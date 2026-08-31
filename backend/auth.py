"""Email/password authentication for Omnivest investors.

Stores users in Mongo (collection: users) with a bcrypt-hashed password and
issues a signed JWT on signup/login. Kept intentionally small and framework
native so the frontend can use a simple Bearer-token flow.
"""
from __future__ import annotations

import os
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, EmailStr, Field
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)

JWT_SECRET = os.environ.get("JWT_SECRET", "basketly-dev-secret")
JWT_ALGO = "HS256"
JWT_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    # bcrypt has a 72-byte limit; truncate defensively
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["id"],
        "email": user.get("email"),
        "role": user.get("role", "investor"),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_EXPIRE_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authentication token")


def build_current_user_dep(db, required_roles=None):
    """Return a FastAPI dependency that resolves the Bearer user, optionally
    enforcing that the user's role is in required_roles."""
    async def dep(authorization: Optional[str] = Header(None)) -> dict:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Not authenticated")
        payload = decode_token(authorization.split(" ", 1)[1].strip())
        user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if required_roles and user.get("role") not in required_roles:
            raise HTTPException(status_code=403, detail="You do not have access to this resource")
        return user
    return dep


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "name": user.get("name", ""),
        "email": user.get("email"),
        "phone": user.get("phone"),
        "role": user.get("role", "investor"),
        "created_at": user.get("created_at"),
    }


class SignupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    role: str = Field(default="investor")
    invite_code: Optional[str] = Field(default=None, max_length=300)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


async def seed_users(db: AsyncIOMotorDatabase) -> None:
    """Idempotently ensure a demo investor and an admin exist."""
    # email is optional (phone users have none) -> partial unique index on string emails only
    try:
        await db.users.drop_index("email_1")
    except Exception:
        pass
    await db.users.create_index("email", unique=True, partialFilterExpression={"email": {"$type": "string"}})
    await db.users.create_index("phone", unique=True, partialFilterExpression={"phone": {"$type": "string"}})

    # Migrate the previously-seeded admin email to the new Omnivest address in place.
    # Preserves the existing password hash, id and role (no duplicate, no lockout).
    OLD_ADMIN_EMAIL = "admin@basketly.in"
    NEW_ADMIN_EMAIL = "admin@omnivest.in"
    if not await db.users.find_one({"email": NEW_ADMIN_EMAIL}):
        try:
            r = await db.users.update_one(
                {"email": OLD_ADMIN_EMAIL, "role": "admin"},
                {"$set": {"email": NEW_ADMIN_EMAIL}},
            )
            if r.matched_count:
                logger.info("Migrated admin email %s -> %s", OLD_ADMIN_EMAIL, NEW_ADMIN_EMAIL)
        except DuplicateKeyError:
            pass  # a concurrent worker won the rename; leave that record intact

    seeds = [
        {"name": "Demo Investor", "email": "demo@basketly.in", "password": "Password123", "role": "investor"},
        {"name": "Omnivest Admin", "email": "admin@omnivest.in", "password": "Admin@123", "role": "admin"},
    ]
    for s in seeds:
        existing = await db.users.find_one({"email": s["email"].lower()})
        if existing:
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "name": s["name"],
            "email": s["email"].lower(),
            "password_hash": hash_password(s["password"]),
            "role": s["role"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(doc)
        logger.info("Seeded user %s", s["email"])


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/auth", tags=["auth"])

    async def current_user(authorization: Optional[str] = Header(None)) -> dict:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Not authenticated")
        token = authorization.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Session expired, please log in again")
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user

    @router.post("/signup")
    async def signup(payload: SignupRequest):
        import invites as invites_mod
        email = payload.email.lower()
        if await db.users.find_one({"email": email}):
            raise HTTPException(status_code=409, detail="An account with this email already exists")
        # analyst requires a valid admin-issued invite; otherwise default to investor.
        consumed_invite = None
        role = "investor"
        if payload.role == "analyst" and payload.invite_code:
            consumed_invite = await invites_mod.consume_invite(db, payload.invite_code)
            if not consumed_invite:
                raise HTTPException(status_code=403, detail="This analyst invite is invalid, used or expired.")
            role = "analyst"
        user = {
            "id": str(uuid.uuid4()),
            "name": payload.name.strip(),
            "email": email,
            "password_hash": hash_password(payload.password),
            "role": role,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            await db.users.insert_one(user)
        except Exception:
            if consumed_invite:
                await invites_mod.release_invite(db, consumed_invite["id"])
            raise HTTPException(status_code=409, detail="An account with this email already exists")
        if consumed_invite:
            await invites_mod.bind_invite(db, consumed_invite["id"], user["id"])
        token = create_token(user)
        return {"token": token, "user": public_user(user)}

    @router.post("/login")
    async def login(payload: LoginRequest):
        email = payload.email.lower()
        user = await db.users.find_one({"email": email})
        if not user or not verify_password(payload.password, user.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        token = create_token(user)
        return {"token": token, "user": public_user(user)}

    @router.get("/me")
    async def me(user: dict = Depends(current_user)):
        return {"user": public_user(user)}

    return router

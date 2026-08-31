"""Admin-issued invites that gate the `analyst` role during self-signup.

Only an HMAC digest of each invite code is stored; the raw code is returned to
the admin exactly once. Analyst signup consumes an invite atomically via a
conditional find_one_and_update (single standalone Mongo, no transactions), with
a compensating release if user creation fails.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep

INVITE_PEPPER = os.environ.get("JWT_SECRET", "basketly-dev-secret")
DEFAULT_TTL_DAYS = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


def digest_code(code: str) -> str:
    return hmac.new(INVITE_PEPPER.encode(), code.encode(), hashlib.sha256).hexdigest()


async def consume_invite(db: AsyncIOMotorDatabase, code: str) -> Optional[dict]:
    """Atomically flip a valid open invite to used. Returns the invite or None."""
    if not code:
        return None
    now = _now().isoformat()
    doc = await db.analyst_invites.find_one_and_update(
        {"code_hash": digest_code(code), "role": "analyst", "status": "open", "expires_at": {"$gt": now}},
        {"$set": {"status": "used", "used_at": now}},
    )
    return doc


async def release_invite(db: AsyncIOMotorDatabase, invite_id: str) -> None:
    """Revert a consumed invite back to open (compensating action)."""
    await db.analyst_invites.update_one(
        {"id": invite_id, "status": "used"},
        {"$set": {"status": "open", "used_at": None, "used_by": None}},
    )


async def bind_invite(db: AsyncIOMotorDatabase, invite_id: str, user_id: str) -> None:
    await db.analyst_invites.update_one({"id": invite_id}, {"$set": {"used_by": user_id}})


def _public(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "role": doc.get("role", "analyst"),
        "status": doc.get("status"),
        "email_note": doc.get("email_note") or "",
        "created_at": doc.get("created_at"),
        "expires_at": doc.get("expires_at"),
        "used_at": doc.get("used_at"),
        "used_by": doc.get("used_by"),
    }


class CreateInviteIn(BaseModel):
    email_note: str = Field(default="", max_length=200)
    expires_in_days: int = Field(default=DEFAULT_TTL_DAYS, ge=1, le=90)


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/admin/invites", tags=["invites"])
    require_admin = build_current_user_dep(db, ["admin"])

    @router.post("")
    async def create_invite(payload: CreateInviteIn, admin: dict = Depends(require_admin)):
        raw_code = secrets.token_urlsafe(24)
        now = _now()
        doc = {
            "id": str(uuid.uuid4()),
            "code_hash": digest_code(raw_code),
            "role": "analyst",
            "email_note": payload.email_note,
            "status": "open",
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(days=payload.expires_in_days)).isoformat(),
            "created_by": admin["id"],
            "used_at": None,
            "used_by": None,
        }
        await db.analyst_invites.insert_one(dict(doc))
        # Raw code returned exactly once; only the digest is persisted.
        return {"invite": _public(doc), "code": raw_code, "expires_at": doc["expires_at"]}

    @router.get("")
    async def list_invites(admin: dict = Depends(require_admin)):
        docs = await db.analyst_invites.find({}, {"_id": 0, "code_hash": 0}).sort("created_at", -1).to_list(500)
        return {"invites": [_public(d) for d in docs]}

    @router.post("/{invite_id}/revoke")
    async def revoke_invite(invite_id: str, admin: dict = Depends(require_admin)):
        await db.analyst_invites.update_one(
            {"id": invite_id, "status": "open"}, {"$set": {"status": "revoked"}}
        )
        return {"ok": True}

    return router

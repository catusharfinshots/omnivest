"""Passwordless phone-number + SMS OTP auth via Twilio Verify.

Twilio Verify generates/expires/checks the OTP, so we never store codes.
On success we issue our existing PyJWT token. Optional admin-issued invite
code (reusing invites.consume_invite) grants the analyst role.
Admin email/password auth (auth.py) is untouched.
"""
from __future__ import annotations

import os
import uuid
import time
import logging
from datetime import datetime, timezone
from typing import Optional

import phonenumbers
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from twilio.rest import Client
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import create_token, public_user

logger = logging.getLogger(__name__)

ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID")
AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
VERIFY_SID = os.environ.get("TWILIO_VERIFY_SERVICE_SID")
_client = Client(ACCOUNT_SID, AUTH_TOKEN) if (ACCOUNT_SID and AUTH_TOKEN) else None

# Demo mode: skip real SMS and accept a fixed code (free, any number). Flip
# OTP_DEMO_MODE=false in .env to use real Twilio SMS.
DEMO_MODE = os.environ.get("OTP_DEMO_MODE", "true").strip().lower() == "true"
DEMO_CODE = os.environ.get("OTP_DEMO_CODE", "123456")

_last_send: dict[str, float] = {}
SEND_COOLDOWN = 25  # seconds per number


def to_e164(raw: str) -> str:
    raw = (raw or "").strip()
    try:
        # default region India when no +country code supplied
        parsed = phonenumbers.parse(raw, None if raw.startswith("+") else "IN")
    except phonenumbers.NumberParseException:
        raise HTTPException(status_code=400, detail="Please enter a valid mobile number")
    if not phonenumbers.is_valid_number(parsed):
        raise HTTPException(status_code=400, detail="Please enter a valid mobile number")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


class PhoneReq(BaseModel):
    phone: str = Field(..., min_length=3, max_length=40)
    flow: str = Field(default="customer", pattern="^(customer|partner)$")


class VerifyReq(BaseModel):
    phone: str = Field(..., min_length=3, max_length=40)
    code: str = Field(..., pattern=r"^\d{4,10}$")
    name: Optional[str] = Field(default=None, max_length=80)
    invite_code: Optional[str] = Field(default=None, max_length=300)
    flow: str = Field(default="customer", pattern="^(customer|partner)$")


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/auth/phone", tags=["phone-auth"])

    async def _enforce_wall(phone: str, flow: str) -> None:
        """Hard wall between the customer and partner funnels: a number lives on
        exactly one side. Customer login refuses partner numbers (and pending
        applicants); partner login refuses customer numbers and unknown numbers,
        so it can never silently create an investor account."""
        user = await db.users.find_one({"phone": phone}, {"_id": 0, "role": 1})
        app = await db.partner_applications.find_one(
            {"phone": phone, "status": {"$in": ["pending", "approved"]}},
            {"_id": 0, "status": 1}, sort=[("created_at", -1)],
        )
        role = (user or {}).get("role")
        if flow == "customer":
            if role == "analyst" or (app and app["status"] == "approved"):
                raise HTTPException(status_code=409, detail="This number is registered as a partner account. Please log in from the Partner page (omnivest.in/partner).")
            if app and app["status"] == "pending":
                raise HTTPException(status_code=409, detail="This number has a partner application under review. You can track it on the Partner page (omnivest.in/partner).")
        else:  # partner login
            if role == "analyst":
                return
            if app and app["status"] == "pending":
                raise HTTPException(status_code=409, detail="Your partner application is still under review — you'll be able to log in here once it's approved.")
            if role == "investor":
                raise HTTPException(status_code=409, detail="This number is a customer account. Use “Get started” to log in, or apply as a partner with a different number.")
            if role == "admin":
                raise HTTPException(status_code=409, detail="Please use the admin email login.")
            raise HTTPException(status_code=404, detail="No partner account found for this number. Apply below to become a partner.")

    @router.post("/request-otp")
    async def request_otp(body: PhoneReq):
        phone = to_e164(body.phone)
        await _enforce_wall(phone, body.flow)
        if DEMO_MODE:
            return {"ok": True, "demo": True, "status": "pending"}
        if not _client or not VERIFY_SID:
            raise HTTPException(status_code=400, detail="SMS service is not configured yet.")
        now = time.time()
        if now - _last_send.get(phone, 0) < SEND_COOLDOWN:
            raise HTTPException(status_code=429, detail="Please wait a few seconds before requesting another code")
        _last_send[phone] = now
        try:
            v = await run_in_threadpool(
                lambda: _client.verify.v2.services(VERIFY_SID).verifications.create(to=phone, channel="sms")
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("OTP send failed: %s", e)
            detail = "Couldn't send the code. Please check the mobile number is correct and try again."
            code = getattr(e, "code", None)
            if code == 21608:
                detail = "This number isn't verified on our SMS trial account yet. Please verify it in Twilio, or use a verified number."
            elif code in (60078, 60083, 21408, 21211):
                detail = "We can't send an OTP to this country yet. Please use a supported country's mobile number."
            raise HTTPException(status_code=400, detail=detail)
        return {"ok": True, "demo": False, "status": v.status}

    @router.post("/verify-otp")
    async def verify_otp(body: VerifyReq):
        phone = to_e164(body.phone)
        await _enforce_wall(phone, body.flow)  # re-checked here so verify can't bypass the wall
        if DEMO_MODE:
            if body.code != DEMO_CODE:
                raise HTTPException(status_code=401, detail="Invalid code. In demo mode the code is 123456.")
        else:
            if not _client or not VERIFY_SID:
                raise HTTPException(status_code=400, detail="SMS service is not configured yet.")
            try:
                res = await run_in_threadpool(
                    lambda: _client.verify.v2.services(VERIFY_SID).verification_checks.create(to=phone, code=body.code)
                )
            except Exception as e:  # noqa: BLE001
                logger.warning("OTP check failed: %s", e)
                raise HTTPException(status_code=400, detail="Couldn't verify the code, please request a new one.")
            if res.status != "approved":
                raise HTTPException(status_code=401, detail="Invalid or expired code")

        import invites as invites_mod

        existing = await db.users.find_one({"phone": phone})
        if existing:
            # returning user: optionally upgrade an investor to analyst with a valid invite
            if body.invite_code and existing.get("role") == "investor":
                inv = await invites_mod.consume_invite(db, body.invite_code)
                if inv:
                    await db.users.update_one({"id": existing["id"]}, {"$set": {"role": "analyst"}})
                    await invites_mod.bind_invite(db, inv["id"], existing["id"])
                    existing["role"] = "analyst"
            return {"token": create_token(existing), "user": public_user(existing)}

        # new user
        role = "investor"
        consumed = None
        if body.invite_code:
            consumed = await invites_mod.consume_invite(db, body.invite_code)
            if not consumed:
                raise HTTPException(status_code=403, detail="This analyst invite is invalid, used or expired.")
            role = "analyst"
        user = {
            "id": str(uuid.uuid4()),
            "name": (body.name or "").strip(),
            "phone": phone,
            "role": role,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            await db.users.insert_one(dict(user))
        except Exception:
            if consumed:
                await invites_mod.release_invite(db, consumed["id"])
            # race: another verify created it
            again = await db.users.find_one({"phone": phone})
            if again:
                return {"token": create_token(again), "user": public_user(again)}
            raise HTTPException(status_code=400, detail="Could not create your account, please retry")
        if consumed:
            await invites_mod.bind_invite(db, consumed["id"], user["id"])
        return {"token": create_token(user), "user": public_user(user)}

    return router

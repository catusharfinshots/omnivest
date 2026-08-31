"""Public 'Become a partner' applications + admin approval.

A prospective research analyst applies via a public form. Admins review in the
console; on approval the applicant's phone number is provisioned as an
`analyst` user (created or upgraded), so their next phone-OTP login lands them
in the analyst console.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, EmailStr
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep
from phone_auth import to_e164
from managers import upsert_manager_from_partner, deactivate_manager


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ApplyIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=3, max_length=40)
    email: EmailStr
    firm: str = Field(..., min_length=1, max_length=160)
    sebi_reg: str = Field(..., pattern=r"^IN[A-Z][0-9]{9}$")
    applicant_type: str = Field(..., pattern="^(Individual|LLP|Company)$")
    note: str = Field(..., min_length=1, max_length=600)
    accepted_terms: bool = Field(...)


class ReviewIn(BaseModel):
    action: str = Field(..., pattern="^(approve|reject)$")
    note: str = Field(default="", max_length=400)


def _public(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "name": doc.get("name"),
        "phone": doc.get("phone"),
        "email": doc.get("email"),
        "firm": doc.get("firm", ""),
        "sebi_reg": doc.get("sebi_reg", ""),
        "applicant_type": doc.get("applicant_type", ""),
        "note": doc.get("note", ""),
        "status": doc.get("status"),
        "review_note": doc.get("review_note", ""),
        "accepted_terms": doc.get("accepted_terms", False),
        "accepted_terms_at": doc.get("accepted_terms_at"),
        "created_at": doc.get("created_at"),
        "reviewed_at": doc.get("reviewed_at"),
    }


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(tags=["partners"])
    col = db.partner_applications
    require_admin = build_current_user_dep(db, ["admin"])

    @router.post("/partners/apply")
    async def apply(payload: ApplyIn):
        if not payload.accepted_terms:
            raise HTTPException(status_code=400, detail="Please accept the Partner Terms & Conditions to apply.")
        phone = to_e164(payload.phone)  # server-side E.164 validation; rejects invalid numbers
        # avoid stacking duplicate pending applications for the same phone
        if await col.find_one({"phone": phone, "status": "pending"}):
            raise HTTPException(status_code=409, detail="You already have an application under review. We'll be in touch soon.")
        doc = {
            "id": str(uuid.uuid4()),
            "name": payload.name.strip(),
            "phone": phone,
            "email": str(payload.email),
            "firm": payload.firm.strip(),
            "sebi_reg": payload.sebi_reg.strip(),
            "applicant_type": payload.applicant_type,
            "note": payload.note.strip(),
            "accepted_terms": True,
            "accepted_terms_at": _now(),
            "status": "pending",
            "review_note": "",
            "created_at": _now(),
            "reviewed_at": None,
            "linked_user_id": None,
        }
        await col.insert_one(dict(doc))
        return {"ok": True, "application": _public(doc)}

    @router.get("/admin/partners")
    async def list_applications(status: Optional[str] = Query(None), admin: dict = Depends(require_admin)):
        q = {"status": status} if status else {}
        docs = await col.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"applications": [_public(d) for d in docs]}

    @router.post("/admin/partners/{app_id}/review")
    async def review(app_id: str, payload: ReviewIn, admin: dict = Depends(require_admin)):
        app_doc = await col.find_one({"id": app_id})
        if not app_doc:
            raise HTTPException(status_code=404, detail="Application not found")
        if payload.action == "reject":
            await col.update_one({"id": app_id}, {"$set": {"status": "rejected", "review_note": payload.note, "reviewed_at": _now()}})
            await deactivate_manager(db, app_id)
            return {"ok": True, "status": "rejected"}

        # approve -> provision analyst tied to the phone number
        phone = app_doc["phone"]
        existing = await db.users.find_one({"phone": phone})
        if existing:
            await db.users.update_one({"id": existing["id"]}, {"$set": {"role": "analyst", "name": existing.get("name") or app_doc["name"]}})
            user_id = existing["id"]
        else:
            user = {
                "id": str(uuid.uuid4()),
                "name": app_doc["name"],
                "phone": phone,
                "email": app_doc.get("email"),
                "role": "analyst",
                "created_at": _now(),
            }
            try:
                await db.users.insert_one(dict(user))
            except Exception:
                # race: fetch whoever got created and upgrade
                again = await db.users.find_one({"phone": phone})
                if not again:
                    raise HTTPException(status_code=500, detail="Could not provision analyst account")
                await db.users.update_one({"id": again["id"]}, {"$set": {"role": "analyst"}})
                again2 = await db.users.find_one({"phone": phone})
                user_id = again2["id"]
            else:
                user_id = user["id"]
        await col.update_one({"id": app_id}, {"$set": {"status": "approved", "review_note": payload.note, "reviewed_at": _now(), "linked_user_id": user_id}})
        approved_doc = await col.find_one({"id": app_id}, {"_id": 0})
        await upsert_manager_from_partner(db, approved_doc, user_id)
        return {"ok": True, "status": "approved"}

    return router

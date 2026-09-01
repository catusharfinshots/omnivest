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

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field, EmailStr
from motor.motor_asyncio import AsyncIOMotorDatabase

from pymongo import ReturnDocument

from auth import build_current_user_dep
from phone_auth import to_e164
from managers import upsert_manager_from_partner, deactivate_manager


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _next_ref_no(db: AsyncIOMotorDatabase) -> str:
    """Human-friendly sequential reference, e.g. OMN-RA-2026-0001 (per-year counter)."""
    year = datetime.now(timezone.utc).year
    counter = await db.counters.find_one_and_update(
        {"_id": f"partner_ref_{year}"}, {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    return f"OMN-RA-{year}-{counter['seq']:04d}"


# Compliance documents live in MongoDB (partner_documents) rather than local
# disk so they survive host restarts; each is capped at 5 MB.
DOC_KINDS = ("sebi_cert", "nism_cert", "pan_card")
DOC_MAX_BYTES = 5 * 1024 * 1024
DOC_TYPES = {"application/pdf", "image/jpeg", "image/png"}


class OfficerIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=3, max_length=40)


class ApplyIn(BaseModel):
    # contact
    name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=3, max_length=40)
    email: EmailStr
    # registration (SEBI RA Regulations, incl. Dec 2024 amendment)
    registered_name: str = Field(..., min_length=1, max_length=160)
    firm: str = Field(..., min_length=1, max_length=160)
    sebi_reg: str = Field(..., pattern=r"^IN[A-Z][0-9]{9}$")
    sebi_reg_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    raasb_no: str = Field(..., min_length=1, max_length=60)
    nism_cert_no: str = Field(..., min_length=1, max_length=60)
    nism_valid_till: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    pan: str = Field(..., pattern=r"^[A-Z]{5}[0-9]{4}[A-Z]$")
    registered_address: str = Field(..., min_length=10, max_length=400)
    applicant_type: str = Field(..., pattern="^(Individual|LLP|Company)$")
    # officers (required for LLP/Company)
    principal_officer: Optional[OfficerIn] = None
    compliance_officer: Optional[OfficerIn] = None
    # declarations
    disciplinary_history: bool = Field(...)
    disciplinary_details: str = Field(default="", max_length=600)
    raasb_deposit_confirmed: bool = Field(...)
    other_registrations: str = Field(default="", max_length=300)
    model_portfolio_compliance: bool = Field(...)
    # profile (optional)
    website: str = Field(default="", max_length=200)
    linkedin: str = Field(default="", max_length=200)
    experience_years: str = Field(default="", max_length=20)
    specializations: str = Field(default="", max_length=200)
    # strategy + consent
    note: str = Field(..., min_length=1, max_length=600)
    accepted_terms: bool = Field(...)


class ReviewIn(BaseModel):
    action: str = Field(..., pattern="^(approve|reject)$")
    note: str = Field(default="", max_length=400)


class StatusIn(BaseModel):
    ref_no: str = Field(..., min_length=6, max_length=30)
    phone: str = Field(..., min_length=3, max_length=40)


_PUBLIC_FIELDS = (
    "ref_no", "name", "phone", "email", "registered_name", "firm", "sebi_reg", "sebi_reg_date",
    "raasb_no", "nism_cert_no", "nism_valid_till", "pan", "registered_address",
    "applicant_type", "principal_officer", "compliance_officer",
    "disciplinary_history", "disciplinary_details", "raasb_deposit_confirmed",
    "other_registrations", "model_portfolio_compliance",
    "website", "linkedin", "experience_years", "specializations",
    "note", "status", "review_note", "accepted_terms", "accepted_terms_at",
    "created_at", "reviewed_at",
)


def _public(doc: dict) -> dict:
    out = {"id": doc["id"]}
    for k in _PUBLIC_FIELDS:
        out[k] = doc.get(k, "" if k not in ("principal_officer", "compliance_officer") else None)
    return out


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(tags=["partners"])
    col = db.partner_applications
    require_admin = build_current_user_dep(db, ["admin"])
    require_user = build_current_user_dep(db)

    @router.post("/partners/apply")
    async def apply(payload: ApplyIn):
        if not payload.accepted_terms:
            raise HTTPException(status_code=400, detail="Please accept the Partner Terms & Conditions to apply.")
        if not payload.raasb_deposit_confirmed:
            raise HTTPException(status_code=400, detail="Please confirm you maintain the RAASB deposit required by SEBI.")
        if not payload.model_portfolio_compliance:
            raise HTTPException(status_code=400, detail="Please confirm your model portfolios will comply with SEBI's RA guidelines.")
        if payload.applicant_type in ("LLP", "Company") and (not payload.principal_officer or not payload.compliance_officer):
            raise HTTPException(status_code=400, detail="Principal Officer and Compliance Officer details are required for LLP/Company applicants.")
        if payload.disciplinary_history and not payload.disciplinary_details.strip():
            raise HTTPException(status_code=400, detail="Please describe the disciplinary action(s) you declared.")
        phone = to_e164(payload.phone)  # server-side E.164 validation; rejects invalid numbers
        # avoid stacking duplicate pending applications for the same phone
        if await col.find_one({"phone": phone, "status": "pending"}):
            raise HTTPException(status_code=409, detail="You already have an application under review. We'll be in touch soon.")
        doc = {
            "id": str(uuid.uuid4()),
            "ref_no": await _next_ref_no(db),
            "name": payload.name.strip(),
            "phone": phone,
            "email": str(payload.email),
            "registered_name": payload.registered_name.strip(),
            "firm": payload.firm.strip(),
            "sebi_reg": payload.sebi_reg.strip(),
            "sebi_reg_date": payload.sebi_reg_date,
            "raasb_no": payload.raasb_no.strip(),
            "nism_cert_no": payload.nism_cert_no.strip(),
            "nism_valid_till": payload.nism_valid_till,
            "pan": payload.pan.strip(),
            "registered_address": payload.registered_address.strip(),
            "applicant_type": payload.applicant_type,
            "principal_officer": payload.principal_officer.model_dump() if payload.principal_officer else None,
            "compliance_officer": payload.compliance_officer.model_dump() if payload.compliance_officer else None,
            "disciplinary_history": payload.disciplinary_history,
            "disciplinary_details": payload.disciplinary_details.strip(),
            "raasb_deposit_confirmed": True,
            "other_registrations": payload.other_registrations.strip(),
            "model_portfolio_compliance": True,
            "website": payload.website.strip(),
            "linkedin": payload.linkedin.strip(),
            "experience_years": payload.experience_years.strip(),
            "specializations": payload.specializations.strip(),
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

    @router.post("/partners/apply/{app_id}/document")
    async def upload_document(app_id: str, kind: str = Query(...), file: UploadFile = File(...)):
        """Attach a compliance document (SEBI cert / NISM cert / PAN) to a pending
        application. Unauthenticated by design (applicants have no account yet);
        the application id is an unguessable UUID and uploads are only accepted
        while the application is pending."""
        if kind not in DOC_KINDS:
            raise HTTPException(status_code=422, detail=f"kind must be one of {list(DOC_KINDS)}")
        app_doc = await col.find_one({"id": app_id})
        if not app_doc or app_doc.get("status") != "pending":
            raise HTTPException(status_code=404, detail="Application not found or no longer editable")
        ct = (file.content_type or "").lower()
        if ct not in DOC_TYPES:
            raise HTTPException(status_code=422, detail="Please upload a PDF, JPG or PNG.")
        data = await file.read()
        if len(data) > DOC_MAX_BYTES:
            raise HTTPException(status_code=413, detail="File must be 5 MB or smaller.")
        meta = {
            "id": str(uuid.uuid4()),
            "application_id": app_id,
            "kind": kind,
            "filename": file.filename or f"{kind}.pdf",
            "content_type": ct,
            "size": len(data),
            "data": data,
            "uploaded_at": _now(),
        }
        # one document per kind — re-upload replaces
        await db.partner_documents.delete_many({"application_id": app_id, "kind": kind})
        await db.partner_documents.insert_one(dict(meta))
        return {"ok": True, "document": {k: meta[k] for k in ("id", "kind", "filename", "content_type", "size", "uploaded_at")}}

    @router.get("/partners/my-application")
    async def my_application(user: dict = Depends(require_user)):
        """The logged-in user's latest partner application (matched by their
        phone), so /partner can show their status instead of a blank form."""
        phone = user.get("phone")
        if not phone:
            raise HTTPException(status_code=404, detail="No application")
        doc = await col.find_one({"phone": phone}, sort=[("created_at", -1)])
        if not doc:
            raise HTTPException(status_code=404, detail="No application")
        return {
            "ref_no": doc.get("ref_no"),
            "name": doc.get("name"),
            "status": doc.get("status"),
            "review_note": doc.get("review_note", ""),
            "created_at": doc.get("created_at"),
            "reviewed_at": doc.get("reviewed_at"),
        }

    @router.post("/partners/status")
    async def application_status(payload: StatusIn):
        """Public tracking: the applicant supplies their reference number AND the
        mobile they applied with (both must match, so reference numbers alone
        leak nothing). The review note is included — it's how admins communicate
        rejection reasons / correction requests back to applicants."""
        try:
            phone = to_e164(payload.phone)
        except HTTPException:
            raise HTTPException(status_code=404, detail="No application found for this reference number and mobile.")
        doc = await col.find_one({"ref_no": payload.ref_no.strip().upper(), "phone": phone})
        if not doc:
            raise HTTPException(status_code=404, detail="No application found for this reference number and mobile.")
        return {
            "ref_no": doc.get("ref_no"),
            "name": doc.get("name"),
            "status": doc.get("status"),
            "review_note": doc.get("review_note", ""),
            "created_at": doc.get("created_at"),
            "reviewed_at": doc.get("reviewed_at"),
        }

    @router.get("/admin/partners/{app_id}/documents")
    async def list_documents(app_id: str, admin: dict = Depends(require_admin)):
        docs = await db.partner_documents.find(
            {"application_id": app_id}, {"_id": 0, "data": 0}
        ).sort("uploaded_at", 1).to_list(20)
        return {"documents": docs}

    @router.get("/admin/partners/{app_id}/documents/{doc_id}")
    async def download_document(app_id: str, doc_id: str, admin: dict = Depends(require_admin)):
        doc = await db.partner_documents.find_one({"id": doc_id, "application_id": app_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return Response(
            content=bytes(doc["data"]), media_type=doc.get("content_type", "application/octet-stream"),
            headers={"Content-Disposition": f'inline; filename="{doc.get("filename", "document")}"'},
        )

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
        if payload.action == "reject" and not payload.note.strip():
            raise HTTPException(status_code=400, detail="Please provide a rejection reason — the applicant sees it when tracking their application.")
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

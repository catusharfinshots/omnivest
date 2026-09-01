"""Basket Managers — a database-backed directory driven by approved partners.

A manager record is created/activated when an admin approves a partner
application (see partners.py) and deactivated when the application is rejected.
Public endpoints power the /managers page; admin endpoints let staff edit the
public-facing details.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _initials(name: str) -> str:
    parts = [w[0] for w in (name or "").split() if w]
    return ("".join(parts[:2]) or "?").upper()


async def _baskets_count(db, user_id) -> int:
    if not user_id:
        return 0
    return await db.analyst_portfolios.count_documents({"owner_id": user_id, "status": "approved"})


async def _public(db, doc: dict) -> dict:
    return {
        "id": doc["id"],
        "name": doc.get("name"),
        "firm": doc.get("firm", ""),
        "logo": doc.get("logo") or _initials(doc.get("name", "?")),
        "sebiReg": doc.get("sebi_reg", ""),
        "applicantType": doc.get("applicant_type", ""),
        "philosophy": doc.get("philosophy", ""),
        "description": doc.get("description", ""),
        "baskets": await _baskets_count(db, doc.get("user_id")),
    }


async def upsert_manager_from_partner(db: AsyncIOMotorDatabase, app_doc: dict, user_id: str) -> None:
    """Create (or re-activate) a manager record for an approved partner."""
    fields = {
        "name": app_doc.get("name"),
        "firm": app_doc.get("firm", ""),
        "sebi_reg": app_doc.get("sebi_reg", ""),
        "applicant_type": app_doc.get("applicant_type", ""),
        "website": app_doc.get("website", ""),
        "linkedin": app_doc.get("linkedin", ""),
        "experience_years": app_doc.get("experience_years", ""),
        "specializations": app_doc.get("specializations", ""),
        "user_id": user_id,
        "active": True,
        "updated_at": _now(),
    }
    existing = await db.managers.find_one({"application_id": app_doc["id"]})
    if existing:
        await db.managers.update_one({"id": existing["id"]}, {"$set": fields})
        return
    note = (app_doc.get("note") or "").strip()
    doc = {
        "id": str(uuid.uuid4()),
        "application_id": app_doc["id"],
        "logo": _initials(app_doc.get("name", "?")),
        "philosophy": (note[:120] if note else "SEBI-registered research analyst"),
        "description": note,
        "created_at": _now(),
        **fields,
    }
    await db.managers.insert_one(dict(doc))


async def deactivate_manager(db: AsyncIOMotorDatabase, application_id: str) -> None:
    await db.managers.update_one({"application_id": application_id}, {"$set": {"active": False, "updated_at": _now()}})


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(tags=["managers"])
    require_admin = build_current_user_dep(db, ["admin"])

    @router.get("/managers")
    async def list_managers():
        docs = await db.managers.find({"active": True}, {"_id": 0}).sort("created_at", -1).to_list(200)
        return {"managers": [await _public(db, d) for d in docs]}

    @router.get("/managers/{mid}")
    async def get_manager(mid: str):
        doc = await db.managers.find_one({"id": mid, "active": True}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Manager not found")
        pub = await _public(db, doc)
        listings = await db.analyst_portfolios.find(
            {"owner_id": doc.get("user_id"), "status": "approved"}, {"_id": 0}
        ).sort("updated_at", -1).to_list(100)
        pub["portfolios"] = [
            {"id": l.get("id"), "name": l.get("name"), "subtitle": l.get("subtitle", ""),
             "cagr": (l.get("returns") or {}).get("cagr")}
            for l in listings
        ]
        return pub

    @router.get("/admin/managers")
    async def admin_list(admin: dict = Depends(require_admin)):
        docs = await db.managers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"managers": [{**await _public(db, d), "active": d.get("active", True)} for d in docs]}

    @router.put("/admin/managers/{mid}")
    async def admin_update(mid: str, payload: dict = Body(...), admin: dict = Depends(require_admin)):
        allowed = {k: payload[k] for k in ("philosophy", "description", "firm", "sebi_reg", "logo", "active") if k in payload}
        allowed["updated_at"] = _now()
        r = await db.managers.update_one({"id": mid}, {"$set": allowed})
        if not r.matched_count:
            raise HTTPException(status_code=404, detail="Manager not found")
        doc = await db.managers.find_one({"id": mid}, {"_id": 0})
        return {**await _public(db, doc), "active": doc.get("active", True)}

    return router

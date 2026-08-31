"""Lead capture for AIF & Advisory "register interest" forms.

Public POST to create a lead; GET to list them (used by the admin console).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from motor.motor_asyncio import AsyncIOMotorDatabase


class LeadCreate(BaseModel):
    type: str = Field(..., description="aif | advisory")
    email: EmailStr
    name: Optional[str] = Field(default=None, max_length=120)
    plan: Optional[str] = Field(default=None, max_length=60)
    message: Optional[str] = Field(default=None, max_length=1000)


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/leads", tags=["leads"])

    @router.post("")
    async def create_lead(payload: LeadCreate):
        t = payload.type.lower().strip()
        if t not in ("aif", "advisory", "subscribe"):
            raise HTTPException(status_code=422, detail="type must be 'aif', 'advisory' or 'subscribe'")
        lead = {
            "id": str(uuid.uuid4()),
            "type": t,
            "email": payload.email.lower(),
            "name": (payload.name or "").strip() or None,
            "plan": (payload.plan or "").strip() or None,
            "message": (payload.message or "").strip() or None,
            "status": "new",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.leads.insert_one(dict(lead))
        return {"ok": True, "lead": lead}

    @router.get("")
    async def list_leads(type: Optional[str] = Query(default=None)):
        query = {}
        if type:
            query["type"] = type.lower()
        docs = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
        return {"leads": docs, "count": len(docs)}

    return router

"""Admin-editable dropdown options for the analyst listing form (F5.1).

A single settings doc holds the option lists (strategy, risk, rebalance, etc.).
Analysts' form dropdowns render from this; admins edit it without code.

Collection: app_settings  {_id:"listing_options", ...option lists}
"""
from __future__ import annotations

from typing import Dict, List

from fastapi import APIRouter, Body, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep

DOC_ID = "listing_options"

DEFAULTS: Dict[str, List[str]] = {
    "strategy": ["asset-allocation", "sectoral", "thematic", "smart-beta", "model-based"],
    "risk": ["Low", "Medium", "High"],
    "rebalanceFreq": ["Monthly", "Quarterly", "Half-yearly", "Yearly"],
    "subscription": ["Free", "Paid"],
    "constituentType": ["Stock", "ETF"],
}

FIELDS = list(DEFAULTS.keys())


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(tags=["listing-options"])
    require_admin = build_current_user_dep(db, ["admin"])
    col = db.app_settings

    async def _get() -> Dict[str, List[str]]:
        doc = await col.find_one({"_id": DOC_ID}) or {}
        merged = {}
        for k in FIELDS:
            vals = doc.get(k)
            merged[k] = vals if isinstance(vals, list) and vals else list(DEFAULTS[k])
        return merged

    @router.get("/listing-options")
    async def get_options():
        return {"options": await _get()}

    @router.put("/admin/listing-options")
    async def update_options(payload: dict = Body(...), user: dict = Depends(require_admin)):
        clean: Dict[str, List[str]] = {}
        for k in FIELDS:
            raw = payload.get(k)
            if raw is None:
                continue
            if not isinstance(raw, list):
                raise HTTPException(status_code=422, detail=f"'{k}' must be a list of options")
            vals = [str(v).strip() for v in raw if str(v).strip()]
            # de-dupe preserving order
            seen, deduped = set(), []
            for v in vals:
                if v.lower() not in seen:
                    seen.add(v.lower())
                    deduped.append(v)
            if not deduped:
                raise HTTPException(status_code=422, detail=f"'{k}' needs at least one option")
            clean[k] = deduped
        if not clean:
            raise HTTPException(status_code=422, detail="No options provided")
        await col.update_one({"_id": DOC_ID}, {"$set": {"_id": DOC_ID, **clean}}, upsert=True)
        return {"options": await _get()}

    return router

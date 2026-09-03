"""Admin-editable settings for the partner listing form (Listing 2.0).

Two settings docs in app_settings:
  listing_options  — dropdown option lists (strategy categories, style tags, rebalance
                     frequencies, subscription types, constituent types)
  listing_rules    — validation + commercial rules enforced at submit time
                     (constituent count, concentration cap, factsheet requirement,
                     plan durations, platform fee, founding-partner window)

Partners' form renders from these; admins edit them in "Listing settings" without code.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Body, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep

DOC_ID = "listing_options"
RULES_ID = "listing_rules"

DEFAULTS: Dict[str, List[str]] = {
    "strategy": ["asset-allocation", "sectoral", "thematic", "smart-beta", "model-based"],
    "tags": ["Growth", "Value", "Dividend", "Momentum", "Quality", "Low volatility", "Multi-asset", "Small & midcap", "Large cap", "Quant"],
    "risk": ["Low", "Medium", "High"],                # legacy — volatility is computed now
    "rebalanceFreq": ["Monthly", "Quarterly", "Half-yearly", "Yearly", "As needed"],
    "subscription": ["Free", "Paid"],
    "constituentType": ["Stock", "ETF"],
}
FIELDS = list(DEFAULTS.keys())

RULE_DEFAULTS: Dict[str, Any] = {
    "min_constituents": 2,
    "max_constituents": 50,
    "max_weight_pct": 50,            # no single stock above this
    "max_tags": 3,
    "max_subtitle_words": 30,
    "factsheet_pdf_required": False,
    "allow_video": True,
    "plan_durations": [1, 3, 6, 12],  # months
    "platform_fee_pct": 0,           # Omnivest's share of subscription revenue
    "founding_partner_until": "",    # ISO date; empty = open-ended founding window
    "min_plan_price": 99,
}
RULE_TYPES = {"min_constituents": int, "max_constituents": int, "max_weight_pct": int, "max_tags": int, "max_subtitle_words": int,
              "factsheet_pdf_required": bool, "allow_video": bool, "plan_durations": list, "platform_fee_pct": float,
              "founding_partner_until": str, "min_plan_price": int}


async def load_rules(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    """Current listing rules (defaults merged with the admin doc). Used by analyst.py at submit time."""
    doc = await db.app_settings.find_one({"_id": RULES_ID}) or {}
    out = dict(RULE_DEFAULTS)
    for k, t in RULE_TYPES.items():
        if k in doc and doc[k] is not None:
            try:
                out[k] = t(doc[k]) if t is not list else [int(x) for x in doc[k] if int(x) > 0]
            except Exception:  # noqa: BLE001
                pass
    if not out["plan_durations"]:
        out["plan_durations"] = list(RULE_DEFAULTS["plan_durations"])
    return out


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

    async def get_rules() -> Dict[str, Any]:
        return await load_rules(db)

    @router.get("/listing-options")
    async def listing_options():
        return await _get()

    @router.put("/admin/listing-options")
    async def update_listing_options(payload: dict = Body(...), _: dict = Depends(require_admin)):
        update = {}
        for k in FIELDS:
            if k in payload:
                vals = payload[k]
                if not isinstance(vals, list) or not all(isinstance(v, str) for v in vals):
                    raise HTTPException(status_code=422, detail=f"{k} must be a list of strings")
                cleaned = [v.strip() for v in vals if v.strip()]
                if not cleaned:
                    raise HTTPException(status_code=422, detail=f"{k} needs at least one option")
                update[k] = cleaned
        if not update:
            raise HTTPException(status_code=422, detail="Nothing to update")
        await col.update_one({"_id": DOC_ID}, {"$set": {**update, "updated_at": datetime.now(timezone.utc)}}, upsert=True)
        return await _get()

    @router.get("/listing-rules")
    async def listing_rules():
        return await get_rules()

    @router.put("/admin/listing-rules")
    async def update_listing_rules(payload: dict = Body(...), _: dict = Depends(require_admin)):
        update: Dict[str, Any] = {}
        for k, t in RULE_TYPES.items():
            if k not in payload:
                continue
            v = payload[k]
            try:
                if t is list:
                    v = sorted({int(x) for x in v if int(x) > 0})
                    if not v:
                        raise ValueError
                elif t is bool:
                    v = bool(v)
                elif t is str:
                    v = str(v or "").strip()
                else:
                    v = t(v)
            except Exception:  # noqa: BLE001
                raise HTTPException(status_code=422, detail=f"{k} has an invalid value")
            update[k] = v
        if "min_constituents" in update or "max_constituents" in update:
            cur = await get_rules()
            lo = update.get("min_constituents", cur["min_constituents"])
            hi = update.get("max_constituents", cur["max_constituents"])
            if lo < 1 or hi < lo:
                raise HTTPException(status_code=422, detail="Constituent limits must satisfy 1 ≤ min ≤ max")
        if "max_weight_pct" in update and not (1 <= update["max_weight_pct"] <= 100):
            raise HTTPException(status_code=422, detail="max_weight_pct must be between 1 and 100")
        if "platform_fee_pct" in update and not (0 <= update["platform_fee_pct"] <= 100):
            raise HTTPException(status_code=422, detail="platform_fee_pct must be between 0 and 100")
        if not update:
            raise HTTPException(status_code=422, detail="Nothing to update")
        await col.update_one({"_id": RULES_ID}, {"$set": {**update, "updated_at": datetime.now(timezone.utc)}}, upsert=True)
        return await get_rules()

    return router

"""Watchlist: portfolios an investor wants to keep an eye on. Server-side (per account), replacing the old
browser-only list. Used by the dashboard's "Based on your interests" row and the listing page's Watch button."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep

COLL = "watchlist"


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/watchlist", tags=["watchlist"])
    require_user = build_current_user_dep(db)
    col, portfolios = db[COLL], db.analyst_portfolios

    @router.get("")
    async def mine(user: dict = Depends(require_user)):
        rows = await col.find({"user_id": user["id"]}, {"_id": 0, "portfolio_id": 1, "at": 1}).sort("at", -1).to_list(200)
        return {"ids": [r["portfolio_id"] for r in rows], "items": [{"portfolio_id": r["portfolio_id"], "at": r["at"].isoformat() if isinstance(r.get("at"), datetime) else r.get("at")} for r in rows]}

    @router.post("/{pid}")
    async def add(pid: str, user: dict = Depends(require_user)):
        if not await portfolios.find_one({"id": pid, "status": "approved"}, {"_id": 1}):
            raise HTTPException(status_code=404, detail="Portfolio not found")
        await col.update_one({"user_id": user["id"], "portfolio_id": pid}, {"$setOnInsert": {"user_id": user["id"], "portfolio_id": pid, "at": datetime.now(timezone.utc)}}, upsert=True)
        return {"ok": True, "watching": True}

    @router.delete("/{pid}")
    async def remove(pid: str, user: dict = Depends(require_user)):
        await col.delete_one({"user_id": user["id"], "portfolio_id": pid})
        return {"ok": True, "watching": False}

    return router

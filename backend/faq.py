"""FAQ system — public read + admin CRUD. Follows build_router(db) convention."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


SEED_FAQS = [
    {"question": "What is a model portfolio on Omnivest?", "answer": "A model portfolio is a ready-made basket of stocks or ETFs built around a theme or strategy by a SEBI-registered research analyst. You invest in it from your own broker account, and it is rebalanced on a fixed schedule.", "category": "Model Portfolios", "isTop": True},
    {"question": "Do I need to open a new account to invest?", "answer": "No. Your stocks and ETFs are held in your existing demat account. Omnivest connects to your broker — there is no separate account to open.", "category": "Getting Started", "isTop": True},
    {"question": "Are there any lock-ins?", "answer": "No lock-ins. You can exit your investments whenever you like — model portfolios can be liquidated at any time.", "category": "Model Portfolios", "isTop": True},
    {"question": "How much money do I need to start?", "answer": "It depends on the portfolio — each listing shows its minimum investment amount. Many portfolios start from just a few thousand rupees.", "category": "Getting Started", "isTop": True},
    {"question": "Is my money and data safe?", "answer": "Yes. Omnivest uses financial-grade security with encryption in transit and at rest. Your money always stays in your own broker account — we never hold your funds.", "category": "Safety & Security", "isTop": True},
    {"question": "What are the fees?", "answer": "Fees vary by portfolio and are shown on each portfolio's page before you invest. Some portfolios are free to access while others carry a subscription set by the research analyst.", "category": "Fees & Charges", "isTop": True},
]


async def seed_faqs(db: AsyncIOMotorDatabase) -> None:
    if await db.faqs.count_documents({}) > 0:
        return
    for i, f in enumerate(SEED_FAQS):
        await db.faqs.insert_one({
            "id": str(uuid.uuid4()),
            "question": f["question"], "answer": f["answer"], "category": f["category"],
            "isTop": f["isTop"], "order": i, "published": True,
            "created_at": _now(), "updated_at": _now(),
        })


def _public(d: dict) -> dict:
    return {k: d.get(k) for k in ("id", "question", "answer", "category", "isTop", "order", "published", "created_at", "updated_at")}


class FaqIn(BaseModel):
    question: str = Field(..., min_length=1, max_length=300)
    answer: str = Field(..., min_length=1, max_length=5000)
    category: str = Field(default="General", max_length=80)
    isTop: bool = False
    order: int = 0
    published: bool = True


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/faqs", tags=["faqs"])
    require_admin = build_current_user_dep(db, ["admin"])

    @router.get("")
    async def list_public(top: Optional[bool] = Query(None), category: Optional[str] = Query(None)):
        q = {"published": True}
        if top:
            q["isTop"] = True
        if category:
            q["category"] = category
        docs = await db.faqs.find(q, {"_id": 0}).sort("order", 1).to_list(500)
        return {"faqs": [_public(d) for d in docs]}

    @router.get("/categories")
    async def categories():
        cats = await db.faqs.distinct("category", {"published": True})
        out = []
        for c in cats:
            out.append({"category": c, "count": await db.faqs.count_documents({"published": True, "category": c})})
        out.sort(key=lambda x: x["category"].lower())
        return {"categories": out}

    @router.get("/admin/all")
    async def list_all(_: dict = Depends(require_admin)):
        docs = await db.faqs.find({}, {"_id": 0}).sort("order", 1).to_list(1000)
        return {"faqs": [_public(d) for d in docs]}

    @router.post("")
    async def create(payload: FaqIn, _: dict = Depends(require_admin)):
        doc = {"id": str(uuid.uuid4()), **payload.dict(), "created_at": _now(), "updated_at": _now()}
        await db.faqs.insert_one(dict(doc))
        return {"faq": _public(doc)}

    @router.put("/{fid}")
    async def update(fid: str, payload: FaqIn, _: dict = Depends(require_admin)):
        res = await db.faqs.update_one({"id": fid}, {"$set": {**payload.dict(), "updated_at": _now()}})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="FAQ not found")
        doc = await db.faqs.find_one({"id": fid}, {"_id": 0})
        return {"faq": _public(doc)}

    @router.delete("/{fid}")
    async def delete(fid: str, _: dict = Depends(require_admin)):
        res = await db.faqs.delete_one({"id": fid})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="FAQ not found")
        return {"ok": True}

    return router

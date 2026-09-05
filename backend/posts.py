"""Listing updates ("posts"): a partner's feed per model portfolio.

Free listings: posts are public. Paid listings: posts marked subscribers-only are
returned locked (title + date, no body) to non-subscribers — which, until the
payments engine exists, is everyone except the owner and admins.

Collection: listing_posts {id, portfolio_id, owner_id, title, body(html, sanitised),
                           subscribers_only, created_at, updated_at}
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from auth import build_current_user_dep, decode_token
import subscriptions as subs
from richtext import sanitize_html


class PostIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    body: str = ""
    subscribers_only: bool = True


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(tags=["posts"])
    require_admin = build_current_user_dep(db, ["admin"])
    require_analyst = build_current_user_dep(db, ["analyst"])
    posts, portfolios = db.listing_posts, db.analyst_portfolios

    async def _own(pid: str, user: dict) -> dict:
        doc = await portfolios.find_one({"id": pid, "owner_id": user["id"]}, {"_id": 0, "id": 1, "subscription": 1, "status": 1})
        if not doc:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return doc

    async def _viewer(authorization: Optional[str]) -> Optional[dict]:
        if not authorization or not authorization.lower().startswith("bearer "):
            return None
        try:
            payload = decode_token(authorization.split(" ", 1)[1])
            return await db.users.find_one({"id": payload.get("sub")}, {"_id": 0, "id": 1, "role": 1})
        except Exception:  # noqa: BLE001
            return None

    # ---------- partner ----------
    @router.get("/analyst/portfolios/{pid}/posts")
    async def my_posts(pid: str, user: dict = Depends(require_analyst)):
        await _own(pid, user)
        return {"posts": await posts.find({"portfolio_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(200)}

    @router.post("/analyst/portfolios/{pid}/posts")
    async def create_post(pid: str, payload: PostIn, user: dict = Depends(require_analyst)):
        await _own(pid, user)
        doc = {"id": str(uuid.uuid4()), "portfolio_id": pid, "owner_id": user["id"], "title": payload.title.strip(),
               "body": sanitize_html(payload.body), "subscribers_only": bool(payload.subscribers_only), "created_at": _now(), "updated_at": _now()}
        await posts.insert_one(dict(doc))
        return {"post": doc}

    @router.put("/analyst/portfolios/{pid}/posts/{post_id}")
    async def update_post(pid: str, post_id: str, payload: PostIn, user: dict = Depends(require_analyst)):
        await _own(pid, user)
        upd = {"title": payload.title.strip(), "body": sanitize_html(payload.body), "subscribers_only": bool(payload.subscribers_only), "updated_at": _now()}
        res = await posts.update_one({"id": post_id, "portfolio_id": pid, "owner_id": user["id"]}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Post not found")
        return {"post": await posts.find_one({"id": post_id}, {"_id": 0})}

    @router.delete("/analyst/portfolios/{pid}/posts/{post_id}")
    async def delete_post(pid: str, post_id: str, user: dict = Depends(require_analyst)):
        res = await posts.delete_one({"id": post_id, "portfolio_id": pid, "owner_id": user["id"]})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Post not found")
        return {"ok": True}

    # ---------- public ----------
    @router.get("/portfolios/{pid}/posts")
    async def public_posts(pid: str, authorization: Optional[str] = Header(None)):
        listing = await portfolios.find_one({"id": pid}, {"_id": 0, "id": 1, "status": 1, "subscription": 1, "owner_id": 1})
        viewer = await _viewer(authorization)
        is_admin = bool(viewer and viewer.get("role") == "admin")
        if not listing or (listing["status"] != "approved" and not is_admin):
            raise HTTPException(status_code=404, detail="Portfolio not found")
        unlocked_all = (await subs.access_for(db, listing, viewer))["unlocked"]
        out: List[dict] = []
        async for p in posts.find({"portfolio_id": pid}, {"_id": 0}).sort("created_at", -1).limit(100):
            if unlocked_all or not p.get("subscribers_only"):
                out.append({**p, "locked": False})
            else:
                out.append({"id": p["id"], "portfolio_id": pid, "title": p["title"], "created_at": p["created_at"], "subscribers_only": True, "locked": True})
        return {"posts": out, "paid": listing.get("subscription") == "Paid", "unlocked": bool(unlocked_all)}

    # ---------- admin: light moderation ----------
    @router.get("/admin/posts")
    async def admin_posts(portfolio_id: Optional[str] = Query(None), _: dict = Depends(require_admin)):
        q = {"portfolio_id": portfolio_id} if portfolio_id else {}
        rows = await posts.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
        names = {d["id"]: d.get("name") async for d in portfolios.find({"id": {"$in": list({r["portfolio_id"] for r in rows})}}, {"_id": 0, "id": 1, "name": 1})}
        return {"posts": [{**r, "portfolio_name": names.get(r["portfolio_id"])} for r in rows]}

    @router.delete("/admin/posts/{post_id}")
    async def admin_delete_post(post_id: str, payload: dict = Body(default={}), user: dict = Depends(require_admin)):
        doc = await posts.find_one({"id": post_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Post not found")
        await posts.delete_one({"id": post_id})
        await db.audit_log.insert_one({"id": str(uuid.uuid4()), "type": "post_removed", "post_id": post_id, "portfolio_id": doc["portfolio_id"],
                                       "title": doc.get("title"), "reason": (payload.get("reason") or "").strip(), "admin": user.get("email"), "at": _now()})
        return {"ok": True}

    return router

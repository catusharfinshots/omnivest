"""Partner analytics (Phase 3 foundation).

- POST /api/events            public, batched, lightweight event ingest. The owner is
                              resolved server-side from the portfolio, never trusted
                              from the client.
- GET  /api/analyst/stats     the logged-in analyst's funnel: totals + previous
                              window, daily series, per-portfolio rows, nudges.
- GET  /api/partner-dashboard/settings         (public read)
- PUT  /api/admin/partner-dashboard/settings   admin controls for the dashboard
                              (tiles, nudges, thresholds, announcement).
Collection: events {id, type, portfolio_id, owner_id, user_id, sid, path, ts(datetime)}
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, Header, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from auth import build_current_user_dep, decode_token

EVENT_TYPES = {"portfolio_impression", "portfolio_view", "invest_click", "factsheet_download", "share_click"}
SETTINGS_ID = "partner_dashboard"
SETTINGS_DEFAULTS = {
    "enabled": True,
    "defaultWindowDays": 30,
    "tiles": {"views": True, "impressions": True, "investClicks": True, "conversion": True},
    "nudges": {"enabled": True, "staleDays": 30, "draftDays": 7},
    "announcement": "",
}


class EventIn(BaseModel):
    type: str = Field(..., max_length=40)
    portfolio_id: Optional[str] = Field(default=None, max_length=64)
    path: Optional[str] = Field(default=None, max_length=300)
    sid: Optional[str] = Field(default=None, max_length=64)


class EventsBatch(BaseModel):
    events: List[EventIn] = Field(..., min_length=1, max_length=50)


def _parse_dt(s) -> Optional[datetime]:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:  # noqa: BLE001
        return None


def _deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base)
    for k, v in (patch or {}).items():
        if k not in base:
            continue
        if isinstance(base[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(base[k], v)
        elif isinstance(base[k], bool):
            out[k] = bool(v)
        elif isinstance(base[k], int) and not isinstance(base[k], bool):
            try:
                out[k] = max(1, min(int(v), 365))
            except Exception:  # noqa: BLE001
                pass
        elif isinstance(base[k], str):
            out[k] = str(v)[:400]
    return out


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(tags=["partner-analytics"])
    require_analyst = build_current_user_dep(db, ["analyst"])
    require_admin = build_current_user_dep(db, ["admin"])
    events, portfolios, settings = db.events, db.analyst_portfolios, db.app_settings
    _indexed = {"done": False}

    async def _ensure_indexes():
        if _indexed["done"]:
            return
        await events.create_index([("owner_id", 1), ("ts", -1)])
        await events.create_index([("portfolio_id", 1), ("ts", -1)])
        _indexed["done"] = True

    async def _settings() -> dict:
        doc = await settings.find_one({"_id": SETTINGS_ID}) or {}
        doc.pop("_id", None)
        return _deep_merge(SETTINGS_DEFAULTS, doc)

    # ---------------- ingest ----------------
    @router.post("/events")
    async def ingest(batch: EventsBatch, authorization: Optional[str] = Header(None)):
        await _ensure_indexes()
        user_id = None
        if authorization and authorization.startswith("Bearer "):
            try:
                user_id = decode_token(authorization.split(" ", 1)[1].strip()).get("sub")
            except Exception:  # noqa: BLE001
                user_id = None
        pids = {e.portfolio_id for e in batch.events if e.portfolio_id}
        owners = {}
        if pids:
            async for d in portfolios.find({"id": {"$in": list(pids)}}, {"_id": 0, "id": 1, "owner_id": 1}):
                owners[d["id"]] = d.get("owner_id")
        now = datetime.now(timezone.utc)
        docs = []
        for e in batch.events:
            if e.type not in EVENT_TYPES or not e.portfolio_id or e.portfolio_id not in owners:
                continue
            docs.append({
                "id": str(uuid.uuid4()), "type": e.type, "portfolio_id": e.portfolio_id,
                "owner_id": owners[e.portfolio_id], "user_id": user_id, "sid": e.sid, "path": e.path, "ts": now,
            })
        if docs:
            await events.insert_many(docs)
        return {"ok": True, "accepted": len(docs)}

    # ---------------- analyst stats ----------------
    @router.get("/analyst/stats")
    async def analyst_stats(days: int = Query(30, ge=7, le=365), user: dict = Depends(require_analyst)):
        await _ensure_indexes()
        cfg = await _settings()
        owner = user["id"]
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=days)
        prev_start = start - timedelta(days=days)

        async def totals(a: datetime, b: datetime) -> dict:
            pipe = [{"$match": {"owner_id": owner, "ts": {"$gte": a, "$lt": b}}},
                    {"$group": {"_id": "$type", "n": {"$sum": 1}}}]
            return {r["_id"]: r["n"] async for r in events.aggregate(pipe)}

        def shape(t: dict) -> dict:
            views = t.get("portfolio_view", 0)
            clicks = t.get("invest_click", 0)
            return {
                "views": views,
                "impressions": t.get("portfolio_impression", 0),
                "investClicks": clicks,
                "factsheetDownloads": t.get("factsheet_download", 0),
                "shares": t.get("share_click", 0),
                "conversionPct": round(100.0 * clicks / views, 1) if views else 0.0,
            }

        cur, prev = shape(await totals(start, now)), shape(await totals(prev_start, start))

        per: dict = {}
        pipe = [{"$match": {"owner_id": owner, "ts": {"$gte": start}}},
                {"$group": {"_id": {"p": "$portfolio_id", "t": "$type"}, "n": {"$sum": 1}}}]
        async for r in events.aggregate(pipe):
            per.setdefault(r["_id"]["p"], {})[r["_id"]["t"]] = r["n"]

        daily: dict = {}
        pipe = [{"$match": {"owner_id": owner, "ts": {"$gte": start}, "type": {"$in": ["portfolio_view", "invest_click"]}}},
                {"$group": {"_id": {"d": {"$dateToString": {"format": "%Y-%m-%d", "date": "$ts"}}, "t": "$type"}, "n": {"$sum": 1}}}]
        async for r in events.aggregate(pipe):
            day = daily.setdefault(r["_id"]["d"], {"views": 0, "investClicks": 0})
            day["views" if r["_id"]["t"] == "portfolio_view" else "investClicks"] = r["n"]
        series = []
        for i in range(days):
            d = (start + timedelta(days=i + 1)).strftime("%Y-%m-%d")
            series.append({"date": d, **daily.get(d, {"views": 0, "investClicks": 0})})

        plist = await portfolios.find(
            {"owner_id": owner},
            {"_id": 0, "id": 1, "name": 1, "status": 1, "updated_at": 1, "created_at": 1, "factsheet_pdf": 1},
        ).to_list(500)
        rows = []
        for p in plist:
            t = per.get(p["id"], {})
            v, c = t.get("portfolio_view", 0), t.get("invest_click", 0)
            rows.append({
                "id": p["id"], "name": p.get("name") or "Untitled", "status": p.get("status"),
                "impressions": t.get("portfolio_impression", 0), "views": v, "investClicks": c,
                "factsheetDownloads": t.get("factsheet_download", 0), "shares": t.get("share_click", 0),
                "conversionPct": round(100.0 * c / v, 1) if v else 0.0,
            })
        rows.sort(key=lambda r: (-r["views"], -r["impressions"], r["name"]))

        nudges = []
        if cfg["nudges"]["enabled"]:
            stale_days, draft_days = cfg["nudges"]["staleDays"], cfg["nudges"]["draftDays"]
            if not plist:
                nudges.append({"kind": "no_listings", "text": "Publish your first model portfolio — approved listings appear on the Model Portfolios page for every investor.", "action": "new"})
            for p in plist:
                nm = p.get("name") or "Untitled"
                st = p.get("status")
                if st == "approved" and not p.get("factsheet_pdf"):
                    nudges.append({"kind": "no_factsheet", "portfolio_id": p["id"], "text": f"“{nm}” has no factsheet PDF — listings with a factsheet convert better.", "action": "edit"})
                upd = _parse_dt(p.get("updated_at"))
                if st == "approved" and upd and (now - upd).days > stale_days:
                    nudges.append({"kind": "stale_update", "portfolio_id": p["id"], "text": f"“{nm}” hasn't been updated in {(now - upd).days} days — refresh the factsheet or rebalance note.", "action": "edit"})
                crt = _parse_dt(p.get("created_at"))
                if st in ("draft", "rejected") and crt and (now - crt).days > draft_days:
                    nudges.append({"kind": "draft_unsubmitted", "portfolio_id": p["id"], "text": f"“{nm}” has been in {st} for {(now - crt).days} days — complete and submit it for review.", "action": "edit"})
            prof = user.get("analyst_profile") or {}
            if not (prof.get("philosophy") or "").strip() or not (prof.get("description") or "").strip():
                nudges.append({"kind": "profile_incomplete", "text": "Complete your profile (philosophy and about you) — investors read it before subscribing.", "action": "profile"})

        return {"windowDays": days, "totals": cur, "previous": prev, "series": series, "portfolios": rows, "nudges": nudges[:6], "settings": cfg}

    # ---------------- admin: cleanup helper (tests / removing a listing's history) ----------------
    @router.delete("/admin/events/by-portfolio/{pid}")
    async def delete_portfolio_events(pid: str, _: dict = Depends(require_admin)):
        r = await events.delete_many({"portfolio_id": pid})
        return {"ok": True, "deleted": r.deleted_count}

    # ---------------- admin settings ----------------
    @router.get("/partner-dashboard/settings")
    async def get_settings():
        return {"settings": await _settings()}

    @router.put("/admin/partner-dashboard/settings")
    async def update_settings(payload: dict = Body(...), _: dict = Depends(require_admin)):
        merged = _deep_merge(await _settings(), payload)
        await settings.update_one({"_id": SETTINGS_ID}, {"$set": {"_id": SETTINGS_ID, **merged}}, upsert=True)
        return {"settings": merged}

    return router

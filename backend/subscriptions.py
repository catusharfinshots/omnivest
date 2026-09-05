"""Subscriptions — who has access to a paid listing, and until when.

One row per subscription: investor, listing, plan, price, start, expiry, how it was created
(admin grant now; Razorpay later writes the same row), status and an audit trail.

The rule everything else relies on:
    unlocked = listing is free  OR  viewer is admin  OR  viewer owns the listing  OR  viewer has an active row.
Holdings (names, symbols, prices), the factsheet PDF and subscriber-only updates are served only when unlocked.
The locking is done on the server (see lock_listing / lock_perf) so a non-subscriber never receives the data,
not merely a page that hides it.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep, decode_token

COLL = "subscriptions"
INTEREST = "subscription_interest"
PLAN_MONTHS = (1, 3, 6, 12)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt) -> Optional[str]:
    if not isinstance(dt, datetime):
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def _aware(dt) -> Optional[datetime]:
    if not isinstance(dt, datetime):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _mask_phone(p: Optional[str]) -> str:
    p = p or ""
    return f"{p[:3]}•••••{p[-3:]}" if len(p) >= 8 else p


# ---------------- access rules (used by analyst.py, performance.py, posts.py) ----------------
async def viewer_from_header(db: AsyncIOMotorDatabase, authorization: Optional[str]) -> Optional[dict]:
    """Best-effort identity from a Bearer header; None for anonymous or bad tokens."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        payload = decode_token(authorization.split(" ", 1)[1].strip())
        return await db.users.find_one({"id": payload.get("sub")}, {"_id": 0, "id": 1, "role": 1, "name": 1, "phone": 1, "email": 1})
    except Exception:  # noqa: BLE001
        return None


async def active_subscription(db: AsyncIOMotorDatabase, user_id: Optional[str], pid: str) -> Optional[dict]:
    if not user_id:
        return None
    return await db[COLL].find_one({"user_id": user_id, "portfolio_id": pid, "status": "active", "expires_at": {"$gt": _now()}}, {"_id": 0})


async def access_for(db: AsyncIOMotorDatabase, listing: dict, viewer: Optional[dict]) -> Dict[str, Any]:
    """Who may see the full listing. `listing` needs subscription, owner_id, id."""
    paid = listing.get("subscription") == "Paid"
    out: Dict[str, Any] = {"paid": paid, "unlocked": True, "reason": "free", "subscribed_until": None, "plan_months": None}
    if not paid:
        return out
    if viewer and viewer.get("role") == "admin":
        out.update(reason="admin")
        return out
    if viewer and viewer.get("id") == listing.get("owner_id"):
        out.update(reason="owner")
        return out
    sub = await active_subscription(db, viewer.get("id") if viewer else None, listing.get("id"))
    if sub:
        out.update(reason="subscriber", subscribed_until=_iso(sub.get("expires_at")), plan_months=sub.get("plan_months"))
        return out
    out.update(unlocked=False, reason="locked")
    return out


def lock_listing(doc: dict) -> dict:
    """Strip everything that reveals the recipe; keep the shape that sells (count, largest weight, distribution)."""
    cons = doc.get("constituents") or []
    weights = [float(c.get("weight") or 0) for c in cons]
    doc["holdings_locked"] = True
    doc["holdings_count"] = len(cons)
    doc["holdings_kind"] = "ETFs" if cons and all((c.get("type") == "ETF") for c in cons) else "stocks"
    doc["top_weight_pct"] = max(weights) if weights else None
    doc["constituents"] = []
    doc["versions"] = [{"effective_date": v.get("effective_date"), "count": len(v.get("constituents") or [])} for v in (doc.get("versions") or [])]
    if doc.get("factsheet_pdf"):
        doc["factsheet_pdf"] = {"locked": True, "filename": (doc["factsheet_pdf"] or {}).get("filename")}
    return doc


def lock_perf(perf: dict) -> dict:
    """Performance stays public; per-stock prices and the holdings list do not."""
    perf.pop("latest_prices", None)
    mi = perf.get("min_investment")
    if isinstance(mi, dict):
        perf["min_investment"] = {k: v for k, v in mi.items() if k != "holdings"}
        perf["min_investment"]["holdings"] = []
    # engine messages can name a stock ("No price history for X"); a locked viewer gets a neutral message instead
    if perf.get("errors"):
        perf["errors"] = ["Some price data is temporarily unavailable."]
    perf["holdings_locked"] = True
    return perf


# ---------------- routes ----------------
def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter()
    col = db[COLL]
    portfolios = db.analyst_portfolios
    require_user = build_current_user_dep(db)
    require_admin = build_current_user_dep(db, ["admin"])
    require_analyst = build_current_user_dep(db, ["analyst"])

    async def _listing_brief(pid: str) -> Optional[dict]:
        return await portfolios.find_one({"id": pid}, {"_id": 0, "id": 1, "name": 1, "owner_id": 1, "owner_name": 1, "subscription": 1, "plans": 1, "status": 1, "cover": 1})

    def _row(s: dict, listing: Optional[dict] = None, user: Optional[dict] = None) -> dict:
        exp = _aware(s.get("expires_at"))
        return {
            "id": s["id"], "portfolio_id": s["portfolio_id"], "user_id": s["user_id"],
            "plan_months": s.get("plan_months"), "price": s.get("price"), "source": s.get("source"),
            "status": s.get("status"), "started_at": _iso(s.get("started_at")), "expires_at": _iso(exp),
            "active": s.get("status") == "active" and bool(exp and exp > _now()),
            "note": s.get("note", ""), "created_by": s.get("created_by"),
            "listing": {"id": listing["id"], "name": listing.get("name"), "owner_name": listing.get("owner_name")} if listing else None,
            "user": {"name": user.get("name", ""), "phone": _mask_phone(user.get("phone")), "email": user.get("email")} if user else None,
        }

    async def _audit(kind: str, s: dict, admin: dict, note: str = "") -> None:
        await db.audit_log.insert_one({"id": str(uuid.uuid4()), "type": kind, "portfolio_id": s["portfolio_id"], "subscription_id": s["id"],
                                       "user_id": s["user_id"], "plan_months": s.get("plan_months"), "expires_at": _iso(s.get("expires_at")),
                                       "note": note, "admin": admin.get("email") or admin.get("name") or admin.get("id"), "at": _now().isoformat()})

    # ---- investor ----
    @router.get("/me/subscriptions")
    async def my_subscriptions(user: dict = Depends(require_user)):
        rows = await col.find({"user_id": user["id"]}, {"_id": 0}).sort("expires_at", -1).to_list(200)
        out = []
        for s in rows:
            listing = await _listing_brief(s["portfolio_id"])
            r = _row(s, listing)
            if listing:
                r["listing"]["cover"] = listing.get("cover")
            out.append(r)
        return {"subscriptions": out}

    @router.post("/portfolios/{pid}/subscribe-interest")
    async def subscribe_interest(pid: str, payload: dict = Body(default={}), user: dict = Depends(require_user)):
        """Until online payment exists: record that this investor wants a plan, so Omnivest can follow up and grant."""
        listing = await _listing_brief(pid)
        if not listing or listing.get("status") != "approved":
            raise HTTPException(status_code=404, detail="Portfolio not found")
        if listing.get("subscription") != "Paid":
            raise HTTPException(status_code=409, detail="This listing is free — no subscription needed.")
        months = int(payload.get("plan_months") or 0)
        plan = next((p for p in (listing.get("plans") or []) if int(p.get("months") or 0) == months), None)
        doc = {"id": str(uuid.uuid4()), "portfolio_id": pid, "portfolio_name": listing.get("name"), "user_id": user["id"],
               "name": user.get("name", ""), "phone": user.get("phone"), "email": user.get("email"),
               "plan_months": months or None, "price": (plan or {}).get("price"), "status": "open", "created_at": _now()}
        await db[INTEREST].update_one({"portfolio_id": pid, "user_id": user["id"], "status": "open"}, {"$setOnInsert": doc}, upsert=True)
        return {"ok": True, "message": "Thanks — we'll confirm your subscription shortly."}

    # ---- partner ----
    @router.get("/analyst/portfolios/{pid}/subscribers")
    async def my_subscribers(pid: str, user: dict = Depends(require_analyst)):
        listing = await portfolios.find_one({"id": pid, "owner_id": user["id"]}, {"_id": 0, "id": 1})
        if not listing:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        rows = await col.find({"portfolio_id": pid}, {"_id": 0}).sort("started_at", -1).to_list(1000)
        out = []
        for s in rows:
            u = await db.users.find_one({"id": s["user_id"]}, {"_id": 0, "name": 1, "phone": 1})
            r = _row(s, None, u)
            r.pop("user_id", None)
            out.append(r)
        active = [r for r in out if r["active"]]
        return {"active": len(active), "total": len(out), "revenue": sum(float(r.get("price") or 0) for r in active), "subscribers": out,
                "interest": await db[INTEREST].count_documents({"portfolio_id": pid, "status": "open"})}

    # ---- admin ----
    @router.get("/admin/subscriptions")
    async def list_subscriptions(portfolio_id: Optional[str] = Query(default=None), q: Optional[str] = Query(default=None), _: dict = Depends(require_admin)):
        query: Dict[str, Any] = {}
        if portfolio_id:
            query["portfolio_id"] = portfolio_id
        rows = await col.find(query, {"_id": 0}).sort("started_at", -1).to_list(2000)
        out: List[dict] = []
        needle = (q or "").strip().lower()
        for s in rows:
            u = await db.users.find_one({"id": s["user_id"]}, {"_id": 0, "name": 1, "phone": 1, "email": 1})
            listing = await _listing_brief(s["portfolio_id"])
            r = _row(s, listing, u)
            if u:
                r["user"]["phone"] = u.get("phone")   # admin sees the full number
            hay = " ".join(str(x or "") for x in [(u or {}).get("name"), (u or {}).get("phone"), (u or {}).get("email"), (listing or {}).get("name")]).lower()
            if not needle or needle in hay:
                out.append(r)
        interest = await db[INTEREST].find({"status": "open"}, {"_id": 0}).sort("created_at", -1).to_list(500)
        for i in interest:
            i["created_at"] = _iso(i.get("created_at"))
        counts = {"active": sum(1 for r in out if r["active"]), "total": len(out), "interest": len(interest)}
        return {"subscriptions": out, "interest": interest, "counts": counts}

    @router.post("/admin/subscriptions")
    async def grant(payload: dict = Body(...), admin: dict = Depends(require_admin)):
        """Grant access by hand (until online payment): user by phone / email / id, listing, plan."""
        pid = (payload.get("portfolio_id") or "").strip()
        listing = await _listing_brief(pid)
        if not listing:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        if listing.get("subscription") != "Paid":
            raise HTTPException(status_code=409, detail="This listing is free — nothing to grant.")
        ident = (payload.get("user") or "").strip()
        user = None
        if ident:
            user = await db.users.find_one({"$or": [{"id": ident}, {"phone": ident}, {"email": ident.lower()}, {"phone": f"+91{ident}"}]}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "role": 1})
        if not user:
            raise HTTPException(status_code=404, detail="No account with that phone / email. The investor must log in once first.")
        months = int(payload.get("plan_months") or 0)
        if months not in PLAN_MONTHS:
            raise HTTPException(status_code=422, detail="plan_months must be 1, 3, 6 or 12")
        plan = next((p for p in (listing.get("plans") or []) if int(p.get("months") or 0) == months), None)
        price = payload.get("price")
        price = float(price) if price not in (None, "") else float((plan or {}).get("price") or 0)
        start = _now()
        existing = await active_subscription(db, user["id"], pid)
        if existing:
            start = _aware(existing["expires_at"])   # stacking: a new grant extends from the current expiry
        s = {"id": str(uuid.uuid4()), "user_id": user["id"], "portfolio_id": pid, "plan_months": months, "price": price,
             "source": "admin", "status": "active", "started_at": start, "expires_at": start + timedelta(days=30 * months),
             "note": (payload.get("note") or "").strip(), "created_by": admin.get("email") or admin.get("id"), "created_at": _now()}
        await col.insert_one(dict(s))
        await db[INTEREST].update_many({"portfolio_id": pid, "user_id": user["id"], "status": "open"}, {"$set": {"status": "granted", "granted_at": _now()}})
        await _audit("subscription_granted", s, admin, s["note"])
        return {"ok": True, "subscription": _row(s, listing, user)}

    @router.post("/admin/subscriptions/{sid}/revoke")
    async def revoke(sid: str, payload: dict = Body(default={}), admin: dict = Depends(require_admin)):
        s = await col.find_one({"id": sid}, {"_id": 0})
        if not s:
            raise HTTPException(status_code=404, detail="Subscription not found")
        note = (payload.get("note") or "").strip()
        await col.update_one({"id": sid}, {"$set": {"status": "cancelled", "cancelled_at": _now(), "cancel_note": note}})
        await _audit("subscription_revoked", s, admin, note)
        return {"ok": True}

    @router.post("/admin/subscriptions/{sid}/extend")
    async def extend(sid: str, payload: dict = Body(default={}), admin: dict = Depends(require_admin)):
        s = await col.find_one({"id": sid}, {"_id": 0})
        if not s:
            raise HTTPException(status_code=404, detail="Subscription not found")
        months = int(payload.get("months") or 1)
        if months < 1 or months > 24:
            raise HTTPException(status_code=422, detail="months must be between 1 and 24")
        base = max(_aware(s.get("expires_at")) or _now(), _now())
        new_exp = base + timedelta(days=30 * months)
        await col.update_one({"id": sid}, {"$set": {"expires_at": new_exp, "status": "active"}})
        s["expires_at"] = new_exp
        await _audit("subscription_extended", s, admin, f"+{months} month(s)")
        return {"ok": True, "expires_at": _iso(new_exp)}

    return router

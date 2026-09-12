"""Dashboard: the logged-in home. One call assembles everything the investor's money touches on Omnivest
(smallcase's Overview as the bare minimum, plus what only we can say from the data we already record).

  overview   value / invested / returns from the investments snapshots (holdings-based), active subscriptions,
             fees paid, weighted day move of the invested portfolios
  market     NIFTY 50 / SENSEX ticks from the market-data Kite session (cached 60 s), session state, next open
  nudges     what needs the investor: broker, profile, incomplete portfolio, pending orders, renewal due
  interests  portfolios the investor viewed (events) with "moved since you first viewed" from the NAV series
  trending   most invested (30 d, by amount), most viewed (7 d), new launches (30 d)
  posts      latest partner updates for portfolios the investor invested in, subscribes to, watches or viewed
  fees       fees paid vs returns earned, break-even
"""
from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep
import investing as inv

logger = logging.getLogger("dashboard")
IST = timezone(timedelta(hours=5, minutes=30))
ACTIVE = ("complete", "incomplete", "in_progress", "unchecked")
INDICES = [("NSE:NIFTY 50", "NIFTY 50"), ("BSE:SENSEX", "SENSEX")]
_tick_cache: Dict[str, Any] = {"at": 0.0, "data": None}


# ---------------- pure helpers (unit-tested) ----------------

def nav_on_or_before(series: List[dict], day: str) -> Optional[float]:
    """NAV at the last close on/before `day` (YYYY-MM-DD)."""
    best = None
    for p in series or []:
        if str(p.get("d", "")) <= day:
            best = p.get("nav")
        else:
            break
    return best


def moved_since(series: List[dict], day: str) -> Optional[float]:
    start = nav_on_or_before(series, day)
    if not series or not start:
        return None
    end = series[-1].get("nav")
    return round((end - start) * 100.0 / start, 2) if end and start else None


def day_move(series: List[dict]) -> Optional[float]:
    if not series or len(series) < 2:
        return None
    a, b = series[-2].get("nav"), series[-1].get("nav")
    return round((b - a) * 100.0 / a, 2) if a and b else None


def weighted(values: List[tuple]) -> Optional[float]:
    """values: [(weight, pct)] -> weighted pct, ignoring None."""
    tot = sum(w for w, p in values if p is not None and w)
    if not tot:
        return None
    return round(sum(w * p for w, p in values if p is not None and w) / tot, 2)


def fees_vs_returns(fees: float, returns: float) -> dict:
    fees, returns = float(fees or 0), float(returns or 0)
    if fees <= 0:
        return {"fees": 0.0, "returns": round(returns, 2), "covered_pct": None, "gap": None}
    covered = max(0.0, min(999.0, returns * 100.0 / fees))
    return {"fees": round(fees, 2), "returns": round(returns, 2), "covered_pct": round(covered, 1), "gap": round(max(0.0, fees - returns), 2)}


def context_line(market: dict, nifty_pct: Optional[float], my_pct: Optional[float], pending_n: int, next_open_text: str) -> str:
    parts = []
    parts.append("Market is open." if market.get("open") else "Market is closed.")
    if nifty_pct is not None:
        word = "rose" if nifty_pct > 0 else "fell" if nifty_pct < 0 else "was flat"
        s = f"NIFTY 50 {word}{'' if nifty_pct == 0 else f' {abs(nifty_pct):.1f}%'} today"
        if my_pct is not None:
            s += f"; your portfolios moved {'+' if my_pct >= 0 else ''}{my_pct:.1f}%"
        parts.append(s + ".")
    if pending_n and next_open_text:
        parts.append(f"Your {pending_n} after-market order{'s' if pending_n > 1 else ''} execute{'' if pending_n > 1 else 's'} on {next_open_text}.")
    return " ".join(parts)


COLLECTIONS = [
    ("most_subscribed", "Most subscribed", "Most subscribed in the last 4 weeks", "flame"),
    ("free", "Free to start", "No subscription; invest from the minimum", "gift"),
    ("under_10k", "Under ₹10,000", "Portfolios you can start with a small amount", "wallet"),
    ("low_vol", "Steady movers", "Low-volatility portfolios", "shield"),
    ("new", "New launches", "Launched in the last 30 days", "sparkles"),
]


def collection_buckets(items: List[dict], today: Optional[str] = None) -> List[dict]:
    """Group live listings into the curated shelves ('Take your pick'). Pure, unit-tested.
    items: {id, paid, min_amount, volatility_label, launch_date, subscribers_4w, ...}; ordering rules per shelf."""
    from datetime import date as _date
    today_d = _date.fromisoformat(today) if today else _date.today()
    def days_since(s):
        try:
            return (today_d - _date.fromisoformat(str(s)[:10])).days
        except Exception:  # noqa: BLE001
            return None
    out = []
    for key, title, sub, icon in COLLECTIONS:
        if key == "most_subscribed":
            rows = sorted([i for i in items if (i.get("subscribers_4w") or 0) > 0], key=lambda i: -(i.get("subscribers_4w") or 0))
        elif key == "free":
            rows = sorted([i for i in items if not i.get("paid")], key=lambda i: -(i.get("return_pct") or 0))
        elif key == "under_10k":
            rows = sorted([i for i in items if i.get("min_amount") and i["min_amount"] <= 10000], key=lambda i: i["min_amount"])
        elif key == "low_vol":
            rows = sorted([i for i in items if i.get("volatility_label") == "Low"], key=lambda i: -(i.get("return_pct") or 0))
        else:
            rows = sorted([i for i in items if (d := days_since(i.get("launch_date"))) is not None and d <= 30], key=lambda i: str(i.get("launch_date")), reverse=True)
        if rows:
            out.append({"key": key, "title": title, "sub": sub, "icon": icon, "items": rows[:8]})
    return out


def strip_html(s: str, limit: int = 160) -> str:
    t = re.sub(r"<[^>]+>", " ", s or "")
    t = re.sub(r"\s+", " ", t).strip()
    return (t[: limit - 1] + "…") if len(t) > limit else t


def _aware(v):
    return (v if v.tzinfo else v.replace(tzinfo=timezone.utc)) if isinstance(v, datetime) else v


def _iso(v):
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).isoformat()
    return v


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/dashboard", tags=["dashboard"])
    require_user = build_current_user_dep(db)
    portfolios, perf, events, batches, snaps = db.analyst_portfolios, db.portfolio_performance, db.events, db.invest_batches, db["investments"]

    async def _state():
        from listing_options import load_rules
        import market_calendar
        r = await load_rules(db)
        hol = await market_calendar.holidays(db, r.get("market_holidays") or [])
        return inv.market_state(holidays=hol)

    async def _ticks(user_id: Optional[str] = None) -> Optional[List[dict]]:
        if time.time() - _tick_cache["at"] < 60 and _tick_cache["data"]:
            return _tick_cache["data"]
        import market_data
        tokens = []
        row = await db.kite_sessions.find_one({"account": "market-data"})
        if row and row.get("access_token") and not row.get("needs_reconnect"):
            tokens.append(("market", row["access_token"]))
        if user_id:
            conn = await db.broker_connections.find_one({"user_id": user_id, "broker": "kite"})
            if conn and conn.get("access_token") and not conn.get("expired_at"):
                tokens.append(("investor", conn["access_token"]))
        for src, tok in tokens:
            try:
                k = market_data._new_client(tok)
                q = await run_in_threadpool(lambda: k.quote([s for s, _ in INDICES]))
                out = []
                for sym, label in INDICES:
                    d = q.get(sym) or {}
                    ltp, close = float(d.get("last_price") or 0), float((d.get("ohlc") or {}).get("close") or 0)
                    if ltp:
                        out.append({"label": label, "ltp": round(ltp, 2), "change_pct": round((ltp - close) * 100.0 / close, 2) if close else None})
                if out:
                    _tick_cache.update({"at": time.time(), "data": out})
                    return out
            except Exception as e:  # noqa: BLE001
                logger.info("index ticks via %s session unavailable: %s", src, str(e)[:120])
        return _tick_cache["data"] or []

    async def _meta(ids: List[str]) -> Dict[str, dict]:
        if not ids:
            return {}
        docs = await portfolios.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "owner_id": 1, "owner_name": 1, "cover": 1, "subtitle": 1, "tags": 1, "strategy": 1, "subscription": 1, "launch_date": 1, "status": 1}).to_list(len(ids))
        owners = {d.get("owner_id") for d in docs if d.get("owner_id")}
        users = {u["id"]: u async for u in db.users.find({"id": {"$in": list(owners)}}, {"_id": 0, "id": 1, "name": 1, "analyst_profile": 1})} if owners else {}
        try:
            from covers import public_cover
        except Exception:  # noqa: BLE001
            public_cover = lambda d: d.get("cover")  # noqa: E731
        out = {}
        for d in docs:
            u = users.get(d.get("owner_id")) or {}
            out[d["id"]] = {"id": d["id"], "name": d.get("name"), "manager": (u.get("analyst_profile") or {}).get("displayName") or d.get("owner_name") or u.get("name") or "",
                            "cover": public_cover(d), "paid": d.get("subscription") == "Paid", "launch_date": d.get("launch_date"), "live": d.get("status") == "approved"}
        return out

    async def _perf(ids: List[str]) -> Dict[str, dict]:
        if not ids:
            return {}
        return {p["_id"]: p async for p in perf.find({"_id": {"$in": ids}}, {"series": 1, "metrics": 1})}

    def _summary(p: Optional[dict]) -> dict:
        m = (p or {}).get("metrics") or {}
        return {"return_pct": m.get("return_pct"), "cagr_pct": m.get("cagr_pct"), "volatility_label": m.get("volatility_label"), "day_pct": day_move((p or {}).get("series") or [])}

    @router.get("")
    async def dashboard(user: dict = Depends(require_user)):
        uid, now = user["id"], datetime.now(timezone.utc)
        state = await _state()
        next_open = ""
        try:
            next_open = datetime.fromisoformat(state["next_open_ist"]).strftime("%a %d %b at %I:%M %p").replace(" 0", " ")
        except Exception:  # noqa: BLE001
            pass

        # --- overview from holdings snapshots ---
        my = await snaps.find({"user_id": uid}).to_list(100)
        active = [s for s in my if s.get("health") in ACTIVE]
        value = round(sum(float(s.get("current") or 0) for s in active), 2)
        invested = round(sum(float(s.get("invested") or 0) for s in active), 2)
        returns = round(value - invested, 2)
        since = _aware(min((s.get("first_invested_at") for s in active if s.get("first_invested_at")), default=None))
        checked = _aware(max((s.get("checked_at") for s in my if s.get("checked_at")), default=None))
        perf_mine = await _perf([s["portfolio_id"] for s in active])
        my_day = weighted([(float(s.get("current") or 0), day_move((perf_mine.get(s["portfolio_id"]) or {}).get("series") or [])) for s in active])

        subs = await db.subscriptions.find({"user_id": uid, "status": "active", "expires_at": {"$gt": now}}, {"_id": 0, "portfolio_id": 1, "expires_at": 1, "plan_months": 1}).to_list(50)
        next_renewal = _aware(min((s["expires_at"] for s in subs if s.get("expires_at")), default=None))
        paid = await db.payment_orders.find({"user_id": uid, "status": "paid"}, {"_id": 0, "amount": 1, "subscription_id": 1}).to_list(500)
        cancelled_subs = {s["id"] for s in await db.subscriptions.find({"user_id": uid, "status": {"$in": ["cancelled", "revoked", "refunded"]}}, {"_id": 0, "id": 1}).to_list(500)}
        fees = round(sum(float(p.get("amount") or 0) for p in paid if p.get("subscription_id") not in cancelled_subs) / 100.0, 2)

        # --- nudges ---
        nudges: List[dict] = []
        conn = await db.broker_connections.find_one({"user_id": uid, "broker": "kite"})
        if not conn or not conn.get("access_token"):
            nudges.append({"type": "broker", "title": "Connect your broker", "body": "Orders go to your own account; connect once to invest and to match holdings.", "link": "/brokers/connect", "cta": "Connect"})
        elif conn.get("expired_at"):
            nudges.append({"type": "expired", "title": "Your broker login expired for today", "body": "Connect again to invest, match holdings or cancel orders.", "link": "/brokers/connect", "cta": "Connect again"})
        for s in active:
            if s.get("health") == "incomplete":
                miss = [r["symbol"] for r in s.get("rows") or [] if int(r.get("missing_qty") or 0) > 0]
                meta_name = (await _meta([s["portfolio_id"]])).get(s["portfolio_id"], {}).get("name") or "A portfolio"
                nudges.append({"type": "fix", "title": f"{meta_name} is missing {len(miss)} of {s.get('total_count')} stocks", "body": f"{', '.join(miss[:4])}{'…' if len(miss) > 4 else ''}. Fix buys them at today's price.", "link": "/investments", "cta": "Fix portfolio"})
        pend = await batches.find({"user_id": uid, "archived_at": {"$exists": False}, "counts.open": {"$gt": 0}}, {"_id": 0, "portfolio_name": 1, "counts": 1, "orders": 1, "mode": 1}).to_list(20)
        pending_n = sum(int((b.get("counts") or {}).get("open") or 0) for b in pend)
        if pending_n:
            syms = [o["symbol"] for b in pend for o in b.get("orders") or [] if o.get("order_id") and inv.norm_status(o.get("status")) not in inv.FINAL][:4]
            nudges.append({"type": "pending", "title": f"{pending_n} order{'s' if pending_n > 1 else ''} execute{'' if pending_n > 1 else 's'} {next_open}" if not state.get("open") else f"{pending_n} order{'s' if pending_n > 1 else ''} with your broker now",
                           "body": ", ".join(syms) + (", after-market." if not state.get("open") else "."), "link": "/orders", "cta": "See orders"})
        if not user.get("name") or not user.get("email"):
            nudges.append({"type": "profile", "title": "Add your email" if user.get("name") else "Complete your profile", "body": "Receipts and renewal reminders need it.", "link": "/account", "cta": "Profile"})
        if next_renewal and (next_renewal - now).days <= 14:
            nudges.append({"type": "renewal", "title": f"A subscription renews on {next_renewal.astimezone(IST).strftime('%d %b')}", "body": "Renew to keep seeing every stock and every update.", "link": "/account#subscriptions", "cta": "Subscriptions"})

        # --- interests: viewed portfolios ---
        views = await events.find({"user_id": uid, "type": "portfolio_view", "portfolio_id": {"$ne": None}}, {"_id": 0, "portfolio_id": 1, "ts": 1}).sort("ts", -1).to_list(400)
        first_seen: Dict[str, datetime] = {}
        order: List[str] = []
        for v in views:
            pid = v["portfolio_id"]
            if pid not in first_seen:
                order.append(pid)
            ts = _aware(v.get("ts")) or now
            if pid not in first_seen or ts < first_seen[pid]:
                first_seen[pid] = ts
        watch_ids = [w["portfolio_id"] for w in await db.watchlist.find({"user_id": uid}, {"_id": 0, "portfolio_id": 1}).to_list(200)]
        invested_ids = [s["portfolio_id"] for s in active]
        interest_ids = [p for p in order if p not in invested_ids][:6]
        for w in watch_ids:
            if w not in interest_ids and w not in invested_ids and len(interest_ids) < 6:
                interest_ids.append(w)
        meta = await _meta(interest_ids)
        perf_i = await _perf(interest_ids)
        interests = []
        for pid in interest_ids:
            m = meta.get(pid)
            if not m or not m.get("live"):
                continue
            fs = first_seen.get(pid)
            series = (perf_i.get(pid) or {}).get("series") or []
            interests.append({**m, **_summary(perf_i.get(pid)), "first_viewed_at": _iso(fs), "watching": pid in watch_ids,
                              "moved_since_view_pct": moved_since(series, fs.astimezone(IST).strftime("%Y-%m-%d")) if fs else None})

        # --- trending ---
        d30, d7 = now - timedelta(days=30), now - timedelta(days=7)
        inv_agg = await batches.aggregate([{"$match": {"placed_at": {"$gte": d30}, "kind": {"$in": ["invest", "fix"]}, "archived_at": {"$exists": False}}},
                                          {"$group": {"_id": "$portfolio_id", "amount": {"$sum": "$amount_adjusted"}, "n": {"$sum": 1}}}, {"$sort": {"amount": -1}}, {"$limit": 5}]).to_list(5)
        view_agg = await events.aggregate([{"$match": {"type": "portfolio_view", "ts": {"$gte": d7}, "portfolio_id": {"$ne": None}}},
                                           {"$group": {"_id": "$portfolio_id", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 5}]).to_list(5)
        new_docs = await portfolios.find({"status": "approved", "launch_date": {"$ne": None}}, {"_id": 0, "id": 1, "launch_date": 1}).sort("launch_date", -1).to_list(5)
        t_ids = list({*[x["_id"] for x in inv_agg], *[x["_id"] for x in view_agg], *[d["id"] for d in new_docs]})
        t_meta, t_perf = await _meta(t_ids), await _perf(t_ids)
        def row(pid, extra):
            m = t_meta.get(pid)
            return {**m, **_summary(t_perf.get(pid)), **extra} if m and m.get("live") else None
        trending = {
            "most_invested": [r for r in (row(x["_id"], {"amount": round(float(x["amount"] or 0)), "batches": x["n"]}) for x in inv_agg) if r][:3],
            "most_viewed": [r for r in (row(x["_id"], {"views": x["n"]}) for x in view_agg) if r][:3],
            "new_launches": [r for r in (row(d["id"], {"launched": d.get("launch_date")}) for d in new_docs) if r][:3],
        }

        # --- partner posts for portfolios the investor follows ---
        follow_ids = list({*invested_ids, *[s["portfolio_id"] for s in subs], *watch_ids, *order[:10]})
        posts = []
        if follow_ids:
            rows = await db.listing_posts.find({"portfolio_id": {"$in": follow_ids}}, {"_id": 0, "id": 1, "portfolio_id": 1, "title": 1, "body": 1, "created_at": 1, "subscribers_only": 1}).sort("created_at", -1).to_list(3)
            pm = await _meta([r["portfolio_id"] for r in rows])
            sub_ids = {s["portfolio_id"] for s in subs}
            for r in rows:
                m = pm.get(r["portfolio_id"]) or {}
                locked = bool(r.get("subscribers_only")) and r["portfolio_id"] not in sub_ids and r["portfolio_id"] not in invested_ids
                posts.append({"id": r["id"], "portfolio_id": r["portfolio_id"], "portfolio_name": m.get("name"), "manager": m.get("manager"), "title": r.get("title"),
                              "excerpt": "Subscribers only. Subscribe to read this update." if locked else strip_html(r.get("body")), "locked": locked, "at": _iso(r.get("created_at"))})

        # --- take your pick: curated shelves over every live listing (cached 5 min) ---
        shelves = await _shelves(watch_ids)
        featured = []
        seen_f = set()
        for src, label in ((trending["most_viewed"], "Trending this week"), (trending["new_launches"], "New launch"), (trending["most_invested"], "Most invested")):
            for r in src:                                   # one banner per source, so the pair reads as two stories
                if r["id"] not in seen_f and len(featured) < 2:
                    seen_f.add(r["id"]); featured.append({**r, "label": label}); break

        ticks = await _ticks(uid)
        nifty = next((t.get("change_pct") for t in ticks or [] if t.get("label") == "NIFTY 50"), None)
        return {
            "overview": {"value": value, "invested": invested, "returns": returns, "returns_pct": round(returns * 100.0 / invested, 2) if invested else None, "day_pct": my_day,
                         "since": _iso(since), "checked_at": _iso(checked), "portfolios": len(active),
                         "subscriptions": len(subs), "next_renewal": _iso(next_renewal)},
            "fees": fees_vs_returns(fees, returns),
            "market": {**state, "ticks": ticks or [], "next_open_text": next_open, "context": context_line(state, nifty, my_day, pending_n, next_open)},
            "nudges": nudges,
            "interests": interests,
            "trending": trending,
            "posts": posts,
            "collections": shelves,
            "featured": featured,
            "watchlist": watch_ids,
        }

    _shelf_cache: Dict[str, Any] = {"at": 0.0, "items": []}

    async def _shelves(watch_ids: List[str]) -> List[dict]:
        if time.time() - _shelf_cache["at"] > 300:
            docs = await portfolios.find({"status": "approved"}, {"_id": 0, "id": 1, "name": 1, "subtitle": 1, "owner_id": 1, "owner_name": 1, "cover": 1, "subscription": 1, "launch_date": 1, "tags": 1, "strategy": 1, "status": 1}).to_list(500)
            ids = [d["id"] for d in docs]
            meta, perf_all = await _meta(ids), {}
            async for p in perf.find({"_id": {"$in": ids}}, {"metrics": 1, "min_investment": 1, "series": {"$slice": -2}}):
                perf_all[p["_id"]] = p
            d28 = datetime.now(timezone.utc) - timedelta(days=28)
            subs_agg = {x["_id"]: x["n"] for x in await db.subscriptions.aggregate([{"$match": {"started_at": {"$gte": d28}, "status": "active"}}, {"$group": {"_id": "$portfolio_id", "n": {"$sum": 1}}}]).to_list(500)}
            items = []
            for d in docs:
                m, p = meta.get(d["id"]) or {}, perf_all.get(d["id"]) or {}
                items.append({**m, "subtitle": d.get("subtitle") or "", "min_amount": ((p.get("min_investment") or {}).get("amount")), **_summary(p), "subscribers_4w": subs_agg.get(d["id"], 0)})
            _shelf_cache.update({"at": time.time(), "items": items})
        items = [{**i, "watching": i["id"] in watch_ids} for i in _shelf_cache["items"]]
        return collection_buckets(items)

    return router

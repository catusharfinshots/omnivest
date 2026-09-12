"""Investments: holdings are the truth, orders are history.

An investor's real position lives in their Zerodha account and drifts the moment they touch Kite directly
(a cancel, a buy, a sell). So every judgement here is made by comparing what the account actually HOLDS with
what the portfolio TARGETS, never by an order's status (Tushar, 12 Sep 2026: "safeguard client interest").

  target[symbol]  = whole-share quantities the investor asked Omnivest for (sum over non-archived invest/fix batches)
  held[symbol]    = Zerodha holdings (settled + T+1) plus today's net CNC position, allocated to portfolios in the
                    order they were invested when two portfolios share a stock
  status per stock: held / partial / missing; 'sold' when our filled orders exceed what is held (sold outside)
  health: complete | incomplete | exited

Actions are always diffs: Fix = buy (target - held) for missing/partial stocks; Exit = sell everything held for the
portfolio. Both go through the same review -> funds gate -> place path as Invest, and land as batches (kind fix/exit)
so the Orders page keeps the audit trail. A rejected/cancelled order whose stock turns out to be held is marked
resolved_outside_at, which silences Repair on the Orders page without touching history.

Live reconcile needs the investor's Kite session (dies ~6 AM IST); otherwise the last snapshot is served, marked stale.
"""
from __future__ import annotations

import logging
import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep
from broker_kite import _kite_client
import investing as inv
import notifications as notif

logger = logging.getLogger("investments")
COLL = "investments"
TOL_PP = 2.0


# ---------------- pure helpers (unit-tested) ----------------

def held_from_kite(holdings: List[dict], positions_net: List[dict]) -> Dict[str, Dict[str, float]]:
    """Per symbol: qty actually in the account today, and Zerodha's average cost / last price when it has them.
    holdings = settled + T+1 shares; today's CNC trades sit in positions until they settle (net qty may be negative
    when the investor sold from holdings today), so the sum is the true count."""
    out: Dict[str, Dict[str, float]] = {}
    for h in holdings or []:
        s = (h.get("tradingsymbol") or "").upper()
        if not s:
            continue
        q = int(h.get("quantity") or 0) + int(h.get("t1_quantity") or 0)
        row = out.setdefault(s, {"qty": 0, "avg": 0.0, "ltp": 0.0})
        row["qty"] += q
        row["avg"] = float(h.get("average_price") or 0) or row["avg"]
        row["ltp"] = float(h.get("last_price") or 0) or row["ltp"]
    for p in positions_net or []:
        if (p.get("product") or "").upper() != "CNC":
            continue
        s = (p.get("tradingsymbol") or "").upper()
        q = int(p.get("quantity") or 0)
        if not s or q == 0:
            continue
        row = out.setdefault(s, {"qty": 0, "avg": 0.0, "ltp": 0.0})
        row["qty"] += q
        if q > 0 and not row["avg"]:
            row["avg"] = float(p.get("buy_price") or p.get("average_price") or 0)
        row["ltp"] = float(p.get("last_price") or 0) or row["ltp"]
    for r in out.values():
        r["qty"] = max(0, r["qty"])
    return out


def targets_from_batches(batches: List[dict]) -> Dict[str, dict]:
    """What the investor asked for, per symbol, from every non-archived invest/fix batch (exit batches subtract)."""
    t: Dict[str, dict] = {}
    for b in sorted(batches, key=lambda x: str(x.get("placed_at") or "")):
        archived = bool(b.get("archived_at"))          # cancelled by the investor: only what actually filled counts
        sign = -1 if b.get("kind") == "exit" else 1
        for o in b.get("orders") or []:
            s = (o.get("symbol") or "").upper()
            if not s:
                continue
            row = t.setdefault(s, {"symbol": s, "name": o.get("name") or "", "exchange": o.get("exchange") or "NSE", "weight_target": float(o.get("weight_target") or 0), "qty": 0, "filled": 0, "pending": 0})
            st = inv.norm_status(o.get("status"))
            filled = int(o.get("filled_qty") or (o.get("qty") if st == "COMPLETE" else 0) or 0)
            row["qty"] += sign * (filled if archived else int(o.get("qty") or 0))
            if filled:
                row["filled"] += sign * filled
            if not archived and sign > 0 and o.get("order_id") and st not in inv.FINAL:
                row["pending"] += max(0, int(o.get("qty") or 0) - int(o.get("filled_qty") or 0))   # open with Zerodha: on the way
            row["name"] = row["name"] or o.get("name") or ""
            if o.get("weight_target"):
                row["weight_target"] = float(o["weight_target"])
    return {s: r for s, r in t.items() if r["qty"] > 0}


def assess(targets: Dict[str, dict], held: Dict[str, int], prices: Dict[str, float], avg: Optional[Dict[str, float]] = None, extra: Optional[Dict[str, int]] = None) -> dict:
    """Compare target quantities with what is held (already allocated to this portfolio). `extra` = shares of the same
    stock in the account beyond every portfolio's target: the investor's own, shown but never counted. Pure."""
    rows, total_value, invested = [], 0.0, 0.0
    for s, t in targets.items():
        h = min(int(held.get(s, 0)), int(t["qty"]))
        ltp = float(prices.get(s) or 0)
        value = round(h * ltp, 2)
        cost = round(h * float((avg or {}).get(s) or ltp), 2)
        pending = min(int(t.get("pending") or 0), max(0, int(t["qty"]) - h))
        missing = max(0, int(t["qty"]) - h - pending)
        if h >= t["qty"]:
            status = "held"
        elif missing == 0 and pending > 0:
            status = "ordered"                    # the rest is with Zerodha, executes at the next session
        elif h > 0:
            status = "partial"
        else:
            status = "missing"
        if status in ("partial", "missing") and t.get("filled", 0) > h:
            status = "sold"                       # our orders filled more than the account holds now
        rows.append({"symbol": s, "name": t.get("name") or "", "exchange": t.get("exchange") or "NSE", "weight_target": round(t.get("weight_target") or 0, 2),
                     "target_qty": int(t["qty"]), "held_qty": h, "pending_qty": pending, "missing_qty": missing, "extra_qty": int((extra or {}).get(s) or 0), "ltp": ltp, "value": value, "cost": cost, "status": status})
        total_value += value
        invested += cost
    for r in rows:
        r["weight_actual"] = round(r["value"] * 100.0 / total_value, 2) if total_value else 0.0
    held_n = sum(1 for r in rows if r["status"] == "held")
    pending_n = sum(1 for r in rows if r["pending_qty"] > 0)
    if not rows:
        health = "empty"
    elif held_n == len(rows):
        health = "complete"
    elif all(r["held_qty"] == 0 for r in rows) and any(r["status"] == "sold" for r in rows):
        health = "exited_outside"
    elif all(r["missing_qty"] == 0 for r in rows):
        health = "in_progress"                    # nothing to fix: orders are with Zerodha
    else:
        health = "incomplete"
    worst = max((abs(r["weight_actual"] - r["weight_target"]) for r in rows), default=0.0)
    return {"rows": rows, "health": health, "held_count": held_n, "pending_count": pending_n, "total_count": len(rows), "current": round(total_value, 2), "invested": round(invested, 2),
            "returns": round(total_value - invested, 2), "returns_pct": round((total_value - invested) * 100.0 / invested, 2) if invested else 0.0,
            "worst_deviation_pp": round(worst, 2)}


def allocate(investments_in_order: List[Dict[str, dict]], held: Dict[str, int]) -> List[Dict[str, int]]:
    """Two portfolios holding the same stock: the earlier investment is served first."""
    left = dict(held)
    out = []
    for targets in investments_in_order:
        mine: Dict[str, int] = {}
        for s, t in targets.items():
            take = min(int(left.get(s, 0)), int(t["qty"]))
            mine[s] = take
            left[s] = int(left.get(s, 0)) - take
        out.append(mine)
    return out


def _now():
    return datetime.now(timezone.utc)


# ---------------- router ----------------

def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/investments", tags=["investments"])
    require_user = build_current_user_dep(db)
    batches, snaps, portfolios = db[inv.COLL], db[COLL], db.analyst_portfolios

    async def _conn(user: dict) -> Optional[dict]:
        conn = await db.broker_connections.find_one({"user_id": user["id"], "broker": "kite"})
        if not conn or not conn.get("access_token") or conn.get("expired_at"):
            return None
        return conn

    async def _rules():
        from listing_options import load_rules
        return await load_rules(db)

    async def _state():
        r = await _rules()
        import market_calendar
        hol = await market_calendar.holidays(db, r.get("market_holidays") or [])
        return inv.market_state(holidays=hol), float(r.get("order_buffer_pct") or inv.DEFAULT_BUFFER_PCT)

    async def _meta(pid: str, fallback_name: str = "") -> dict:
        doc = await portfolios.find_one({"id": pid}, {"_id": 0, "id": 1, "name": 1, "cover": 1, "versions": 1, "owner_id": 1, "owner_name": 1, "status": 1, "subtitle": 1, "tags": 1, "strategy": 1})
        if not doc:
            return {"id": pid, "name": fallback_name or "Portfolio", "version": 1, "manager": "", "cover": None}
        manager = doc.get("owner_name") or ""
        if doc.get("owner_id"):
            owner = await db.users.find_one({"id": doc["owner_id"]}, {"_id": 0, "name": 1, "analyst_profile": 1})
            manager = ((owner or {}).get("analyst_profile") or {}).get("displayName") or manager or (owner or {}).get("name") or ""
        cover = None
        try:
            from covers import public_cover
            cover = public_cover(doc)
        except Exception:  # noqa: BLE001
            cover = doc.get("cover")
        return {"id": pid, "name": doc.get("name") or "Portfolio", "version": len(doc.get("versions") or []) or 1, "manager": manager, "cover": cover, "status": doc.get("status")}

    def _public_snap(s: dict) -> dict:
        out = {k: v for k, v in s.items() if k not in ("_id", "user_id")}
        for k in ("checked_at", "first_invested_at", "exited_at", "updated_at"):
            out[k] = inv._iso(out.get(k))
        return out

    async def _grouped(user: dict) -> Dict[str, List[dict]]:
        rows = await batches.find({"user_id": user["id"]}).sort("placed_at", 1).to_list(500)
        g: Dict[str, List[dict]] = {}
        for b in rows:
            g.setdefault(b["portfolio_id"], []).append(b)
        return g

    async def _live(user: dict, conn: dict, groups: Dict[str, List[dict]]) -> List[dict]:
        k = _kite_client(conn["access_token"])
        holdings = await run_in_threadpool(k.holdings)
        try:
            positions = (await run_in_threadpool(k.positions) or {}).get("net") or []
        except Exception as e:  # noqa: BLE001
            logger.info("positions unavailable: %s", str(e)[:120])
            positions = []
        held = held_from_kite(holdings or [], positions)
        order = sorted(groups.items(), key=lambda kv: str(kv[1][0].get("placed_at") or ""))
        targets = [targets_from_batches(bs) for _, bs in order]
        alloc = allocate(targets, {s: r["qty"] for s, r in held.items()})
        extra = {s: r["qty"] - sum(m.get(s, 0) for m in alloc) for s, r in held.items()}
        extra = {s: q for s, q in extra.items() if q > 0}
        # prices: from holdings where present, Zerodha ltp for the rest
        need = {s: t["exchange"] for tg in targets for s, t in tg.items() if not held.get(s, {}).get("ltp")}
        prices: Dict[str, float] = {s: r["ltp"] for s, r in held.items() if r.get("ltp")}
        if need:
            try:
                data = await run_in_threadpool(lambda: k.ltp([f"{ex}:{s}" for s, ex in need.items()]))
                for s, ex in need.items():
                    v = (data.get(f"{ex}:{s}") or {}).get("last_price")
                    if v:
                        prices[s] = float(v)
            except Exception as e:  # noqa: BLE001
                logger.info("ltp for missing stocks unavailable: %s", str(e)[:120])
        avg = {s: r["avg"] for s, r in held.items() if r.get("avg")}
        now, out = _now(), []
        kite_user = (conn.get("profile") or {}).get("user_id_kite")
        for (pid, bs), tg, mine in zip(order, targets, alloc):
            prev = await snaps.find_one({"user_id": user["id"], "portfolio_id": pid}) or {}
            a = assess(tg, mine, prices, avg, extra)
            if prev.get("exited_at") and a["health"] in ("empty", "exited_outside"):
                a["health"] = "exited"
            elif not tg and prev.get("exited_at"):
                a["health"] = "exited"
            # an order Zerodha refused or Kite cancelled, whose stock is now held anyway: Repair is moot
            await _resolve_outside(bs, a["rows"], now)
            doc = {"user_id": user["id"], "portfolio_id": pid, "kite_user": kite_user, **a, "checked_at": now, "stale": False,
                   "first_invested_at": bs[0].get("placed_at"), "batches": len(bs), "exited_at": prev.get("exited_at"), "updated_at": now}
            await snaps.update_one({"user_id": user["id"], "portfolio_id": pid}, {"$set": doc}, upsert=True)
            doc["portfolio"] = await _meta(pid, bs[0].get("portfolio_name") or "")
            if a["health"] in ("incomplete", "exited_outside"):
                ev = notif.incomplete_event(pid, doc["portfolio"]["name"], a["rows"])
                if ev:
                    await notif.push(db, user["id"], **ev)
            out.append(_public_snap(doc))
        return out

    async def _resolve_outside(bs: List[dict], rows: List[dict], now: datetime):
        held_ok = {r["symbol"] for r in rows if r["status"] == "held"}
        for b in bs:
            if b.get("archived_at"):
                continue
            changed = False
            for o in b.get("orders") or []:
                st = inv.norm_status(o.get("status"))
                if (st in ("REJECTED", "CANCELLED") or not o.get("order_id")) and o.get("cancelled_by") != "investor" and not o.get("resolved_outside_at") and (o.get("symbol") or "").upper() in held_ok:
                    o["resolved_outside_at"] = now; changed = True
            if changed:
                b["counts"] = inv.counts_of(b["orders"])
                await batches.update_one({"id": b["id"]}, {"$set": {"orders": b["orders"], "counts": b["counts"], "updated_at": now}})

    async def _snapshots(user: dict, groups: Dict[str, List[dict]]) -> List[dict]:
        out = []
        for pid, bs in sorted(groups.items(), key=lambda kv: str(kv[1][0].get("placed_at") or "")):
            s = await snaps.find_one({"user_id": user["id"], "portfolio_id": pid})
            if not s:
                tg = targets_from_batches(bs)
                a = assess(tg, {}, {s: float(t.get("ltp") or 0) for s, t in tg.items()})
                a["health"] = "unchecked"
                s = {"portfolio_id": pid, **a, "checked_at": None, "first_invested_at": bs[0].get("placed_at"), "batches": len(bs)}
            s["stale"] = True
            s["portfolio"] = await _meta(pid, bs[0].get("portfolio_name") or "")
            out.append(_public_snap(s))
        return out

    @router.get("")
    async def my_investments(user: dict = Depends(require_user), quick: bool = Query(False)):
        groups = await _grouped(user)
        conn = None if quick else await _conn(user)
        if conn:
            try:
                items = await _live(user, conn, groups)
                return {"investments": items, "live": True, "kite_user": (conn.get("profile") or {}).get("user_id_kite"), "market": (await _state())[0]}
            except Exception as e:  # noqa: BLE001
                msg = str(e).lower()
                if "token" in msg or "api_key" in msg or "session" in msg:
                    await db.broker_connections.update_one({"_id": conn["_id"]}, {"$set": {"expired_at": _now()}})
                logger.warning("live reconcile failed: %s", str(e)[:160])
        return {"investments": await _snapshots(user, groups), "live": False, "market": (await _state())[0]}

    async def _plan(user: dict, pid: str, action: str) -> dict:
        conn = await _conn(user)
        if not conn:
            raise HTTPException(status_code=428, detail={"code": "broker", "message": "Connect your broker to continue."})
        groups = await _grouped(user)
        if pid not in groups:
            raise HTTPException(status_code=404, detail="No investment in this portfolio")
        items = await _live(user, conn, {pid: groups[pid]})
        snap = items[0]
        state, buffer = await _state()
        k = _kite_client(conn["access_token"])
        if action == "fix":
            todo = [r for r in snap["rows"] if r["missing_qty"] > 0]
            side = "BUY"
        else:
            todo = [r for r in snap["rows"] if r["held_qty"] > 0]
            side = "SELL"
        if not todo:
            raise HTTPException(status_code=409, detail={"code": "nothing", "message": "Nothing to do: your holdings already match this portfolio." if action == "fix" else "Nothing to sell: this portfolio holds no shares."})
        prices = await inv_prices(k, {r["symbol"]: r["exchange"] for r in todo})
        orders = []
        for r in todo:
            qty = r["missing_qty"] if action == "fix" else r["held_qty"]
            ltp = prices[r["symbol"]]
            limit = inv.limit_price(ltp, buffer) if side == "BUY" else inv.round_tick(ltp * (1 - buffer / 100.0), up=False)
            orders.append({"symbol": r["symbol"], "name": r["name"], "exchange": r["exchange"], "weight_target": r["weight_target"], "qty": int(qty), "ltp": ltp,
                           "limit_price": limit, "value": round(qty * limit, 2), "transaction_type": side})
        amount = round(sum(o["value"] for o in orders), 2)
        funds = inv.funds_check(amount, await _funds(k)) if side == "BUY" else None
        return {"snap": snap, "conn": conn, "k": k, "state": state, "buffer": buffer, "orders": orders, "amount": amount, "funds": funds, "side": side,
                "portfolio": snap["portfolio"], "after": _after(snap, orders, action)}

    def _after(snap: dict, orders: List[dict], action: str) -> dict:
        """Weights after the action, so the review can say 'brings every stock within X% of target'."""
        if action != "fix":
            return {"worst_deviation_pp": None}
        vals = {r["symbol"]: r["value"] for r in snap["rows"]}
        for o in orders:
            vals[o["symbol"]] = vals.get(o["symbol"], 0) + o["qty"] * o["ltp"]
        total = sum(vals.values()) or 1.0
        worst = max((abs(vals.get(r["symbol"], 0) * 100.0 / total - r["weight_target"]) for r in snap["rows"]), default=0.0)
        return {"worst_deviation_pp": round(worst, 2)}

    async def inv_prices(k, syms: Dict[str, str]) -> Dict[str, float]:
        keys = [f"{ex}:{s}" for s, ex in syms.items()]
        data = await run_in_threadpool(lambda: k.ltp(keys))
        out = {}
        for s, ex in syms.items():
            v = (data.get(f"{ex}:{s}") or {}).get("last_price")
            if not v:
                raise HTTPException(status_code=502, detail=f"No price from your broker for {s}. Try again in a moment.")
            out[s] = float(v)
        return out

    async def _funds(k) -> Optional[float]:
        try:
            m = await run_in_threadpool(k.margins)
            eq = (m or {}).get("equity") or {}
            return float((eq.get("available") or {}).get("live_balance") or eq.get("net") or 0)
        except Exception:  # noqa: BLE001
            return None

    def _preview_shape(p: dict) -> dict:
        return {"portfolio": p["portfolio"], "orders": p["orders"], "count": len(p["orders"]), "amount": p["amount"], "side": p["side"], "market": p["state"],
                "buffer_pct": p["buffer"], "funds": p["funds"], "after": p["after"], "health": p["snap"]["health"]}

    @router.post("/{pid}/fix/preview")
    async def fix_preview(pid: str, user: dict = Depends(require_user)):
        return _preview_shape(await _plan(user, pid, "fix"))

    @router.post("/{pid}/exit/preview")
    async def exit_preview(pid: str, user: dict = Depends(require_user)):
        return _preview_shape(await _plan(user, pid, "exit"))

    async def _place(user: dict, pid: str, action: str) -> dict:
        p = await _plan(user, pid, action)
        if p["state"]["mode"] == "blocked":
            raise HTTPException(status_code=409, detail={"code": "blocked", "message": p["state"]["note"]})
        if p["funds"] and not p["funds"]["ok"]:
            raise HTTPException(status_code=409, detail={"code": "funds", "message": f"Add ₹{p['funds']['short']:,} to your broker account to place these orders.", **p["funds"]})
        variety = "amo" if p["state"]["mode"] == "amo" else "regular"
        placed = [await _place_one(p["k"], o, variety) for o in p["orders"]]
        counts = inv.counts_of(placed)
        now = _now()
        batch = {"id": uuid.uuid4().hex[:10].upper(), "user_id": user["id"], "portfolio_id": pid, "portfolio_name": p["portfolio"]["name"], "portfolio_version": p["portfolio"].get("version"),
                 "kind": action, "mode": variety, "buffer_pct": p["buffer"], "amount_requested": p["amount"], "amount_adjusted": p["amount"], "orders": placed, "counts": counts,
                 "broker": "kite", "kite_user": (p["conn"].get("profile") or {}).get("user_id_kite"), "placed_at": now, "updated_at": now}
        await batches.insert_one(dict(batch))
        await notif.push(db, user["id"], **notif.placed_event(batch, _next_open(p["state"])))
        if counts["placed"] and action == "fix":
            import referrals as referrals_mod
            await referrals_mod.convert(db, user["id"])
        if action == "exit" and counts["placed"]:
            await snaps.update_one({"user_id": user["id"], "portfolio_id": pid}, {"$set": {"exited_at": now, "updated_at": now}}, upsert=True)
        try:
            await db.events.insert_one({"name": f"invest_{action}_placed", "user_id": user["id"], "portfolio_id": pid, "props": {"batch_id": batch["id"], "amount": p["amount"], "orders": counts}, "at": now})
        except Exception:  # noqa: BLE001
            pass
        batch.pop("_id", None)
        return {"batch": {**batch, "placed_at": inv._iso(now), "updated_at": inv._iso(now)}, "market": p["state"]}

    def _next_open(state: dict) -> str:
        try:
            return datetime.fromisoformat(state["next_open_ist"]).strftime("%a %d %b at %I:%M %p").replace(" 0", " ") if state.get("next_open_ist") else ""
        except Exception:  # noqa: BLE001
            return ""

    async def _place_one(k, o: dict, variety: str) -> dict:
        import asyncio
        last = ""
        for attempt in range(3):
            try:
                oid = await run_in_threadpool(lambda: k.place_order(
                    variety=variety, exchange=o["exchange"], tradingsymbol=o["symbol"], transaction_type=o["transaction_type"],
                    quantity=int(o["qty"]), product="CNC", order_type="LIMIT", price=float(o["limit_price"]), validity="DAY", tag="omnivest"))
                return {**o, "order_id": str(oid), "status": "OPEN", "message": "", "filled_qty": 0, "avg_price": None, "variety": variety, "attempts": attempt + 1}
            except Exception as e:  # noqa: BLE001
                last = str(e)[:200]
                if not inv.RETRYABLE.search(last) or attempt == 2:
                    break
                await asyncio.sleep(0.6 * (attempt + 1))
        return {**o, "order_id": None, "status": "REJECTED", "message": last or "Order was not accepted", "filled_qty": 0, "avg_price": None}

    @router.post("/{pid}/mark-exited")
    async def mark_exited(pid: str, user: dict = Depends(require_user)):
        """Everything this portfolio bought was sold outside Omnivest and the investor confirms they meant it."""
        s = await snaps.find_one({"user_id": user["id"], "portfolio_id": pid})
        if not s:
            raise HTTPException(status_code=404, detail="No investment in this portfolio")
        if s.get("held_count") or any(r.get("held_qty") for r in s.get("rows") or []):
            raise HTTPException(status_code=409, detail={"code": "held", "message": "This portfolio still holds shares. Use Exit to sell them, or Fix to complete it."})
        now = _now()
        await snaps.update_one({"_id": s["_id"]}, {"$set": {"exited_at": now, "exited_by": "investor_outside", "health": "exited", "updated_at": now}})
        try:
            await db.events.insert_one({"name": "invest_marked_exited", "user_id": user["id"], "portfolio_id": pid, "props": {}, "at": now})
        except Exception:  # noqa: BLE001
            pass
        return {"ok": True, "exited_at": inv._iso(now)}

    @router.post("/{pid}/fix")
    async def fix(pid: str, user: dict = Depends(require_user)):
        return await _place(user, pid, "fix")

    @router.post("/{pid}/exit")
    async def exit_(pid: str, user: dict = Depends(require_user)):
        return await _place(user, pid, "exit")

    return router

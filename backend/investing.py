"""Invest flow: turn a model portfolio + an amount into real orders in the investor's own Zerodha account.

Mirrors smallcase's flow (decided with Tushar, 11 Sep 2026):
  amount -> whole-share quantities by weight (min 1 share of every constituent) -> adjusted total
  -> review -> limit orders (last price + buffer, default 0.5%, admin-editable) as delivery (CNC)
  -> regular orders while NSE is open, after-market (AMO) orders otherwise -> status polled from Kite
  -> Orders page per batch with Repair for rejected/cancelled orders.

Everything is recorded in `invest_batches` (who, which portfolio + constituent version, requested and
adjusted amounts, every order with Kite's order id/status/fill) so the Orders page, the Investments page
and later rebalancing have the facts. Partners only ever get aggregates from this collection.

Kite calls go through the investor's own session (broker_connections keyed by the logged-in user id) and,
in production, through the fixed-IP proxy (kite_proxy.py) that Zerodha has whitelisted.
"""
from __future__ import annotations

import asyncio
import logging
import math
import re
import uuid
from datetime import datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep
from broker_kite import _kite_client
import subscriptions as subs

logger = logging.getLogger(__name__)
IST = timezone(timedelta(hours=5, minutes=30))
COLL = "invest_batches"
TICK = 0.05
DEFAULT_BUFFER_PCT = 0.5
HINT_TOLERANCE_PP = 2.0          # "add ₹X" hint: every stock within 2 percentage points of its target weight
FUNDS_MARGIN_PCT = 2.0           # smallcase pads required funds ~2% "to account for changing prices"
FINAL = {"COMPLETE", "REJECTED", "CANCELLED"}
RETRYABLE = re.compile(r"ip|whitelist|network|timed? ?out|gateway|temporar", re.I)


# ---------------- pure helpers (unit-tested) ----------------

def round_tick(price: float, up: bool = True) -> float:
    """NSE prices move in ₹0.05 steps; buys round up so the limit is never below a tradable price."""
    steps = price / TICK
    steps = math.ceil(steps - 1e-9) if up else math.floor(steps + 1e-9)
    return round(steps * TICK, 2)


def limit_price(ltp: float, buffer_pct: float) -> float:
    return round_tick(ltp * (1 + buffer_pct / 100.0), up=True)


def quantities(weights: Dict[str, float], prices: Dict[str, float], amount: float) -> List[dict]:
    """smallcase's rule: floor to whole shares by weight, never below one share of any constituent."""
    rows = []
    for sym, w in weights.items():
        p = prices[sym]
        qty = max(1, math.floor((w / 100.0) * amount / p)) if p > 0 else 0
        rows.append({"symbol": sym, "weight_target": round(w, 2), "ltp": p, "qty": qty, "value": round(qty * p, 2)})
    total = sum(r["value"] for r in rows) or 1.0
    for r in rows:
        r["weight_actual"] = round(r["value"] * 100.0 / total, 2)
    return rows


def min_amount(weights: Dict[str, float], prices: Dict[str, float]) -> int:
    """Smallest amount at which every constituent gets at least one share at its target weight."""
    need = max(prices[s] * 100.0 / w for s, w in weights.items() if w > 0)
    return int(math.ceil(need / 100.0) * 100)


def top_up_hint(weights: Dict[str, float], prices: Dict[str, float], amount: float, tol_pp: float = HINT_TOLERANCE_PP) -> Optional[dict]:
    """Smallest extra amount (₹500 steps, up to 3x) at which every stock lands within `tol_pp` of its target."""
    def worst(a):
        return max(abs(r["weight_actual"] - r["weight_target"]) for r in quantities(weights, prices, a))
    if worst(amount) <= tol_pp:
        return None
    step, extra = 500, 500
    while extra <= amount * 2:            # lumpy portfolios (one pricey stock) may need a bigger step up
        if worst(amount + extra) <= tol_pp:
            return {"add_amount": extra, "amount": amount + extra}
        extra += step
    return None


def market_state(now: Optional[datetime] = None, holidays: Optional[List[str]] = None) -> dict:
    """NSE equity session in IST plus Zerodha's AMO window.
    regular: 09:15–15:30 on a trading day; amo: 15:45–08:57 next trading day (Zerodha accepts AMO then);
    blocked: 08:57–09:15 (pre-open) and 15:30–15:45 (post-close)."""
    now = (now or datetime.now(timezone.utc)).astimezone(IST)
    hol = set(holidays or [])
    def trading_day(d):
        return d.weekday() < 5 and d.strftime("%Y-%m-%d") not in hol
    def next_open_after(d):
        d = d + timedelta(days=1)
        while not trading_day(d):
            d += timedelta(days=1)
        return datetime.combine(d.date(), time(9, 15), tzinfo=IST)
    t = now.time()
    today_open = datetime.combine(now.date(), time(9, 15), tzinfo=IST)
    if trading_day(now):
        if time(9, 15) <= t < time(15, 30):
            return {"open": True, "mode": "regular", "next_open_ist": today_open.isoformat(), "note": "Market is open. Orders are placed now."}
        if time(15, 30) <= t < time(15, 45):
            return {"open": False, "mode": "blocked", "next_open_ist": next_open_after(now).isoformat(), "note": "Market just closed. After-market orders can be placed from 3:45 PM."}
        if time(8, 57) <= t < time(9, 15):
            return {"open": False, "mode": "blocked", "next_open_ist": today_open.isoformat(), "note": "Market opens at 9:15 AM. Orders can be placed after that."}
        nxt = today_open if t < time(8, 57) else next_open_after(now)
    else:
        nxt = next_open_after(now)
    return {"open": False, "mode": "amo", "next_open_ist": nxt.isoformat(),
            "note": f"Market is closed. Orders placed now go as after-market orders and execute when NSE opens on {nxt.strftime('%a %d %b')} at 9:15 AM."}


def funds_check(amount_adjusted: float, available: Optional[float], margin_pct: float = FUNDS_MARGIN_PCT) -> Optional[dict]:
    """Required = adjusted amount + margin; short = what to add (rounded up to ₹10). None when the balance is unknown."""
    if available is None:
        return None
    required = math.ceil(amount_adjusted * (1 + margin_pct / 100.0))
    short = max(0.0, required - available)
    short = int(math.ceil(short / 10.0) * 10) if short > 0 else 0
    return {"required": required, "available": round(available, 2), "short": short, "ok": short == 0}


def counts_of(orders: List[dict]) -> dict:
    c = {"total": len(orders), "placed": 0, "complete": 0, "open": 0, "rejected": 0}
    for o in orders:
        st = (o.get("status") or "").upper()
        if o.get("order_id"):
            c["placed"] += 1
        if st == "COMPLETE":
            c["complete"] += 1
        elif st in ("REJECTED", "CANCELLED") or not o.get("order_id"):
            c["rejected"] += 1
        else:
            c["open"] += 1
    return c


def _now():
    return datetime.now(timezone.utc)


def _iso(v):
    return v.isoformat() if isinstance(v, datetime) else v


# ---------------- router ----------------

def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/invest", tags=["invest"])
    require_user = build_current_user_dep(db)
    portfolios = db.analyst_portfolios
    batches = db[COLL]

    async def _rules():
        from listing_options import load_rules
        try:
            return await load_rules(db)
        except Exception:  # noqa: BLE001
            return {}

    async def _state():
        r = await _rules()
        return market_state(holidays=[str(x) for x in (r.get("market_holidays") or [])]), float(r.get("order_buffer_pct") or DEFAULT_BUFFER_PCT)

    async def _conn(user: dict) -> dict:
        conn = await db.broker_connections.find_one({"user_id": user["id"], "broker": "kite"})
        if not conn or not conn.get("access_token"):
            raise HTTPException(status_code=428, detail={"code": "broker", "message": "Connect your Zerodha account to place orders."})
        return conn

    async def _listing(pid: str, user: dict) -> dict:
        doc = await portfolios.find_one({"id": pid, "status": "approved"}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        access = await subs.access_for(db, doc, user)
        if not access.get("unlocked"):
            raise HTTPException(status_code=403, detail={"code": "locked", "message": "Subscribe to this portfolio to invest in it."})
        cons = [c for c in (doc.get("constituents") or []) if c.get("symbol")]
        if not cons:
            raise HTTPException(status_code=409, detail="This portfolio has no constituents yet.")
        return doc

    def _weights(doc: dict) -> Dict[str, float]:
        return {c["symbol"].upper(): float(c.get("weight") or 0) for c in doc.get("constituents") or [] if c.get("symbol")}

    def _exchange_of(doc: dict) -> Dict[str, str]:
        return {c["symbol"].upper(): (c.get("exchange") or "NSE").upper() for c in doc.get("constituents") or [] if c.get("symbol")}

    async def _prices(k, syms: Dict[str, str]) -> Dict[str, float]:
        keys = [f"{ex}:{s}" for s, ex in syms.items()]
        data = await run_in_threadpool(lambda: k.ltp(keys))
        out = {}
        for s, ex in syms.items():
            v = (data.get(f"{ex}:{s}") or {}).get("last_price")
            if not v:
                raise HTTPException(status_code=502, detail=f"No price from Zerodha for {s}. Try again in a moment.")
            out[s] = float(v)
        return out

    async def _funds(k) -> Optional[float]:
        try:
            m = await run_in_threadpool(k.margins)
            eq = (m or {}).get("equity") or {}
            return float((eq.get("available") or {}).get("live_balance") or eq.get("net") or 0)
        except Exception:  # noqa: BLE001
            return None

    async def _quote(user: dict, pid: str) -> dict:
        """Everything the modal needs before an amount exists: live prices, live minimum, balance, market state."""
        doc = await _listing(pid, user)
        conn = await _conn(user)
        k = _kite_client(conn["access_token"])
        weights, exch = _weights(doc), _exchange_of(doc)
        try:
            prices = await _prices(k, exch)
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            if "token" in msg.lower() or "session" in msg.lower():
                raise HTTPException(status_code=428, detail={"code": "broker", "message": "Your Zerodha login has expired for today. Connect again to continue."})
            raise HTTPException(status_code=502, detail=f"Zerodha did not return prices: {msg[:160]}")
        state, buffer = await _state()
        return {"doc": doc, "conn": conn, "k": k, "weights": weights, "exch": exch, "prices": prices, "state": state, "buffer": buffer,
                "minimum": min_amount(weights, prices), "funds": await _funds(k)}

    async def _build(user: dict, pid: str, amount: float) -> dict:
        q = await _quote(user, pid)
        doc, conn, k, weights, exch, prices, state, buffer, minimum = (q[x] for x in ("doc", "conn", "k", "weights", "exch", "prices", "state", "buffer", "minimum"))
        names = {c["symbol"].upper(): (c.get("name") or "") for c in doc.get("constituents") or [] if c.get("symbol")}
        amount = float(amount or 0)
        if amount < minimum:
            raise HTTPException(status_code=422, detail={"code": "min", "message": f"Minimum investment is ₹{minimum:,.0f} so every stock gets at least one share.", "min_amount": minimum})
        rows = quantities(weights, prices, amount)
        for r in rows:
            r["exchange"] = exch[r["symbol"]]
            r["name"] = names.get(r["symbol"], "")
            r["limit_price"] = limit_price(r["ltp"], buffer)
            r["value"] = round(r["qty"] * r["limit_price"], 2)
            r["transaction_type"] = "BUY"
        adjusted = round(sum(r["value"] for r in rows), 2)
        funds = q["funds"]
        return {
            "portfolio": {"id": doc["id"], "name": doc.get("name"), "version": len(doc.get("versions") or []) or 1},
            "broker": {"connected": True, "user_name": (conn.get("profile") or {}).get("user_name"), "client_id": (conn.get("profile") or {}).get("user_id_kite")},
            "market": state, "buffer_pct": buffer, "min_amount": minimum,
            "amount_requested": amount, "amount_adjusted": adjusted, "orders": rows, "count": len(rows),
            "hint": top_up_hint(weights, prices, amount), "funds": funds_check(adjusted, funds),
            "_conn": conn, "_doc": doc,
        }

    @router.post("/quote")
    async def quote(payload: dict = Body(...), user: dict = Depends(require_user)):
        q = await _quote(user, str(payload.get("portfolio_id") or ""))
        return {"portfolio": {"id": q["doc"]["id"], "name": q["doc"].get("name")}, "min_amount": q["minimum"], "market": q["state"], "buffer_pct": q["buffer"],
                "funds": {"available": round(q["funds"], 2)} if q["funds"] is not None else None,
                "broker": {"connected": True, "user_name": (q["conn"].get("profile") or {}).get("user_name"), "client_id": (q["conn"].get("profile") or {}).get("user_id_kite")}}

    @router.get("/market")
    async def market():
        state, buffer = await _state()
        return {**state, "buffer_pct": buffer}

    @router.post("/preview")
    async def preview(payload: dict = Body(...), user: dict = Depends(require_user)):
        b = await _build(user, str(payload.get("portfolio_id") or ""), payload.get("amount") or 0)
        return {k: v for k, v in b.items() if not k.startswith("_")}

    async def _place_one(k, o: dict, variety: str) -> dict:
        """Place one limit order; retries transient/IP-related failures; never raises."""
        last = ""
        for attempt in range(3):
            try:
                oid = await run_in_threadpool(lambda: k.place_order(
                    variety=variety, exchange=o["exchange"], tradingsymbol=o["symbol"], transaction_type="BUY",
                    quantity=int(o["qty"]), product="CNC", order_type="LIMIT", price=float(o["limit_price"]),
                    validity="DAY", tag="omnivest"))
                return {**o, "order_id": str(oid), "status": "OPEN", "message": "", "filled_qty": 0, "avg_price": None, "attempts": attempt + 1}
            except Exception as e:  # noqa: BLE001
                last = str(e)[:200]
                if not RETRYABLE.search(last) or attempt == 2:
                    break
                await asyncio.sleep(0.6 * (attempt + 1))
        return {**o, "order_id": None, "status": "REJECTED", "message": last or "Order was not accepted", "filled_qty": 0, "avg_price": None}

    async def _refresh(batch: dict, user: dict) -> dict:
        """Pull the latest status/fill for every order in the batch from Kite (best effort)."""
        if all((o.get("status") or "").upper() in FINAL for o in batch["orders"] if o.get("order_id")):
            return batch
        conn = await db.broker_connections.find_one({"user_id": user["id"], "broker": "kite"})
        if not conn:
            return batch
        try:
            k = _kite_client(conn["access_token"])
            book = {str(x.get("order_id")): x for x in (await run_in_threadpool(k.orders) or [])}
        except Exception as e:  # noqa: BLE001
            logger.info("order refresh skipped: %s", str(e)[:120])
            return batch
        changed = False
        for o in batch["orders"]:
            x = book.get(str(o.get("order_id"))) if o.get("order_id") else None
            if not x:
                continue
            st = (x.get("status") or "").upper()
            upd = {"status": st or o.get("status"), "filled_qty": int(x.get("filled_quantity") or 0),
                   "avg_price": float(x.get("average_price") or 0) or None, "message": (x.get("status_message") or "")[:200]}
            if any(o.get(kk) != v for kk, v in upd.items()):
                o.update(upd); changed = True
        if changed:
            batch["counts"] = counts_of(batch["orders"]); batch["updated_at"] = _now()
            await batches.update_one({"id": batch["id"]}, {"$set": {"orders": batch["orders"], "counts": batch["counts"], "updated_at": batch["updated_at"]}})
        return batch

    def _public(b: dict) -> dict:
        out = {kk: v for kk, v in b.items() if kk not in ("_id", "user_id")}
        for kk in ("placed_at", "updated_at"):
            out[kk] = _iso(out.get(kk))
        return out

    @router.post("/place")
    async def place(payload: dict = Body(...), user: dict = Depends(require_user)):
        b = await _build(user, str(payload.get("portfolio_id") or ""), payload.get("amount") or 0)
        if b["market"]["mode"] == "blocked":
            raise HTTPException(status_code=409, detail={"code": "blocked", "message": b["market"]["note"]})
        if b["funds"] and not b["funds"]["ok"] and not payload.get("ignore_funds"):
            raise HTTPException(status_code=409, detail={"code": "funds", "message": f"Add ₹{b['funds']['short']:,} to your Zerodha account to place these orders.", **b["funds"]})
        variety = "amo" if b["market"]["mode"] == "amo" else "regular"
        k = _kite_client(b["_conn"]["access_token"])
        placed = [await _place_one(k, o, variety) for o in b["orders"]]
        batch = {"id": uuid.uuid4().hex[:10].upper(), "user_id": user["id"], "portfolio_id": b["portfolio"]["id"], "portfolio_name": b["portfolio"]["name"],
                 "portfolio_version": b["portfolio"]["version"], "kind": "invest", "mode": variety, "buffer_pct": b["buffer_pct"],
                 "amount_requested": b["amount_requested"], "amount_adjusted": b["amount_adjusted"], "orders": placed, "counts": counts_of(placed),
                 "broker": "kite", "kite_user": b["broker"].get("client_id"), "placed_at": _now(), "updated_at": _now()}
        await batches.insert_one(dict(batch))
        try:
            await db.events.insert_one({"id": str(uuid.uuid4()), "event": "invest_placed", "portfolio_id": batch["portfolio_id"], "user_id": user["id"],
                                        "props": {"batch_id": batch["id"], "amount": batch["amount_adjusted"], "orders": batch["counts"]}, "at": _now()})
        except Exception:  # noqa: BLE001
            pass
        return {"batch": _public(batch), "market": b["market"]}

    @router.get("/batches")
    async def my_batches(user: dict = Depends(require_user), portfolio_id: Optional[str] = None):
        q: Dict[str, Any] = {"user_id": user["id"]}
        if portfolio_id:
            q["portfolio_id"] = portfolio_id
        rows = await batches.find(q).sort("placed_at", -1).to_list(50)
        out = []
        for b in rows[:10]:
            out.append(_public(await _refresh(b, user)))
        out += [_public(b) for b in rows[10:]]
        return {"batches": out}

    @router.get("/batches/{bid}")
    async def one_batch(bid: str, user: dict = Depends(require_user)):
        b = await batches.find_one({"id": bid, "user_id": user["id"]})
        if not b:
            raise HTTPException(status_code=404, detail="Batch not found")
        return {"batch": _public(await _refresh(b, user))}

    @router.post("/batches/{bid}/repair")
    async def repair(bid: str, user: dict = Depends(require_user)):
        """Re-place every rejected/cancelled order at a fresh limit price (smallcase's Repair)."""
        b = await batches.find_one({"id": bid, "user_id": user["id"]})
        if not b:
            raise HTTPException(status_code=404, detail="Batch not found")
        b = await _refresh(b, user)
        todo = [o for o in b["orders"] if (o.get("status") or "").upper() in ("REJECTED", "CANCELLED") or not o.get("order_id")]
        if not todo:
            return {"batch": _public(b), "repaired": 0}
        conn = await _conn(user)
        k = _kite_client(conn["access_token"])
        state, buffer = await _state()
        if state["mode"] == "blocked":
            raise HTTPException(status_code=409, detail={"code": "blocked", "message": state["note"]})
        prices = await _prices(k, {o["symbol"]: o.get("exchange") or "NSE" for o in todo})
        need = sum(o["qty"] * limit_price(prices[o["symbol"]], buffer) for o in todo)
        fc = funds_check(need, await _funds(k))
        if fc and not fc["ok"]:
            raise HTTPException(status_code=409, detail={"code": "funds", "message": f"Add ₹{fc['short']:,} to your Zerodha account to place these orders again.", **fc})
        variety = "amo" if state["mode"] == "amo" else "regular"
        n = 0
        for o in todo:
            o["ltp"] = prices[o["symbol"]]; o["limit_price"] = limit_price(o["ltp"], buffer); o["value"] = round(o["qty"] * o["limit_price"], 2)
            fresh = await _place_one(k, o, variety)
            o.update(fresh); o["repaired_at"] = _now(); n += 1
        b["counts"] = counts_of(b["orders"]); b["updated_at"] = _now()
        await batches.update_one({"id": b["id"]}, {"$set": {"orders": b["orders"], "counts": b["counts"], "updated_at": b["updated_at"], "mode": variety}})
        return {"batch": _public(b), "repaired": n}

    @router.get("/partner-summary/{pid}")
    async def partner_summary(pid: str, user: dict = Depends(require_user)):
        """Aggregates only (Tushar, 11 Sep 2026): how many investors acted, how much was deployed. No identities."""
        doc = await portfolios.find_one({"id": pid}, {"_id": 0, "owner_id": 1})
        if not doc or (doc.get("owner_id") != user["id"] and user.get("role") != "admin"):
            raise HTTPException(status_code=403, detail="Not your portfolio")
        pipeline = [{"$match": {"portfolio_id": pid}},
                    {"$group": {"_id": None, "investors": {"$addToSet": "$user_id"}, "batches": {"$sum": 1}, "deployed": {"$sum": "$amount_adjusted"}}}]
        agg = await batches.aggregate(pipeline).to_list(1)
        a = agg[0] if agg else {}
        return {"investors": len(a.get("investors") or []), "batches": a.get("batches", 0), "deployed": round(a.get("deployed", 0) or 0, 2)}

    return router

"""Kite Connect postbacks: Zerodha POSTs every status change of an order placed with our api_key
(COMPLETE, CANCELLED, REJECTED, UPDATE), whoever acted: Omnivest, the investor inside the Kite app, or the exchange.

Registered in the Kite developer app as  https://omnivest-backend.onrender.com/api/broker/kite/postback
Each call is signed: checksum = sha256(order_id + order_timestamp + api_secret). Anything that fails the check is
dropped with 403. A matching order in `invest_batches` is updated in place (status, fill, average price), a cancel
that Omnivest did not issue is marked `cancelled_by="kite"` so the Orders page can say so, and the batch counts are
recomputed. Every accepted call is kept in `kite_postbacks` for audit. The Orders page polls our own database while
open (`GET /invest/batches?quick=1`), so an investor sees a Kite-side cancel within seconds without a Refresh tap and
without a Zerodha round-trip, even after the daily Kite session has lapsed.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from broker_kite import KITE_API_SECRET
from investing import COLL, _now, counts_of, kite_ts, norm_status
import notifications as notif

logger = logging.getLogger("kite_postback")
IST = timezone(timedelta(hours=5, minutes=30))
KEEP = ("order_id", "exchange_order_id", "user_id", "app_id", "status", "status_message", "order_timestamp", "exchange_update_timestamp",
        "exchange_timestamp", "variety", "exchange", "tradingsymbol", "transaction_type", "quantity", "filled_quantity", "pending_quantity",
        "cancelled_quantity", "price", "average_price", "placed_by", "tag")


def checksum_ok(payload: dict, secret: str) -> bool:
    oid, ts = str(payload.get("order_id") or ""), str(payload.get("order_timestamp") or "")
    if not secret or not oid or not ts:
        return False
    return hashlib.sha256(f"{oid}{ts}{secret}".encode()).hexdigest() == str(payload.get("checksum") or "")


def apply_postback(order: dict, payload: dict, at: Optional[datetime] = None) -> bool:
    """Mutate the stored order from a postback. Returns True when anything changed."""
    raw = (payload.get("status") or "").upper()
    st = norm_status(raw) or order.get("status")
    upd = {"status": st, "status_raw": raw, "filled_qty": int(payload.get("filled_quantity") or 0),
           "avg_price": float(payload.get("average_price") or 0) or None, "message": (payload.get("status_message") or "")[:200]}
    if order.get("cancelled_by") == "investor":
        upd["message"] = order.get("message") or "Cancelled from Omnivest"
    elif st == "CANCELLED" and not order.get("cancelled_by"):
        upd["cancelled_by"] = "kite"
        upd["cancelled_at"] = kite_ts(payload.get("exchange_update_timestamp") or payload.get("order_timestamp")) or at or _now()
    changed = any(order.get(k) != v for k, v in upd.items() if k != "status_raw")   # raw text alone is not a change
    if changed:
        order.update(upd)
        order["postback_at"] = at or _now()
    return changed


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/broker/kite", tags=["broker-kite"])
    batches = db[COLL]

    @router.post("/postback")
    async def postback(request: Request):
        try:
            payload = await request.json()
        except Exception:  # noqa: BLE001  (Kite sends JSON; tolerate a form-encoded body)
            payload = dict(await request.form())
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="Bad payload")
        if not KITE_API_SECRET:
            raise HTTPException(status_code=503, detail="Kite is not configured on this server")
        oid = str(payload.get("order_id") or "")
        if not checksum_ok(payload, KITE_API_SECRET):
            logger.warning("kite postback rejected (checksum) order_id=%s status=%s", oid, payload.get("status"))
            raise HTTPException(status_code=403, detail="Bad checksum")
        now = _now()
        await db["kite_postbacks"].insert_one({"order_id": oid, "status": payload.get("status"), "at": now, "payload": {k: payload.get(k) for k in KEEP}})
        b = await batches.find_one({"orders.order_id": oid})
        if not b:
            logger.info("kite postback for unknown order %s (%s)", oid, payload.get("status"))
            return {"ok": True, "matched": False}
        order = next(o for o in b["orders"] if str(o.get("order_id")) == oid)
        before = [dict(o) for o in b["orders"]]
        if apply_postback(order, payload, now):
            b["counts"] = counts_of(b["orders"])
            await batches.update_one({"id": b["id"]}, {"$set": {"orders": b["orders"], "counts": b["counts"], "updated_at": now, "postback_at": now}})
            await notif.push_many(db, b["user_id"], notif.order_events(before, b["orders"], b))
            logger.info("kite postback applied %s %s -> %s (batch %s)", order.get("symbol"), oid, order.get("status"), b["id"])
        return {"ok": True, "matched": True, "batch": b["id"]}

    return router

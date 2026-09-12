"""In-app notifications: one row per thing worth telling the investor, written by the code that learns it.

Sources (all server-side, so the same rows later feed email/WhatsApp without re-plumbing):
  orders     placed / could not be placed, Fix or Exit placed, filled (one per batch, agreed 12 Sep 2026: never one per fill),
             rejected, cancelled inside Kite (one per order), partly filled, batch archived
  portfolio  incomplete after a holdings check (once per distinct set of missing stocks)
  account    Zerodha login expired (once a day, only while something is pending), subscription started

Every row carries a dedupe `key`; pushing the same key twice is a no-op, so refresh loops and postbacks are safe.
In-app is always on; email / WhatsApp preferences are stored but nothing is sent yet.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep

logger = logging.getLogger("notifications")
COLL = "notifications"
KINDS = ("order", "portfolio", "account")


def _now():
    return datetime.now(timezone.utc)


def _norm(raw) -> str:
    s = (raw or "").upper()
    if "CANCEL" in s:
        return "CANCELLED"
    if "REJECT" in s:
        return "REJECTED"
    if s.startswith("COMPLETE"):
        return "COMPLETE"
    return s


async def push(db, user_id: str, kind: str, type: str, title: str, body: str = "", link: Optional[str] = None, key: Optional[str] = None, at: Optional[datetime] = None) -> bool:
    """Insert one notification; with a `key`, only the first push for that user+key lands. Returns True when inserted."""
    at = at or _now()
    doc = {"id": uuid.uuid4().hex[:12], "user_id": user_id, "kind": kind if kind in KINDS else "account", "type": type, "title": title[:140], "body": (body or "")[:400],
           "link": link, "key": key, "at": at, "read_at": None}
    try:
        if key:
            res = await db[COLL].update_one({"user_id": user_id, "key": key}, {"$setOnInsert": doc}, upsert=True)
            return bool(res.upserted_id)
        await db[COLL].insert_one(doc)
        return True
    except Exception as e:  # noqa: BLE001  (a notification must never break the action that caused it)
        logger.warning("notification not written (%s): %s", type, str(e)[:120])
        return False


async def push_many(db, user_id: str, events: List[dict]):
    for e in events:
        await push(db, user_id, **e)


# ---------------- pure: what a change in a batch's orders implies ----------------

def _all_complete(orders: List[dict]) -> bool:
    placed = [o for o in orders if o.get("order_id")]
    return bool(placed) and all(_norm(o.get("status")) == "COMPLETE" for o in placed)


def order_events(before: List[dict], after: List[dict], batch: dict) -> List[dict]:
    """Notifications implied by order status changes between two snapshots of one batch. Pure, unit-tested."""
    prev = {str(o.get("order_id")): o for o in before if o.get("order_id")}
    name = batch.get("portfolio_name") or "your portfolio"
    bid = batch.get("id")
    out: List[dict] = []
    for o in after:
        oid = o.get("order_id")
        if not oid:
            continue
        p = prev.get(str(oid)) or {}
        ps, ns = _norm(p.get("status")), _norm(o.get("status"))
        if ps == ns:
            continue
        sym, qty, filled = o.get("symbol"), int(o.get("qty") or 0), int(o.get("filled_qty") or 0)
        if ns == "CANCELLED" and o.get("cancelled_by") == "investor":
            continue                                   # the investor did it; the cancel endpoint announces the archive
        if ns == "CANCELLED":
            if filled:
                out.append({"kind": "order", "type": "partial", "title": f"{sym} partly filled: {filled} of {qty}", "key": f"order:{oid}:partial",
                            "body": f"The remaining {qty - filled} were not bought, so {name} is short of this stock. Fix buys the rest at today's price.", "link": "/investments"})
            else:
                who = "in your broker app, not from Omnivest" if o.get("cancelled_by") == "kite" else "by your broker"
                out.append({"kind": "order", "type": "cancelled", "title": f"{sym} cancelled {'at broker' if o.get('cancelled_by') == 'kite' else ''}".strip(), "key": f"order:{oid}:cancelled",
                            "body": f"This order from {name} was cancelled {who}. {name} is now incomplete; Fix buys what is missing.", "link": "/investments"})
        elif ns == "REJECTED":
            out.append({"kind": "order", "type": "rejected", "title": f"{sym} rejected by your broker", "key": f"order:{oid}:rejected",
                        "body": (o.get("message") or "Your broker did not accept this order.")[:200], "link": f"/orders?batch={bid}"})
    if _all_complete(after) and not _all_complete(before):
        n = sum(1 for o in after if o.get("order_id"))
        kind_word = {"fix": "Fix orders filled", "exit": "Exit complete"}.get(batch.get("kind") or "invest", "orders filled")
        title = f"{n} {kind_word}" if batch.get("kind") in (None, "invest") else kind_word
        body = (f"Everything sold; {name} is exited." if batch.get("kind") == "exit" else f"{name}: every stock in this batch is now in your broker account.")
        out.append({"kind": "portfolio", "type": "filled", "title": title, "key": f"batch:{bid}:complete", "body": body, "link": "/investments"})
    return out


def placed_event(batch: dict, next_open_text: str = "") -> dict:
    """The one line an investor gets right after placing (invest / fix / exit)."""
    c, kind, name = batch.get("counts") or {}, batch.get("kind") or "invest", batch.get("portfolio_name") or "your portfolio"
    n, total, amo = int(c.get("placed") or 0), int(c.get("total") or 0), batch.get("mode") == "amo"
    side = "sell" if kind == "exit" else "buy"
    when = f"They execute when NSE opens{(' on ' + next_open_text) if next_open_text else ''}." if amo else "Your broker is executing them now."
    link = f"/orders?batch={batch.get('id')}"
    if n == 0:
        return {"kind": "order", "type": "failed", "title": "Orders could not be placed", "key": f"batch:{batch.get('id')}:placed",
                "body": f"None of the {total} {side} orders for {name} were accepted. Nothing was charged. See why on the Orders page.", "link": link}
    label = {"fix": "Fix", "exit": "Exit"}.get(kind, "")
    title = f"{label + ': ' if label else ''}{n}{' of ' + str(total) if n < total else ''} {'after-market ' if amo else ''}{side} order{'s' if n != 1 else ''} placed"
    return {"kind": "order", "type": "placed", "title": title, "key": f"batch:{batch.get('id')}:placed",
            "body": f"{name} · ₹{int(round(batch.get('amount_adjusted') or 0)):,}. {when}" + (f" {total - n} were refused; see the Orders page." if n < total else ""), "link": link}


def incomplete_event(portfolio_id: str, name: str, rows: List[dict]) -> Optional[dict]:
    miss = [r["symbol"] for r in rows if int(r.get("missing_qty") or 0) > 0]
    if not miss:
        return None
    return {"kind": "portfolio", "type": "incomplete", "title": f"{name} is incomplete", "key": f"pf:{portfolio_id}:incomplete:{','.join(sorted(miss))}",
            "body": f"{len(miss)} of {len(rows)} stocks missing: {', '.join(miss)}. Fix buys them at today's price.", "link": "/investments"}


def public(n: dict) -> dict:
    return {"id": n["id"], "kind": n.get("kind"), "type": n.get("type"), "title": n.get("title"), "body": n.get("body"), "link": n.get("link"),
            "at": (n["at"] if n["at"].tzinfo else n["at"].replace(tzinfo=timezone.utc)).isoformat() if isinstance(n.get("at"), datetime) else n.get("at"),
            "read": bool(n.get("read_at"))}


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/notifications", tags=["notifications"])
    require_user = build_current_user_dep(db)
    col = db[COLL]

    @router.get("")
    async def list_mine(user: dict = Depends(require_user), limit: int = Query(50, ge=1, le=200), kind: Optional[str] = None):
        q: Dict[str, Any] = {"user_id": user["id"]}
        if kind in KINDS:
            q["kind"] = kind
        rows = await col.find(q).sort("at", -1).to_list(limit)
        unread = await col.count_documents({"user_id": user["id"], "read_at": None})
        return {"items": [public(n) for n in rows], "unread": unread}

    @router.post("/read")
    async def mark_read(payload: dict = Body(default={}), user: dict = Depends(require_user)):
        q: Dict[str, Any] = {"user_id": user["id"], "read_at": None}
        if not payload.get("all"):
            ids = [str(x) for x in (payload.get("ids") or [])][:200]
            if not ids:
                return {"ok": True, "marked": 0}
            q["id"] = {"$in": ids}
        res = await col.update_many(q, {"$set": {"read_at": _now()}})
        return {"ok": True, "marked": res.modified_count}

    @router.get("/prefs")
    async def get_prefs(user: dict = Depends(require_user)):
        p = (await db.users.find_one({"id": user["id"]}, {"_id": 0, "notify_prefs": 1}) or {}).get("notify_prefs") or {}
        return {"in_app": True, "email": bool(p.get("email")), "whatsapp": bool(p.get("whatsapp")), "email_available": bool(user.get("email")), "whatsapp_available": False}

    @router.put("/prefs")
    async def put_prefs(payload: dict = Body(...), user: dict = Depends(require_user)):
        prefs = {"email": bool(payload.get("email")), "whatsapp": bool(payload.get("whatsapp"))}
        await db.users.update_one({"id": user["id"]}, {"$set": {"notify_prefs": prefs}})
        return {"in_app": True, **prefs, "email_available": bool(user.get("email")), "whatsapp_available": False}

    return router

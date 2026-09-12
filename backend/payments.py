"""Razorpay checkout for paid listings.

Flow: the investor picks a plan → POST /payments/orders creates a Razorpay order for exactly the plan price
→ the browser opens Razorpay Checkout with that order → on success the browser POSTs the payment id + signature
to /payments/verify → the signature is checked with the key secret on the server → a subscription row is created
(the same row an admin grant creates). A webhook (payment.captured) is the safety net if the browser never
comes back.

Configuration (Render env): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
RAZORPAY_MODE=mock (local / CI only) skips the Razorpay API call and issues local order ids so the whole flow,
including signature verification, can be tested without an account. Never set mock on production.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import requests
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

import subscriptions as subs
import checkout
from auth import build_current_user_dep

ORDERS = "payment_orders"
RZP_API = "https://api.razorpay.com/v1"


def _cfg() -> Dict[str, Any]:
    key_id = (os.environ.get("RAZORPAY_KEY_ID") or "").strip()
    secret = (os.environ.get("RAZORPAY_KEY_SECRET") or "").strip()
    mode = (os.environ.get("RAZORPAY_MODE") or "").strip().lower()
    mock = mode == "mock"
    return {"key_id": key_id or ("rzp_test_mock" if mock else ""), "secret": secret or ("mock-secret" if mock else ""),
            "webhook_secret": (os.environ.get("RAZORPAY_WEBHOOK_SECRET") or "").strip(), "mock": mock,
            "enabled": bool(mock or (key_id and secret))}


def _mode(c: Dict[str, Any]) -> str:
    """mock (local/CI) | test (Razorpay test key: no real money) | live | off (no keys yet)."""
    if c["mock"]:
        return "mock"
    if not c["enabled"]:
        return "off"
    return "test" if c["key_id"].startswith("rzp_test_") else "live"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _sign(secret: str, message: str) -> str:
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter()
    orders = db[ORDERS]
    portfolios = db.analyst_portfolios
    require_user = build_current_user_dep(db)

    @router.get("/payments/config")
    async def config():
        c = _cfg()
        return {"enabled": c["enabled"], "key_id": c["key_id"] if c["enabled"] else None, "mode": _mode(c)}

    @router.get("/payments/credit")
    async def my_credit(user: dict = Depends(require_user)):
        """Subscription credit the investor can apply at checkout (earned via Share with friends)."""
        import referrals
        b = await referrals.balance(db, user["id"])
        return {"balance": b["balance"], "note": (await referrals.settings(db))["note"]}

    @router.post("/payments/orders")
    async def create_order(payload: dict = Body(...), user: dict = Depends(require_user)):
        c = _cfg()
        if not c["enabled"]:
            raise HTTPException(status_code=503, detail="Online payment is not enabled yet.")
        pid = (payload.get("portfolio_id") or "").strip()
        months = int(payload.get("plan_months") or 0)
        listing = await portfolios.find_one({"id": pid, "status": "approved"}, {"_id": 0, "id": 1, "name": 1, "owner_id": 1, "subscription": 1, "plans": 1})
        if not listing:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        if listing.get("subscription") != "Paid":
            raise HTTPException(status_code=409, detail="This listing is free — nothing to pay.")
        if listing.get("owner_id") == user["id"]:
            raise HTTPException(status_code=409, detail="You own this listing.")
        plan = next((p for p in (listing.get("plans") or []) if int(p.get("months") or 0) == months), None)
        if not plan or float(plan.get("price") or 0) <= 0:
            raise HTTPException(status_code=422, detail="Pick a valid plan")
        # SEBI-style prerequisites, checked on the server: billing details on file and the terms signed for this listing
        ready = await checkout.readiness(db, user, pid)
        if ready["missing"]:
            raise HTTPException(status_code=428, detail={"message": "Complete the checkout steps first", "missing": ready["missing"]})
        amount_paise = int(round(float(plan["price"]) * 100))   # the price the partner set, never what the browser sends
        # Share-with-friends credit: applied first, the gateway is only asked for what is left
        import referrals
        credit_rs = (await referrals.balance(db, user["id"]))["balance"] if payload.get("use_credit", True) else 0
        apply_rs = min(int(credit_rs), int(amount_paise // 100))
        credit_paise = apply_rs * 100
        payable_paise = amount_paise - credit_paise
        receipt = f"omni_{uuid.uuid4().hex[:20]}"
        if payable_paise == 0:
            order_id = f"order_credit_{uuid.uuid4().hex[:14]}"
        elif c["mock"]:
            order_id = f"order_mock_{uuid.uuid4().hex[:14]}"
        else:
            try:
                r = requests.post(f"{RZP_API}/orders", auth=(c["key_id"], c["secret"]), timeout=20,
                                  json={"amount": payable_paise, "currency": "INR", "receipt": receipt,
                                        "notes": {"portfolio_id": pid, "user_id": user["id"], "plan_months": str(months), "credit_applied": str(credit_paise)}})
                r.raise_for_status()
                order_id = r.json()["id"]
            except Exception as e:  # noqa: BLE001
                raise HTTPException(status_code=502, detail=f"Payment gateway error: {e}")
        doc = {"id": str(uuid.uuid4()), "order_id": order_id, "receipt": receipt, "user_id": user["id"], "portfolio_id": pid,
               "portfolio_name": listing.get("name"), "plan_months": months, "amount": amount_paise, "credit_applied": credit_paise, "payable": payable_paise, "currency": "INR",
               "consent": ready["consent"], "status": "created", "created_at": _now()}
        await orders.insert_one(dict(doc))
        if payable_paise == 0:
            s = await _fulfil(doc, f"credit_{order_id}", "credit")
            return {"order_id": order_id, "amount": 0, "price": amount_paise, "credit_applied": credit_paise, "currency": "INR", "paid": True, "mode": _mode(c),
                    "subscription": {"id": s["id"], "plan_months": s["plan_months"], "expires_at": subs._iso(s["expires_at"]), "portfolio_id": s["portfolio_id"]}}
        return {"order_id": order_id, "amount": payable_paise, "price": amount_paise, "credit_applied": credit_paise, "currency": "INR", "key_id": c["key_id"], "mode": _mode(c),
                "name": "Omnivest", "description": f"{listing.get('name')} · {months} month{'s' if months > 1 else ''}",
                "prefill": {"name": user.get("name", ""), "email": user.get("email") or "", "contact": user.get("phone") or ""},
                "notes": {"portfolio_id": pid, "plan_months": str(months)}}

    async def _sub_of(order: dict) -> Optional[dict]:
        return await db[subs.COLL].find_one({"id": order["subscription_id"]}, {"_id": 0}) if order.get("subscription_id") else None

    async def _fulfil(order: dict, payment_id: str, how: str) -> dict:
        """Exactly one subscription per paid order, however many times and however concurrently we hear about it.
        Razorpay sends payment.captured AND order.paid within the same second, and the browser's verify races
        both (seen on 9 Sep 2026: one ₹500 payment became two stacked terms). The first caller claims the order
        with an atomic update; the others wait for the claimer's subscription id instead of creating their own."""
        for _ in range(3):
            if order.get("subscription_id"):
                return await _sub_of(order)
            stale = _now() - timedelta(seconds=60)   # a claim older than this belongs to a request that died mid-way
            claimed = await orders.find_one_and_update(
                {"id": order["id"], "subscription_id": {"$exists": False},
                 "$or": [{"fulfilling_at": {"$exists": False}}, {"fulfilling_at": {"$lt": stale}}]},
                {"$set": {"fulfilling_at": _now(), "fulfilling_by": how}})
            if claimed is None:
                for _wait in range(40):   # up to ~10 s: the claimer only has to insert one row
                    await asyncio.sleep(0.25)
                    fresh = await orders.find_one({"id": order["id"]}, {"_id": 0})
                    if fresh and fresh.get("subscription_id"):
                        return await _sub_of(fresh)
                    if fresh and not fresh.get("fulfilling_at"):   # the claimer failed and released the order
                        order = fresh
                        break
                else:
                    raise HTTPException(status_code=503, detail="Your payment is being recorded. Refresh in a moment.")
                continue
            try:
                listing = await portfolios.find_one({"id": order["portfolio_id"]}, {"_id": 0, "id": 1, "name": 1})
                credit_paise = int(order.get("credit_applied") or 0)
                s = await subs.create_subscription(db, order["user_id"], listing, int(order["plan_months"]), order["amount"] / 100.0, "credit" if how == "credit" else "razorpay",
                                                   ("Referral credit" if how == "credit" else f"Razorpay {payment_id}"), how,
                                                   payment={"order_id": order["order_id"], "payment_id": payment_id, "amount": int(order.get("payable", order["amount"])), "credit_applied": credit_paise},
                                                   consent=order.get("consent"))
                if credit_paise:
                    import referrals
                    await referrals.redeem(db, order["user_id"], credit_paise // 100, key=f"order:{order['id']}")
                await orders.update_one({"id": order["id"]}, {"$set": {"status": "paid", "payment_id": payment_id, "paid_at": _now(), "subscription_id": s["id"], "fulfilled_by": how},
                                                              "$unset": {"fulfilling_at": "", "fulfilling_by": ""}})
            except Exception:
                await orders.update_one({"id": order["id"]}, {"$unset": {"fulfilling_at": "", "fulfilling_by": ""}})
                raise
            try:
                import notifications as notif
                months = int(order["plan_months"])
                await notif.push(db, order["user_id"], "account", "subscribed", f"Subscribed to {(listing or {}).get('name') or 'a portfolio'}",
                                 f"{months}-month plan · ₹{order['amount'] / 100.0:,.0f}" + (f" (₹{int(order.get('credit_applied') or 0) / 100.0:,.0f} paid with referral credit)" if order.get("credit_applied") else "") + ". You can now see every stock and invest from the portfolio page.",
                                 f"/model-portfolios/{order['portfolio_id']}", key=f"sub:{s['id']}")
            except Exception:  # noqa: BLE001
                pass
            await db.audit_log.insert_one({"id": str(uuid.uuid4()), "type": "subscription_paid", "portfolio_id": order["portfolio_id"], "subscription_id": s["id"],
                                           "user_id": order["user_id"], "plan_months": order["plan_months"], "amount": order["amount"], "payment_id": payment_id,
                                           "via": how, "at": _now().isoformat()})
            return s
        raise HTTPException(status_code=503, detail="Your payment is being recorded. Refresh in a moment.")

    @router.get("/payments/orders/{order_id}")
    async def order_status(order_id: str, user: dict = Depends(require_user)):
        """Lets the browser reconcile after Razorpay's window closes: a retry inside that window is fulfilled by
        the webhook even though checkout's handler never fired, so the page asks us before saying 'not charged'."""
        order = await orders.find_one({"order_id": order_id, "user_id": user["id"]}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        s = await _sub_of(order)
        return {"order_id": order_id, "status": order.get("status"),
                "subscription": {"id": s["id"], "plan_months": s["plan_months"], "expires_at": subs._iso(s["expires_at"]), "portfolio_id": s["portfolio_id"]} if s else None}

    @router.post("/payments/verify")
    async def verify(payload: dict = Body(...), user: dict = Depends(require_user)):
        """The browser reports success; we trust only the HMAC signature computed with the key secret."""
        c = _cfg()
        if not c["enabled"]:
            raise HTTPException(status_code=503, detail="Online payment is not enabled yet.")
        order_id = (payload.get("razorpay_order_id") or "").strip()
        payment_id = (payload.get("razorpay_payment_id") or "").strip()
        signature = (payload.get("razorpay_signature") or "").strip()
        order = await orders.find_one({"order_id": order_id}, {"_id": 0})
        if not order or order["user_id"] != user["id"]:
            raise HTTPException(status_code=404, detail="Order not found")
        mock_ok = c["mock"] and bool(payload.get("mock")) and payment_id.startswith("pay_mock_")
        if not payment_id or (not mock_ok and not hmac.compare_digest(_sign(c["secret"], f"{order_id}|{payment_id}"), signature or "")):
            await orders.update_one({"id": order["id"]}, {"$set": {"status": "signature_failed", "last_attempt_at": _now()}})
            raise HTTPException(status_code=400, detail="Payment could not be verified. If money was deducted it will be reconciled automatically.")
        s = await _fulfil(order, payment_id, "checkout")
        return {"ok": True, "subscription": {"id": s["id"], "plan_months": s["plan_months"], "expires_at": subs._iso(s["expires_at"]), "portfolio_id": s["portfolio_id"]}}

    @router.post("/payments/webhook")
    async def webhook(request: Request, x_razorpay_signature: Optional[str] = Header(None)):
        """Razorpay → us. Verified with the webhook secret; fulfils payment.captured even if the browser never returned."""
        c = _cfg()
        body = await request.body()
        if not c["webhook_secret"] or not x_razorpay_signature or not hmac.compare_digest(_sign(c["webhook_secret"], body.decode("utf-8", "replace")), x_razorpay_signature):
            raise HTTPException(status_code=400, detail="Bad signature")
        try:
            event = json.loads(body)
        except Exception:  # noqa: BLE001
            raise HTTPException(status_code=400, detail="Bad payload")
        if event.get("event") not in ("payment.captured", "order.paid"):
            return {"ok": True, "ignored": event.get("event")}
        pay = ((event.get("payload") or {}).get("payment") or {}).get("entity") or {}
        order_id, payment_id = pay.get("order_id"), pay.get("id")
        order = await orders.find_one({"order_id": order_id}, {"_id": 0}) if order_id else None
        if not order:
            return {"ok": True, "ignored": "unknown order"}
        if int(pay.get("amount") or 0) != int(order.get("payable", order["amount"])):
            await orders.update_one({"id": order["id"]}, {"$set": {"status": "amount_mismatch", "webhook_amount": pay.get("amount")}})
            return {"ok": True, "ignored": "amount mismatch"}
        await _fulfil(order, payment_id, "webhook")
        return {"ok": True}

    @router.get("/me/payments")
    async def my_payments(user: dict = Depends(require_user)):
        rows = await orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
        for r in rows:
            for k in ("created_at", "paid_at"):
                if isinstance(r.get(k), datetime):
                    r[k] = subs._iso(r[k])
        return {"payments": rows}

    return router

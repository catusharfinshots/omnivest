"""Razorpay checkout, exercised end to end in mock mode (RAZORPAY_MODE=mock on the server under test).

The server prices the order from the partner's plan, verifies the payment signature with the key secret,
creates the same subscription row an admin grant creates, unlocks the listing, and stays idempotent when the
webhook reports the same payment again. Skips when the server has no payment configuration at all.
"""
import hashlib
import hmac
import json
import os
import sys
import uuid
import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import _listing  # noqa: E402
from test_listing_v2 import API, CONS, _admin, _analyst, _cleanup  # noqa: E402
from test_subscriptions import _investor, _leaks  # noqa: E402

MOCK_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "mock-secret")
WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")


def _sig(secret, msg):
    return hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()


def _mongo():
    from pymongo import MongoClient
    return MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=3000)["omnivest"]


def test_referral_credit_reduces_the_payable_amount_and_can_cover_it_fully():
    cfg = requests.get(f"{API}/payments/config", timeout=30).json()
    if cfg.get("mode") != "mock":
        pytest.skip("server is not in RAZORPAY_MODE=mock")
    from datetime import datetime, timedelta, timezone
    h = _admin()
    app_id, user_id, a, firm = _analyst(h)
    inv_id, inv_phone, inv = _investor()
    db = _mongo()
    pid = None
    try:
        pid = _listing.create_submitted_listing(API, a, "Credit Basket", CONS, subscription="Paid", plans=[{"months": 1, "price": 499}, {"months": 3, "price": 1299}])
        requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30).raise_for_status()
        requests.put(f"{API}/me/billing", json={"pan": "ABCDE1234F", "pan_name": "Sub Tester", "dob": "1990-05-04", "state": "Karnataka"}, headers=inv, timeout=30).raise_for_status()
        t = requests.get(f"{API}/portfolios/{pid}/terms", timeout=30).json()
        requests.post(f"{API}/checkout/consent/request", json={"portfolio_id": pid}, headers=inv, timeout=30).raise_for_status()
        requests.post(f"{API}/checkout/consent/confirm", json={"portfolio_id": pid, "code": "123456", "terms_version": t["version"]}, headers=inv, timeout=30).raise_for_status()
        # ₹100 of credit -> the 3-month plan (₹1,299) asks the gateway for ₹1,199 and the browser sees both numbers
        db.credits.insert_one({"id": "t1", "user_id": inv_id, "amount": 100, "reason": "test", "key": "test:1", "at": datetime.now(timezone.utc), "expires_at": datetime.now(timezone.utc) + timedelta(days=30), "redeemed": 0})
        assert requests.get(f"{API}/payments/credit", headers=inv, timeout=30).json()["balance"] == 100
        o = requests.post(f"{API}/payments/orders", json={"portfolio_id": pid, "plan_months": 3}, headers=inv, timeout=30).json()
        assert o["amount"] == 119900 and o["price"] == 129900 and o["credit_applied"] == 10000 and not o.get("paid")
        # credit is only consumed once the payment succeeds
        assert requests.get(f"{API}/payments/credit", headers=inv, timeout=30).json()["balance"] == 100
        pay_id = "pay_mock_" + uuid.uuid4().hex[:10]
        r = requests.post(f"{API}/payments/verify", json={"razorpay_order_id": o["order_id"], "razorpay_payment_id": pay_id, "razorpay_signature": _sig(MOCK_SECRET, f"{o['order_id']}|{pay_id}"), "mock": True}, headers=inv, timeout=30)
        assert r.status_code == 200, r.text
        assert requests.get(f"{API}/payments/credit", headers=inv, timeout=30).json()["balance"] == 0
        # enough credit for the whole 1-month plan: no gateway at all, subscribed on the spot, credit consumed exactly once
        db.credits.insert_one({"id": "t2", "user_id": inv_id, "amount": 600, "reason": "test", "key": "test:2", "at": datetime.now(timezone.utc), "expires_at": datetime.now(timezone.utc) + timedelta(days=30), "redeemed": 0})
        o2 = requests.post(f"{API}/payments/orders", json={"portfolio_id": pid, "plan_months": 1}, headers=inv, timeout=30).json()
        assert o2["paid"] is True and o2["amount"] == 0 and o2["credit_applied"] == 49900 and o2["subscription"]["plan_months"] == 1
        assert requests.get(f"{API}/payments/credit", headers=inv, timeout=30).json()["balance"] == 101
        assert db.subscriptions.find_one({"user_id": inv_id, "source": "credit", "status": "active"}) is not None
        assert db.credit_redemptions.count_documents({"user_id": inv_id}) == 2
    finally:
        for coll in ("credits", "credit_redemptions", "subscriptions", "payment_orders", "consents", "notifications"):
            db[coll].delete_many({"user_id": inv_id})
        requests.delete(f"{API}/admin/db/users/{inv_id}", headers=h, timeout=30)
        _cleanup(h, app_id, user_id, firm, [pid] if pid else [])


def _consent(h, inv, pid):
    requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30)
    requests.put(f"{API}/me/billing", json={"pan": "ABCDE1234F", "pan_name": "Sub Tester", "dob": "1990-05-04", "state": "Karnataka"}, headers=inv, timeout=30).raise_for_status()
    t = requests.get(f"{API}/portfolios/{pid}/terms", timeout=30).json()
    requests.post(f"{API}/checkout/consent/request", json={"portfolio_id": pid}, headers=inv, timeout=30).raise_for_status()
    requests.post(f"{API}/checkout/consent/confirm", json={"portfolio_id": pid, "code": "123456", "terms_version": t["version"]}, headers=inv, timeout=30).raise_for_status()


def _pay(inv, o):
    pay_id = "pay_mock_" + uuid.uuid4().hex[:10]
    r = requests.post(f"{API}/payments/verify", json={"razorpay_order_id": o["order_id"], "razorpay_payment_id": pay_id, "razorpay_signature": _sig(MOCK_SECRET, f"{o['order_id']}|{pay_id}"), "mock": True}, headers=inv, timeout=30)
    assert r.status_code == 200, r.text


def test_referred_friend_first_paid_subscription_earns_both_sides_once():
    """Locked 14 Sep 2026: a referred account converts on its first paid subscription OR first placed order, whichever
    comes first, once. On the paid path the friend's welcome credit is applied to that very first checkout; the referrer
    is credited only once the payment is confirmed. A partner referrer is counted but never credited."""
    cfg = requests.get(f"{API}/payments/config", timeout=30).json()
    if cfg.get("mode") != "mock":
        pytest.skip("server is not in RAZORPAY_MODE=mock")
    from datetime import datetime, timezone
    h = _admin()
    app_id, user_id, a, firm = _analyst(h)
    ref_id, _, _ref_h = _investor()
    friend_id, _, friend = _investor()
    friend2_id, _, friend2 = _investor()
    db = _mongo()
    pid = None
    try:
        pid = _listing.create_submitted_listing(API, a, "Welcome Basket", CONS, subscription="Paid", plans=[{"months": 1, "price": 499}, {"months": 3, "price": 1299}])
        db.users.update_one({"id": friend_id}, {"$set": {"referred_by": ref_id, "referred_at": datetime.now(timezone.utc)}})
        db.users.update_one({"id": friend2_id}, {"$set": {"referred_by": user_id, "referred_at": datetime.now(timezone.utc)}})   # referred by the partner
        db.app_settings.update_one({"_id": "referrals"}, {"$set": {"enabled": True, "referrer_amount": 100, "friend_amount": 100, "credit_months": 12}}, upsert=True)
        _consent(h, friend, pid)
        # before paying: nothing in the ledger, but the checkout may already deduct the welcome credit
        c = requests.get(f"{API}/payments/credit", headers=friend, timeout=30).json()
        assert c["balance"] == 0 and c["welcome"] == 100 and c["available"] == 100
        o = requests.post(f"{API}/payments/orders", json={"portfolio_id": pid, "plan_months": 3}, headers=friend, timeout=30).json()
        assert o["amount"] == 119900 and o["credit_applied"] == 10000 and not o.get("paid")
        assert db.credits.count_documents({"user_id": friend_id}) == 0 and db.credits.count_documents({"user_id": ref_id}) == 0
        _pay(friend, o)
        # paid: friend converted via subscription, welcome credit issued and consumed by this order, referrer credited, told
        u = db.users.find_one({"id": friend_id})
        assert u.get("referral_converted_at") and u.get("referral_converted_via") == "subscription"
        fc = db.credits.find_one({"user_id": friend_id})
        assert fc["amount"] == 100 and fc["redeemed"] == 100
        assert requests.get(f"{API}/payments/credit", headers=friend, timeout=30).json() ["available"] == 0
        rc = db.credits.find_one({"user_id": ref_id})
        assert rc["amount"] == 100 and rc["redeemed"] == 0 and "subscribed" in rc["reason"]
        assert db.notifications.find_one({"user_id": ref_id, "type": "referral"}) is not None
        # the Account page statement: friend earned and used ₹100, referrer holds ₹100 with an expiry
        st = requests.get(f"{API}/referrals/credits", headers=friend, timeout=30).json()
        assert st["balance"] == 0 and st["welcome"] == 0 and sorted(e["kind"] for e in st["entries"]) == ["earned", "used"]
        assert next(e for e in st["entries"] if e["kind"] == "used")["title"] == "Used on Welcome Basket"
        rst = requests.get(f"{API}/referrals/credits", headers=_ref_h, timeout=30).json()
        assert rst["balance"] == 100 and rst["expires_at"] and rst["entries"][0]["title"].endswith("subscribed")
        # once: a second plan gets no welcome credit and no second reward
        o2 = requests.post(f"{API}/payments/orders", json={"portfolio_id": pid, "plan_months": 1}, headers=friend, timeout=30).json()
        assert o2["credit_applied"] == 0 and o2["amount"] == 49900
        assert db.credits.count_documents({"user_id": ref_id}) == 1
        # partner referrer: the friend still gets the welcome credit, the partner gets nothing
        _consent(h, friend2, pid)
        o3 = requests.post(f"{API}/payments/orders", json={"portfolio_id": pid, "plan_months": 1}, headers=friend2, timeout=30).json()
        assert o3["credit_applied"] == 10000 and o3["amount"] == 39900
        _pay(friend2, o3)
        assert db.credits.find_one({"user_id": friend2_id})["redeemed"] == 100
        assert db.credits.count_documents({"user_id": user_id}) == 0
        assert db.users.find_one({"id": friend2_id}).get("referral_converted_via") == "subscription"
        # admin sees the friend's contact and how they converted
        requests.get(f"{API}/referrals/me", headers=a, timeout=30).raise_for_status()   # gives the partner a code so the table lists them
        rows = requests.get(f"{API}/admin/referrals", headers=h, timeout=30).json()["rows"]
        row = next(r for r in rows if r["referrer"]["id"] == user_id)
        assert row["friends"][0]["phone"] and row["friends"][0]["via"] == "subscription"
    finally:
        for uid in (friend_id, friend2_id, ref_id, user_id):
            for coll in ("credits", "credit_redemptions", "subscriptions", "payment_orders", "consents", "notifications"):
                db[coll].delete_many({"user_id": uid})
        for uid in (friend_id, friend2_id, ref_id):
            requests.delete(f"{API}/admin/db/users/{uid}", headers=h, timeout=30)
        _cleanup(h, app_id, user_id, firm, [pid] if pid else [])


def test_checkout_creates_subscription_and_unlocks():
    cfg = requests.get(f"{API}/payments/config", timeout=30).json()
    assert cfg.get("mode") in ("mock", "test", "live", "off")
    if cfg.get("mode") != "mock":
        pytest.skip("server is not in RAZORPAY_MODE=mock")
    h = _admin()
    app_id, user_id, a, firm = _analyst(h)
    inv_id, inv_phone, inv = _investor()
    pid = None
    try:
        pid = _listing.create_submitted_listing(API, a, "Checkout Basket", CONS, subscription="Paid",
                                               plans=[{"months": 1, "price": 499}, {"months": 3, "price": 1299}, {"months": 6, "price": 2399}, {"months": 12, "price": 3999}])
        requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30).raise_for_status()

        # prerequisites (covered in detail by test_checkout): billing on file + terms signed for this listing
        requests.put(f"{API}/me/billing", json={"pan": "ABCDE1234F", "pan_name": "Sub Tester", "dob": "1990-05-04", "state": "Karnataka"}, headers=inv, timeout=30).raise_for_status()
        t = requests.get(f"{API}/portfolios/{pid}/terms", timeout=30).json()
        requests.post(f"{API}/checkout/consent/request", json={"portfolio_id": pid}, headers=inv, timeout=30).raise_for_status()
        requests.post(f"{API}/checkout/consent/confirm", json={"portfolio_id": pid, "code": "123456", "terms_version": t["version"]}, headers=inv, timeout=30).raise_for_status()

        # anonymous cannot order; a wrong plan is refused; the amount comes from the partner's plan
        assert requests.post(f"{API}/payments/orders", json={"portfolio_id": pid, "plan_months": 3}, timeout=30).status_code == 401
        assert requests.post(f"{API}/payments/orders", json={"portfolio_id": pid, "plan_months": 5}, headers=inv, timeout=30).status_code == 422
        r = requests.post(f"{API}/payments/orders", json={"portfolio_id": pid, "plan_months": 3, "amount": 1}, headers=inv, timeout=30)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["amount"] == 129900 and order["currency"] == "INR" and order["order_id"].startswith("order_") and order["key_id"]

        # a forged signature never unlocks
        bad = requests.post(f"{API}/payments/verify", json={"razorpay_order_id": order["order_id"], "razorpay_payment_id": "pay_fake", "razorpay_signature": "0" * 64}, headers=inv, timeout=30)
        assert bad.status_code == 400
        assert not requests.get(f"{API}/portfolios/{pid}", headers=inv, timeout=30).json()["portfolio"]["access"]["unlocked"]

        st = requests.get(f"{API}/payments/orders/{order['order_id']}", headers=inv, timeout=30).json()
        assert st["status"] in ("created", "signature_failed") and st["subscription"] is None
        assert requests.get(f"{API}/payments/orders/{order['order_id']}", timeout=30).status_code == 401

        # the real signature (HMAC of order|payment with the key secret) does — and it must survive the real-world
        # burst: the browser's verify plus Razorpay's payment.captured AND order.paid webhooks in the same second
        payment_id = f"pay_{uuid.uuid4().hex[:14]}"
        verify_body = {"razorpay_order_id": order["order_id"], "razorpay_payment_id": payment_id, "razorpay_signature": _sig(MOCK_SECRET, f"{order['order_id']}|{payment_id}")}
        calls = [lambda: requests.post(f"{API}/payments/verify", json=verify_body, headers=inv, timeout=30)] * 2
        if WEBHOOK_SECRET:
            for ev in ("payment.captured", "order.paid"):
                wb = json.dumps({"event": ev, "payload": {"payment": {"entity": {"id": payment_id, "order_id": order["order_id"], "amount": 129900}}}})
                calls.append(lambda wb=wb: requests.post(f"{API}/payments/webhook", data=wb, headers={"Content-Type": "application/json", "X-Razorpay-Signature": _sig(WEBHOOK_SECRET, wb)}, timeout=30))
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=len(calls)) as ex:
            results = list(ex.map(lambda f: f(), calls))
        assert all(r.status_code == 200 for r in results), [(r.status_code, r.text[:120]) for r in results]
        good = results[0]
        assert good.json()["subscription"]["plan_months"] == 3
        assert len(requests.get(f"{API}/me/subscriptions", headers=inv, timeout=30).json()["subscriptions"]) == 1, "one payment must never stack two terms"
        st = requests.get(f"{API}/payments/orders/{order['order_id']}", headers=inv, timeout=30).json()
        assert st["status"] == "paid" and st["subscription"]["plan_months"] == 3
        d = requests.get(f"{API}/portfolios/{pid}", headers=inv, timeout=30).json()["portfolio"]
        assert d["access"]["unlocked"] and d["access"]["reason"] == "subscriber" and len(d["constituents"]) == 2
        mine = requests.get(f"{API}/me/subscriptions", headers=inv, timeout=30).json()["subscriptions"]
        assert len(mine) == 1 and mine[0]["source"] == "razorpay" and mine[0]["price"] == 1299
        pays = requests.get(f"{API}/me/payments", headers=inv, timeout=30).json()["payments"]
        assert pays[0]["status"] == "paid" and pays[0]["payment_id"] == payment_id

        # the webhook reporting the same payment does not create a second subscription
        if WEBHOOK_SECRET:
            body = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {"id": payment_id, "order_id": order["order_id"], "amount": 129900}}}})
            wh = requests.post(f"{API}/payments/webhook", data=body, headers={"Content-Type": "application/json", "X-Razorpay-Signature": _sig(WEBHOOK_SECRET, body)}, timeout=30)
            assert wh.status_code == 200, wh.text
            assert len(requests.get(f"{API}/me/subscriptions", headers=inv, timeout=30).json()["subscriptions"]) == 1
            # an unsigned webhook is rejected
            assert requests.post(f"{API}/payments/webhook", data=body, headers={"Content-Type": "application/json"}, timeout=30).status_code == 400

        # anonymous still sees nothing
        assert not _leaks(requests.get(f"{API}/portfolios/{pid}", timeout=30).json()["portfolio"])
        # admin sees the paid row
        adm = requests.get(f"{API}/admin/subscriptions", params={"portfolio_id": pid}, headers=h, timeout=30).json()
        assert adm["counts"]["active"] == 1 and adm["subscriptions"][0]["source"] == "razorpay"
    finally:
        requests.delete(f"{API}/admin/db/users/{inv_id}", headers=h, timeout=30)
        for coll in ("subscriptions", "subscription_interest", "payment_orders", "consents"):
            for row in requests.get(f"{API}/admin/db/{coll}", params={"limit": 200}, headers=h, timeout=30).json().get("documents", []):
                if row.get("portfolio_id") == pid:
                    requests.delete(f"{API}/admin/db/{coll}/{row['id']}", headers=h, timeout=30)
        _cleanup(h, app_id, user_id, firm, [pid] if pid else [])


def test_mode_label_reflects_key_type():
    """A Razorpay test key must never be reported as live (Tushar reads this in the admin/checkout)."""
    import sys, os as _os
    sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
    from payments import _mode
    assert _mode({"mock": True, "enabled": True, "key_id": "rzp_test_mock"}) == "mock"
    assert _mode({"mock": False, "enabled": False, "key_id": ""}) == "off"
    assert _mode({"mock": False, "enabled": True, "key_id": "rzp_test_abc"}) == "test"
    assert _mode({"mock": False, "enabled": True, "key_id": "rzp_live_abc"}) == "live"

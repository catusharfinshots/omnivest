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


def test_checkout_creates_subscription_and_unlocks():
    cfg = requests.get(f"{API}/payments/config", timeout=30).json()
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
        requests.post(f"{API}/checkout/consent/request", headers=inv, timeout=30).raise_for_status()
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

        # the real signature (HMAC of order|payment with the key secret) does
        payment_id = f"pay_{uuid.uuid4().hex[:14]}"
        good = requests.post(f"{API}/payments/verify", json={"razorpay_order_id": order["order_id"], "razorpay_payment_id": payment_id,
                                                              "razorpay_signature": _sig(MOCK_SECRET, f"{order['order_id']}|{payment_id}")}, headers=inv, timeout=30)
        assert good.status_code == 200, good.text
        assert good.json()["subscription"]["plan_months"] == 3
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

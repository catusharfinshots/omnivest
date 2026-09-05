"""Checkout prerequisites: billing details (validated), listing-specific terms signed with a mobile OTP,
and an order that is refused until both exist. Runs against OTP demo mode (code 123456)."""
import os
import sys
import requests

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import _listing  # noqa: E402
from test_listing_v2 import API, CONS, _admin, _analyst, _cleanup  # noqa: E402
from test_subscriptions import _investor  # noqa: E402

PLANS = [{"months": 1, "price": 499}, {"months": 3, "price": 1299}, {"months": 6, "price": 2399}, {"months": 12, "price": 3999}]
GOOD = {"pan": "abcde1234f", "pan_name": "Sub Tester", "dob": "1990-05-04", "state": "Karnataka"}


def _cleanup_investor(h, inv_id, pid):
    requests.delete(f"{API}/admin/db/users/{inv_id}", headers=h, timeout=30)
    for coll in ("consents", "subscriptions", "subscription_interest", "payment_orders"):
        for row in requests.get(f"{API}/admin/db/{coll}", params={"limit": 200}, headers=h, timeout=30).json().get("documents", []):
            if row.get("portfolio_id") == pid or row.get("user_id") == inv_id:
                requests.delete(f"{API}/admin/db/{coll}/{row['id']}", headers=h, timeout=30)


def test_billing_terms_and_order_gate():
    h = _admin()
    app_id, user_id, a, firm = _analyst(h)
    inv_id, inv_phone, inv = _investor()
    pid = None
    try:
        pid = _listing.create_submitted_listing(API, a, "Terms Basket", CONS, subscription="Paid", plans=PLANS)
        requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30).raise_for_status()

        # nothing on file yet
        st = requests.get(f"{API}/checkout/status", params={"portfolio_id": pid}, headers=inv, timeout=30).json()
        assert st["missing"] == ["billing", "terms"] and st["terms_version"]
        cfg = requests.get(f"{API}/payments/config", timeout=30).json()
        if cfg.get("enabled"):
            r = requests.post(f"{API}/payments/orders", json={"portfolio_id": pid, "plan_months": 3}, headers=inv, timeout=30)
            assert r.status_code == 428 and set(r.json()["detail"]["missing"]) == {"billing", "terms"}

        # billing validation
        bad = requests.put(f"{API}/me/billing", json={**GOOD, "pan": "1234"}, headers=inv, timeout=30)
        assert bad.status_code == 422 and any("PAN" in e for e in bad.json()["detail"]["errors"])
        minor = requests.put(f"{API}/me/billing", json={**GOOD, "dob": "2015-01-01"}, headers=inv, timeout=30)
        assert minor.status_code == 422 and any("18" in e for e in minor.json()["detail"]["errors"])
        ok = requests.put(f"{API}/me/billing", json=GOOD, headers=inv, timeout=30)
        assert ok.status_code == 200 and ok.json()["billing"]["pan"] == "ABCDE1234F" and ok.json()["complete"]
        assert requests.get(f"{API}/me/billing", headers=inv, timeout=30).json()["complete"]

        # terms: partner block + platform terms, versioned
        t = requests.get(f"{API}/portfolios/{pid}/terms", timeout=30).json()
        assert t["paid"] and "Research analyst" in t["html"] and "Omnivest" in t["html"] and t["partner"]["sebiReg"] == "INH000066666"
        assert "INH000066666" in t["html"] and "Registered address" in t["html"] and "Investor Charter" in t["charter_html"]
        assert t["version"] == st["terms_version"]
        # wrong code, stale version, then the real signature
        rq = requests.post(f"{API}/checkout/consent/request", json={"portfolio_id": pid}, headers=inv, timeout=30)
        assert rq.status_code == 200 and rq.json()["phone_hint"].startswith("+91")
        r = requests.post(f"{API}/checkout/consent/confirm", json={"portfolio_id": pid, "code": "000000", "terms_version": t["version"]}, headers=inv, timeout=30)
        assert r.status_code == 401
        r = requests.post(f"{API}/checkout/consent/confirm", json={"portfolio_id": pid, "code": "123456", "terms_version": "old"}, headers=inv, timeout=30)
        assert r.status_code == 409
        r = requests.post(f"{API}/checkout/consent/confirm", json={"portfolio_id": pid, "code": "123456", "terms_version": t["version"]}, headers=inv, timeout=30)
        assert r.status_code == 200 and r.json()["consent"]["terms_version"] == t["version"], r.text
        st = requests.get(f"{API}/checkout/status", params={"portfolio_id": pid}, headers=inv, timeout=30).json()
        assert st["missing"] == [] and st["consent"]["id"]
        mine = requests.get(f"{API}/me/consents", headers=inv, timeout=30).json()["consents"]
        assert len(mine) == 1 and mine[0]["signer"]["pan"] == "ABCDE1234F" and mine[0]["method"] == "otp_sms" and "terms_html" not in mine[0]

        # now an order is priced, and the subscription carries the consent
        if cfg.get("enabled"):
            r = requests.post(f"{API}/payments/orders", json={"portfolio_id": pid, "plan_months": 3}, headers=inv, timeout=30)
            assert r.status_code == 200 and r.json()["amount"] == 129900, r.text
            if cfg.get("mode") == "mock":
                order = r.json()
                v = requests.post(f"{API}/payments/verify", json={"razorpay_order_id": order["order_id"], "razorpay_payment_id": "pay_mock_test1", "razorpay_signature": None, "mock": True}, headers=inv, timeout=30)
                assert v.status_code == 200, v.text
                sub = requests.get(f"{API}/admin/subscriptions", params={"portfolio_id": pid}, headers=h, timeout=30).json()["subscriptions"][0]
                assert sub["active"] and sub["source"] == "razorpay"
                assert sub["consent"]["terms_version"] == t["version"] and sub["consent"]["accepted_at"]
    finally:
        _cleanup_investor(h, inv_id, pid)
        _cleanup(h, app_id, user_id, firm, [pid] if pid else [])

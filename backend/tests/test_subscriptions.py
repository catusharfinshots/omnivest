"""Paid listings keep their recipe on the server.

A non-subscriber never receives stock names, symbols or prices for a paid listing — not from the
explore list, the listing page, the performance document, the factsheet or subscriber-only updates.
Admin grants a subscription (until online payment exists); the investor then gets everything;
revoking locks it again. Free listings are untouched.
"""
import io
import os
import sys
import uuid
import requests

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import _listing  # noqa: E402
from test_listing_v2 import API, CONS, _admin, _analyst, _cleanup  # noqa: E402

SYMS = {c["symbol"] for c in CONS}


def _investor():
    phone = f"+9196{uuid.uuid4().int % 10**8:08d}"
    requests.post(f"{API}/auth/phone/request-otp", json={"phone": phone}, timeout=30)
    v = requests.post(f"{API}/auth/phone/verify-otp", json={"phone": phone, "code": "123456", "name": "Sub Tester", "flow": "customer"}, timeout=30).json()
    return v["user"]["id"], phone, {"Authorization": f"Bearer {v['token']}"}


def _leaks(obj) -> bool:
    """True if any constituent symbol appears anywhere in the JSON."""
    text = str(obj)
    return any(s in text for s in SYMS)


def test_paid_listing_recipe_is_server_gated_until_admin_grants():
    h = _admin()
    app_id, user_id, a, firm = _analyst(h)
    inv_id, inv_phone, inv = _investor()
    pid = None
    try:
        pid = _listing.create_submitted_listing(API, a, "Paid Basket", CONS, subscription="Paid",
                                               plans=[{"months": 1, "price": 499}, {"months": 3, "price": 1299}, {"months": 6, "price": 2399}, {"months": 12, "price": 3999}])
        requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30).raise_for_status()
        # a subscriber-only update
        requests.post(f"{API}/analyst/portfolios/{pid}/posts", json={"title": "Why we added RELIANCE", "body": "<p>Secret reasoning</p>", "subscribers_only": True}, headers=a, timeout=30).raise_for_status()

        # --- anonymous: everything locked, nothing leaks ---
        lst = requests.get(f"{API}/portfolios", timeout=30).json()["portfolios"]
        row = [p for p in lst if p["id"] == pid][0]
        assert row["holdings_locked"] and row["holdings_count"] == 2 and row["constituents"] == [] and not _leaks(row)
        d = requests.get(f"{API}/portfolios/{pid}", timeout=30).json()["portfolio"]
        assert d["access"] == {"paid": True, "unlocked": False, "reason": "locked", "subscribed_until": None, "plan_months": None}
        assert d["holdings_locked"] and d["holdings_count"] == 2 and d["top_weight_pct"] == 50 and not _leaks(d)
        assert d["factsheet_pdf"]["locked"] is True
        perf = requests.get(f"{API}/portfolios/{pid}/performance", timeout=60).json()
        assert perf.get("holdings_locked") is True and "latest_prices" not in perf and not _leaks(perf)
        assert requests.get(f"{API}/portfolios/{pid}/factsheet", timeout=30).status_code == 403
        posts = requests.get(f"{API}/portfolios/{pid}/posts", timeout=30).json()
        assert posts["unlocked"] is False and posts["posts"][0]["locked"] and "body" not in posts["posts"][0]

        # --- logged-in investor without a subscription: still locked ---
        d = requests.get(f"{API}/portfolios/{pid}", headers=inv, timeout=30).json()["portfolio"]
        assert not d["access"]["unlocked"] and not _leaks(d)
        assert requests.get(f"{API}/portfolios/{pid}/factsheet", headers=inv, timeout=30).status_code == 403
        # they can register interest (lead for follow-up)
        r = requests.post(f"{API}/portfolios/{pid}/subscribe-interest", json={"plan_months": 3}, headers=inv, timeout=30)
        assert r.status_code == 200, r.text
        adm = requests.get(f"{API}/admin/subscriptions", headers=h, timeout=30).json()
        assert any(i["user_id"] == inv_id and i["portfolio_id"] == pid and i["plan_months"] == 3 for i in adm["interest"])

        # --- admin grants 3 months by phone number ---
        r = requests.post(f"{API}/admin/subscriptions", json={"user": inv_phone, "portfolio_id": pid, "plan_months": 3, "note": "paid by UPI"}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        sub = r.json()["subscription"]
        assert sub["active"] and sub["plan_months"] == 3 and sub["price"] == 1299 and sub["source"] == "admin"
        d = requests.get(f"{API}/portfolios/{pid}", headers=inv, timeout=30).json()["portfolio"]
        assert d["access"]["unlocked"] and d["access"]["reason"] == "subscriber" and d["access"]["subscribed_until"]
        assert not d.get("holdings_locked") and {c["symbol"] for c in d["constituents"]} == SYMS
        perf = requests.get(f"{API}/portfolios/{pid}/performance", headers=inv, timeout=60).json()
        assert not perf.get("holdings_locked") and "latest_prices" in perf
        assert requests.get(f"{API}/portfolios/{pid}/factsheet", headers=inv, timeout=30).status_code == 200
        posts = requests.get(f"{API}/portfolios/{pid}/posts", headers=inv, timeout=30).json()
        assert posts["unlocked"] and posts["posts"][0]["body"]
        mine = requests.get(f"{API}/me/subscriptions", headers=inv, timeout=30).json()["subscriptions"]
        assert len(mine) == 1 and mine[0]["listing"]["name"] == "Paid Basket" and mine[0]["active"]
        # the interest lead is closed, the partner sees a real subscriber
        adm = requests.get(f"{API}/admin/subscriptions", params={"portfolio_id": pid}, headers=h, timeout=30).json()
        assert adm["counts"]["active"] == 1 and not any(i["user_id"] == inv_id and i["status"] == "open" for i in adm["interest"])
        ps = requests.get(f"{API}/analyst/portfolios/{pid}/subscribers", headers=a, timeout=30).json()
        assert ps["active"] == 1 and ps["revenue"] == 1299 and "•" in ps["subscribers"][0]["user"]["phone"]

        # --- anonymous is still locked while the investor is unlocked (no cache leak) ---
        assert not requests.get(f"{API}/portfolios/{pid}", timeout=30).json()["portfolio"]["access"]["unlocked"]

        # --- extend then revoke ---
        assert requests.post(f"{API}/admin/subscriptions/{sub['id']}/extend", json={"months": 1}, headers=h, timeout=30).status_code == 200
        assert requests.post(f"{API}/admin/subscriptions/{sub['id']}/revoke", json={"note": "refund"}, headers=h, timeout=30).status_code == 200
        d = requests.get(f"{API}/portfolios/{pid}", headers=inv, timeout=30).json()["portfolio"]
        assert not d["access"]["unlocked"] and d["holdings_locked"] and not _leaks(d)
        assert requests.get(f"{API}/portfolios/{pid}/factsheet", headers=inv, timeout=30).status_code == 403

        # --- owner and admin always unlocked ---
        assert requests.get(f"{API}/portfolios/{pid}", headers=a, timeout=30).json()["portfolio"]["access"]["reason"] == "owner"
        assert requests.get(f"{API}/portfolios/{pid}", headers=h, timeout=30).json()["portfolio"]["access"]["reason"] == "admin"
        # granting on a free listing is refused
        r = requests.post(f"{API}/admin/subscriptions", json={"user": inv_phone, "portfolio_id": pid, "plan_months": 5}, headers=h, timeout=30)
        assert r.status_code == 422
    finally:
        requests.delete(f"{API}/admin/db/users/{inv_id}", headers=h, timeout=30)
        for coll in ("subscriptions", "subscription_interest"):
            for row in requests.get(f"{API}/admin/db/{coll}", params={"limit": 200}, headers=h, timeout=30).json().get("documents", []):
                if row.get("portfolio_id") == pid:
                    requests.delete(f"{API}/admin/db/{coll}/{row['id']}", headers=h, timeout=30)
        _cleanup(h, app_id, user_id, firm, [pid] if pid else [])


def test_free_listing_is_fully_public():
    h = _admin()
    app_id, user_id, a, firm = _analyst(h)
    pid = None
    try:
        pid = _listing.create_submitted_listing(API, a, "Free Basket", CONS)
        requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30).raise_for_status()
        d = requests.get(f"{API}/portfolios/{pid}", timeout=30).json()["portfolio"]
        assert d["access"]["unlocked"] and d["access"]["reason"] == "free" and {c["symbol"] for c in d["constituents"]} == SYMS
        assert requests.get(f"{API}/portfolios/{pid}/factsheet", timeout=30).status_code == 200
        row = [p for p in requests.get(f"{API}/portfolios", timeout=30).json()["portfolios"] if p["id"] == pid][0]
        assert not row.get("holdings_locked") and row["holdings_count"] == 2
    finally:
        _cleanup(h, app_id, user_id, firm, [pid] if pid else [])

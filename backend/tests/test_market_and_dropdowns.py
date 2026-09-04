"""Backend tests for:
- Editable dropdown options (F5.1) — GET /listing-options + PUT /admin/listing-options
- Kite market data (F6.1/F6.4) — /admin/kite/market/status, /login-url, /market/quote,
  /market/period-return, /market/instruments/search

Kite is NOT connected in this environment (correct/expected). Live endpoints
should therefore return 503 gracefully.
"""
from __future__ import annotations

import os
import random
import sys
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "http://localhost:8001"

ADMIN_EMAIL = "admin@omnivest.in"
ADMIN_PASSWORD = "Admin@123"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from listing_options import DEFAULTS  # the live defaults, so "restore" never strips newer options


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def a_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def analyst_token(s, a_headers):
    r = s.post(f"{BASE_URL}/api/admin/invites",
               json={"email_note": "TEST_market", "expires_in_days": 1},
               headers=a_headers)
    assert r.status_code == 200
    code = r.json()["code"]
    phone = "+9198" + "".join(str(random.randint(0, 9)) for _ in range(8))
    s.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": phone})
    r = s.post(f"{BASE_URL}/api/auth/phone/verify-otp",
               json={"phone": phone, "code": "123456", "name": "TEST Mkt", "invite_code": code})
    assert r.status_code == 200
    return r.json()["token"]


# ---------------- Listing options (F5.1) ----------------

class TestListingOptions:
    def test_get_listing_options_public_returns_5_groups(self, s):
        r = s.get(f"{BASE_URL}/api/listing-options")
        assert r.status_code == 200
        opts = r.json()["options"]
        for k in DEFAULTS:
            assert k in opts and isinstance(opts[k], list) and len(opts[k]) >= 1

    def test_put_listing_options_requires_admin(self, s):
        r = s.put(f"{BASE_URL}/api/admin/listing-options", json={"strategy": ["x"]})
        assert r.status_code in (401, 403)

    def test_put_listing_options_dedupes_and_persists(self, s, a_headers):
        payload = {"strategy": ["thematic", "Thematic", "sectoral", " thematic "]}
        r = s.put(f"{BASE_URL}/api/admin/listing-options", json=payload, headers=a_headers)
        assert r.status_code == 200
        got = r.json()["options"]["strategy"]
        assert got == ["thematic", "sectoral"], f"dedupe wrong: {got}"

        # persistence check via GET
        r = s.get(f"{BASE_URL}/api/listing-options")
        assert r.json()["options"]["strategy"] == ["thematic", "sectoral"]

    def test_put_listing_options_rejects_empty_list(self, s, a_headers):
        r = s.put(f"{BASE_URL}/api/admin/listing-options", json={"strategy": []}, headers=a_headers)
        assert r.status_code == 422

    def test_put_listing_options_rejects_non_list(self, s, a_headers):
        r = s.put(f"{BASE_URL}/api/admin/listing-options", json={"strategy": "not-a-list"}, headers=a_headers)
        assert r.status_code == 422

    def test_zzz_restore_defaults(self, s, a_headers):
        # restore all defaults so the analyst form is unaffected
        r = s.put(f"{BASE_URL}/api/admin/listing-options", json=DEFAULTS, headers=a_headers)
        assert r.status_code == 200
        for k, v in DEFAULTS.items():
            assert r.json()["options"][k] == v


# ---------------- Kite market-data (F6.1/F6.4) ----------------

class TestMarketData:
    def test_market_status_not_connected(self, s, a_headers):
        r = s.get(f"{BASE_URL}/api/admin/kite/market/status", headers=a_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["connected"] is False
        assert isinstance(body["configured"], bool)   # True locally/prod, False in CI (no Kite key)
        assert "instruments_count" in body

    def test_market_status_requires_admin(self, s):
        r = s.get(f"{BASE_URL}/api/admin/kite/market/status")
        assert r.status_code in (401, 403)

    def test_market_login_url_returns_kite_url(self, s, a_headers):
        st = s.get(f"{BASE_URL}/api/admin/kite/market/status", headers=a_headers).json()
        if not st.get("configured"):
            pytest.skip("Kite API key not configured in this environment")
        r = s.get(f"{BASE_URL}/api/admin/kite/market/login-url", headers=a_headers)
        assert r.status_code == 200
        url = r.json().get("login_url", "")
        assert "kite.zerodha.com" in url, f"unexpected login url: {url}"

    def test_market_quote_returns_503_when_not_connected(self, s, analyst_token):
        r = s.post(f"{BASE_URL}/api/market/quote",
                   json={"symbols": ["NSE:RELIANCE"]},
                   headers={"Authorization": f"Bearer {analyst_token}"})
        assert r.status_code == 503, f"expected 503, got {r.status_code}: {r.text}"

    def test_market_period_return_503_or_404(self, s, analyst_token):
        r = s.post(f"{BASE_URL}/api/market/period-return",
                   json={"symbol": "NSE:RELIANCE", "period": "1Y"},
                   headers={"Authorization": f"Bearer {analyst_token}"})
        # Without any cached instruments, the code hits instruments.find_one first → 404;
        # OR if instrument is cached but session not connected → 503. Either is graceful.
        assert r.status_code in (503, 404), f"expected 503/404, got {r.status_code}: {r.text}"

    def test_instruments_search_requires_auth(self, s):
        r = s.get(f"{BASE_URL}/api/market/instruments/search?q=REL")
        assert r.status_code in (401, 403)

    def test_instruments_search_returns_empty_gracefully(self, s, analyst_token):
        r = s.get(f"{BASE_URL}/api/market/instruments/search?q=REL",
                  headers={"Authorization": f"Bearer {analyst_token}"})
        assert r.status_code == 200
        body = r.json()
        assert "results" in body and isinstance(body["results"], list)
        # With no cached instruments the list should be empty
        # (may be non-empty if a previous run cached — tolerate both)

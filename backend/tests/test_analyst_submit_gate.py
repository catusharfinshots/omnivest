"""Backend tests for the Analyst Console 'Save & submit for approval' gate.

Covers the Phase-3 change brief items:
- POST /api/analyst/portfolios/{pid}/submit returns 422 with detail.errors[]
  when the stored portfolio is incomplete (name/subtitle/methodology/factsheet
  fields/rationale/constituents/weights != 100%; factsheet PDF optional since Listing 2.0).
- Returns 200 when the portfolio is fully complete.
- Drafts (create/update) are permissive (no strict validation).
"""
from __future__ import annotations

import io
import os
import random
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for local dev; do NOT default in prod
    BASE_URL = "http://localhost:8001"

ADMIN_EMAIL = "admin@omnivest.in"
ADMIN_PASSWORD = "Admin@123"


# ---------- Fixtures ----------

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
def invite_code(s, admin_token):
    r = s.post(
        f"{BASE_URL}/api/admin/invites",
        json={"email_note": "TEST_analyst_submit_gate", "expires_in_days": 1},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, f"create invite failed: {r.status_code} {r.text}"
    return r.json()["code"]


@pytest.fixture(scope="module")
def analyst_token(s, invite_code):
    # Unique phone; demo mode → any number + code 123456
    phone = "+9198" + "".join(str(random.randint(0, 9)) for _ in range(8))
    r = s.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": phone})
    assert r.status_code == 200, f"request-otp failed: {r.status_code} {r.text}"
    r = s.post(
        f"{BASE_URL}/api/auth/phone/verify-otp",
        json={"phone": phone, "code": "123456", "name": "TEST Analyst", "invite_code": invite_code},
    )
    assert r.status_code == 200, f"verify-otp failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "analyst", f"role != analyst: {data['user']}"
    return data["token"]


@pytest.fixture
def a_headers(analyst_token):
    return {"Authorization": f"Bearer {analyst_token}"}


# ---------- Helpers ----------

BLANK_PORTFOLIO = {
    "name": "",
    "subtitle": "",
    "strategy": "thematic",
    "risk": "Medium",
    "minAmount": 5000,
    "subscription": "Free",
    "feeAmount": 0,
    "feeCycle": "monthly",
    "methodology": "",
    "rebalanceFreq": "Quarterly",
    "constituents": [],
    "returns": {"cagr": 0, "y1": 0, "y3": 0, "y5": 0},
    "factsheet": {"objective": "", "whoShouldInvest": "", "riskFactors": "", "pdfName": ""},
}


def _create_pf(s, headers, name="TEST_PF_empty"):
    payload = dict(BLANK_PORTFOLIO)
    payload["name"] = name
    r = s.post(f"{BASE_URL}/api/analyst/portfolios", json=payload, headers=headers)
    assert r.status_code == 200, f"create portfolio failed: {r.status_code} {r.text}"
    return r.json()["portfolio"]["id"]


# ---------- Tests ----------

class TestSubmitGate:
    """Backend submit-gate returns 422 with errors[] when incomplete."""

    def test_submit_empty_portfolio_returns_422_with_errors(self, s, a_headers):
        pid = _create_pf(s, a_headers, "TEST_empty_submit")
        r = s.post(f"{BASE_URL}/api/analyst/portfolios/{pid}/submit", headers=a_headers)
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"
        body = r.json()
        detail = body.get("detail")
        assert isinstance(detail, dict), f"detail should be object, got: {detail}"
        assert "errors" in detail and isinstance(detail["errors"], list)
        errs = detail["errors"]
        assert len(errs) > 0
        joined = " | ".join(errs)
        # Key expected error messages
        assert "Subtitle is required." in errs
        assert "Methodology is required." in errs
        assert "Factsheet objective is required." in errs
        assert "Factsheet who should invest is required." in errs
        assert "Factsheet risk factors is required." in errs
        assert "Investment rationale is required." in errs  # PDF is optional since Listing 2.0
        assert "Add at least 2 constituents." in errs
        # cleanup
        s.delete(f"{BASE_URL}/api/analyst/portfolios/{pid}", headers=a_headers)

    def test_submit_wrong_total_weight_returns_422_with_100pct_error(self, s, a_headers):
        payload = dict(BLANK_PORTFOLIO)
        payload.update({
            "name": "TEST_wrong_weight",
            "subtitle": "A short subtitle",
            "methodology": "Some methodology",
            "factsheet": {"objective": "obj", "whoShouldInvest": "who", "riskFactors": "risk", "pdfName": ""},
            "constituents": [
                {"symbol": "RELIANCE", "name": "Reliance", "type": "Stock", "weight": 40},
                {"symbol": "TCS", "name": "TCS", "type": "Stock", "weight": 30},
            ],
        })
        r = s.post(f"{BASE_URL}/api/analyst/portfolios", json=payload, headers=a_headers)
        assert r.status_code == 200
        pid = r.json()["portfolio"]["id"]
        r = s.post(f"{BASE_URL}/api/analyst/portfolios/{pid}/submit", headers=a_headers)
        assert r.status_code == 422
        errs = r.json()["detail"]["errors"]
        # message should mention "100%" and currently 70%
        assert any("100%" in e and "70%" in e for e in errs), f"missing weight-total msg: {errs}"
        # factsheet PDF still missing
        assert "Investment rationale is required." in errs  # PDF is optional since Listing 2.0
        s.delete(f"{BASE_URL}/api/analyst/portfolios/{pid}", headers=a_headers)

    def test_submit_subtitle_over_30_words_returns_422(self, s, a_headers):
        # This tests server-side subtitle length check only (frontend caps at 30).
        long_subtitle = " ".join(["word"] * 35)
        payload = dict(BLANK_PORTFOLIO)
        payload.update({"name": "TEST_long_sub", "subtitle": long_subtitle})
        r = s.post(f"{BASE_URL}/api/analyst/portfolios", json=payload, headers=a_headers)
        assert r.status_code == 200
        pid = r.json()["portfolio"]["id"]
        r = s.post(f"{BASE_URL}/api/analyst/portfolios/{pid}/submit", headers=a_headers)
        assert r.status_code == 422
        errs = r.json()["detail"]["errors"]
        assert "Subtitle must be 30 words or fewer." in errs, f"missing 30w err: {errs}"
        s.delete(f"{BASE_URL}/api/analyst/portfolios/{pid}", headers=a_headers)

    def test_draft_save_permissive_no_strict_validation(self, s, a_headers):
        """Create + update with a blank/incomplete draft is allowed (no 422)."""
        pid = _create_pf(s, a_headers, "TEST_draft_ok")
        # update with still-incomplete data - should still succeed
        payload = dict(BLANK_PORTFOLIO)
        payload["name"] = "TEST_draft_ok_updated"
        r = s.put(f"{BASE_URL}/api/analyst/portfolios/{pid}", json=payload, headers=a_headers)
        assert r.status_code == 200, f"draft update should be permissive, got {r.status_code}: {r.text}"
        assert r.json()["portfolio"]["status"] == "draft"
        s.delete(f"{BASE_URL}/api/analyst/portfolios/{pid}", headers=a_headers)

    def test_complete_portfolio_submits_successfully_200_pending(self, s, a_headers):
        # Full portfolio incl. factsheet PDF upload; weight sums to 100.
        payload = dict(BLANK_PORTFOLIO)
        payload.update({
            "name": "TEST_complete_pf",
            "subtitle": "Well built thematic portfolio for long-term compounding",
            "methodology": "Rules-based rebalanced quarterly using factor tilts.",
            "rationale": "<p>Factor-tilted large caps for steady compounding.</p>",
            "factsheet": {
                "objective": "Long-term wealth creation",
                "whoShouldInvest": "Investors with a 5+ year horizon",
                "riskFactors": "Market and liquidity risk apply",
                "pdfName": "",
            },
            "constituents": [
                {"symbol": "RELIANCE", "name": "Reliance", "type": "Stock", "weight": 50},
                {"symbol": "TCS", "name": "TCS", "type": "Stock", "weight": 50},
            ],
            "returns": {"cagr": 12, "y1": 10, "y3": 15, "y5": 14},
        })
        r = s.post(f"{BASE_URL}/api/analyst/portfolios", json=payload, headers=a_headers)
        assert r.status_code == 200
        pid = r.json()["portfolio"]["id"]

        # Upload factsheet PDF (multipart)
        pdf_bytes = b"%PDF-1.4\n%TEST\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
        files = {"file": ("factsheet.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        r = requests.post(
            f"{BASE_URL}/api/analyst/portfolios/{pid}/factsheet",
            headers={"Authorization": a_headers["Authorization"]},
            files=files,
        )
        assert r.status_code == 200, f"pdf upload failed: {r.status_code} {r.text}"

        # Now submit -> 200
        r = s.post(f"{BASE_URL}/api/analyst/portfolios/{pid}/submit", headers=a_headers)
        assert r.status_code == 200, f"submit should succeed: {r.status_code} {r.text}"
        assert r.json().get("status") == "pending"

        # Verify list shows pending
        r = s.get(f"{BASE_URL}/api/analyst/portfolios", headers=a_headers)
        assert r.status_code == 200
        found = [p for p in r.json()["portfolios"] if p["id"] == pid]
        assert found and found[0]["status"] == "pending"

        s.delete(f"{BASE_URL}/api/analyst/portfolios/{pid}", headers=a_headers)

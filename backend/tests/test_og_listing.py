"""Listing share previews: short link /api/og/s/<code>, per-listing OG image (PNG 1200x630),
public-origin URLs, and fallbacks for unknown codes."""
import os
import sys
import uuid

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import _listing  # noqa: E402
import og  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "admin@omnivest.in", "password": "Admin@123"}
CONS = [{"symbol": "RELIANCE", "name": "Reliance", "exchange": "NSE", "type": "Stock", "weight": 50},
        {"symbol": "INFY", "name": "Infosys", "exchange": "NSE", "type": "Stock", "weight": 50}]


def test_short_code_and_card_render_pure():
    assert og.short_code("03cdb78d-19c3-4b6b-92e5-f1f305355de0") == "03cdb78d"
    png = og.render_card({"name": "Test Basket", "subtitle": "Pitch", "tags": ["Growth"], "strategy": "thematic", "cover": {"palette": "teal"}}, "RA", [("Since launch", "+1.0%"), ("Min. investment", "Rs 5,000")])
    assert png[:8] == b"\x89PNG\r\n\x1a\n" and len(png) > 20_000


def _admin():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30); r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _analyst(h):
    n = uuid.uuid4().hex[:8]; firm = f"Perffirm {n}"; phone = f"+9195{uuid.uuid4().int % 10**8:08d}"
    payload = {"name": f"OG Analyst {n}", "phone": phone, "email": f"og_{n}@test.com", "registered_name": f"OG Research {n}", "firm": firm,
               "sebi_reg": "INH000066666", "sebi_reg_date": "2022-01-01", "raasb_no": "R-8", "nism_cert_no": "N-8", "nism_valid_till": "2030-01-01",
               "pan": "ABCDE6666F", "registered_address": "8 Perf Street, Mumbai 400001", "applicant_type": "Individual",
               "principal_officer": None, "compliance_officer": None, "disciplinary_history": False, "disciplinary_details": "",
               "raasb_deposit_confirmed": True, "other_registrations": "", "model_portfolio_compliance": True,
               "website": "", "linkedin": "", "experience_years": "5", "specializations": "", "note": "og", "accepted_terms": True}
    app = requests.post(f"{API}/partners/apply", json=payload, timeout=30).json()["application"]
    requests.post(f"{API}/admin/partners/{app['id']}/review", json={"action": "approve", "note": ""}, headers=h, timeout=30).raise_for_status()
    v = requests.post(f"{API}/auth/phone/verify-otp", json={"phone": phone, "code": "123456", "flow": "partner"}, timeout=30).json()
    return app["id"], v["user"]["id"], {"Authorization": f"Bearer {v['token']}"}, firm


def test_listing_share_preview_end_to_end():
    h = _admin()
    app_id, user_id, an, firm = _analyst(h)
    pid = None
    try:
        pid = _listing.create_submitted_listing(API, an, "Share Card Basket", CONS, subtitle="A pitch for the share card.")
        code = og.short_code(pid)
        # not approved yet -> short link falls back to the portfolios page, no leak
        r = requests.get(f"{API}/og/s/{code}", timeout=30)
        assert r.status_code == 200 and "Share Card Basket" not in r.text and "Model Portfolios" in r.text
        assert requests.get(f"{API}/og/image/{pid}.png", timeout=30).status_code == 404
        requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30).raise_for_status()

        # short link -> listing meta, per-listing image, canonical = SPA route on the public origin
        r = requests.get(f"{API}/og/s/{code}", timeout=30)
        assert r.status_code == 200, r.text
        html_ = r.text
        assert "Share Card Basket | Omnivest" in html_ and "A pitch for the share card." in html_
        assert f"/api/og/image/{pid}.png?v=" in html_ and 'og:image:width" content="1200"' in html_
        assert f"/model-portfolios/{pid}" in html_ and "omnivest-og-1200x630" not in html_
        # full id and path-style both work too
        assert "Share Card Basket" in requests.get(f"{API}/og/model-portfolios/{pid}", timeout=30).text
        # image endpoint: real PNG, 1200x630, cached
        img = requests.get(f"{API}/og/image/{pid}.png", timeout=60)
        assert img.status_code == 200 and img.headers["content-type"] == "image/png" and img.content[:8] == b"\x89PNG\r\n\x1a\n"
        assert "max-age" in img.headers.get("cache-control", "")
        from PIL import Image
        import io
        assert Image.open(io.BytesIO(img.content)).size == (1200, 630)
        # unknown code -> portfolios fallback, never 500
        assert requests.get(f"{API}/og/s/zzzzzzzz", timeout=30).status_code == 200
    finally:
        if pid:
            requests.delete(f"{API}/admin/db/portfolio_performance/{pid}", headers=h, timeout=30)
            requests.delete(f"{API}/admin/db/analyst_portfolios/{pid}", headers=h, timeout=30)
        requests.delete(f"{API}/admin/db/partner_applications/{app_id}", headers=h, timeout=30)
        requests.delete(f"{API}/admin/db/users/{user_id}", headers=h, timeout=30)
        for m in requests.get(f"{API}/admin/db/managers", params={"q": firm}, headers=h, timeout=30).json().get("documents", []):
            requests.delete(f"{API}/admin/db/managers/{m['id']}", headers=h, timeout=30)

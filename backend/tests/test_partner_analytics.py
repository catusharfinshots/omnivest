"""Partner analytics: event ingest -> analyst stats -> admin dashboard settings.
Runs against a live backend (default local dev). Self-cleaning."""
import os
import uuid

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "admin@omnivest.in", "password": "Admin@123"}


def _admin_headers():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _make_analyst(headers):
    """Apply -> approve -> partner OTP login. Returns (app_id, phone, analyst_headers, firm_marker)."""
    n = uuid.uuid4().hex[:8]
    firm = f"Statsfirm {n}"
    phone = f"+9196{uuid.uuid4().int % 10**8:08d}"
    payload = {
        "name": f"Stats Analyst {n}", "phone": phone, "email": f"stats_{n}@test.com",
        "registered_name": f"Stats Research {n}", "firm": firm, "sebi_reg": "INH000077777",
        "sebi_reg_date": "2022-01-01", "raasb_no": "R-9", "nism_cert_no": "N-9", "nism_valid_till": "2030-01-01",
        "pan": "ABCDE7777G", "registered_address": "9 Stats Street, Mumbai 400001", "applicant_type": "Individual",
        "principal_officer": None, "compliance_officer": None, "disciplinary_history": False, "disciplinary_details": "",
        "raasb_deposit_confirmed": True, "other_registrations": "", "model_portfolio_compliance": True,
        "website": "", "linkedin": "", "experience_years": "5", "specializations": "", "note": "stats", "accepted_terms": True,
    }
    app = requests.post(f"{API}/partners/apply", json=payload, timeout=30).json()["application"]
    requests.post(f"{API}/admin/partners/{app['id']}/review", json={"action": "approve", "note": ""}, headers=headers, timeout=30).raise_for_status()
    v = requests.post(f"{API}/auth/phone/verify-otp", json={"phone": phone, "code": "123456", "flow": "partner"}, timeout=30)
    v.raise_for_status()
    return app["id"], v.json()["user"]["id"], {"Authorization": f"Bearer {v.json()['token']}"}, firm


def test_events_flow_to_analyst_stats_and_admin_settings():
    headers = _admin_headers()
    app_id, user_id, analyst, firm = _make_analyst(headers)
    pid = None
    try:
        # analyst creates a draft portfolio (owner resolution target)
        p = requests.post(f"{API}/analyst/portfolios", json={"name": "Stats Basket"}, headers=analyst, timeout=30)
        assert p.status_code == 200, p.text
        pid = p.json()["portfolio"]["id"]

        # public ingest: 3 views, 1 invest click, 1 share, 2 impressions, plus junk that must be dropped
        batch = {"events": [
            {"type": "portfolio_view", "portfolio_id": pid, "path": "/model-portfolios/x", "sid": "s1"},
            {"type": "portfolio_view", "portfolio_id": pid, "sid": "s1"},
            {"type": "portfolio_view", "portfolio_id": pid, "sid": "s2"},
            {"type": "invest_click", "portfolio_id": pid, "sid": "s2"},
            {"type": "share_click", "portfolio_id": pid, "sid": "s2"},
            {"type": "portfolio_impression", "portfolio_id": pid, "sid": "s3"},
            {"type": "portfolio_impression", "portfolio_id": pid, "sid": "s4"},
            {"type": "portfolio_view", "portfolio_id": "does-not-exist", "sid": "s9"},   # unknown portfolio -> dropped
            {"type": "hack_event", "portfolio_id": pid, "sid": "s9"},                     # unknown type -> dropped
        ]}
        r = requests.post(f"{API}/events", json=batch, timeout=30)
        assert r.status_code == 200 and r.json()["accepted"] == 7, r.text

        # analyst stats reflect exactly those events
        s = requests.get(f"{API}/analyst/stats", params={"days": 30}, headers=analyst, timeout=30)
        assert s.status_code == 200, s.text
        d = s.json()
        assert d["totals"]["views"] == 3 and d["totals"]["investClicks"] == 1
        assert d["totals"]["impressions"] == 2 and d["totals"]["shares"] == 1
        assert d["totals"]["conversionPct"] == 33.3
        assert len(d["series"]) == 30 and sum(x["views"] for x in d["series"]) == 3
        row = next(x for x in d["portfolios"] if x["id"] == pid)
        assert row["views"] == 3 and row["status"] == "draft"
        assert any(n["kind"] == "profile_incomplete" for n in d["nudges"])
        assert d["settings"]["enabled"] is True

        # stats are analyst-only
        assert requests.get(f"{API}/analyst/stats", timeout=30).status_code in (401, 403)

        # admin settings round-trip (deep-merge, clamped) and analyst sees them
        put = requests.put(f"{API}/admin/partner-dashboard/settings",
                           json={"announcement": "Rebalance window closes Friday", "nudges": {"staleDays": 45}, "tiles": {"shares": True}},
                           headers=headers, timeout=30)
        assert put.status_code == 200, put.text
        cfg = put.json()["settings"]
        assert cfg["announcement"] == "Rebalance window closes Friday" and cfg["nudges"]["staleDays"] == 45
        assert "shares" not in cfg["tiles"]  # unknown keys ignored
        pub = requests.get(f"{API}/partner-dashboard/settings", timeout=30).json()["settings"]
        assert pub["announcement"] == "Rebalance window closes Friday"
        assert requests.put(f"{API}/admin/partner-dashboard/settings", json={"enabled": False}, timeout=30).status_code in (401, 403)
    finally:
        # restore settings + clean everything this test created
        requests.put(f"{API}/admin/partner-dashboard/settings", json={"announcement": "", "nudges": {"staleDays": 30}}, headers=headers, timeout=30)
        if pid:
            requests.delete(f"{API}/admin/events/by-portfolio/{pid}", headers=headers, timeout=30)
            requests.delete(f"{API}/admin/db/analyst_portfolios/{pid}", headers=headers, timeout=30)
        requests.delete(f"{API}/admin/db/partner_applications/{app_id}", headers=headers, timeout=30)
        requests.delete(f"{API}/admin/db/users/{user_id}", headers=headers, timeout=30)
        for m in requests.get(f"{API}/admin/db/managers", params={"q": firm}, headers=headers, timeout=30).json().get("documents", []):
            requests.delete(f"{API}/admin/db/managers/{m['id']}", headers=headers, timeout=30)

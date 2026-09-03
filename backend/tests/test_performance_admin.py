"""Admin monitoring + control for the performance engine: overview/alerts shape and auth,
per-listing recompute, launch-date correction (validation, audit log, recompute), and the
admin-editable investor disclaimer in site content."""
import os
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import performance as pe  # noqa: E402
import _seedlock  # noqa: E402  (serialises price_history seeding across xdist workers)
import _listing  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "admin@omnivest.in", "password": "Admin@123"}
LOCAL = "localhost" in BASE_URL or "127.0.0.1" in BASE_URL


def _admin_headers():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _make_analyst(headers):
    n = uuid.uuid4().hex[:8]
    firm = f"Perffirm {n}"
    phone = f"+9195{uuid.uuid4().int % 10**8:08d}"
    payload = {
        "name": f"Perf Admin Analyst {n}", "phone": phone, "email": f"perfadm_{n}@test.com",
        "registered_name": f"Perf Research {n}", "firm": firm, "sebi_reg": "INH000066666",
        "sebi_reg_date": "2022-01-01", "raasb_no": "R-8", "nism_cert_no": "N-8", "nism_valid_till": "2030-01-01",
        "pan": "ABCDE6666F", "registered_address": "8 Perf Street, Mumbai 400001", "applicant_type": "Individual",
        "principal_officer": None, "compliance_officer": None, "disciplinary_history": False, "disciplinary_details": "",
        "raasb_deposit_confirmed": True, "other_registrations": "", "model_portfolio_compliance": True,
        "website": "", "linkedin": "", "experience_years": "5", "specializations": "", "note": "perf", "accepted_terms": True,
    }
    app = requests.post(f"{API}/partners/apply", json=payload, timeout=30).json()["application"]
    requests.post(f"{API}/admin/partners/{app['id']}/review", json={"action": "approve", "note": ""}, headers=headers, timeout=30).raise_for_status()
    v = requests.post(f"{API}/auth/phone/verify-otp", json={"phone": phone, "code": "123456", "flow": "partner"}, timeout=30)
    v.raise_for_status()
    return app["id"], v.json()["user"]["id"], {"Authorization": f"Bearer {v.json()['token']}"}, firm


def _local_db():
    from pymongo import MongoClient
    return MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=3000)["omnivest"]


def _seed_prices():
    db = _local_db()
    start = date.today() - timedelta(days=740)
    days = [start + timedelta(days=i) for i in range(741) if (start + timedelta(days=i)).weekday() < 5]

    def series(base, yearly):
        return [[d.isoformat(), round(base * (1 + yearly) ** (i / 260), 4)] for i, d in enumerate(days)]
    docs = {"NSE:PERFA": series(1000, 0.25), "NSE:PERFB": series(200, 0.05), "NSE:NIFTY 50": series(20000, 0.10), "NSE:NIFTY 500": series(18000, 0.11),
            "NSE:NIFTY MIDCAP 150": series(15000, 0.14), "NSE:NIFTY SMLCAP 250": series(12000, 0.16)}
    for k, candles in docs.items():
        db.price_history.update_one({"_id": k}, {"$set": {"_id": k, "token": 0, "refreshed_at": datetime.now(timezone.utc), "candles": candles}}, upsert=True)
    return list(docs.keys())


def test_admin_endpoints_require_admin():
    assert requests.get(f"{API}/admin/performance/overview", timeout=30).status_code in (401, 403)
    assert requests.get(f"{API}/admin/performance/alerts", timeout=30).status_code in (401, 403)
    assert requests.post(f"{API}/admin/performance/recompute/x", timeout=30).status_code in (401, 403)
    assert requests.put(f"{API}/admin/portfolios/x/launch", json={"launch_date": "2026-01-01", "reason": "nope nope"}, timeout=30).status_code in (401, 403)


def test_overview_and_alerts_shape():
    h = _admin_headers()
    ov = requests.get(f"{API}/admin/performance/overview", headers=h, timeout=60)
    assert ov.status_code == 200, ov.text
    d = ov.json()
    assert {"kite", "expected_close_date", "symbols_cached", "listings", "behind", "failed_symbols", "benchmarks_missing", "policy", "audit"} <= set(d)
    assert d["expected_close_date"] == pe.last_close_date().isoformat()
    assert d["policy"]["cagr_after_days"] == 365 and d["policy"]["volatility_after_trading_days"] == 20
    assert isinstance(d["kite"]["connected"], bool)
    al = requests.get(f"{API}/admin/performance/alerts", headers=h, timeout=60).json()
    assert {"behind", "failed_symbols", "benchmarks_missing", "kite_connected", "approved", "total"} <= set(al)
    assert al["total"] >= al["behind"] + al["failed_symbols"]


def test_disclaimer_is_admin_editable_content():
    c = requests.get(f"{API}/content", timeout=30).json()
    assert "performanceDisclaimer" in c and "closing prices" in c["performanceDisclaimer"]


def test_launch_correction_and_recompute():
    h = _admin_headers()
    app_id, user_id, analyst, firm = _make_analyst(h)
    pid, seeded = None, []
    try:
        if LOCAL:
            _seedlock.acquire()
            seeded = _seed_prices()
        pid = _listing.create_submitted_listing(API, analyst, "Perf Admin Basket", [
            {"symbol": "PERFA", "name": "Perf A", "exchange": "NSE", "type": "Stock", "weight": 70},
            {"symbol": "PERFB", "name": "Perf B", "exchange": "NSE", "type": "Stock", "weight": 30}], benchmark="NIFTY 500")
        requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30).raise_for_status()
        # already approved -> cannot be approved again
        assert requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30).status_code == 409

        # row appears in the overview
        rows = requests.get(f"{API}/admin/performance/overview", headers=h, timeout=60).json()["listings"]
        me = next(r for r in rows if r["id"] == pid)
        assert me["status"] == "approved" and me["launch_date"] == pe.ist_today().isoformat() and me["launch_price_date"] == pe.last_close_date().isoformat()

        # recompute one
        rc = requests.post(f"{API}/admin/performance/recompute/{pid}", headers=h, timeout=120)
        assert rc.status_code == 200 and rc.json()["market_data"] in ("live", "cached"), rc.text
        assert requests.post(f"{API}/admin/performance/recompute/nope", headers=h, timeout=30).status_code == 404

        # validation: reason required, no future purchase date, no weekend, purchase <= launch
        lp = pe.last_close_date() - timedelta(days=400)
        while lp.weekday() >= 5:
            lp -= timedelta(days=1)
        bad = [({"launch_date": lp.isoformat(), "reason": "ok"}, "reason"),
               ({"launch_date": (date.today() + timedelta(days=30)).isoformat(), "launch_price_date": (date.today() + timedelta(days=30)).isoformat(), "reason": "future date"}, "future"),
               ({"launch_date": lp.isoformat(), "launch_price_date": (lp + timedelta(days=1)).isoformat(), "reason": "price after launch"}, "after"),
               ({"launch_date": "not-a-date", "reason": "bad format"}, "format")]
        for body, why in bad:
            r = requests.put(f"{API}/admin/portfolios/{pid}/launch", json=body, headers=h, timeout=60)
            assert r.status_code == 422, (why, r.text)
        sat = lp
        while sat.weekday() != 5:
            sat -= timedelta(days=1)
        r = requests.put(f"{API}/admin/portfolios/{pid}/launch", json={"launch_date": sat.isoformat(), "launch_price_date": sat.isoformat(), "reason": "weekend"}, headers=h, timeout=60)
        assert r.status_code == 422

        # success: purchase date defaults to last close on/before launch date, audit entry written, recomputed
        r = requests.put(f"{API}/admin/portfolios/{pid}/launch", json={"launch_date": lp.isoformat(), "reason": "Approved on a holiday by mistake; agreed with partner"}, headers=h, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["launch"] == {"launch_date": lp.isoformat(), "launch_price_date": lp.isoformat()}
        assert d["audit"]["before"]["launch_date"] == pe.ist_today().isoformat() and d["audit"]["reason"].startswith("Approved on a holiday")
        ov = requests.get(f"{API}/admin/performance/overview", headers=h, timeout=60).json()
        assert any(a["portfolio_id"] == pid and a["after"]["launch_date"] == lp.isoformat() for a in ov["audit"])
        me = next(r for r in ov["listings"] if r["id"] == pid)
        assert me["launch_date"] == lp.isoformat() and len(me["launch_history"]) == 1
        if LOCAL:
            assert d["performance"]["status"] == "ok" and d["performance"]["start_date"] == lp.isoformat(), d["performance"].get("errors")
            assert me["days"] >= 399 and me["cagr_pct"] is not None and me["behind"] is False
            pub = requests.get(f"{API}/portfolios/{pid}/performance", timeout=60).json()
            assert pub["launch_date"] == lp.isoformat() and pub["metrics"]["cagr_pct"] is not None
    finally:
        if pid:
            requests.delete(f"{API}/admin/db/portfolio_performance/{pid}", headers=h, timeout=30)
            requests.delete(f"{API}/admin/db/analyst_portfolios/{pid}", headers=h, timeout=30)
            for a in requests.get(f"{API}/admin/db/audit_log", params={"limit": 100}, headers=h, timeout=30).json().get("documents", []):
                if a.get("portfolio_id") == pid:
                    requests.delete(f"{API}/admin/db/audit_log/{a['id']}", headers=h, timeout=30)
        requests.delete(f"{API}/admin/db/partner_applications/{app_id}", headers=h, timeout=30)
        requests.delete(f"{API}/admin/db/users/{user_id}", headers=h, timeout=30)
        for m in requests.get(f"{API}/admin/db/managers", params={"q": firm}, headers=h, timeout=30).json().get("documents", []):
            requests.delete(f"{API}/admin/db/managers/{m['id']}", headers=h, timeout=30)
        if seeded:
            _local_db().price_history.delete_many({"_id": {"$in": seeded}})
            _seedlock.release()

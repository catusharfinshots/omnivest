"""Listing performance engine: seeded price history -> computed NAV/CAGR/
benchmarks/min-investment via the API. Price seeding needs direct DB access,
so the compute assertions run only against the local dev backend; on other
hosts the test still checks endpoint shapes/auth."""
import os
import uuid
from datetime import date, timedelta

import requests

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
        "name": f"Perf Analyst {n}", "phone": phone, "email": f"perf_{n}@test.com",
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


def _seed_prices():
    """Local only: synthetic 2-year daily candles for two stocks and the core-4 indices."""
    from datetime import datetime, timezone
    from pymongo import MongoClient
    db = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=3000)["omnivest"]
    start = date.today() - timedelta(days=740)
    days = [start + timedelta(days=i) for i in range(741) if (start + timedelta(days=i)).weekday() < 5]
    def series(base, yearly):
        return [[d.isoformat(), round(base * (1 + yearly) ** (i / 260), 4)] for i, d in enumerate(days)]
    docs = {
        "NSE:PERFA": series(1000, 0.25), "NSE:PERFB": series(200, 0.05),
        "NSE:NIFTY 50": series(20000, 0.10), "NSE:NIFTY 500": series(18000, 0.11),
        "NSE:NIFTY MIDCAP 150": series(15000, 0.14), "NSE:NIFTY SMLCAP 250": series(12000, 0.16),
    }
    for k, candles in docs.items():
        db.price_history.update_one({"_id": k}, {"$set": {"_id": k, "token": 0, "refreshed_at": datetime.now(timezone.utc), "candles": candles}}, upsert=True)
    return list(docs.keys())


def _unseed(keys):
    from pymongo import MongoClient
    db = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=3000)["omnivest"]
    db.price_history.delete_many({"_id": {"$in": keys}})


def test_benchmarks_endpoint():
    r = requests.get(f"{API}/performance/benchmarks", timeout=30)
    assert r.status_code == 200
    keys = [b["key"] for b in r.json()["benchmarks"]]
    assert keys == ["NIFTY 50", "NIFTY 500", "NIFTY MIDCAP 150", "NIFTY SMLCAP 250"]
    assert requests.post(f"{API}/admin/performance/recompute", timeout=30).status_code in (401, 403)


def test_computed_performance_end_to_end():
    headers = _admin_headers()
    app_id, user_id, analyst, firm = _make_analyst(headers)
    pid, seeded = None, []
    try:
        if LOCAL:
            seeded = _seed_prices()
        p = requests.post(f"{API}/analyst/portfolios", json={
            "name": "Perf Basket", "benchmark": "NIFTY 500",
            "constituents": [{"symbol": "PERFA", "name": "Perf A", "exchange": "NSE", "type": "Stock", "weight": 70},
                             {"symbol": "PERFB", "name": "Perf B", "exchange": "NSE", "type": "Stock", "weight": 30}],
        }, headers=analyst, timeout=30)
        assert p.status_code == 200, p.text
        pid = p.json()["portfolio"]["id"]

        # approve -> launch_date set to today
        rv = requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=headers, timeout=30)
        from datetime import datetime, timezone
        assert rv.status_code == 200 and rv.json()["launch_date"] == datetime.now(timezone.utc).date().isoformat()

        perf = requests.post(f"{API}/analyst/portfolios/{pid}/performance/recompute", headers=analyst, timeout=60)
        assert perf.status_code == 200, perf.text
        d = perf.json()
        if not LOCAL:
            assert d["status"] in ("ok", "unavailable")
            return
        assert d["status"] == "ok", d.get("errors")
        assert d["benchmark"] == "NIFTY 500" and len(d["series"]) > 400
        # backtest (all history) metrics: 70/30 of +25%/+5% -> CAGR roughly 19%
        allm = d["metrics"]["all"]
        assert 15 < allm["cagr_pct"] < 23, allm
        assert allm["windows"]["1Y"] is not None and allm["windows"]["5Y"] is None
        assert allm["volatility_label"] in ("Low", "Medium", "High")
        # live series just launched (today in UTC) -> at most a day of live history, no CAGR yet
        assert d["metrics"]["live"]["days"] <= 1 and d["metrics"]["live"]["cagr_pct"] is None
        # benchmarks normalised to 100 at series start, primary has metrics
        assert set(d["benchmarks"].keys()) >= {"NIFTY 50", "NIFTY 500"}
        assert d["benchmarks"]["NIFTY 500"][0]["nav"] == 100.0
        assert d["bench_metrics"]["NIFTY 500"]["all"]["cagr_pct"] is not None
        # auto minimum investment: at least one share of each at 70/30
        mi = d["min_investment"]
        assert mi and mi["amount"] > 0 and {h["symbol"] for h in mi["holdings"]} == {"PERFA", "PERFB"}
        assert all(h["qty"] >= 1 for h in mi["holdings"])

        # public endpoint serves the cached doc (approved listing)
        pub = requests.get(f"{API}/portfolios/{pid}/performance", timeout=30)
        assert pub.status_code == 200 and pub.json()["status"] == "ok"
        assert pub.json()["portfolio_id"] == pid

        # rebalance: change weights after launch -> a version is recorded
        up = requests.put(f"{API}/analyst/portfolios/{pid}", json={
            "name": "Perf Basket", "benchmark": "NIFTY 500",
            "constituents": [{"symbol": "PERFA", "name": "Perf A", "exchange": "NSE", "type": "Stock", "weight": 50},
                             {"symbol": "PERFB", "name": "Perf B", "exchange": "NSE", "type": "Stock", "weight": 50}],
        }, headers=analyst, timeout=30)
        assert up.status_code == 200
        assert len(up.json()["portfolio"].get("versions") or []) == 2
    finally:
        if pid:
            requests.delete(f"{API}/admin/db/portfolio_performance/{pid}", headers=headers, timeout=30)
            requests.delete(f"{API}/admin/db/analyst_portfolios/{pid}", headers=headers, timeout=30)
        requests.delete(f"{API}/admin/db/partner_applications/{app_id}", headers=headers, timeout=30)
        requests.delete(f"{API}/admin/db/users/{user_id}", headers=headers, timeout=30)
        for m in requests.get(f"{API}/admin/db/managers", params={"q": firm}, headers=headers, timeout=30).json().get("documents", []):
            requests.delete(f"{API}/admin/db/managers/{m['id']}", headers=headers, timeout=30)
        if seeded:
            _unseed(seeded)

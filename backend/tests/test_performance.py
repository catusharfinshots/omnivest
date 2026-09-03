"""Listing performance engine (launch-day model).

Rules under test:
  * approval stamps launch_date (IST) + launch_price_date (last NSE close available)
  * the computed track record starts at that close — no backtest of earlier history
  * CAGR / windows / volatility stay None until enough live history exists
  * drafts get a min-investment preview only; refresh is automatic (no partner button)
  * public list carries a card summary; rebalances after launch record a version

Price seeding needs direct DB access, so the numeric assertions run only against
the local dev backend; elsewhere the test still checks shapes/auth."""
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
IST = timezone(timedelta(hours=5, minutes=30))


# ---------------- pure functions ----------------
def test_last_close_date_rules():
    ist = lambda y, m, d, hh, mm: datetime(y, m, d, hh, mm, tzinfo=IST)  # noqa: E731
    assert pe.last_close_date(ist(2026, 9, 5, 10, 0)) == date(2026, 9, 4)   # Saturday -> Friday
    assert pe.last_close_date(ist(2026, 9, 6, 18, 0)) == date(2026, 9, 4)   # Sunday -> Friday
    assert pe.last_close_date(ist(2026, 9, 7, 10, 0)) == date(2026, 9, 4)   # Monday before close -> Friday
    assert pe.last_close_date(ist(2026, 9, 7, 16, 0)) == date(2026, 9, 7)   # Monday after close -> Monday
    assert pe.last_close_date(ist(2026, 9, 8, 15, 34)) == date(2026, 9, 7)  # candles settle at 15:35


def test_build_nav_starts_on_purchase_date_with_forward_fill():
    cal = ["2026-01-05", "2026-01-06", "2026-01-07"]
    prices = {"A": {"2026-01-02": 100.0, "2026-01-06": 110.0, "2026-01-07": 120.0},   # no candle on the purchase date
              "B": {"2026-01-05": 50.0, "2026-01-06": 50.0, "2026-01-07": 40.0}}
    s = pe.build_nav([{"effective": "0000-01-01", "weights": {"A": 50, "B": 50}}], prices, cal)
    assert [p["d"] for p in s] == cal and s[0]["nav"] == 100.0
    assert abs(s[1]["nav"] - 105.0) < 1e-6          # A +10%, B flat
    assert abs(s[2]["nav"] - 100.0) < 1e-6          # A +20%, B -20%
    m = pe._metrics(s)
    assert m["return_pct"] == 0.0 and m["cagr_pct"] is None and all(v is None for v in m["windows"].values())
    assert m["volatility_label"] is None            # < 20 trading days


def test_summary_shape():
    s = pe.summary({"status": "ok", "launch_date": "2026-09-01", "launched_days_ago": 3, "benchmark": "NIFTY 50",
                    "metrics": {"days": 3, "return_pct": 1.5, "cagr_pct": None, "volatility_label": None, "max_drawdown_pct": -0.4},
                    "bench_metrics": {"NIFTY 50": {"return_pct": 0.5, "cagr_pct": None}}, "min_investment": {"amount": 1309}})
    assert s["alpha_pct"] == 1.0 and s["min_investment"] == 1309 and s["cagr_pct"] is None and s["launched_days_ago"] == 3


# ---------------- API ----------------
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


def _local_db():
    from pymongo import MongoClient
    return MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=3000)["omnivest"]


def _seed_prices():
    """Local only: synthetic 2-year daily candles for two stocks and the core-4 indices."""
    db = _local_db()
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
    _local_db().price_history.delete_many({"_id": {"$in": keys}})


def test_benchmarks_endpoint_and_auth():
    r = requests.get(f"{API}/performance/benchmarks", timeout=30)
    assert r.status_code == 200
    assert [b["key"] for b in r.json()["benchmarks"]] == ["NIFTY 50", "NIFTY 500", "NIFTY MIDCAP 150", "NIFTY SMLCAP 250"]
    assert requests.post(f"{API}/admin/performance/recompute", timeout=30).status_code in (401, 403)


def test_launch_day_performance_end_to_end():
    headers = _admin_headers()
    app_id, user_id, analyst, firm = _make_analyst(headers)
    pid, seeded = None, []
    cons = [{"symbol": "PERFA", "name": "Perf A", "exchange": "NSE", "type": "Stock", "weight": 50},
            {"symbol": "PERFB", "name": "Perf B", "exchange": "NSE", "type": "Stock", "weight": 50}]
    try:
        if LOCAL:
            _seedlock.acquire()
            seeded = _seed_prices()
        p = requests.post(f"{API}/analyst/portfolios", json={"name": "Perf Basket", "benchmark": "NIFTY 500", "constituents": cons}, headers=analyst, timeout=30)
        assert p.status_code == 200, p.text
        pid = p.json()["portfolio"]["id"]
        # a draft never reaches admin: not listed, cannot be approved, absent from the engine panel
        adm = requests.get(f"{API}/admin/portfolios", headers=headers, timeout=30).json()
        assert pid not in [x["id"] for x in adm["portfolios"]] and "counts" in adm
        assert requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=headers, timeout=30).status_code == 404
        assert pid not in [r["id"] for r in requests.get(f"{API}/admin/performance/overview", headers=headers, timeout=60).json()["listings"]]

        # draft: preview only, no track record, nothing to click (old recompute endpoint is gone)
        assert requests.post(f"{API}/analyst/portfolios/{pid}/performance/recompute", headers=analyst, timeout=30).status_code in (404, 405)
        d = requests.get(f"{API}/analyst/portfolios/{pid}/performance", headers=analyst, timeout=60).json()
        assert d["status"] in ("not_launched", "unavailable"), d
        assert d["launch_date"] is None and "series" not in d
        if LOCAL:
            assert d["status"] == "not_launched" and d["min_investment"]["amount"] > 0

        # partner completes + submits (real gate) -> pending, now visible to admin
        requests.put(f"{API}/analyst/portfolios/{pid}", json=_listing.complete_payload("Perf Basket", cons, "NIFTY 500"), headers=analyst, timeout=30).raise_for_status()
        import io
        requests.post(f"{API}/analyst/portfolios/{pid}/factsheet", files={"file": ("f.pdf", io.BytesIO(_listing.TINY_PDF), "application/pdf")}, headers=analyst, timeout=30).raise_for_status()
        requests.post(f"{API}/analyst/portfolios/{pid}/submit", headers=analyst, timeout=30).raise_for_status()
        assert pid in [x["id"] for x in requests.get(f"{API}/admin/portfolios", headers=headers, timeout=30).json()["portfolios"]]
        # approve -> launch day = IST today, purchase price = last close available now
        rv = requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=headers, timeout=30)
        assert rv.status_code == 200, rv.text
        assert rv.json()["launch_date"] == pe.ist_today().isoformat()
        assert rv.json()["launch_price_date"] == pe.last_close_date().isoformat()

        # public page: computed automatically on first view, starts at the launch close, too young for CAGR
        pub = requests.get(f"{API}/portfolios/{pid}/performance", timeout=60)
        assert pub.status_code == 200, pub.text
        d = pub.json()
        if not LOCAL:
            assert d["status"] in ("ok", "unavailable", "computing")
            return
        assert d["status"] == "ok", d.get("errors")
        assert d["launch_price_date"] == pe.last_close_date().isoformat()
        assert d["start_date"] <= d["launch_price_date"] and len(d["series"]) <= 2
        assert d["series"][0]["nav"] == 100.0 and d["metrics"]["cagr_pct"] is None
        assert all(v is None for v in d["metrics"]["windows"].values())
        assert d["benchmarks"]["NIFTY 500"][0]["nav"] == 100.0 and d["launched_days_ago"] == 0
        assert {h["symbol"] for h in d["min_investment"]["holdings"]} == {"PERFA", "PERFB"}

        # explore list carries the card summary
        lst = requests.get(f"{API}/portfolios", timeout=30).json()["portfolios"]
        me = next(x for x in lst if x["id"] == pid)
        assert me["computed"]["status"] == "ok" and me["computed"]["min_investment"] == d["min_investment"]["amount"]

        # simulate a listing launched 400 days ago -> live CAGR from launch close, 1Y window, no 3Y/5Y
        db = _local_db()
        lp = pe.last_close_date() - timedelta(days=400)
        while lp.weekday() >= 5:
            lp -= timedelta(days=1)
        db.analyst_portfolios.update_one({"id": pid}, {"$set": {"launch_date": lp.isoformat(), "launch_price_date": lp.isoformat()}})
        rc = requests.post(f"{API}/admin/performance/recompute", headers=headers, timeout=120)
        assert rc.status_code == 200, rc.text
        d = requests.get(f"{API}/portfolios/{pid}/performance", timeout=60).json()
        assert d["start_date"] == lp.isoformat() and d["series"][0]["nav"] == 100.0
        m = d["metrics"]
        assert 12 < m["cagr_pct"] < 18, m                      # 50/50 of +25%/+5% ≈ 15%
        assert m["windows"]["1Y"] is not None and m["windows"]["3Y"] is None and m["windows"]["5Y"] is None
        assert m["volatility_label"] in ("Low", "Medium", "High")
        assert d["bench_metrics"]["NIFTY 500"]["cagr_pct"] is not None and d["launched_days_ago"] >= 400

        # rebalance after launch -> version recorded with today's IST date
        up = requests.put(f"{API}/analyst/portfolios/{pid}", json=_listing.complete_payload("Perf Basket", [{**cons[0], "weight": 40}, {**cons[1], "weight": 60}], "NIFTY 500"), headers=analyst, timeout=30)
        assert up.status_code == 200
        vs = up.json()["portfolio"].get("versions") or []
        assert len(vs) == 2 and vs[-1]["effective_date"] == pe.ist_today().isoformat()
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
            _seedlock.release()

"""Demo data for the quality gate and local design work: one partner with two approved listings
(one launched today, one launched 400 days ago on synthetic prices) plus a draft.

    python scripts/seed_demo.py seed    # creates everything, writes e2e/.listing-route
    python scripts/seed_demo.py clean   # removes everything it made

Never run against production: it talks to MONGO_URL (default local) and REACT_APP_BACKEND_URL (default :8000).
"""
import json
import os
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

import requests
from pymongo import MongoClient

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
ROOT = os.path.dirname(BACKEND)
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.join(BACKEND, "tests"))
import performance as pe  # noqa: E402
import _listing  # noqa: E402

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/") + "/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
if "mongodb.net" in MONGO_URL or "omnivest.in" in API:
    sys.exit("refusing to seed demo data against production")
db = MongoClient(MONGO_URL)[os.environ.get("DB_NAME", "omnivest")]
STATE = os.path.join(HERE, "seed_demo_state.json")
ROUTE_FILE = os.path.join(ROOT, "e2e", ".listing-route")
PHONE = "+919500000042"


def seed():
    start = date.today() - timedelta(days=740)
    days = [start + timedelta(days=i) for i in range(741) if (start + timedelta(days=i)).weekday() < 5]
    random.seed(7)

    def series(base, yearly, noise):
        out, v = [], base
        for d in days:
            v = v * (1 + yearly / 260 + random.gauss(0, noise))
            out.append([d.isoformat(), round(v, 2)])
        return out

    docs = {"NSE:DEMOA": series(2400, 0.22, 0.014), "NSE:DEMOB": series(640, 0.09, 0.011), "NSE:DEMOC": series(1310, 0.16, 0.017),
            "NSE:NIFTY 50": series(22000, 0.11, 0.007), "NSE:NIFTY 500": series(20000, 0.12, 0.008),
            "NSE:NIFTY MIDCAP 150": series(18000, 0.15, 0.010), "NSE:NIFTY SMLCAP 250": series(15000, 0.17, 0.012)}
    for k, c in docs.items():
        db.price_history.update_one({"_id": k}, {"$set": {"_id": k, "token": 0, "refreshed_at": datetime.now(timezone.utc), "candles": c}}, upsert=True)

    admin = requests.post(f"{API}/auth/login", json={"email": "admin@omnivest.in", "password": "Admin@123"}, timeout=30).json()["token"]
    ah = {"Authorization": f"Bearer {admin}"}
    n = uuid.uuid4().hex[:6]
    payload = {"name": "Demo Analyst", "phone": PHONE, "email": f"demo_{n}@test.com", "registered_name": "Demo Research", "firm": f"Demofirm {n}",
               "sebi_reg": "INH000077777", "sebi_reg_date": "2022-01-01", "raasb_no": "R-9", "nism_cert_no": "N-9", "nism_valid_till": "2030-01-01",
               "pan": "ABCDE7777F", "registered_address": "9 Demo Street, Mumbai 400001", "applicant_type": "Individual",
               "principal_officer": None, "compliance_officer": None, "disciplinary_history": False, "disciplinary_details": "",
               "raasb_deposit_confirmed": True, "other_registrations": "", "model_portfolio_compliance": True,
               "website": "", "linkedin": "", "experience_years": "7", "specializations": "", "note": "demo", "accepted_terms": True}
    app = requests.post(f"{API}/partners/apply", json=payload, timeout=30).json()["application"]
    requests.post(f"{API}/admin/partners/{app['id']}/review", json={"action": "approve", "note": ""}, headers=ah, timeout=30).raise_for_status()
    v = requests.post(f"{API}/auth/phone/verify-otp", json={"phone": PHONE, "code": "123456", "flow": "partner"}, timeout=30).json()
    th = {"Authorization": f"Bearer {v['token']}"}

    def mk(name, sub, cons, bench):
        return _listing.create_submitted_listing(API, th, name, cons, benchmark=bench, subtitle=sub)

    cons = [{"symbol": "DEMOA", "name": "Demo Alpha Ltd", "exchange": "NSE", "type": "Stock", "weight": 50},
            {"symbol": "DEMOB", "name": "Demo Beta Ltd", "exchange": "NSE", "type": "Stock", "weight": 30},
            {"symbol": "DEMOC", "name": "Demo Gamma Ltd", "exchange": "NSE", "type": "Stock", "weight": 20}]
    p_old = mk("Compounders 3", "Three quality compounders held for the long run.", cons, "NIFTY 500")
    p_new = mk("Fresh Momentum", "Just launched — momentum leaders across sectors.", [{**cons[0], "weight": 50}, {**cons[1], "weight": 50}], "NIFTY 50")
    p_draft = requests.post(f"{API}/analyst/portfolios", json={"name": "Draft Basket", "subtitle": "Still being built.", "benchmark": "NIFTY 50",
                                                              "strategy": "thematic", "risk": "Medium", "minAmount": 5000, "rebalanceFreq": "Quarterly",
                                                              "subscription": "Free", "constituents": cons}, headers=th, timeout=30).json()["portfolio"]["id"]
    for pid in (p_old, p_new):
        requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=ah, timeout=30).raise_for_status()
    lp = pe.last_close_date() - timedelta(days=400)
    while lp.weekday() >= 5:
        lp -= timedelta(days=1)
    db.analyst_portfolios.update_one({"id": p_old}, {"$set": {"launch_date": lp.isoformat(), "launch_price_date": lp.isoformat()}})
    db.portfolio_performance.delete_many({"_id": {"$in": [p_old, p_new]}})
    json.dump({"prices": list(docs), "app": app["id"], "user": v["user"]["id"], "firm": payload["firm"], "pids": [p_old, p_new, p_draft]}, open(STATE, "w"))
    with open(ROUTE_FILE, "w") as f:
        f.write(f"/model-portfolios/{p_old}\n")
    print(json.dumps({"old": p_old, "new": p_new, "draft": p_draft, "launch_old": lp.isoformat(), "route_file": ROUTE_FILE}))


def clean():
    if not os.path.exists(STATE):
        print("nothing to clean")
        return
    st = json.load(open(STATE))
    db.price_history.delete_many({"_id": {"$in": st["prices"]}})
    db.portfolio_performance.delete_many({"_id": {"$in": st["pids"]}})
    db.analyst_portfolios.delete_many({"id": {"$in": st["pids"]}})
    db.events.delete_many({"portfolio_id": {"$in": st["pids"]}})
    db.partner_applications.delete_many({"id": st["app"]})
    db.users.delete_many({"id": st["user"]})
    db.managers.delete_many({"firm": st["firm"]})
    for f in (STATE, ROUTE_FILE):
        if os.path.exists(f):
            os.remove(f)
    print("cleaned; portfolios left:", db.analyst_portfolios.count_documents({}))


if __name__ == "__main__":
    seed() if (sys.argv[1:] or ["seed"])[0] == "seed" else clean()

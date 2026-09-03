"""Listing 2.0 backend (stage A): admin rules + options, submit gate against the rules,
rich-text sanitising, request-changes review flow, featured / pause / resume, admin preview
of non-approved listings, update posts with subscriber gating, and stock classification."""
import io
import os
import sys
import uuid

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import _listing  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "admin@omnivest.in", "password": "Admin@123"}
LOCAL = "localhost" in BASE_URL or "127.0.0.1" in BASE_URL
CONS = [{"symbol": "RELIANCE", "name": "Reliance", "exchange": "NSE", "type": "Stock", "weight": 50},
        {"symbol": "INFY", "name": "Infosys", "exchange": "NSE", "type": "Stock", "weight": 50}]


def _admin():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _analyst(h):
    n = uuid.uuid4().hex[:8]
    firm = f"Perffirm {n}"
    phone = f"+9195{uuid.uuid4().int % 10**8:08d}"
    payload = {"name": f"V2 Analyst {n}", "phone": phone, "email": f"v2_{n}@test.com", "registered_name": f"V2 Research {n}", "firm": firm,
               "sebi_reg": "INH000066666", "sebi_reg_date": "2022-01-01", "raasb_no": "R-8", "nism_cert_no": "N-8", "nism_valid_till": "2030-01-01",
               "pan": "ABCDE6666F", "registered_address": "8 Perf Street, Mumbai 400001", "applicant_type": "Individual",
               "principal_officer": None, "compliance_officer": None, "disciplinary_history": False, "disciplinary_details": "",
               "raasb_deposit_confirmed": True, "other_registrations": "", "model_portfolio_compliance": True,
               "website": "", "linkedin": "", "experience_years": "5", "specializations": "", "note": "v2", "accepted_terms": True}
    app = requests.post(f"{API}/partners/apply", json=payload, timeout=30).json()["application"]
    requests.post(f"{API}/admin/partners/{app['id']}/review", json={"action": "approve", "note": ""}, headers=h, timeout=30).raise_for_status()
    v = requests.post(f"{API}/auth/phone/verify-otp", json={"phone": phone, "code": "123456", "flow": "partner"}, timeout=30).json()
    return app["id"], v["user"]["id"], {"Authorization": f"Bearer {v['token']}"}, firm


def _cleanup(h, app_id, user_id, firm, pids):
    for pid in pids:
        requests.delete(f"{API}/admin/db/portfolio_performance/{pid}", headers=h, timeout=30)
        requests.delete(f"{API}/admin/db/analyst_portfolios/{pid}", headers=h, timeout=30)
        for p in requests.get(f"{API}/admin/posts", params={"portfolio_id": pid}, headers=h, timeout=30).json().get("posts", []):
            requests.delete(f"{API}/admin/db/listing_posts/{p['id']}", headers=h, timeout=30)
    requests.delete(f"{API}/admin/db/partner_applications/{app_id}", headers=h, timeout=30)
    requests.delete(f"{API}/admin/db/users/{user_id}", headers=h, timeout=30)
    for m in requests.get(f"{API}/admin/db/managers", params={"q": firm}, headers=h, timeout=30).json().get("documents", []):
        requests.delete(f"{API}/admin/db/managers/{m['id']}", headers=h, timeout=30)
    for a in requests.get(f"{API}/admin/db/audit_log", params={"limit": 100}, headers=h, timeout=30).json().get("documents", []):
        if a.get("portfolio_id") in pids:
            requests.delete(f"{API}/admin/db/audit_log/{a['id']}", headers=h, timeout=30)


def test_rules_and_options_defaults_and_auth():
    rules = requests.get(f"{API}/listing-rules", timeout=30).json()
    assert rules["min_constituents"] == 2 and rules["max_constituents"] == 50 and rules["max_weight_pct"] == 50
    assert rules["factsheet_pdf_required"] is False and rules["plan_durations"] == [1, 3, 6, 12]
    opts = requests.get(f"{API}/listing-options", timeout=30).json()
    assert "Growth" in opts["tags"] and "As needed" in opts["rebalanceFreq"]
    assert requests.put(f"{API}/admin/listing-rules", json={"max_weight_pct": 40}, timeout=30).status_code in (401, 403)
    h = _admin()
    assert requests.put(f"{API}/admin/listing-rules", json={"max_weight_pct": 0}, headers=h, timeout=30).status_code == 422
    assert requests.put(f"{API}/admin/listing-rules", json={"min_constituents": 5, "max_constituents": 3}, headers=h, timeout=30).status_code == 422


def test_submit_gate_uses_rules_and_sanitises():
    h = _admin()
    app_id, user_id, an, firm = _analyst(h)
    pids = []
    try:
        # concentration cap + min constituents + paid without plan + bad video + 4 tags
        bad = _listing.complete_payload("Bad Basket", [{**CONS[0], "weight": 100}], subscription="Paid", plans=[], videoUrl="https://example.com/x",
                                        tags=["a", "b", "c", "d"], rationale="<script>alert(1)</script>")
        r = requests.post(f"{API}/analyst/portfolios", json=bad, headers=an, timeout=30)
        assert r.status_code == 200, r.text
        pid = r.json()["portfolio"]["id"]
        pids.append(pid)
        assert "<script" not in r.json()["portfolio"]["rationale"]
        miss = requests.get(f"{API}/analyst/portfolios/{pid}/readiness", headers=an, timeout=30).json()["missing"]
        joined = " | ".join(miss)
        assert "at least 2 constituents" in joined and "exceeds the 50% cap" in joined and "at least one plan" in joined
        assert "YouTube or Vimeo" in joined and "at most 3 style tags" in joined and "rationale is required" in joined
        assert requests.post(f"{API}/analyst/portfolios/{pid}/submit", headers=an, timeout=30).status_code == 422

        # fix it: paid with plans, video ok, tags ok -> submits; legacy fee derived from cheapest plan per month
        good = _listing.complete_payload("Good Basket", CONS, subscription="Paid", plans=[{"months": 1, "price": 499}, {"months": 12, "price": 3999}],
                                         videoUrl="https://youtu.be/abc123", tags=["Growth", "Quality", "Momentum"])
        r = requests.put(f"{API}/analyst/portfolios/{pid}", json=good, headers=an, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()["portfolio"]
        assert p["feeAmount"] == 3999 and p["feeCycle"] == "yearly" and [x["months"] for x in p["plans"]] == [1, 12]
        assert "<strong>steady earnings</strong>" in p["rationale"]
        assert requests.get(f"{API}/analyst/portfolios/{pid}/readiness", headers=an, timeout=30).json()["missing"] == []
        assert requests.post(f"{API}/analyst/portfolios/{pid}/submit", headers=an, timeout=30).status_code == 200
    finally:
        _cleanup(h, app_id, user_id, firm, pids)


def test_request_changes_preview_feature_pause_and_posts():
    h = _admin()
    app_id, user_id, an, firm = _analyst(h)
    pids = []
    try:
        pid = _listing.create_submitted_listing(API, an, "Flow Basket", CONS, subscription="Paid", plans=[{"months": 3, "price": 999}])
        pids.append(pid)
        # request changes needs a note; sends it back to draft with the note visible to the partner
        assert requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "request_changes", "note": "ok"}, headers=h, timeout=30).status_code == 422
        r = requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "request_changes", "note": "Please expand the risk factors section."}, headers=h, timeout=30)
        assert r.status_code == 200 and r.json()["status"] == "draft", r.text
        mine = next(p for p in requests.get(f"{API}/analyst/portfolios", headers=an, timeout=30).json()["portfolios"] if p["id"] == pid)
        assert mine["status"] == "draft" and mine["changes_requested"] is True and "risk factors" in mine["review_note"]
        assert pid not in [x["id"] for x in requests.get(f"{API}/admin/portfolios", headers=h, timeout=30).json()["portfolios"]]
        # partner resubmits -> pending, flag cleared; admin can preview it, anonymous cannot
        assert requests.post(f"{API}/analyst/portfolios/{pid}/submit", headers=an, timeout=30).status_code == 200
        assert requests.get(f"{API}/portfolios/{pid}", timeout=30).status_code == 404
        pv = requests.get(f"{API}/portfolios/{pid}", headers=h, timeout=30)
        assert pv.status_code == 200 and pv.json()["portfolio"]["preview"] is True and pv.json()["portfolio"]["changes_requested"] is False
        # approve, feature -> first on explore
        requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30).raise_for_status()
        assert requests.post(f"{API}/admin/portfolios/{pid}/feature", json={"featured": True}, headers=h, timeout=30).json()["featured"] is True
        lst = requests.get(f"{API}/portfolios", timeout=30).json()["portfolios"]
        assert lst and lst[0]["id"] == pid and lst[0]["featured"] is True
        assert "preview" not in requests.get(f"{API}/portfolios/{pid}", timeout=30).json()["portfolio"]

        # posts: partner writes; public sees locked body on a paid listing; owner/admin see it; admin can remove
        post = requests.post(f"{API}/analyst/portfolios/{pid}/posts", json={"title": "Q2 update", "body": "<p>We added <b>INFY</b>.</p><script>x</script>", "subscribers_only": True}, headers=an, timeout=30)
        assert post.status_code == 200, post.text
        post_id = post.json()["post"]["id"]
        assert "<script" not in post.json()["post"]["body"]
        pub = requests.get(f"{API}/portfolios/{pid}/posts", timeout=30).json()
        assert pub["paid"] is True and pub["unlocked"] is False and pub["posts"][0]["locked"] is True and "body" not in pub["posts"][0]
        own = requests.get(f"{API}/portfolios/{pid}/posts", headers=an, timeout=30).json()
        assert own["unlocked"] is True and own["posts"][0]["locked"] is False and "INFY" in own["posts"][0]["body"]
        open_post = requests.post(f"{API}/analyst/portfolios/{pid}/posts", json={"title": "Hello", "body": "<p>public</p>", "subscribers_only": False}, headers=an, timeout=30).json()["post"]
        pub = requests.get(f"{API}/portfolios/{pid}/posts", timeout=30).json()
        assert next(p for p in pub["posts"] if p["id"] == open_post["id"])["locked"] is False
        adm = requests.get(f"{API}/admin/posts", params={"portfolio_id": pid}, headers=h, timeout=30).json()["posts"]
        assert len(adm) == 2 and adm[0]["portfolio_name"] == "Flow Basket"
        assert requests.delete(f"{API}/admin/posts/{post_id}", json={"reason": "off-topic"}, headers=h, timeout=30).status_code == 200
        assert len(requests.get(f"{API}/analyst/portfolios/{pid}/posts", headers=an, timeout=30).json()["posts"]) == 1

        # pause with reason -> off the site, partner sees the reason; resume brings it back
        assert requests.post(f"{API}/admin/portfolios/{pid}/pause", json={"reason": "x"}, headers=h, timeout=30).status_code == 422
        assert requests.post(f"{API}/admin/portfolios/{pid}/pause", json={"reason": "Compliance query on constituent weights"}, headers=h, timeout=30).status_code == 200
        assert requests.get(f"{API}/portfolios/{pid}", timeout=30).status_code == 404
        mine = next(p for p in requests.get(f"{API}/analyst/portfolios", headers=an, timeout=30).json()["portfolios"] if p["id"] == pid)
        assert mine["status"] == "paused" and "Compliance" in mine["review_note"]
        counts = requests.get(f"{API}/admin/portfolios", headers=h, timeout=30).json()["counts"]
        assert counts["paused"] >= 1
        assert requests.post(f"{API}/admin/portfolios/{pid}/resume", headers=h, timeout=30).status_code == 200
        assert requests.get(f"{API}/portfolios/{pid}", timeout=30).status_code == 200
        requests.post(f"{API}/admin/portfolios/{pid}/feature", json={"featured": False}, headers=h, timeout=30)
    finally:
        _cleanup(h, app_id, user_id, firm, pids)


def test_classification_endpoint():
    r = requests.get(f"{API}/instruments/classify", params={"symbols": "RELIANCE,NOPE_X"}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert set(d["symbols"]) == {"RELIANCE", "NOPE_X"} and d["symbols"]["NOPE_X"]["cap"] == "Other"
    if d["loaded"]:
        assert d["symbols"]["RELIANCE"]["cap"] == "Large" and d["symbols"]["RELIANCE"]["industry"]
    h = _admin()
    st = requests.get(f"{API}/admin/classification/status", headers=h, timeout=30).json()
    assert "loaded" in st and "symbols" in st
    # CSV upload path (server-side NSE fetch may be geo-blocked on the host)
    csv_text = "Company Name,Industry,Symbol,Series,ISIN Code\nTest Micro Ltd.,Chemicals,TESTMICROX,EQ,INE000000000\n"
    up = requests.post(f"{API}/admin/classification/upload", data={"kind": "microcap250"}, files={"file": ("m.csv", io.BytesIO(csv_text.encode()), "text/csv")}, headers=h, timeout=30)
    assert up.status_code == 200 and up.json()["rows"] == 1, up.text
    c = requests.get(f"{API}/instruments/classify", params={"symbols": "TESTMICROX"}, timeout=30).json()["symbols"]["TESTMICROX"]
    assert c["cap"] == "Micro" and c["industry"] == "Chemicals"

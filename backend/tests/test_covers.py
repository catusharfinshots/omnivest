"""Listing covers: auto theme pick from name/pitch/tags, partner theme choice survives edits,
upload (validated, served, removable), admin reset, and public docs always carry a cover."""
import io
import os
import sys
import uuid

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import covers  # noqa: E402
import _listing  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "admin@omnivest.in", "password": "Admin@123"}
CONS = [{"symbol": "RELIANCE", "name": "Reliance", "exchange": "NSE", "type": "Stock", "weight": 50},
        {"symbol": "INFY", "name": "Infosys", "exchange": "NSE", "type": "Stock", "weight": 50}]
# 1x1 PNG
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000401bc0c0c0e0000000049454e44ae426082") + b"\x00" * 120


def test_theme_picker_pure():
    assert covers.pick_theme("India Water Crisis", "Companies solving water problem") == "water"
    assert covers.pick_theme("EV & Battery Leaders", "") == "ev"
    assert covers.pick_theme("Steady Payers", "High dividend yield large caps") == "dividend"
    assert covers.pick_theme("Random Name", "", ["Quality"], "thematic") == "quality"
    assert covers.pick_theme("Random Name", "", [], "asset-allocation") == "multiasset"
    assert covers.pick_theme("Random Name", "", [], "thematic") == "default"
    assert covers.pick_palette("abc") in covers.PALETTES and covers.pick_palette("abc") == covers.pick_palette("abc")
    d = covers.normalise_cover({"name": "Green Energy Theme", "subtitle": "renewables"})
    assert d["cover"]["kind"] == "auto" and d["cover"]["theme"] == "green"
    kept = covers.normalise_cover({"name": "Green Energy Theme", "cover": {"kind": "theme", "theme": "solar", "palette": "amber"}})
    assert kept["cover"] == {"kind": "theme", "theme": "solar", "palette": "amber"}


def _admin():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30); r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _analyst(h):
    n = uuid.uuid4().hex[:8]; firm = f"Perffirm {n}"; phone = f"+9195{uuid.uuid4().int % 10**8:08d}"
    payload = {"name": f"Cover Analyst {n}", "phone": phone, "email": f"cover_{n}@test.com", "registered_name": f"Cover Research {n}", "firm": firm,
               "sebi_reg": "INH000066666", "sebi_reg_date": "2022-01-01", "raasb_no": "R-8", "nism_cert_no": "N-8", "nism_valid_till": "2030-01-01",
               "pan": "ABCDE6666F", "registered_address": "8 Perf Street, Mumbai 400001", "applicant_type": "Individual",
               "principal_officer": None, "compliance_officer": None, "disciplinary_history": False, "disciplinary_details": "",
               "raasb_deposit_confirmed": True, "other_registrations": "", "model_portfolio_compliance": True,
               "website": "", "linkedin": "", "experience_years": "5", "specializations": "", "note": "cover", "accepted_terms": True}
    app = requests.post(f"{API}/partners/apply", json=payload, timeout=30).json()["application"]
    requests.post(f"{API}/admin/partners/{app['id']}/review", json={"action": "approve", "note": ""}, headers=h, timeout=30).raise_for_status()
    v = requests.post(f"{API}/auth/phone/verify-otp", json={"phone": phone, "code": "123456", "flow": "partner"}, timeout=30).json()
    return app["id"], v["user"]["id"], {"Authorization": f"Bearer {v['token']}"}, firm


def test_cover_lifecycle():
    h = _admin()
    app_id, user_id, an, firm = _analyst(h)
    pid = None
    try:
        th = requests.get(f"{API}/covers/themes", timeout=30).json()
        assert any(t["id"] == "water" and t["icon"] == "Droplets" for t in th["themes"]) and "violet" in th["palettes"]
        sg = requests.get(f"{API}/covers/suggest", params={"name": "India Water Crisis", "subtitle": "Companies solving water problem", "tags": "Growth"}, timeout=30).json()
        assert sg["auto"] == "water" and sg["suggested"][0] == "water"

        # auto cover on create, follows the name on edit
        r = requests.post(f"{API}/analyst/portfolios", json=_listing.complete_payload("India Water Crisis", CONS, subtitle="Companies solving water problem"), headers=an, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()["portfolio"]; pid = p["id"]
        assert p["cover"]["kind"] == "auto" and p["cover"]["theme"] == "water"
        mine = next(x for x in requests.get(f"{API}/analyst/portfolios", headers=an, timeout=30).json()["portfolios"] if x["id"] == pid)
        assert mine["cover"]["icon"] == "Droplets" and mine["cover"]["palette"] in covers.PALETTES
        r = requests.put(f"{API}/analyst/portfolios/{pid}", json=_listing.complete_payload("Green Energy Leaders", CONS, subtitle="Renewables"), headers=an, timeout=30)
        assert r.json()["portfolio"]["cover"]["theme"] == "green"

        # explicit theme + palette sticks across edits
        r = requests.put(f"{API}/analyst/portfolios/{pid}", json={**_listing.complete_payload("Green Energy Leaders", CONS), "cover": {"kind": "theme", "theme": "solar", "palette": "amber"}}, headers=an, timeout=30)
        assert r.json()["portfolio"]["cover"] == {"kind": "theme", "theme": "solar", "palette": "amber"}
        r = requests.put(f"{API}/analyst/portfolios/{pid}", json=_listing.complete_payload("Something Else Entirely", CONS), headers=an, timeout=30)
        assert r.json()["portfolio"]["cover"]["theme"] == "solar"

        # upload: wrong type / too big rejected; good one stored, served, shown on public doc after approval
        bad = requests.post(f"{API}/analyst/portfolios/{pid}/cover", files={"file": ("x.txt", io.BytesIO(b"hello world" * 20), "text/plain")}, headers=an, timeout=30)
        assert bad.status_code == 422
        big = requests.post(f"{API}/analyst/portfolios/{pid}/cover", files={"file": ("big.png", io.BytesIO(b"\x89PNG" + b"\x00" * (2 * 1024 * 1024 + 1)), "image/png")}, headers=an, timeout=60)
        assert big.status_code == 413
        up = requests.post(f"{API}/analyst/portfolios/{pid}/cover", files={"file": ("c.png", io.BytesIO(PNG), "image/png")}, headers=an, timeout=30)
        assert up.status_code == 200, up.text
        assert up.json()["cover"]["kind"] == "upload" and up.json()["cover"]["url"].startswith(f"/api/portfolios/{pid}/cover")
        img = requests.get(f"{API}/portfolios/{pid}/cover", timeout=30)
        assert img.status_code == 200 and img.headers["content-type"] == "image/png" and img.content[:4] == b"\x89PNG"
        # an edit keeps the upload
        r = requests.put(f"{API}/analyst/portfolios/{pid}", json=_listing.complete_payload("Something Else Entirely", CONS), headers=an, timeout=30)
        assert r.json()["portfolio"]["cover"]["kind"] == "upload"
        # submit + approve -> public list/detail carry the cover
        io_pdf = io.BytesIO(_listing.TINY_PDF)
        requests.post(f"{API}/analyst/portfolios/{pid}/factsheet", files={"file": ("f.pdf", io_pdf, "application/pdf")}, headers=an, timeout=30)
        assert requests.post(f"{API}/analyst/portfolios/{pid}/submit", headers=an, timeout=30).status_code == 200
        requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30).raise_for_status()
        pub = requests.get(f"{API}/portfolios/{pid}", timeout=30).json()["portfolio"]
        assert pub["cover"]["kind"] == "upload" and "url" in pub["cover"]
        lst = next(x for x in requests.get(f"{API}/portfolios", timeout=30).json()["portfolios"] if x["id"] == pid)
        assert lst["cover"]["kind"] == "upload"
        # admin reset -> back to generated theme, image gone
        rs = requests.post(f"{API}/admin/portfolios/{pid}/cover/reset", headers=h, timeout=30)
        assert rs.status_code == 200 and rs.json()["cover"]["kind"] == "auto"
        assert requests.get(f"{API}/portfolios/{pid}/cover", timeout=30).status_code == 404
        # partner remove (no upload now) -> still a valid cover
        rm = requests.delete(f"{API}/analyst/portfolios/{pid}/cover", headers=an, timeout=30)
        assert rm.status_code == 200 and rm.json()["cover"]["theme"] in {t["id"] for t in th["themes"]}
    finally:
        if pid:
            requests.delete(f"{API}/admin/db/portfolio_performance/{pid}", headers=h, timeout=30)
            requests.delete(f"{API}/admin/db/analyst_portfolios/{pid}", headers=h, timeout=30)
            for c in requests.get(f"{API}/admin/db/listing_covers", params={"limit": 100}, headers=h, timeout=30).json().get("documents", []):
                if c.get("portfolio_id") == pid:
                    requests.delete(f"{API}/admin/db/listing_covers/{c['id']}", headers=h, timeout=30)
            for a in requests.get(f"{API}/admin/db/audit_log", params={"limit": 100}, headers=h, timeout=30).json().get("documents", []):
                if a.get("portfolio_id") == pid:
                    requests.delete(f"{API}/admin/db/audit_log/{a['id']}", headers=h, timeout=30)
        requests.delete(f"{API}/admin/db/partner_applications/{app_id}", headers=h, timeout=30)
        requests.delete(f"{API}/admin/db/users/{user_id}", headers=h, timeout=30)
        for m in requests.get(f"{API}/admin/db/managers", params={"q": firm}, headers=h, timeout=30).json().get("documents", []):
            requests.delete(f"{API}/admin/db/managers/{m['id']}", headers=h, timeout=30)

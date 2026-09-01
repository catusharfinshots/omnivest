"""SEBI-grade partner onboarding: extended fields, conditional validation,
and compliance-document upload/download. Runs against a live backend
(default local dev server)."""
import os
import uuid

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "admin@omnivest.in", "password": "Admin@123"}

FAKE_PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF"


def _payload(**over):
    n = uuid.uuid4().hex[:8]
    base = {
        "name": f"Test Analyst {n}",
        "phone": f"+9198{uuid.uuid4().int % 10**8:08d}",
        "email": f"analyst_{n}@test.com",
        "registered_name": f"Test Research Services {n}",
        "firm": "10 yrs, Test Capital",
        "sebi_reg": "INH000099999",
        "sebi_reg_date": "2022-04-01",
        "raasb_no": "RAASB-12345",
        "nism_cert_no": "NISM-XV-999999",
        "nism_valid_till": "2030-01-01",
        "pan": "ABCDE1234F",
        "registered_address": "12, Test Street, Mumbai, Maharashtra 400001",
        "applicant_type": "Individual",
        "principal_officer": None,
        "compliance_officer": None,
        "disciplinary_history": False,
        "disciplinary_details": "",
        "raasb_deposit_confirmed": True,
        "other_registrations": "",
        "model_portfolio_compliance": True,
        "website": "https://test.example",
        "linkedin": "",
        "experience_years": "10",
        "specializations": "Midcaps",
        "note": "Momentum baskets for retail investors.",
        "accepted_terms": True,
    }
    base.update(over)
    return base


def _admin_headers():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _cleanup(app_id, headers):
    requests.delete(f"{API}/admin/db/partner_applications/{app_id}", headers=headers, timeout=30)


def test_llp_requires_officers():
    r = requests.post(f"{API}/partners/apply", json=_payload(applicant_type="LLP"), timeout=30)
    assert r.status_code == 400
    assert "Officer" in r.json()["detail"]


def test_deposit_declaration_required():
    r = requests.post(f"{API}/partners/apply", json=_payload(raasb_deposit_confirmed=False), timeout=30)
    assert r.status_code == 400
    assert "RAASB" in r.json()["detail"]


def test_disciplinary_yes_needs_details():
    r = requests.post(f"{API}/partners/apply", json=_payload(disciplinary_history=True), timeout=30)
    assert r.status_code == 400


def test_bad_pan_rejected():
    r = requests.post(f"{API}/partners/apply", json=_payload(pan="NOTAPAN123"), timeout=30)
    assert r.status_code == 422


def test_full_flow_individual_with_documents():
    headers = _admin_headers()
    r = requests.post(f"{API}/partners/apply", json=_payload(), timeout=30)
    assert r.status_code == 200, r.text
    app = r.json()["application"]
    app_id = app["id"]
    try:
        assert app["raasb_no"] == "RAASB-12345"
        assert app["nism_valid_till"] == "2030-01-01"
        assert app["pan"] == "ABCDE1234F"
        assert app["raasb_deposit_confirmed"] is True

        # upload all three documents; re-upload replaces, bad kind rejected
        for kind in ("sebi_cert", "nism_cert", "pan_card"):
            up = requests.post(
                f"{API}/partners/apply/{app_id}/document", params={"kind": kind},
                files={"file": (f"{kind}.pdf", FAKE_PDF, "application/pdf")}, timeout=30)
            assert up.status_code == 200, up.text
        bad = requests.post(
            f"{API}/partners/apply/{app_id}/document", params={"kind": "aadhaar"},
            files={"file": ("x.pdf", FAKE_PDF, "application/pdf")}, timeout=30)
        assert bad.status_code == 422
        badtype = requests.post(
            f"{API}/partners/apply/{app_id}/document", params={"kind": "pan_card"},
            files={"file": ("x.exe", b"MZ", "application/octet-stream")}, timeout=30)
        assert badtype.status_code == 422

        # admin sees the application with new fields + documents
        lst = requests.get(f"{API}/admin/partners", headers=headers, timeout=30)
        mine = next(a for a in lst.json()["applications"] if a["id"] == app_id)
        assert mine["registered_name"].startswith("Test Research Services")

        docs = requests.get(f"{API}/admin/partners/{app_id}/documents", headers=headers, timeout=30).json()["documents"]
        assert sorted(d["kind"] for d in docs) == ["nism_cert", "pan_card", "sebi_cert"]
        one = docs[0]
        dl = requests.get(f"{API}/admin/partners/{app_id}/documents/{one['id']}", headers=headers, timeout=30)
        assert dl.status_code == 200 and dl.content == FAKE_PDF

        # docs are admin-only
        noauth = requests.get(f"{API}/admin/partners/{app_id}/documents", timeout=30)
        assert noauth.status_code in (401, 403)
    finally:
        _cleanup(app_id, headers)


def test_llp_full_flow_with_officers():
    headers = _admin_headers()
    officer = {"name": "PO Person", "email": "po@test.com", "phone": "+919812345678"}
    r = requests.post(f"{API}/partners/apply", json=_payload(
        applicant_type="LLP", principal_officer=officer,
        compliance_officer={**officer, "name": "CO Person", "email": "co@test.com"}), timeout=30)
    assert r.status_code == 200, r.text
    app = r.json()["application"]
    try:
        assert app["principal_officer"]["name"] == "PO Person"
        assert app["compliance_officer"]["email"] == "co@test.com"
    finally:
        _cleanup(app["id"], headers)

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
    for d in requests.get(f"{API}/admin/partners/{app_id}/documents", headers=headers, timeout=30).json().get("documents", []):
        requests.delete(f"{API}/admin/db/partner_documents/{d['id']}", headers=headers, timeout=30)
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
        import re as _re
        assert _re.match(r"^OMN-RA-\d{4}-\d{4}$", app["ref_no"]), app["ref_no"]
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


def test_reject_requires_reason_and_status_tracking():
    headers = _admin_headers()
    p = _payload()
    r = requests.post(f"{API}/partners/apply", json=p, timeout=30)
    assert r.status_code == 200, r.text
    app = r.json()["application"]
    try:
        # tracking while pending (both keys must match)
        st = requests.post(f"{API}/partners/status", json={"ref_no": app["ref_no"], "phone": p["phone"]}, timeout=30)
        assert st.status_code == 200 and st.json()["status"] == "pending"
        wrong = requests.post(f"{API}/partners/status", json={"ref_no": app["ref_no"], "phone": "+919800000000"}, timeout=30)
        assert wrong.status_code == 404

        # reject without a note is refused
        bad = requests.post(f"{API}/admin/partners/{app['id']}/review", json={"action": "reject", "note": ""}, headers=headers, timeout=30)
        assert bad.status_code == 400

        # reject with a note; applicant sees it via tracking
        ok = requests.post(f"{API}/admin/partners/{app['id']}/review",
                           json={"action": "reject", "note": "NISM certificate expired — please renew and re-apply."},
                           headers=headers, timeout=30)
        assert ok.status_code == 200
        st2 = requests.post(f"{API}/partners/status", json={"ref_no": app["ref_no"], "phone": p["phone"]}, timeout=30).json()
        assert st2["status"] == "rejected"
        assert "NISM" in st2["review_note"]
    finally:
        _cleanup(app["id"], headers)


def test_hard_wall_between_customer_and_partner_funnels():
    """A number lives on exactly one side. Applicants/analysts are refused on
    the customer login; customer numbers are refused on the partner login and
    the application form; the partner login never creates accounts."""
    headers = _admin_headers()
    firm_marker = f"Wallfirm {uuid.uuid4().hex[:6]}"
    p = _payload(firm=firm_marker)
    app = requests.post(f"{API}/partners/apply", json=p, timeout=30).json()["application"]
    analyst_user_id = investor_user_id = None
    try:
        # pending applicant blocked on customer side (request AND verify)
        r = requests.post(f"{API}/auth/phone/request-otp", json={"phone": p["phone"], "flow": "customer"}, timeout=30)
        assert r.status_code == 409 and "under review" in r.json()["detail"]
        r = requests.post(f"{API}/auth/phone/verify-otp", json={"phone": p["phone"], "code": "123456", "flow": "customer"}, timeout=30)
        assert r.status_code == 409
        # pending applicant can't log in on the partner side either (no silent account)
        r = requests.post(f"{API}/auth/phone/request-otp", json={"phone": p["phone"], "flow": "partner"}, timeout=30)
        assert r.status_code == 409 and "under review" in r.json()["detail"]

        # approve -> analyst account; partner login works, customer login refused
        ok = requests.post(f"{API}/admin/partners/{app['id']}/review", json={"action": "approve", "note": ""}, headers=headers, timeout=30)
        assert ok.status_code == 200
        v = requests.post(f"{API}/auth/phone/verify-otp", json={"phone": p["phone"], "code": "123456", "flow": "partner"}, timeout=30)
        assert v.status_code == 200 and v.json()["user"]["role"] == "analyst"
        analyst_user_id = v.json()["user"]["id"]
        r = requests.post(f"{API}/auth/phone/request-otp", json={"phone": p["phone"], "flow": "customer"}, timeout=30)
        assert r.status_code == 409 and "partner account" in r.json()["detail"]

        # a customer number: created on customer side, refused on partner side + application form
        cust_phone = f"+9197{uuid.uuid4().int % 10**8:08d}"
        cv = requests.post(f"{API}/auth/phone/verify-otp", json={"phone": cust_phone, "code": "123456", "flow": "customer"}, timeout=30)
        assert cv.status_code == 200 and cv.json()["user"]["role"] == "investor"
        investor_user_id = cv.json()["user"]["id"]
        r = requests.post(f"{API}/auth/phone/request-otp", json={"phone": cust_phone, "flow": "partner"}, timeout=30)
        assert r.status_code == 409 and "customer account" in r.json()["detail"]
        r = requests.post(f"{API}/partners/apply", json=_payload(phone=cust_phone), timeout=30)
        assert r.status_code == 409 and "customer account" in r.json()["detail"]

        # unknown number on the partner side: no account creation, clear guidance
        r = requests.post(f"{API}/auth/phone/request-otp", json={"phone": "+919600000001", "flow": "partner"}, timeout=30)
        assert r.status_code == 404 and "Apply below" in r.json()["detail"]
    finally:
        _cleanup(app["id"], headers)
        for uid in (analyst_user_id, investor_user_id):
            if uid:
                requests.delete(f"{API}/admin/db/users/{uid}", headers=headers, timeout=30)
        for m in requests.get(f"{API}/admin/db/managers", params={"q": firm_marker}, headers=headers, timeout=30).json().get("documents", []):
            requests.delete(f"{API}/admin/db/managers/{m['id']}", headers=headers, timeout=30)


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

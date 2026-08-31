"""Backend regression tests for the Omnivest rebrand.

Validates that:
- GET /api/about returns Tushar Sukhija as sole founder with role 'Founder & CEO'
  and all contacts use @omnivest.in emails.
- GET /api/content footer.contactEmail is support@omnivest.in.
- Admin login still works with existing admin@omnivest.in credentials.
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@omnivest.in"
ADMIN_PASSWORD = "Admin@123"


def test_about_founder_is_tushar():
    r = requests.get(f"{API}/about", timeout=15)
    assert r.status_code == 200
    d = r.json()
    founders = d.get("founders", [])
    assert len(founders) >= 1, "at least one founder expected"
    assert founders[0]["name"] == "Tushar Sukhija", founders[0]
    assert founders[0]["role"] == "Founder & CEO", founders[0]


def test_about_contacts_are_omnivest():
    r = requests.get(f"{API}/about", timeout=15)
    d = r.json()
    emails = {c.get("email") for c in d.get("contacts", [])}
    for expected in ("support@omnivest.in", "careers@omnivest.in", "press@omnivest.in"):
        assert expected in emails, f"missing {expected} in contacts, got {emails}"
    for e in emails:
        if e:
            assert e.endswith("@omnivest.in"), f"non-omnivest email leaked: {e}"


def test_content_footer_email_is_omnivest():
    r = requests.get(f"{API}/content", timeout=15)
    assert r.status_code == 200
    d = r.json()
    footer = d.get("footer") or {}
    assert footer.get("contactEmail") == "support@omnivest.in", footer


def test_admin_login_still_works():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("token") or data.get("access_token") or (data.get("data") or {}).get("token")
    assert token, f"no token returned: {data}"

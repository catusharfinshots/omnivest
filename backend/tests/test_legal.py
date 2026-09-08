"""Legal pages (Terms / Privacy / Refunds + Contact details), added 9 Sep 2026 for Razorpay live activation.

Company facts live once in platformDetails and are merged into every document through {{tokens}}; conditional
{{#key}}…{{/key}} blocks appear only when the detail is filled; admin overrides replace the built-in text; the
public API never leaks an unfilled placeholder; and the checkout terms carry the same facts."""
import os
import sys
import requests

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from test_listing_v2 import API, _admin  # noqa: E402


def _content(h):
    return requests.get(f"{API}/content", headers=h, timeout=30).json()


def test_index_and_documents_render_without_placeholders():
    idx = requests.get(f"{API}/legal", timeout=30).json()
    assert [p["slug"] for p in idx["pages"]] == ["terms", "privacy", "refunds"]
    assert idx["details"]["brand"] == "Omnivest" and idx["details"]["supportEmail"] and idx["details"]["grievanceEmail"]
    assert "scores.sebi.gov.in" in idx["grievance_html"] and "{{" not in idx["grievance_html"]
    for slug in ("terms", "privacy", "refunds"):
        d = requests.get(f"{API}/legal/{slug}", timeout=30).json()
        assert d["title"] and d["updated"] and len(d["toc"]) >= 5, slug
        assert "{{" not in d["html"] and "}}" not in d["html"], f"{slug} leaked a placeholder"
        assert d["details"]["legalName"] in d["html"]
        assert 'class="mitc"' in d["html"]                       # plain-language summary on top, smallcase-style MITC
    assert requests.get(f"{API}/legal/nope", timeout=30).status_code == 404
    t = requests.get(f"{API}/legal/terms", timeout=30).json()["html"]
    assert "not refundable" in t and "SEBI" in t and "smartodr.in" in t and 'href="/refunds"' in t
    r = requests.get(f"{API}/legal/refunds", timeout=30).json()["html"]
    assert "not refundable" in r and "Duplicate charge" in r


def test_platform_details_flow_into_every_page_and_checkout_block():
    h = _admin()
    before = _content(h)
    orig = before.get("platformDetails") or {}
    try:
        pd = {**orig, "registeredAddress": "12 Test Lane, Gurugram, Haryana 122001", "supportPhone": "+91 99999 00000", "supportHours": "Mon–Fri 10–6 IST"}
        requests.put(f"{API}/content", json={"platformDetails": pd}, headers=h, timeout=30).raise_for_status()
        idx = requests.get(f"{API}/legal", timeout=30).json()
        assert "registeredAddress" not in idx["missing"]
        for slug in ("terms", "privacy"):
            html = requests.get(f"{API}/legal/{slug}", timeout=30).json()["html"]
            assert "12 Test Lane" in html and "+91 99999 00000" in html, slug
        # conditional blocks disappear again when the detail is cleared
        requests.put(f"{API}/content", json={"platformDetails": {**pd, "registeredAddress": "", "supportPhone": ""}}, headers=h, timeout=30).raise_for_status()
        html = requests.get(f"{API}/legal/privacy", timeout=30).json()["html"]
        assert "12 Test Lane" not in html and "Postal:" not in html and "{{" not in html
        assert "registeredAddress" in requests.get(f"{API}/legal", timeout=30).json()["missing"]
    finally:
        requests.put(f"{API}/content", json={"platformDetails": orig}, headers=h, timeout=30)


def test_admin_override_replaces_builtin_text_and_fills_tokens():
    h = _admin()
    before = _content(h)
    try:
        custom = '<h2 id="own">Our own terms</h2><p>Write to {{supportEmail}}.</p>'
        requests.put(f"{API}/content", json={"legalTerms": custom, "legalUpdated": "2026-10-01"}, headers=h, timeout=30).raise_for_status()
        d = requests.get(f"{API}/legal/terms", timeout=30).json()
        assert d["custom"] is True and d["updated"] == "2026-10-01" and d["toc"] == [{"id": "own", "title": "Our own terms"}]
        assert "Write to support@omnivest.in." in d["html"] or "Write to " in d["html"] and "{{" not in d["html"]
        # other documents untouched
        assert requests.get(f"{API}/legal/privacy", timeout=30).json()["custom"] is False
        # anonymous cannot edit
        assert requests.put(f"{API}/content", json={"legalTerms": "x"}, timeout=30).status_code in (401, 403)
        # empty override = back to built-in
        requests.put(f"{API}/content", json={"legalTerms": ""}, headers=h, timeout=30).raise_for_status()
        d = requests.get(f"{API}/legal/terms", timeout=30).json()
        assert d["custom"] is False and len(d["toc"]) >= 10
    finally:
        requests.put(f"{API}/content", json={"legalTerms": before.get("legalTerms") or "", "legalUpdated": before.get("legalUpdated") or ""}, headers=h, timeout=30)


def test_contact_lead_requires_message():
    h = _admin()
    bad = requests.post(f"{API}/leads", json={"type": "contact", "email": "legal_test@test.com"}, timeout=30)
    assert bad.status_code == 422
    ok = requests.post(f"{API}/leads", json={"type": "contact", "email": "legal_test@test.com", "name": "Legal Test", "message": "Testing the contact form"}, timeout=30)
    assert ok.status_code == 200, ok.text
    lead = ok.json()["lead"]
    assert lead["type"] == "contact" and lead["message"] == "Testing the contact form"
    requests.delete(f"{API}/admin/db/leads/{lead['id']}", headers=h, timeout=30)

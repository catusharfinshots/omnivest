"""Structured methodology: admin-defined sections, partner fills them, investors get them in order with a
"last reviewed" date; required sections gate submission; legacy free text still works."""
import os
import sys
import requests

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import _listing  # noqa: E402
from test_listing_v2 import API, CONS, _admin, _analyst, _cleanup  # noqa: E402


def test_sections_are_defined_saved_rendered_and_gated():
    h = _admin()
    rules = requests.get(f"{API}/listing-rules", timeout=30).json()
    keys = [s["key"] for s in rules["methodology_sections"]]
    assert keys[:2] == ["universe", "research"] and all(s["title"] and s["icon"] for s in rules["methodology_sections"])
    app_id, user_id, a, firm = _analyst(h)
    pid = None
    try:
        # a listing with sections instead of free text
        secs = [{"key": "universe", "title": "Defining the universe", "body": "<p>NSE-listed, market cap above ₹1,000 cr.</p>"},
                {"key": "research", "title": "Research", "body": "<p>Reports, concalls, <script>alert(1)</script>channel checks.</p>"},
                {"key": "rebalance", "title": "Rebalance", "body": "<p>Quarterly.</p>"},
                {"key": "custom1", "title": "Exit rules", "body": "<p>Sold on a governance issue.</p>"}]
        payload = _listing.complete_payload("Method Basket", CONS, methodology="", methodologySections=secs)
        r = requests.post(f"{API}/analyst/portfolios", json=payload, headers=a, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()["portfolio"]; pid = p["id"]
        assert [s["key"] for s in p["methodologySections"]] == ["universe", "research", "rebalance", "custom1"]
        assert "<script>" not in p["methodologySections"][1]["body"] and "channel checks" in p["methodologySections"][1]["body"]
        assert "<h4>Defining the universe</h4>" in p["methodology"]      # legacy rendering kept for old clients
        assert p.get("methodology_updated_at")
        first_stamp = p["methodology_updated_at"]

        # the required sections gate submission
        bad = _listing.complete_payload("Method Basket", CONS, methodology="", methodologySections=[secs[0]])
        requests.put(f"{API}/analyst/portfolios/{pid}", json=bad, headers=a, timeout=30).raise_for_status()
        rd = requests.get(f"{API}/analyst/portfolios/{pid}/readiness", headers=a, timeout=30).json()
        assert any("Research" in m for m in rd["missing"])
        # unchanged text does not bump the reviewed date; changed text does
        requests.put(f"{API}/analyst/portfolios/{pid}", json=payload, headers=a, timeout=30).raise_for_status()
        p2 = requests.get(f"{API}/analyst/portfolios", headers=a, timeout=30).json()["portfolios"]
        p2 = [x for x in p2 if x["id"] == pid][0]
        assert p2["methodology_updated_at"] >= first_stamp
        secs2 = [dict(secs[0], body="<p>NSE-listed, market cap above ₹2,000 cr.</p>")] + secs[1:]
        requests.put(f"{API}/analyst/portfolios/{pid}", json=_listing.complete_payload("Method Basket", CONS, methodology="", methodologySections=secs2), headers=a, timeout=30).raise_for_status()
        p3 = [x for x in requests.get(f"{API}/analyst/portfolios", headers=a, timeout=30).json()["portfolios"] if x["id"] == pid][0]
        assert p3["methodology_updated_at"] > p2["methodology_updated_at"]

        # submit + approve -> investors get the sections in order, with the reviewed date
        import io
        requests.post(f"{API}/analyst/portfolios/{pid}/factsheet", files={"file": ("f.pdf", io.BytesIO(_listing.TINY_PDF), "application/pdf")}, headers=a, timeout=30).raise_for_status()
        s = requests.post(f"{API}/analyst/portfolios/{pid}/submit", headers=a, timeout=30)
        assert s.status_code == 200, s.text
        requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30).raise_for_status()
        pub = requests.get(f"{API}/portfolios/{pid}", timeout=30).json()["portfolio"]
        assert [x["key"] for x in pub["methodologySections"]] == ["universe", "research", "rebalance", "custom1"] and pub["methodology_updated_at"]
        # legacy free text still passes the gate
        legacy = _listing.complete_payload("Method Basket", CONS, methodology="<p>Rules-based, quarterly.</p>", methodologySections=[])
        requests.put(f"{API}/analyst/portfolios/{pid}", json=legacy, headers=a, timeout=30).raise_for_status()
        rd = requests.get(f"{API}/analyst/portfolios/{pid}/readiness", headers=a, timeout=30).json()
        assert not any("Methodology" in m for m in rd["missing"])
    finally:
        _cleanup(h, app_id, user_id, firm, [pid] if pid else [])


def test_admin_can_edit_the_section_set():
    h = _admin()
    orig = requests.get(f"{API}/listing-rules", timeout=30).json()["methodology_sections"]
    try:
        custom = orig[:2] + [{"key": "exit", "title": "Exit rules", "icon": "shield", "required": False, "helper": "When you sell", "example": ""}]
        r = requests.put(f"{API}/admin/listing-rules", json={"methodology_sections": custom}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        got = requests.get(f"{API}/listing-rules", timeout=30).json()["methodology_sections"]
        assert [s["key"] for s in got] == ["universe", "research", "exit"] and got[2]["helper"] == "When you sell"
    finally:
        requests.put(f"{API}/admin/listing-rules", json={"methodology_sections": orig}, headers=h, timeout=30).raise_for_status()

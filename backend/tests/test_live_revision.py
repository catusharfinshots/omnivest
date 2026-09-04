"""A live listing never goes dark when its partner edits it.

Edits to an approved listing are held as a revision: investors keep seeing the approved
version, the partner submits the revision, and only an admin approval applies it
(recording a rebalance version when weights change). Request-changes and reject leave
the live listing untouched. Unpublished revisions never leak through public endpoints.
"""
import os
import sys
import requests

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import _listing  # noqa: E402
from test_listing_v2 import API, CONS, _admin, _analyst, _cleanup  # noqa: E402


def _public(pid, **kw):
    return requests.get(f"{API}/portfolios/{pid}", timeout=30, **kw)


def test_editing_a_live_listing_keeps_it_live_until_admin_approves():
    h = _admin()
    app_id, user_id, a, firm = _analyst(h)
    pid = None
    try:
        pid = _listing.create_submitted_listing(API, a, "Live Basket", CONS)
        assert requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30).status_code == 200
        assert _public(pid).status_code == 200 and _public(pid).json()["portfolio"]["name"] == "Live Basket"

        # partner edits: new name + a weight change
        new_cons = [dict(CONS[0], weight=40), dict(CONS[1], weight=30), {"symbol": "TCS", "name": "TCS", "exchange": "NSE", "type": "Stock", "weight": 30}]
        payload = _listing.complete_payload("Live Basket v2", new_cons, subtitle="Sharper pitch")
        r = requests.put(f"{API}/analyst/portfolios/{pid}", json=payload, headers=a, timeout=30)
        assert r.status_code == 200, r.text
        wc = r.json()["portfolio"]
        assert wc["status"] == "approved" and wc["has_revision"] and wc["revision_status"] == "draft" and wc["name"] == "Live Basket v2"

        # investors still see the approved version; the unpublished changes never leak
        pub = _public(pid).json()["portfolio"]
        assert pub["name"] == "Live Basket" and "revision" not in pub and pub["constituents"][0]["weight"] == 50
        lst = requests.get(f"{API}/portfolios", timeout=30).json()["portfolios"]
        mine = [p for p in lst if p["id"] == pid][0]
        assert mine["name"] == "Live Basket" and "revision" not in mine
        # admin list: not awaiting approval yet (draft revision), but flagged
        adm = requests.get(f"{API}/admin/portfolios", params={"status": "pending"}, headers=h, timeout=30).json()
        assert pid not in [p["id"] for p in adm["portfolios"]]

        # partner submits the changes -> admin sees a pending revision with the proposal beside the live version
        r = requests.post(f"{API}/analyst/portfolios/{pid}/submit", headers=a, timeout=30)
        assert r.status_code == 200 and r.json()["revision_status"] == "pending", r.text
        adm = requests.get(f"{API}/admin/portfolios", params={"status": "pending"}, headers=h, timeout=30).json()
        row = [p for p in adm["portfolios"] if p["id"] == pid][0]
        assert row["revision_pending"] and row["name"] == "Live Basket" and row["proposed"]["name"] == "Live Basket v2"
        assert adm["counts"]["pending"] >= 1
        assert _public(pid).json()["portfolio"]["name"] == "Live Basket"      # still live, still old
        # admin can preview the proposal; the public cannot
        prev = _public(pid, params={"revision": 1}, headers=h).json()["portfolio"]
        assert prev["name"] == "Live Basket v2" and prev["preview"] and prev["preview_revision"]
        assert _public(pid, params={"revision": 1}).status_code == 404

        # request changes -> revision back to draft with a note; live untouched
        r = requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "request_changes", "note": "Please explain the weight shift."}, headers=h, timeout=30)
        assert r.status_code == 200 and r.json()["revision"] == "changes_requested", r.text
        mine = [p for p in requests.get(f"{API}/analyst/portfolios", headers=a, timeout=30).json()["portfolios"] if p["id"] == pid][0]
        assert mine["status"] == "approved" and mine["revision_status"] == "draft" and mine["revision_changes_requested"]
        assert "weight shift" in mine["revision_note"]
        assert _public(pid).json()["portfolio"]["name"] == "Live Basket"

        # resubmit and approve -> changes go live, a rebalance version is recorded, revision cleared
        assert requests.post(f"{API}/analyst/portfolios/{pid}/submit", headers=a, timeout=30).status_code == 200
        r = requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "approve"}, headers=h, timeout=30)
        assert r.status_code == 200 and r.json()["revision"] == "applied", r.text
        pub = _public(pid).json()["portfolio"]
        assert pub["name"] == "Live Basket v2" and pub["subtitle"] == "Sharper pitch" and pub["constituents"][0]["weight"] == 40
        assert len(pub.get("versions") or []) == 2
        mine = [p for p in requests.get(f"{API}/analyst/portfolios", headers=a, timeout=30).json()["portfolios"] if p["id"] == pid][0]
        assert mine["status"] == "approved" and not mine["has_revision"]

        # discard: an unsubmitted edit can be thrown away, live unchanged
        requests.put(f"{API}/analyst/portfolios/{pid}", json=_listing.complete_payload("Oops", new_cons), headers=a, timeout=30).raise_for_status()
        assert requests.delete(f"{API}/analyst/portfolios/{pid}/revision", headers=a, timeout=30).status_code == 200
        assert _public(pid).json()["portfolio"]["name"] == "Live Basket v2"
        assert requests.delete(f"{API}/analyst/portfolios/{pid}/revision", headers=a, timeout=30).status_code == 404

        # reject: proposal discarded with a note the partner can read; live unchanged
        requests.put(f"{API}/analyst/portfolios/{pid}", json=_listing.complete_payload("Rejected name", new_cons), headers=a, timeout=30).raise_for_status()
        requests.post(f"{API}/analyst/portfolios/{pid}/submit", headers=a, timeout=30).raise_for_status()
        r = requests.post(f"{API}/admin/portfolios/{pid}/review", json={"action": "reject", "note": "Not in line with the mandate."}, headers=h, timeout=30)
        assert r.status_code == 200 and r.json()["revision"] == "rejected"
        pub = _public(pid).json()["portfolio"]
        assert pub["name"] == "Live Basket v2" and pub["status"] == "approved"
        mine = [p for p in requests.get(f"{API}/analyst/portfolios", headers=a, timeout=30).json()["portfolios"] if p["id"] == pid][0]
        assert not mine["has_revision"] and "mandate" in mine["review_note"] and mine.get("revision_rejected_at")
    finally:
        _cleanup(h, app_id, user_id, firm, [pid] if pid else [])


def test_unpublished_listing_edits_still_return_to_draft():
    h = _admin()
    app_id, user_id, a, firm = _analyst(h)
    pid = None
    try:
        pid = _listing.create_submitted_listing(API, a, "Pending Basket", CONS)
        r = requests.put(f"{API}/analyst/portfolios/{pid}", json=_listing.complete_payload("Pending Basket 2", CONS), headers=a, timeout=30)
        assert r.status_code == 200 and r.json()["portfolio"]["status"] == "draft" and not r.json()["portfolio"]["has_revision"]
    finally:
        _cleanup(h, app_id, user_id, firm, [pid] if pid else [])

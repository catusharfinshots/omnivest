"""Investors can complete and edit their own profile (name, email); the login phone stays read-only."""
import os
import sys
import uuid
import requests

sys.path.insert(0, os.path.dirname(__file__))
from test_listing_v2 import API  # noqa: E402
from test_subscriptions import _investor  # noqa: E402


def test_investor_edits_name_and_email_and_cannot_take_a_used_email():
    uid, phone, h = _investor()
    r = requests.put(f"{API}/auth/me", json={"name": "  Tushar S  ", "email": f"t{uuid.uuid4().hex[:6]}@example.com"}, headers=h, timeout=30)
    assert r.status_code == 200 and r.json()["user"]["name"] == "Tushar S" and r.json()["user"]["phone"] == phone
    me = requests.get(f"{API}/auth/me", headers=h, timeout=30).json()["user"]
    assert me["name"] == "Tushar S" and me["email"].startswith("t")
    # someone else's email is refused
    _, _, h2 = _investor()
    r = requests.put(f"{API}/auth/me", json={"name": "Other", "email": me["email"]}, headers=h2, timeout=30)
    assert r.status_code == 409
    # a blank name is refused; clearing email is allowed
    assert requests.put(f"{API}/auth/me", json={"name": "   "}, headers=h, timeout=30).status_code == 422
    assert requests.put(f"{API}/auth/me", json={"name": "Tushar S", "email": None}, headers=h, timeout=30).json()["user"]["email"] is None
    # admin/phone/role cannot be changed through this door
    r = requests.put(f"{API}/auth/me", json={"name": "Tushar S", "role": "admin", "phone": "+911111111111"}, headers=h, timeout=30)
    assert r.status_code == 200 and r.json()["user"]["role"] == "investor" and r.json()["user"]["phone"] == phone

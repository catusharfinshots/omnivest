"""Referral codes, share copy and reward settings (pure)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import referrals as rf  # noqa: E402


def test_code_is_initials_plus_four_unambiguous_chars():
    assert rf.make_code("Tushar Sukhija", "7K2Q") == "TS7K2Q"
    assert rf.make_code("", "7K2Q") == "OM7K2Q"
    c = rf.make_code("Anita")
    assert len(c) == 5 and c[0] == "A" and all(ch in rf.ALPHABET for ch in c[1:])
    assert not set("0O1IL") & set(rf.ALPHABET)


def test_share_text_and_reward_defaults():
    t = rf.share_text("https://omnivest.in/r/TS7K2Q", "Tushar Sukhija")
    assert t.startswith("Tushar uses Omnivest") and t.endswith("/r/TS7K2Q")
    r = rf.reward_for({})
    assert r["enabled"] and r["referrer_amount"] == 100 and r["friend_amount"] == 100 and r["credit_months"] == 12
    assert rf.reward_for({"enabled": False, "referrer_amount": "250"})["referrer_amount"] == 250
    assert rf.qr_svg("https://omnivest.in/r/TS7K2Q").startswith("<svg")

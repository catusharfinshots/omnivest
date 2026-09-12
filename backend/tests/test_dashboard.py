"""Dashboard maths and copy (pure)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import dashboard as dbm  # noqa: E402

S = [{"d": "2026-09-01", "nav": 100.0}, {"d": "2026-09-05", "nav": 104.0}, {"d": "2026-09-10", "nav": 102.0}, {"d": "2026-09-11", "nav": 103.02}]


def test_moved_since_uses_last_close_on_or_before_the_view_day():
    assert dbm.nav_on_or_before(S, "2026-09-05") == 104.0
    assert dbm.nav_on_or_before(S, "2026-09-07") == 104.0          # weekend view -> Friday's close
    assert dbm.nav_on_or_before(S, "2026-08-30") is None            # viewed before launch -> nothing to compare
    assert dbm.moved_since(S, "2026-09-05") == -0.94               # 104 -> 103.02
    assert dbm.moved_since(S, "2026-08-30") is None and dbm.moved_since([], "2026-09-05") is None
    assert dbm.day_move(S) == 1.0 and dbm.day_move(S[:1]) is None


def test_weighted_and_fees():
    assert dbm.weighted([(1000, 1.0), (3000, -1.0)]) == -0.5
    assert dbm.weighted([(1000, None)]) is None
    f = dbm.fees_vs_returns(499, 317)
    assert f["covered_pct"] == 63.5 and f["gap"] == 182.0
    assert dbm.fees_vs_returns(0, 317)["covered_pct"] is None
    assert dbm.fees_vs_returns(499, 900)["gap"] == 0.0


def test_context_line_reads_like_a_person():
    m = {"open": False}
    assert dbm.context_line(m, -0.33, 0.1, 2, "Tue 15 Sep at 9:15 AM") == "Market is closed. NIFTY 50 fell 0.3% today; your portfolios moved +0.1%. Your 2 after-market orders execute on Tue 15 Sep at 9:15 AM."
    assert dbm.context_line({"open": True}, 0.0, None, 0, "") == "Market is open. NIFTY 50 was flat today."
    assert dbm.context_line(m, None, None, 1, "Mon") == "Market is closed. Your 1 after-market order executes on Mon."


def test_strip_html_excerpt():
    assert dbm.strip_html("<p>Hello <b>world</b></p>  <br>again", 12) == "Hello world…"
    assert dbm.strip_html(None) == ""

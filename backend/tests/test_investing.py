"""Invest flow maths and market-session rules (pure functions; Kite itself is not called in tests)."""
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import investing as inv  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
W = {"A": 40.0, "B": 35.0, "C": 25.0}
P = {"A": 1000.0, "B": 250.0, "C": 90.0}


def test_quantities_floor_to_whole_shares_and_keep_one_of_each():
    rows = {r["symbol"]: r for r in inv.quantities(W, P, 10000)}
    assert rows["A"]["qty"] == 4 and rows["B"]["qty"] == 14 and rows["C"]["qty"] == 27
    tiny = {r["symbol"]: r for r in inv.quantities(W, P, 100)}
    assert all(r["qty"] == 1 for r in tiny.values())          # never zero shares of a constituent
    assert abs(sum(r["weight_actual"] for r in rows.values()) - 100) < 0.05


def test_min_amount_buys_one_share_of_everything():
    m = inv.min_amount(W, P)
    assert m == 2500                                           # A at 40% needs ₹2,500 to afford one ₹1,000 share
    assert all(r["qty"] >= 1 for r in inv.quantities(W, P, m))


def test_limit_price_rounds_up_to_the_tick_with_buffer():
    assert inv.round_tick(100.01) == 100.05 and inv.round_tick(100.05) == 100.05 and inv.round_tick(100.04, up=False) == 100.0
    assert inv.limit_price(100.0, 0.5) == 100.5
    assert inv.limit_price(236.13, 0.5) == 237.35              # 237.31 -> next tick


def test_top_up_hint_only_when_weights_are_skewed():
    assert inv.top_up_hint(W, P, 200000) is None               # large amount: flooring barely matters
    h = inv.top_up_hint(W, P, 2500)                            # minimum: one share each is far from 40/35/25
    assert h and h["add_amount"] == 2500 and h["amount"] == 5000   # 2/7/13 shares -> 40.7/35.6/23.8


def _at(y, m, d, hh, mm):
    return datetime(y, m, d, hh, mm, tzinfo=IST)


def test_market_state_windows():
    # Fri 11 Sep 2026
    assert inv.market_state(_at(2026, 9, 11, 10, 0))["mode"] == "regular"
    assert inv.market_state(_at(2026, 9, 11, 15, 35))["mode"] == "blocked"      # 15:30–15:45
    amo = inv.market_state(_at(2026, 9, 11, 21, 0))
    assert amo["mode"] == "amo" and amo["next_open_ist"].startswith("2026-09-14T09:15")   # Monday
    assert inv.market_state(_at(2026, 9, 12, 11, 0))["mode"] == "amo"            # Saturday
    assert inv.market_state(_at(2026, 9, 14, 9, 0))["mode"] == "blocked"         # pre-open
    early = inv.market_state(_at(2026, 9, 14, 7, 0))
    assert early["mode"] == "amo" and early["next_open_ist"].startswith("2026-09-14T09:15")
    # an admin-listed holiday is skipped
    hol = inv.market_state(_at(2026, 9, 11, 21, 0), holidays=["2026-09-14"])
    assert hol["next_open_ist"].startswith("2026-09-15")


def test_counts():
    c = inv.counts_of([{"order_id": "1", "status": "COMPLETE"}, {"order_id": "2", "status": "OPEN"}, {"order_id": None, "status": "REJECTED"}, {"order_id": "4", "status": "CANCELLED"}])
    assert c == {"total": 4, "placed": 3, "complete": 1, "open": 1, "rejected": 2, "cancelled": 0}


def test_investor_cancel_is_a_choice_not_a_failure():
    # cancelled from Omnivest -> counted as 'cancelled' (no Repair); cancelled inside Kite -> 'rejected' (Repair offered)
    mine = {"order_id": "1", "status": "CANCELLED", "cancelled_by": "investor"}
    kite = {"order_id": "2", "status": "CANCELLED"}
    c = inv.counts_of([mine, kite])
    assert c["cancelled"] == 1 and c["rejected"] == 1 and c["open"] == 0
    assert inv.is_archived({"archived_at": "2026-09-12"}) and not inv.is_archived({})


def test_funds_check_pads_and_rounds():
    assert inv.funds_check(11212, 48210) == {"required": 11437, "available": 48210.0, "short": 0, "ok": True}
    fc = inv.funds_check(3845, -119)                              # smallcase's example: 3845 -> 3922 required, ₹-119 available
    assert fc["required"] == 3922 and fc["short"] == 4050 and fc["ok"] is False   # rounded up to ₹10 (smallcase showed 4,042)
    assert inv.funds_check(1000, None) is None                    # balance unknown -> no gate, warn only


def test_builtin_holiday_calendar_knows_ganesh_chaturthi_2026():
    import market_calendar as mc
    assert "2026-09-14" in mc.BUILTIN and "2026-10-02" in mc.BUILTIN
    # Friday night before the holiday -> next session is Tuesday 15 Sep
    st = inv.market_state(_at(2026, 9, 11, 21, 0), holidays=mc.BUILTIN)
    assert st["mode"] == "amo" and st["next_open_ist"].startswith("2026-09-15T09:15")
    assert mc._parse([{"tradingDate": "14-Sep-2026"}, {"tradingDate": "bad"}]) == ["2026-09-14"]


def test_iso_marks_naive_mongo_datetimes_as_utc():
    from datetime import datetime as _dt
    assert inv._iso(_dt(2026, 9, 11, 19, 24, 31)).endswith("+00:00")       # Mongo returns naive UTC; the browser must not read it as local
    assert inv._iso("2026-09-11") == "2026-09-11"

"""Notification rules (pure; nothing is written here)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import notifications as nf  # noqa: E402

B = {"id": "D55469D9FE", "kind": "invest", "portfolio_name": "India Water Crisis", "mode": "amo", "amount_adjusted": 24423.7, "counts": {"placed": 5, "total": 5}}
O = lambda sym, oid, st, qty=10, **kw: {"symbol": sym, "order_id": oid, "status": st, "qty": qty, "filled_qty": 0, **kw}  # noqa: E731


def test_kite_cancel_and_rejection_notify_once_per_order_and_investor_cancel_stays_quiet():
    before = [O("WABAG", "1", "AMO REQ RECEIVED"), O("EIEL", "2", "AMO REQ RECEIVED"), O("DENTA", "3", "AMO REQ RECEIVED")]
    after = [O("WABAG", "1", "CANCELLED AMO", cancelled_by="kite"), O("EIEL", "2", "REJECTED", message="Insufficient funds"), O("DENTA", "3", "CANCELLED", cancelled_by="investor")]
    ev = nf.order_events(before, after, B)
    assert [e["type"] for e in ev] == ["cancelled", "rejected"]
    assert ev[0]["title"] == "WABAG cancelled in Kite" and ev[0]["key"] == "order:1:cancelled" and ev[0]["link"] == "/investments"
    assert ev[1]["title"] == "EIEL rejected by Zerodha" and "Insufficient" in ev[1]["body"]
    assert nf.order_events(after, after, B) == []                       # nothing changed -> nothing said


def test_fills_notify_once_per_batch_never_per_order():
    before = [O("A", "1", "OPEN"), O("B", "2", "OPEN"), O("C", "3", "OPEN")]
    half = [O("A", "1", "COMPLETE", filled_qty=10), O("B", "2", "OPEN"), O("C", "3", "OPEN")]
    assert nf.order_events(before, half, B) == []                        # one stock filled: quiet
    done = [O("A", "1", "COMPLETE", filled_qty=10), O("B", "2", "COMPLETE", filled_qty=10), O("C", "3", "COMPLETE", filled_qty=10)]
    ev = nf.order_events(half, done, B)
    assert len(ev) == 1 and ev[0]["type"] == "filled" and ev[0]["title"] == "3 orders filled" and ev[0]["key"] == "batch:D55469D9FE:complete"
    assert nf.order_events(done, done, B) == []


def test_partial_fill_then_lapse_is_its_own_message():
    before = [O("EIEL", "4", "OPEN", qty=24, filled_qty=10)]
    after = [O("EIEL", "4", "CANCELLED", qty=24, filled_qty=10, cancelled_by="kite")]
    ev = nf.order_events(before, after, B)
    assert ev[0]["type"] == "partial" and ev[0]["title"] == "EIEL partly filled: 10 of 24" and "14" in ev[0]["body"]


def test_placed_and_incomplete_copy():
    p = nf.placed_event(B, "Tue 15 Sep at 9:15 AM")
    assert p["title"] == "5 after-market buy orders placed" and "₹24,424" in p["body"] and "Tue 15 Sep" in p["body"]
    assert nf.placed_event({**B, "counts": {"placed": 0, "total": 5}})["type"] == "failed"
    assert nf.placed_event({**B, "counts": {"placed": 3, "total": 5}, "mode": "regular"})["title"] == "3 of 5 buy orders placed"
    assert nf.placed_event({**B, "kind": "fix", "counts": {"placed": 2, "total": 2}})["title"] == "Fix: 2 after-market buy orders placed"
    assert nf.placed_event({**B, "kind": "exit", "counts": {"placed": 5, "total": 5}, "mode": "regular"})["title"] == "Exit: 5 sell orders placed"
    rows = [{"symbol": "WABAG", "missing_qty": 2}, {"symbol": "EIEL", "missing_qty": 0}, {"symbol": "DENTA", "missing_qty": 17}]
    inc = nf.incomplete_event("p1", "India Water Crisis", rows)
    assert inc["title"] == "India Water Crisis is incomplete" and inc["key"] == "pf:p1:incomplete:DENTA,WABAG" and "2 of 3" in inc["body"]
    assert nf.incomplete_event("p1", "X", [{"symbol": "A", "missing_qty": 0}]) is None

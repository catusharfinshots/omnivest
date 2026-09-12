"""Investments reconcile maths (pure functions; Zerodha is not called)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import investments as ivm  # noqa: E402

BATCH = {"kind": "invest", "placed_at": "2026-09-12", "orders": [
    {"symbol": "WABAG", "name": "VA Tech Wabag", "exchange": "NSE", "weight_target": 20, "qty": 2, "status": "CANCELLED", "cancelled_by": "kite", "filled_qty": 0, "order_id": "1"},
    {"symbol": "IONEXCHANG", "exchange": "NSE", "weight_target": 20, "qty": 11, "status": "COMPLETE", "filled_qty": 11, "order_id": "2"},
    {"symbol": "EMSLIMITED", "exchange": "NSE", "weight_target": 20, "qty": 13, "status": "COMPLETE", "filled_qty": 13, "order_id": "3"},
    {"symbol": "EIEL", "exchange": "NSE", "weight_target": 20, "qty": 24, "status": "COMPLETE", "filled_qty": 24, "order_id": "4"},
    {"symbol": "DENTA", "exchange": "NSE", "weight_target": 20, "qty": 17, "status": "CANCELLED", "cancelled_by": "kite", "filled_qty": 0, "order_id": "5"},
]}
PRICES = {"WABAG": 2280.0, "IONEXCHANG": 450.0, "EMSLIMITED": 385.0, "EIEL": 208.0, "DENTA": 290.0}


def test_held_counts_settled_t1_and_todays_cnc_position():
    held = ivm.held_from_kite(
        [{"tradingsymbol": "EIEL", "quantity": 20, "t1_quantity": 4, "average_price": 207.5, "last_price": 208.0}],
        [{"tradingsymbol": "IONEXCHANG", "product": "CNC", "quantity": 11, "buy_price": 447.0, "last_price": 450.0},
         {"tradingsymbol": "EIEL", "product": "CNC", "quantity": -4, "last_price": 208.0},          # sold 4 from holdings today
         {"tradingsymbol": "NIFTY26SEPFUT", "product": "NRML", "quantity": 1}])
    assert held["EIEL"]["qty"] == 20 and held["EIEL"]["avg"] == 207.5
    assert held["IONEXCHANG"]["qty"] == 11 and held["IONEXCHANG"]["avg"] == 447.0
    assert "NIFTY26SEPFUT" not in held


def test_targets_come_from_non_archived_batches_and_exits_subtract():
    t = ivm.targets_from_batches([BATCH, {**BATCH, "archived_at": "x"}])
    assert t["WABAG"]["qty"] == 2 and t["EIEL"]["qty"] == 24 and t["IONEXCHANG"]["filled"] == 11
    t2 = ivm.targets_from_batches([BATCH, {"kind": "exit", "placed_at": "2026-09-20", "orders": [{"symbol": "EIEL", "qty": 24, "status": "COMPLETE", "filled_qty": 24}]}])
    assert "EIEL" not in t2 and t2["WABAG"]["qty"] == 2


def test_assess_marks_missing_partial_held_and_sold():
    t = ivm.targets_from_batches([BATCH])
    a = ivm.assess(t, {"IONEXCHANG": 11, "EMSLIMITED": 13, "EIEL": 24}, PRICES)
    st = {r["symbol"]: r["status"] for r in a["rows"]}
    assert st == {"WABAG": "missing", "IONEXCHANG": "held", "EMSLIMITED": "held", "EIEL": "held", "DENTA": "missing"}
    assert a["health"] == "incomplete" and a["held_count"] == 3 and a["total_count"] == 5
    assert a["current"] == 11 * 450 + 13 * 385 + 24 * 208
    fix = {r["symbol"]: r["missing_qty"] for r in a["rows"] if r["missing_qty"]}
    assert fix == {"WABAG": 2, "DENTA": 17}
    # the investor bought the two in Kite: complete, no fix left
    b = ivm.assess(t, {"IONEXCHANG": 11, "EMSLIMITED": 13, "EIEL": 24, "WABAG": 2, "DENTA": 17}, PRICES)
    assert b["health"] == "complete" and all(r["missing_qty"] == 0 for r in b["rows"])
    # the investor sold EIEL in Kite after it filled through Omnivest
    c = ivm.assess(t, {"IONEXCHANG": 11, "EMSLIMITED": 13}, PRICES)
    assert {r["symbol"]: r["status"] for r in c["rows"]}["EIEL"] == "sold"
    # partial fill with the rest still open: 10 of 24 filled and held, 14 with Zerodha -> ordered, nothing to buy
    tp = ivm.targets_from_batches([{**BATCH, "orders": [{**BATCH["orders"][3], "filled_qty": 10, "status": "OPEN"}]}])
    d = ivm.assess(tp, {"EIEL": 10}, PRICES)
    assert d["rows"][0]["status"] == "ordered" and d["rows"][0]["missing_qty"] == 0 and d["rows"][0]["pending_qty"] == 14
    # the same after the day ends (order lapsed, status CANCELLED): partial, Fix buys the 14
    tl = ivm.targets_from_batches([{**BATCH, "orders": [{**BATCH["orders"][3], "filled_qty": 10, "status": "CANCELLED"}]}])
    e = ivm.assess(tl, {"EIEL": 10}, PRICES)
    assert e["rows"][0]["status"] == "partial" and e["rows"][0]["missing_qty"] == 14


def test_open_orders_count_as_on_the_way_and_are_never_bought_again():
    # Tushar's real batch on Sat 12 Sep: 3 AMO orders waiting for Tuesday, 2 cancelled in Kite, nothing held yet
    b = {**BATCH, "orders": [
        {**BATCH["orders"][0]},                                                              # WABAG cancelled in Kite
        {**BATCH["orders"][1], "status": "AMO REQ RECEIVED", "filled_qty": 0},
        {**BATCH["orders"][2], "status": "AMO REQ RECEIVED", "filled_qty": 0},
        {**BATCH["orders"][3], "status": "AMO REQ RECEIVED", "filled_qty": 0},
        {**BATCH["orders"][4]},                                                              # DENTA cancelled in Kite
    ]}
    t = ivm.targets_from_batches([b])
    assert t["EIEL"]["pending"] == 24 and t["WABAG"]["pending"] == 0
    a = ivm.assess(t, {}, PRICES)
    st = {r["symbol"]: r["status"] for r in a["rows"]}
    assert st == {"WABAG": "missing", "IONEXCHANG": "ordered", "EMSLIMITED": "ordered", "EIEL": "ordered", "DENTA": "missing"}
    assert {r["symbol"]: r["missing_qty"] for r in a["rows"] if r["missing_qty"]} == {"WABAG": 2, "DENTA": 17}     # Fix buys 2, never 5
    assert a["health"] == "incomplete" and a["pending_count"] == 3
    # only pending, nothing missing -> in progress, no Fix
    ok = ivm.assess(ivm.targets_from_batches([{**b, "orders": b["orders"][1:4]}]), {}, PRICES)
    assert ok["health"] == "in_progress" and all(r["missing_qty"] == 0 for r in ok["rows"])
    # a partial fill: 10 of 24 filled, 14 still open -> ordered, not missing
    pf = ivm.assess(ivm.targets_from_batches([{**b, "orders": [{**BATCH["orders"][3], "status": "OPEN", "filled_qty": 10}]}]), {"EIEL": 10}, PRICES)
    assert pf["rows"][0]["status"] == "ordered" and pf["rows"][0]["pending_qty"] == 14 and pf["rows"][0]["missing_qty"] == 0


def test_allocation_serves_the_earlier_investment_first():
    a = ivm.allocate([{"EIEL": {"qty": 24}}, {"EIEL": {"qty": 10}}], {"EIEL": 30})
    assert a == [{"EIEL": 24}, {"EIEL": 6}]

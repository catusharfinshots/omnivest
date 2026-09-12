"""Kite postback handling (pure functions; Zerodha is not called)."""
import hashlib
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import kite_postback as kp  # noqa: E402

SECRET = "s3cret"


def _signed(**kw):
    p = {"order_id": "260912000123", "order_timestamp": "2026-09-12 11:02:03", "status": "CANCELLED", "filled_quantity": 0, "average_price": 0, "status_message": None, **kw}
    p["checksum"] = hashlib.sha256(f"{p['order_id']}{p['order_timestamp']}{SECRET}".encode()).hexdigest()
    return p


def test_checksum_is_sha256_of_order_id_timestamp_secret():
    p = _signed()
    assert kp.checksum_ok(p, SECRET)
    assert not kp.checksum_ok({**p, "checksum": "0" * 64}, SECRET)
    assert not kp.checksum_ok(p, "other") and not kp.checksum_ok(p, "") and not kp.checksum_ok({**p, "order_id": ""}, SECRET)


def test_kite_timestamps_are_ist():
    t = kp.kite_ts("2026-09-12 11:02:03")
    assert t == datetime(2026, 9, 12, 5, 32, 3, tzinfo=timezone.utc)      # 11:02 IST -> 05:32 UTC
    assert kp.kite_ts(None) is None and kp.kite_ts("bad") is None


def test_cancel_inside_kite_is_marked_and_stamped():
    o = {"order_id": "260912000123", "symbol": "WABAG", "status": "OPEN", "filled_qty": 0, "avg_price": None, "message": ""}
    assert kp.apply_postback(o, _signed(exchange_update_timestamp="2026-09-12 11:02:05"))
    assert o["status"] == "CANCELLED" and o["cancelled_by"] == "kite"
    assert o["cancelled_at"] == datetime(2026, 9, 12, 5, 32, 5, tzinfo=timezone.utc) and o.get("postback_at")
    assert not kp.apply_postback(o, _signed(exchange_update_timestamp="2026-09-12 11:02:05"))   # idempotent


def test_investor_cancel_keeps_its_note_and_fill_updates_apply():
    mine = {"order_id": "1", "status": "CANCELLED", "cancelled_by": "investor", "message": "Cancelled from Omnivest", "filled_qty": 0, "avg_price": None}
    assert not kp.apply_postback(mine, _signed(order_id="1", status="CANCELLED"))
    assert mine["message"] == "Cancelled from Omnivest" and mine["cancelled_by"] == "investor"
    fill = {"order_id": "2", "status": "OPEN", "filled_qty": 0, "avg_price": None, "message": ""}
    assert kp.apply_postback(fill, _signed(order_id="2", status="COMPLETE", filled_quantity=2, average_price=2281.5))
    assert fill["status"] == "COMPLETE" and fill["filled_qty"] == 2 and fill["avg_price"] == 2281.5 and "cancelled_by" not in fill

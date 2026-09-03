"""Cross-worker lock for tests that seed/unseed the shared local `price_history` keys.
pytest.ini runs modules on separate xdist workers (loadscope); two modules seeding the
same benchmark keys would otherwise delete each other's data mid-test."""
import time
from datetime import datetime, timezone

from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

_NAME = "price_seed"
_STALE_S = 300


def _col():
    return MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=3000)["omnivest"]["test_locks"]


def acquire(timeout_s: int = 240) -> None:
    col = _col()
    deadline = time.time() + timeout_s
    while True:
        try:
            col.insert_one({"_id": _NAME, "at": datetime.now(timezone.utc)})
            return
        except DuplicateKeyError:
            held = col.find_one({"_id": _NAME})
            if held and (datetime.now(timezone.utc) - held["at"].replace(tzinfo=timezone.utc)).total_seconds() > _STALE_S:
                col.delete_one({"_id": _NAME})
                continue
            if time.time() > deadline:
                raise TimeoutError("price_seed lock held too long")
            time.sleep(1)


def release() -> None:
    _col().delete_one({"_id": _NAME})

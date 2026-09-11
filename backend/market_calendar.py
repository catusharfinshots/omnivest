"""NSE trading holidays for the invest clock (market_state in investing.py).

Source: NSE's official holiday master (https://www.nseindia.com/api/holiday-master?type=trading, segment CM).
Fetched by the engine scheduler on server start and every morning at 08:30 IST, re-downloaded when older than
AUTO_MAX_AGE_DAYS; stored in app_settings {_id: "nse_holidays"}. BUILTIN holds the calendar NSE published for
2026 (fetched 12 Sep 2026) so the clock is right even before the first fetch or if NSE blocks the server.
Admin-typed dates (listing rules → market_holidays) are always added on top.

Why: on 12 Sep 2026 the modal promised "executes Mon 14 Sep" — Ganesh Chaturthi, a holiday. The AMO orders
actually execute Tue 15 Sep.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Iterable, List, Optional, Set

import requests
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)
DOC_ID = "nse_holidays"
AUTO_MAX_AGE_DAYS = 7
IST = timezone(timedelta(hours=5, minutes=30))
URL = "https://www.nseindia.com/api/holiday-master?type=trading"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36",
           "Accept": "application/json,text/plain,*/*", "Accept-Language": "en-US,en;q=0.9", "Referer": "https://www.nseindia.com/"}

# NSE CM segment, 2026 (as published on nseindia.com, fetched 12 Sep 2026)
BUILTIN: List[str] = [
    "2026-01-15", "2026-01-26", "2026-02-15", "2026-03-03", "2026-03-21", "2026-03-26", "2026-03-31", "2026-04-03",
    "2026-04-14", "2026-05-01", "2026-05-28", "2026-06-26", "2026-08-15", "2026-09-14", "2026-10-02", "2026-10-20",
    "2026-11-08", "2026-11-10", "2026-11-24", "2026-12-25",
]


def _parse(rows: Iterable[dict]) -> List[str]:
    out: Set[str] = set()
    for r in rows or []:
        raw = (r.get("tradingDate") or "").strip()
        for fmt in ("%d-%b-%Y", "%Y-%m-%d", "%d-%m-%Y"):
            try:
                out.add(datetime.strptime(raw, fmt).strftime("%Y-%m-%d"))
                break
            except ValueError:
                continue
    return sorted(out)


def fetch_nse() -> List[str]:
    """NSE wants a browser-like session: hit the homepage first for cookies, then the JSON endpoint."""
    s = requests.Session()
    try:
        s.get("https://www.nseindia.com/", headers=HEADERS, timeout=20)
    except Exception:  # noqa: BLE001
        pass
    r = s.get(URL, headers=HEADERS, timeout=20)
    r.raise_for_status()
    data = r.json()
    dates = _parse(data.get("CM") or [])
    if len(dates) < 5:
        raise RuntimeError(f"NSE holiday list looks wrong ({len(dates)} dates)")
    return dates


def _aware(dt) -> Optional[datetime]:
    if not isinstance(dt, datetime):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def is_stale(doc: Optional[dict], now: Optional[datetime] = None) -> bool:
    fa = _aware((doc or {}).get("fetched_at"))
    return not fa or (now or datetime.now(timezone.utc)) - fa > timedelta(days=AUTO_MAX_AGE_DAYS)


async def load(db: AsyncIOMotorDatabase) -> Optional[dict]:
    return await db.app_settings.find_one({"_id": DOC_ID})


async def holidays(db: AsyncIOMotorDatabase, extra: Iterable[str] = ()) -> List[str]:
    """Built-in ∪ NSE-fetched ∪ admin-typed."""
    doc = await load(db)
    out = set(BUILTIN) | set((doc or {}).get("dates") or []) | {str(x).strip() for x in extra if str(x).strip()}
    return sorted(out)


async def auto_refresh(db: AsyncIOMotorDatabase, reason: str, force: bool = False) -> dict:
    doc = await load(db)
    if not force and not is_stale(doc):
        return {"skipped": True, "reason": reason, "fetched_at": _aware(doc.get("fetched_at")).isoformat() if doc else None}
    run = {"at": datetime.now(timezone.utc), "at_ist": datetime.now(IST).isoformat(), "reason": reason}
    try:
        dates = await run_in_threadpool(fetch_nse)
        await db.app_settings.update_one({"_id": DOC_ID}, {"$set": {"dates": dates, "fetched_at": datetime.now(timezone.utc), "source": "nse", "auto": {**run, "ok": True, "count": len(dates)}}}, upsert=True)
        run.update({"ok": True, "count": len(dates)})
        logger.info("nse holidays refreshed (%s): %s dates", reason, len(dates))
    except Exception as e:  # noqa: BLE001
        run.update({"ok": False, "error": str(e)[:160]})
        await db.app_settings.update_one({"_id": DOC_ID}, {"$set": {"auto": run}}, upsert=True)
        logger.warning("nse holidays refresh (%s) failed: %s", reason, e)
    return run


def status(doc: Optional[dict]) -> dict:
    fa = _aware((doc or {}).get("fetched_at"))
    auto = dict((doc or {}).get("auto") or {})
    if isinstance(auto.get("at"), datetime):
        auto["at"] = _aware(auto["at"]).isoformat()
    return {"builtin": len(BUILTIN), "fetched": len((doc or {}).get("dates") or []), "fetched_at": fa.isoformat() if fa else None,
            "stale": is_stale(doc), "auto": auto or None}

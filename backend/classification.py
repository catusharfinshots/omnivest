"""Stock classification: market-cap bucket + industry per NSE symbol.

Source: NSE's official index constituent lists (CSV with an Industry column).
  NIFTY 100 -> Large, NIFTY Midcap 150 -> Mid, NIFTY Smallcap 250 -> Small,
  NIFTY Microcap 250 -> Micro, anything else -> Other. Industry from any list.
Cached in app_settings {_id:"index_membership"}.

Refresh is AUTOMATIC: the engine scheduler calls `auto_refresh()` on server start
and every morning at 08:30 IST; it re-fetches from NSE once the data is older than
AUTO_MAX_AGE_DAYS (NSE reshuffles its indices in March and September, so a weekly
check keeps every listing's cap/sector split current). When membership changes,
live listings are recomputed. The admin "Fetch from NSE" button forces a fetch now,
and CSV upload remains the fallback if NSE ever blocks the server's IP.

Used by the performance engine to add a weighted market-cap / sector split to
each listing, and by the partner form for a live preview while editing.
"""
from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep

logger = logging.getLogger(__name__)
DOC_ID = "index_membership"
IST = timezone(timedelta(hours=5, minutes=30))
AUTO_MAX_AGE_DAYS = 7
AUTO_POLICY = f"checked every morning at 08:30 IST and on server start; re-fetched from NSE when older than {AUTO_MAX_AGE_DAYS} days"
LISTS = {  # kind -> (cap bucket, NSE archive URL)
    "nifty100": ("Large", "https://archives.nseindia.com/content/indices/ind_nifty100list.csv"),
    "midcap150": ("Mid", "https://archives.nseindia.com/content/indices/ind_niftymidcap150list.csv"),
    "smallcap250": ("Small", "https://archives.nseindia.com/content/indices/ind_niftysmallcap250list.csv"),
    "microcap250": ("Micro", "https://archives.nseindia.com/content/indices/ind_niftymicrocap250_list.csv"),
    "nifty500": (None, "https://archives.nseindia.com/content/indices/ind_nifty500list.csv"),  # industry only
}
CAP_ORDER = ["Large", "Mid", "Small", "Micro", "Other"]
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36",
           "Accept": "text/csv,*/*", "Referer": "https://www.nseindia.com/"}

_CACHE: Dict[str, dict] = {}   # process-local copy of the membership doc (symbols map)


def parse_csv(text: str) -> List[dict]:
    rows = list(csv.DictReader(io.StringIO(text.lstrip("﻿"))))
    out = []
    for r in rows:
        sym = (r.get("Symbol") or r.get("symbol") or "").strip().upper()
        if sym:
            out.append({"symbol": sym, "name": (r.get("Company Name") or r.get("name") or "").strip(), "industry": (r.get("Industry") or r.get("industry") or "").strip()})
    return out


def merge(symbols: Dict[str, dict], kind: str, rows: List[dict]) -> int:
    cap = LISTS[kind][0]
    for r in rows:
        cur = symbols.get(r["symbol"]) or {}
        entry = {"name": r["name"] or cur.get("name", ""), "industry": r["industry"] or cur.get("industry", ""), "cap": cur.get("cap")}
        if cap:  # a symbol appears in exactly one cap index; nifty500 only supplies industry
            entry["cap"] = cap
        symbols[r["symbol"]] = entry
    return len(rows)


def classify(symbol: str) -> dict:
    s = _CACHE.get(symbol.upper()) or {}
    return {"cap": s.get("cap") or "Other", "industry": s.get("industry") or "Other", "name": s.get("name") or ""}


def distribution(weights: Dict[str, float]) -> dict:
    """Weighted market-cap and sector split for {symbol: weight%}."""
    cap = {k: 0.0 for k in CAP_ORDER}
    sector: Dict[str, float] = {}
    for sym, w in weights.items():
        c = classify(sym)
        cap[c["cap"]] = cap.get(c["cap"], 0.0) + w
        sector[c["industry"]] = sector.get(c["industry"], 0.0) + w
    cap = {k: round(v, 2) for k, v in cap.items() if v > 0}
    sector = dict(sorted(((k, round(v, 2)) for k, v in sector.items()), key=lambda kv: -kv[1]))
    return {"cap": cap, "sector": sector, "known": bool(_CACHE)}


# ---------------- storage helpers (shared by the router and the scheduler) ----------------

def _aware(dt) -> Optional[datetime]:
    if not isinstance(dt, datetime):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def is_stale(doc: Optional[dict], now: Optional[datetime] = None, max_age_days: int = AUTO_MAX_AGE_DAYS) -> bool:
    """True when the lists were never loaded or are older than the auto-refresh window."""
    fa = _aware((doc or {}).get("fetched_at"))
    if not fa:
        return True
    return (now or datetime.now(timezone.utc)) - fa > timedelta(days=max_age_days)


async def load(db: AsyncIOMotorDatabase) -> Optional[dict]:
    doc = await db.app_settings.find_one({"_id": DOC_ID})
    _CACHE.clear()
    if doc and isinstance(doc.get("symbols"), dict):
        _CACHE.update(doc["symbols"])
    return doc


async def save(db: AsyncIOMotorDatabase, symbols: Dict[str, dict], source: str, lists: Dict[str, int]) -> dict:
    doc = {"symbols": symbols, "count": len(symbols), "source": source, "lists": lists, "fetched_at": datetime.now(timezone.utc)}
    await db.app_settings.update_one({"_id": DOC_ID}, {"$set": doc}, upsert=True)
    _CACHE.clear()
    _CACHE.update(symbols)
    return {"_id": DOC_ID, **doc}


def status(doc: Optional[dict]) -> dict:
    auto = (doc or {}).get("auto")
    if auto and isinstance(auto.get("at"), datetime):
        auto = {**auto, "at": _aware(auto["at"]).isoformat()}
    if not doc or not doc.get("fetched_at"):
        return {"loaded": False, "symbols": 0, "lists": {}, "fetched_at": None, "source": None, "stale": True, "auto": auto, "auto_policy": AUTO_POLICY}
    fa = _aware(doc.get("fetched_at"))
    return {"loaded": True, "symbols": doc.get("count") or len(doc.get("symbols") or {}), "lists": doc.get("lists") or {},
            "fetched_at": fa.isoformat() if fa else None, "source": doc.get("source"), "stale": is_stale(doc), "auto": auto, "auto_policy": AUTO_POLICY}


async def fetch_from_nse(db: AsyncIOMotorDatabase) -> Tuple[dict, dict, List[str], List[str]]:
    """Download all five lists and merge them over the stored map.
    Returns (doc, counts, errors, changed_symbols). Raises RuntimeError when NSE served nothing."""
    existing = await db.app_settings.find_one({"_id": DOC_ID})
    before: Dict[str, dict] = dict((existing or {}).get("symbols") or {})
    symbols: Dict[str, dict] = {k: dict(v) for k, v in before.items()}
    counts, errors = {}, []
    for kind, (_, url) in LISTS.items():
        try:
            r = await run_in_threadpool(lambda u=url: requests.get(u, headers=HEADERS, timeout=30))
            if r.status_code != 200 or "Symbol" not in r.text[:500]:
                raise RuntimeError(f"HTTP {r.status_code}")
            counts[kind] = merge(symbols, kind, parse_csv(r.text))
        except Exception as e:  # noqa: BLE001
            errors.append(f"{kind}: {str(e)[:80]}")
    if not counts:
        raise RuntimeError("NSE did not serve any list from this server")
    changed = sorted(s for s in set(before) | set(symbols) if before.get(s) != symbols.get(s))
    doc = await save(db, symbols, "nse", {**((existing or {}).get("lists") or {}), **counts})
    return doc, counts, errors, changed


async def auto_refresh(db: AsyncIOMotorDatabase, reason: str, force: bool = False) -> dict:
    """Scheduler entry point: fetch when the data is missing or older than AUTO_MAX_AGE_DAYS.
    Records the outcome under `auto` so the admin console shows what happened, and recomputes live
    listings when index membership actually changed (their cap/sector split depends on it)."""
    doc = await db.app_settings.find_one({"_id": DOC_ID}, {"symbols": 0})
    if not force and not is_stale(doc):
        if not _CACHE:
            await load(db)
        return {"skipped": True, "reason": reason, "fetched_at": status(doc).get("fetched_at")}
    run = {"at": datetime.now(timezone.utc), "at_ist": datetime.now(IST).isoformat(), "reason": reason}
    try:
        _, counts, errors, changed = await fetch_from_nse(db)
        run.update({"ok": True, "fetched": counts, "errors": errors, "changed": len(changed)})
        if changed:
            try:
                import performance as perf_engine
                if perf_engine.ENGINE is not None:
                    await perf_engine.ENGINE.refresh_all("nse index lists changed", only_stale=False)
                    run["recomputed"] = True
            except Exception as e:  # noqa: BLE001
                logger.warning("recompute after classification change failed: %s", e)
    except Exception as e:  # noqa: BLE001
        run.update({"ok": False, "errors": [str(e)[:160]]})
        logger.warning("classification auto-refresh (%s) failed: %s", reason, e)
    await db.app_settings.update_one({"_id": DOC_ID}, {"$set": {"auto": run}}, upsert=True)
    return run


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(tags=["classification"])
    require_admin = build_current_user_dep(db, ["admin"])
    col = db.app_settings

    @router.on_event("startup")
    async def _warm():
        try:
            await load(db)
        except Exception as e:  # noqa: BLE001
            logger.warning("classification warm-up failed: %s", e)

    @router.get("/instruments/classify")
    async def classify_symbols(symbols: str = Query("", description="comma-separated NSE symbols")):
        if not _CACHE:
            await load(db)
        syms = [s.strip().upper() for s in symbols.split(",") if s.strip()][:100]
        return {"loaded": bool(_CACHE), "symbols": {s: classify(s) for s in syms}}

    @router.get("/admin/classification/status")
    async def status_ep(_: dict = Depends(require_admin)):
        return status(await col.find_one({"_id": DOC_ID}, {"symbols": 0}))

    @router.post("/admin/classification/refresh")
    async def refresh(_: dict = Depends(require_admin)):
        """Force a fetch of all five NSE lists now (the scheduler does this weekly on its own)."""
        run = await auto_refresh(db, "admin fetch", force=True)
        if not run.get("ok"):
            raise HTTPException(status_code=502, detail="NSE did not serve any list from this server. Upload the CSVs instead (they are on nseindia.com under Indices > constituent lists).")
        doc = await col.find_one({"_id": DOC_ID}, {"symbols": 0})
        return {"ok": True, "fetched": run.get("fetched") or {}, "errors": run.get("errors") or [], "changed": run.get("changed", 0), **status(doc)}

    @router.post("/admin/classification/upload")
    async def upload(kind: str = Form(...), file: UploadFile = File(...), _: dict = Depends(require_admin)):
        if kind not in LISTS:
            raise HTTPException(status_code=422, detail=f"kind must be one of {', '.join(LISTS)}")
        text = (await file.read()).decode("utf-8", errors="ignore")
        rows = parse_csv(text)
        if not rows:
            raise HTTPException(status_code=422, detail="Could not read any rows. Expected NSE's CSV with a Symbol column.")
        existing = await col.find_one({"_id": DOC_ID})
        symbols: Dict[str, dict] = dict((existing or {}).get("symbols") or {})
        n = merge(symbols, kind, rows)
        doc = await save(db, symbols, "upload", {**((existing or {}).get("lists") or {}), kind: n})
        return {"ok": True, "kind": kind, "rows": n, **status(doc)}

    return router

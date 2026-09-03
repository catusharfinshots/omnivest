"""Stock classification: market-cap bucket + industry per NSE symbol.

Source: NSE's official index constituent lists (CSV with an Industry column).
  NIFTY 100 -> Large, NIFTY Midcap 150 -> Mid, NIFTY Smallcap 250 -> Small,
  NIFTY Microcap 250 -> Micro, anything else -> Other. Industry from any list.
Cached in app_settings {_id:"index_membership"}; refreshed by admin (auto-fetch
from NSE, or CSV upload when the server's IP is blocked by NSE).

Used by the performance engine to add a weighted market-cap / sector split to
each listing, and by the partner form for a live preview while editing.
"""
from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep

logger = logging.getLogger(__name__)
DOC_ID = "index_membership"
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


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(tags=["classification"])
    require_admin = build_current_user_dep(db, ["admin"])
    col = db.app_settings

    async def _load():
        doc = await col.find_one({"_id": DOC_ID})
        _CACHE.clear()
        if doc and isinstance(doc.get("symbols"), dict):
            _CACHE.update(doc["symbols"])
        return doc

    async def _save(symbols: Dict[str, dict], source: str, lists: Dict[str, int]):
        doc = {"_id": DOC_ID, "symbols": symbols, "source": source, "lists": lists, "fetched_at": datetime.now(timezone.utc)}
        await col.update_one({"_id": DOC_ID}, {"$set": doc}, upsert=True)
        _CACHE.clear()
        _CACHE.update(symbols)
        return doc

    def _status(doc: Optional[dict]) -> dict:
        if not doc:
            return {"loaded": False, "symbols": 0, "lists": {}, "fetched_at": None, "source": None}
        fa = doc.get("fetched_at")
        return {"loaded": True, "symbols": len(doc.get("symbols") or {}), "lists": doc.get("lists") or {},
                "fetched_at": (fa if fa.tzinfo else fa.replace(tzinfo=timezone.utc)).isoformat() if isinstance(fa, datetime) else None,
                "source": doc.get("source")}

    @router.on_event("startup")
    async def _warm():
        try:
            await _load()
        except Exception as e:  # noqa: BLE001
            logger.warning("classification warm-up failed: %s", e)

    @router.get("/instruments/classify")
    async def classify_symbols(symbols: str = Query("", description="comma-separated NSE symbols")):
        if not _CACHE:
            await _load()
        syms = [s.strip().upper() for s in symbols.split(",") if s.strip()][:100]
        return {"loaded": bool(_CACHE), "symbols": {s: classify(s) for s in syms}}

    @router.get("/admin/classification/status")
    async def status(_: dict = Depends(require_admin)):
        return _status(await col.find_one({"_id": DOC_ID}, {"symbols": 0}))

    @router.post("/admin/classification/refresh")
    async def refresh(_: dict = Depends(require_admin)):
        """Fetch all five NSE lists. NSE sometimes blocks non-Indian server IPs — then use /upload."""
        existing = await col.find_one({"_id": DOC_ID})
        symbols: Dict[str, dict] = dict((existing or {}).get("symbols") or {})
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
            raise HTTPException(status_code=502, detail="NSE did not serve any list from this server. Upload the CSVs instead (they are on nseindia.com under Indices → constituent lists).")
        doc = await _save(symbols, "nse", {**((existing or {}).get("lists") or {}), **counts})
        return {"ok": True, "fetched": counts, "errors": errors, **_status(doc)}

    @router.post("/admin/classification/upload")
    async def upload(kind: str = Form(...), file: UploadFile = File(...), _: dict = Depends(require_admin)):
        if kind not in LISTS:
            raise HTTPException(status_code=422, detail=f"kind must be one of {', '.join(LISTS)}")
        text = (await file.read()).decode("utf-8", errors="ignore")
        rows = parse_csv(text)
        if not rows:
            raise HTTPException(status_code=422, detail="Could not read any rows — expected NSE's CSV with a Symbol column.")
        existing = await col.find_one({"_id": DOC_ID})
        symbols: Dict[str, dict] = dict((existing or {}).get("symbols") or {})
        n = merge(symbols, kind, rows)
        doc = await _save(symbols, "upload", {**((existing or {}).get("lists") or {}), kind: n})
        return {"ok": True, "kind": kind, "rows": n, **_status(doc)}

    return router

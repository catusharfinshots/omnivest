"""Kite Connect MARKET DATA — a single shared/admin session powers instrument
search + live quotes + period returns for ALL analysts.

Design (per Kite Connect rules): the access token expires daily at ~6 AM IST and
needs an interactive login. An admin connects the shared "market-data" account
once per trading day; that token drives every analyst's instrument search and
price lookups. The api_secret / access_token never leave the backend.

Collections:
  - kite_sessions   {account:"market-data", access_token, login_time, needs_reconnect, updated_at}
  - instruments     {_id:"NSE:RELIANCE", exchange, tradingsymbol, name, instrument_token, ...}
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReplaceOne

try:
    from kiteconnect import KiteConnect  # type: ignore
    from kiteconnect import exceptions as kite_exceptions  # type: ignore
except Exception:  # pragma: no cover
    KiteConnect = None  # type: ignore
    kite_exceptions = None  # type: ignore

from auth import build_current_user_dep

logger = logging.getLogger(__name__)

KITE_API_KEY = os.environ.get("KITE_API_KEY", "").strip()
KITE_API_SECRET = os.environ.get("KITE_API_SECRET", "").strip()

ACCOUNT = "market-data"

PERIODS = {
    "1M": 30, "3M": 91, "6M": 182, "1Y": 365,
    "2Y": 730, "3Y": 1095, "5Y": 1825,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ExchangeRequest(BaseModel):
    request_token: str = Field(..., min_length=6)


class QuoteRequest(BaseModel):
    symbols: List[str] = Field(..., min_items=1, max_items=500)


class PeriodReturnRequest(BaseModel):
    symbol: str = Field(..., min_length=3)   # e.g. NSE:RELIANCE
    period: str = "1Y"


def _new_client(access_token: Optional[str] = None) -> "KiteConnect":
    if KiteConnect is None:
        raise HTTPException(status_code=500, detail="kiteconnect library not installed")
    if not KITE_API_KEY or not KITE_API_SECRET:
        raise HTTPException(status_code=500, detail="Kite API key/secret not configured on server")
    k = KiteConnect(api_key=KITE_API_KEY)
    if access_token:
        k.set_access_token(access_token)
    return k


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(tags=["market-data"])
    require_admin = build_current_user_dep(db, ["admin"])
    require_user = build_current_user_dep(db, ["admin", "analyst", "investor"])

    sessions = db.kite_sessions
    instruments = db.instruments

    async def _load_session() -> Optional[dict]:
        return await sessions.find_one({"account": ACCOUNT})

    async def _market_client() -> "KiteConnect":
        row = await _load_session()
        if not row or not row.get("access_token"):
            raise HTTPException(status_code=503, detail="Kite market-data account is not connected. Ask an admin to connect Kite.")
        if row.get("needs_reconnect"):
            raise HTTPException(status_code=503, detail="Kite session expired. Ask an admin to reconnect Kite for today.")
        return _new_client(row["access_token"])

    async def _flag_reconnect():
        await sessions.update_one({"account": ACCOUNT}, {"$set": {"needs_reconnect": True, "updated_at": _now()}})

    def _is_token_error(e: Exception) -> bool:
        return kite_exceptions is not None and isinstance(e, kite_exceptions.TokenException)

    # ---------------- Admin: shared session ----------------
    @router.get("/admin/kite/market/login-url")
    async def market_login_url(user: dict = Depends(require_admin)):
        k = _new_client()
        return {"login_url": k.login_url(), "api_key": KITE_API_KEY}

    @router.post("/admin/kite/market/exchange")
    async def market_exchange(payload: ExchangeRequest, user: dict = Depends(require_admin)):
        def _exchange():
            k = _new_client()
            return k.generate_session(payload.request_token, api_secret=KITE_API_SECRET)
        try:
            data = await run_in_threadpool(_exchange)
        except Exception as e:  # noqa: BLE001
            logger.exception("Kite market exchange failed")
            raise HTTPException(status_code=400, detail=f"Kite login failed: {e}")
        await sessions.update_one(
            {"account": ACCOUNT},
            {"$set": {
                "account": ACCOUNT,
                "access_token": data.get("access_token"),
                "login_time": str(data.get("login_time")),
                "kite_user": data.get("user_name") or data.get("user_id"),
                "needs_reconnect": False,
                "updated_at": _now(),
            }},
            upsert=True,
        )
        return {"ok": True, "kite_user": data.get("user_name") or data.get("user_id"), "login_time": str(data.get("login_time"))}

    @router.get("/admin/kite/market/status")
    async def market_status(user: dict = Depends(require_admin)):
        row = await _load_session()
        count = await instruments.estimated_document_count()
        if not row or not row.get("access_token"):
            return {"connected": False, "instruments_count": count, "configured": bool(KITE_API_KEY and KITE_API_SECRET)}
        return {
            "connected": True,
            "needs_reconnect": bool(row.get("needs_reconnect")),
            "kite_user": row.get("kite_user"),
            "login_time": row.get("login_time"),
            "instruments_count": count,
            "instruments_refreshed_at": row.get("instruments_refreshed_at"),
            "configured": True,
        }

    @router.post("/admin/kite/market/refresh-instruments")
    async def refresh_instruments(user: dict = Depends(require_admin)):
        k = await _market_client()
        try:
            rows = await run_in_threadpool(k.instruments)
        except Exception as e:  # noqa: BLE001
            if _is_token_error(e):
                await _flag_reconnect()
                raise HTTPException(status_code=503, detail="Kite session expired. Please reconnect Kite.")
            logger.exception("Kite instruments download failed")
            raise HTTPException(status_code=502, detail=f"Could not download instruments: {e}")
        ops = []
        for x in rows:
            if x.get("exchange") not in ("NSE", "BSE") or not x.get("tradingsymbol"):
                continue
            key = f'{x["exchange"]}:{x["tradingsymbol"]}'
            ops.append(ReplaceOne({"_id": key}, {
                "_id": key,
                "exchange": x["exchange"],
                "tradingsymbol": x["tradingsymbol"],
                "name": x.get("name", ""),
                "instrument_token": int(x["instrument_token"]),
                "segment": x.get("segment"),
                "instrument_type": x.get("instrument_type"),
                "refreshed_at": _now(),
            }, upsert=True))
        written = 0
        if ops:
            res = await instruments.bulk_write(ops, ordered=False)
            written = (res.upserted_count or 0) + (res.modified_count or 0)
            await instruments.create_index([("exchange", 1), ("tradingsymbol", 1)])
        await sessions.update_one({"account": ACCOUNT}, {"$set": {"instruments_refreshed_at": _now().isoformat()}})
        return {"ok": True, "count": len(ops), "written": written}

    @router.post("/admin/kite/market/disconnect")
    async def market_disconnect(user: dict = Depends(require_admin)):
        await sessions.delete_one({"account": ACCOUNT})
        return {"ok": True}

    # ---------------- Analyst: instrument search & prices ----------------
    @router.get("/market/instruments/search")
    async def search(q: str = Query(..., min_length=1), limit: int = Query(20, ge=1, le=50), user: dict = Depends(require_user)):
        term = q.strip().upper()
        if len(term) < 1:
            return {"results": []}
        import re
        safe = re.escape(term)
        cursor = instruments.find({
            "exchange": {"$in": ["NSE", "BSE"]},
            "$or": [
                {"tradingsymbol": {"$regex": f"^{safe}"}},
                {"name": {"$regex": safe, "$options": "i"}},
            ],
        }, {"_id": 0}).limit(min(limit, 50))
        rows = await cursor.to_list(length=min(limit, 50))
        # symbol-prefix matches first
        rows.sort(key=lambda r: (0 if r.get("tradingsymbol", "").startswith(term) else 1, r.get("tradingsymbol", "")))
        return {"results": rows}

    @router.post("/market/quote")
    async def quote(payload: QuoteRequest, user: dict = Depends(require_user)):
        k = await _market_client()
        symbols = [s.strip() for s in payload.symbols if s.strip()]
        try:
            data = await run_in_threadpool(k.quote, symbols)
        except Exception as e:  # noqa: BLE001
            if _is_token_error(e):
                await _flag_reconnect()
                raise HTTPException(status_code=503, detail="Kite session expired. Ask an admin to reconnect Kite.")
            logger.exception("Kite quote failed")
            raise HTTPException(status_code=502, detail=f"Could not fetch prices: {e}")
        out = []
        for key in symbols:
            q = data.get(key)
            if not q:
                out.append({"symbol": key, "available": False})
                continue
            close = (q.get("ohlc") or {}).get("close")
            ltp = q.get("last_price")
            out.append({
                "symbol": key,
                "available": True,
                "ltp": ltp,
                "previous_close": close,
                "change_pct": ((ltp / close - 1) * 100) if (close not in (None, 0) and ltp is not None) else None,
                "timestamp": q.get("timestamp"),
            })
        return {"quotes": out}

    @router.post("/market/period-return")
    async def period_return(payload: PeriodReturnRequest, user: dict = Depends(require_user)):
        period = payload.period.upper()
        if period not in PERIODS:
            raise HTTPException(status_code=400, detail=f"period must be one of {list(PERIODS)}")
        k = await _market_client()
        inst = await instruments.find_one({"_id": payload.symbol.strip().upper()})
        if not inst:
            raise HTTPException(status_code=404, detail=f"Unknown instrument {payload.symbol}. Refresh instruments or check the symbol.")
        to_date = datetime.now().date()
        from_date = to_date - timedelta(days=PERIODS[period])
        try:
            candles = await run_in_threadpool(
                k.historical_data, inst["instrument_token"],
                from_date.isoformat(), to_date.isoformat(), "day",
            )
        except Exception as e:  # noqa: BLE001
            if _is_token_error(e):
                await _flag_reconnect()
                raise HTTPException(status_code=503, detail="Kite session expired. Ask an admin to reconnect Kite.")
            logger.exception("Kite historical failed")
            raise HTTPException(status_code=502, detail=f"Could not fetch history: {e}")
        if not candles or len(candles) < 2:
            raise HTTPException(status_code=422, detail="Not enough price history for this period.")
        start_close = candles[0]["close"]
        end_close = candles[-1]["close"]
        abs_return = (end_close / start_close - 1) * 100 if start_close else None
        years = PERIODS[period] / 365.0
        cagr = ((end_close / start_close) ** (1 / years) - 1) * 100 if (start_close and years > 0) else None
        return {
            "symbol": payload.symbol.upper(),
            "name": inst.get("name") or inst.get("tradingsymbol"),
            "period": period,
            "start_date": str(candles[0]["date"]),
            "end_date": str(candles[-1]["date"]),
            "start_close": start_close,
            "end_close": end_close,
            "return_pct": round(abs_return, 2) if abs_return is not None else None,
            "cagr_pct": round(cagr, 2) if cagr is not None else None,
        }

    return router

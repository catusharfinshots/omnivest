"""Listing performance engine (Listing 2.0 — step 4a).

Performance is COMPUTED, never typed. For each portfolio we build a daily NAV
series from Kite historical closes (buy-and-hold between rebalance versions,
starting at 100), then derive CAGR, window returns (1M…5Y, since launch),
max drawdown, annualised volatility (Low/Med/High label), benchmark series
for the core-4 indices, and an auto minimum-investment amount.

Points before the listing's launch date are a BACKTEST and are flagged so the
UI can label them; points after are the live track record.

Collections:
  price_history         {_id:"NSE:RELIANCE", token, refreshed_at, candles:[[YYYY-MM-DD, close], ...]}
  portfolio_performance {_id:<portfolio id>, as_of, launch_date, benchmark, series, benchmarks, metrics, ...}
"""
from __future__ import annotations

import logging
import math
import os
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep

try:
    from kiteconnect import KiteConnect, exceptions as kite_exceptions
except Exception:  # noqa: BLE001
    KiteConnect = None  # type: ignore
    kite_exceptions = None  # type: ignore

logger = logging.getLogger(__name__)

KITE_API_KEY = os.environ.get("KITE_API_KEY", "").strip()
ACCOUNT = "market-data"
BENCHMARKS = ["NIFTY 50", "NIFTY 500", "NIFTY MIDCAP 150", "NIFTY SMLCAP 250"]
BENCH_LABELS = {"NIFTY 50": "NIFTY 50", "NIFTY 500": "NIFTY 500", "NIFTY MIDCAP 150": "NIFTY Midcap 150", "NIFTY SMLCAP 250": "NIFTY Smallcap 250"}
DEFAULT_BENCHMARK = "NIFTY 50"
HISTORY_DAYS = 5 * 365 + 40          # a little over 5 years of daily candles (one Kite call)
WINDOWS = {"1M": 30, "3M": 91, "6M": 182, "1Y": 365, "3Y": 1095, "5Y": 1825}
PRICE_STALE_HOURS = 20
PERF_STALE_HOURS = 20


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_date(s) -> Optional[date]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).date()
    except Exception:  # noqa: BLE001
        try:
            return date.fromisoformat(str(s)[:10])
        except Exception:  # noqa: BLE001
            return None


# ----------------------------------------------------------------------------
# Pure math (no I/O) — unit-testable
# ----------------------------------------------------------------------------
def build_nav(versions: List[dict], prices: Dict[str, Dict[str, float]], calendar: List[str]) -> List[dict]:
    """versions: [{effective: 'YYYY-MM-DD', weights: {sym: pct}}] sorted ascending.
    prices: sym -> {date: close}. calendar: sorted trading dates (from the benchmark).
    Buy-and-hold between versions; NAV starts at 100 on the first date where every
    symbol of the first version has a price."""
    if not versions or not calendar:
        return []
    # forward-fill helper
    last: Dict[str, float] = {}

    def px(sym: str, d: str) -> Optional[float]:
        v = prices.get(sym, {}).get(d)
        if v is not None:
            last[sym] = v
        return last.get(sym)

    series: List[dict] = []
    units: Dict[str, float] = {}
    nav = 100.0
    vi = 0
    started = False
    for d in calendar:
        # advance to the version effective on this date
        while vi + 1 < len(versions) and versions[vi + 1]["effective"] <= d:
            vi += 1
            if started:
                # rebalance: reallocate current NAV to new target weights at today's prices
                nav = sum(units[s] * (px(s, d) or 0) for s in units) or nav
                units = {}
                for s, w in versions[vi]["weights"].items():
                    p = px(s, d)
                    if p:
                        units[s] = (w / 100.0) * nav / p
        weights = versions[vi]["weights"]
        current = {s: px(s, d) for s in weights}
        if not started:
            if any(current[s] is None for s in weights):
                continue  # not all constituents have history yet
            units = {s: (w / 100.0) * 100.0 / current[s] for s, w in weights.items()}
            nav = 100.0
            started = True
            series.append({"d": d, "nav": 100.0})
            continue
        nav = sum(units[s] * (current.get(s) or last.get(s) or 0) for s in units)
        series.append({"d": d, "nav": round(nav, 4)})
    return series


def _metrics(points: List[dict]) -> dict:
    """points: [{d, nav}] ascending. Returns window returns, cagr, drawdown, vol."""
    out = {"start": None, "end": None, "days": 0, "return_pct": None, "cagr_pct": None,
           "windows": {}, "max_drawdown_pct": None, "volatility_pct": None, "volatility_label": None}
    if len(points) < 2:
        return out
    end_d = date.fromisoformat(points[-1]["d"])
    start_d = date.fromisoformat(points[0]["d"])
    end_nav, start_nav = points[-1]["nav"], points[0]["nav"]
    days = (end_d - start_d).days
    out.update({"start": points[0]["d"], "end": points[-1]["d"], "days": days})
    out["return_pct"] = round((end_nav / start_nav - 1) * 100, 2)
    if days >= 365:
        out["cagr_pct"] = round(((end_nav / start_nav) ** (365.0 / days) - 1) * 100, 2)
    # window returns
    for key, wd in WINDOWS.items():
        target = end_d - timedelta(days=wd)
        if target < start_d:
            out["windows"][key] = None
            continue
        base = None
        for p in points:  # first point at/after target date
            if date.fromisoformat(p["d"]) >= target:
                base = p["nav"]
                break
        out["windows"][key] = round((end_nav / base - 1) * 100, 2) if base else None
    # drawdown
    peak, mdd = points[0]["nav"], 0.0
    for p in points:
        peak = max(peak, p["nav"])
        mdd = min(mdd, p["nav"] / peak - 1)
    out["max_drawdown_pct"] = round(mdd * 100, 2)
    # volatility (annualised std of daily log returns)
    rets = []
    for a, b in zip(points, points[1:]):
        if a["nav"] > 0 and b["nav"] > 0:
            rets.append(math.log(b["nav"] / a["nav"]))
    if len(rets) >= 20:
        mean = sum(rets) / len(rets)
        var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
        vol = math.sqrt(var) * math.sqrt(252) * 100
        out["volatility_pct"] = round(vol, 2)
        out["volatility_label"] = "Low" if vol < 12 else ("Medium" if vol < 20 else "High")
    return out


def min_investment(weights: Dict[str, float], latest: Dict[str, float]) -> Optional[dict]:
    """Smallest amount that buys at least one share of every constituent at target weights."""
    if not weights or any(latest.get(s) is None for s in weights):
        return None
    amount = max(latest[s] * 100.0 / w for s, w in weights.items() if w > 0)
    amount = math.ceil(amount / 100.0) * 100
    holdings, cost = [], 0.0
    for s, w in weights.items():
        qty = max(1, math.floor((w / 100.0) * amount / latest[s]))
        holdings.append({"symbol": s, "qty": qty, "price": latest[s], "value": round(qty * latest[s], 2)})
        cost += qty * latest[s]
    return {"amount": int(math.ceil(cost)), "holdings": holdings}


# ----------------------------------------------------------------------------
def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(tags=["performance"])
    require_admin = build_current_user_dep(db, ["admin"])
    require_analyst = build_current_user_dep(db, ["analyst"])
    portfolios, sessions, instruments = db.analyst_portfolios, db.kite_sessions, db.instruments
    prices_col, perf_col = db.price_history, db.portfolio_performance
    _inflight: set = set()

    async def _client():
        row = await sessions.find_one({"account": ACCOUNT})
        if not row or not row.get("access_token") or row.get("needs_reconnect") or KiteConnect is None or not KITE_API_KEY:
            return None
        k = KiteConnect(api_key=KITE_API_KEY)
        k.set_access_token(row["access_token"])
        return k

    async def _instrument(sym: str, exchange: str = "NSE") -> Optional[dict]:
        doc = await instruments.find_one({"_id": f"{exchange}:{sym}"})
        if not doc:
            doc = await instruments.find_one({"exchange": exchange, "tradingsymbol": sym})
        return doc

    async def _candles(k, sym: str, exchange: str = "NSE") -> Optional[List[list]]:
        key = f"{exchange}:{sym}"
        cached = await prices_col.find_one({"_id": key})
        if cached and cached.get("refreshed_at") and (_now() - cached["refreshed_at"].replace(tzinfo=timezone.utc)) < timedelta(hours=PRICE_STALE_HOURS):
            return cached["candles"]
        if k is None:
            return cached["candles"] if cached else None
        inst = await _instrument(sym, exchange)
        if not inst:
            return cached["candles"] if cached else None
        to_d, from_d = date.today(), date.today() - timedelta(days=HISTORY_DAYS)
        try:
            raw = await run_in_threadpool(k.historical_data, inst["instrument_token"], from_d.isoformat(), to_d.isoformat(), "day")
        except Exception as e:  # noqa: BLE001
            if kite_exceptions is not None and isinstance(e, kite_exceptions.TokenException):
                await sessions.update_one({"account": ACCOUNT}, {"$set": {"needs_reconnect": True}})
            logger.warning("historical fetch failed for %s: %s", key, e)
            return cached["candles"] if cached else None
        candles = [[str(c["date"])[:10], float(c["close"])] for c in raw if c.get("close")]
        await prices_col.update_one({"_id": key}, {"$set": {"_id": key, "token": inst["instrument_token"], "refreshed_at": _now(), "candles": candles}}, upsert=True)
        return candles

    def _versions_of(doc: dict) -> List[dict]:
        vs = doc.get("versions") or []
        out = []
        for v in vs:
            w = {c["symbol"].upper(): float(c.get("weight") or 0) for c in (v.get("constituents") or []) if c.get("symbol")}
            if w:
                out.append({"effective": str(v.get("effective_date"))[:10], "weights": w})
        cur = {c["symbol"].upper(): float(c.get("weight") or 0) for c in (doc.get("constituents") or []) if c.get("symbol")}
        if cur and (not out or out[-1]["weights"] != cur):
            eff = str(doc.get("launch_date") or doc.get("created_at") or date.today().isoformat())[:10]
            if out:
                eff = max(eff, str(doc.get("updated_at") or eff)[:10])
            out.append({"effective": eff, "weights": cur})
        out.sort(key=lambda v: v["effective"])
        # the first version applies to all earlier (backtest) dates too
        if out:
            out[0] = {**out[0], "effective": "0000-01-01"}
        return out

    async def compute(pid: str) -> dict:
        doc = await portfolios.find_one({"id": pid}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        k = await _client()
        versions = _versions_of(doc)
        syms = sorted({s for v in versions for s in v["weights"]})
        exch = {c["symbol"].upper(): (c.get("exchange") or "NSE") for c in (doc.get("constituents") or []) if c.get("symbol")}
        errors: List[str] = []
        prices: Dict[str, Dict[str, float]] = {}
        latest: Dict[str, float] = {}
        for s in syms:
            c = await _candles(k, s, exch.get(s, "NSE"))
            if not c:
                errors.append(f"No price history for {s}")
                continue
            prices[s] = {d: v for d, v in c}
            latest[s] = c[-1][1]
        bench_series: Dict[str, List[list]] = {}
        for b in BENCHMARKS:
            c = await _candles(k, b, "NSE")
            if c:
                bench_series[b] = c
        primary = doc.get("benchmark") if doc.get("benchmark") in BENCHMARKS else DEFAULT_BENCHMARK
        calendar_src = bench_series.get(primary) or next(iter(bench_series.values()), None)
        if not calendar_src or not prices:
            perf = {"_id": pid, "id": pid, "as_of": _now(), "status": "unavailable", "errors": errors or ["Market data not connected — ask the admin to connect Kite."],
                    "launch_date": doc.get("launch_date"), "benchmark": primary}
            await perf_col.update_one({"_id": pid}, {"$set": perf}, upsert=True)
            return perf
        calendar = [d for d, _ in calendar_src]
        series = build_nav(versions, prices, calendar)
        launch = _parse_date(doc.get("launch_date"))
        launch_s = launch.isoformat() if launch else None
        live = [p for p in series if launch_s and p["d"] >= launch_s]
        # rebase live series to 100 at launch for the live metrics
        live_pts = [{"d": p["d"], "nav": round(p["nav"] / live[0]["nav"] * 100, 4)} for p in live] if live else []
        metrics = {"live": _metrics(live_pts), "all": _metrics(series)}
        bench_out, bench_metrics = {}, {}
        if series:
            s0 = series[0]["d"]
            for b, c in bench_series.items():
                pts = [{"d": d, "nav": v} for d, v in c if d >= s0]
                if not pts:
                    continue
                base = pts[0]["nav"]
                norm = [{"d": p["d"], "nav": round(p["nav"] / base * 100, 4)} for p in pts]
                bench_out[b] = norm
                b_live = [p for p in norm if launch_s and p["d"] >= launch_s]
                b_live_pts = [{"d": p["d"], "nav": round(p["nav"] / b_live[0]["nav"] * 100, 4)} for p in b_live] if b_live else []
                bench_metrics[b] = {"live": _metrics(b_live_pts), "all": _metrics(norm)}
        current_w = versions[-1]["weights"] if versions else {}
        perf = {
            "_id": pid, "id": pid, "as_of": _now(), "status": "ok",
            "launch_date": launch_s, "benchmark": primary, "benchmark_labels": BENCH_LABELS,
            "series": series, "benchmarks": bench_out,
            "metrics": metrics, "bench_metrics": bench_metrics,
            "min_investment": min_investment(current_w, latest),
            "latest_prices": latest, "price_date": series[-1]["d"] if series else None,
            "versions": [{"effective": v["effective"] if v["effective"] != "0000-01-01" else (launch_s or (series[0]["d"] if series else None)), "count": len(v["weights"])} for v in versions],
            "errors": errors,
        }
        await perf_col.update_one({"_id": pid}, {"$set": perf}, upsert=True)
        return perf

    def _public(perf: dict) -> dict:
        p = dict(perf)
        p["portfolio_id"] = p.pop("_id", None)
        if isinstance(p.get("as_of"), datetime):
            p["as_of"] = p["as_of"].isoformat()
        return p

    async def _refresh_bg(pid: str):
        if pid in _inflight:
            return
        _inflight.add(pid)
        try:
            await compute(pid)
        except Exception as e:  # noqa: BLE001
            logger.warning("background performance compute failed for %s: %s", pid, e)
        finally:
            _inflight.discard(pid)

    # ---------------- public ----------------
    @router.get("/performance/benchmarks")
    async def benchmarks():
        return {"benchmarks": [{"key": b, "label": BENCH_LABELS[b]} for b in BENCHMARKS], "default": DEFAULT_BENCHMARK}

    @router.get("/portfolios/{pid}/performance")
    async def portfolio_performance(pid: str, background: BackgroundTasks):
        doc = await portfolios.find_one({"id": pid, "status": "approved"}, {"_id": 0, "id": 1})
        if not doc:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        perf = await perf_col.find_one({"_id": pid})
        stale = (not perf) or (perf.get("as_of") and (_now() - perf["as_of"].replace(tzinfo=timezone.utc)) > timedelta(hours=PERF_STALE_HOURS))
        if stale and pid not in _inflight:
            background.add_task(_refresh_bg, pid)
        if not perf:
            return {"portfolio_id": pid, "status": "computing"}
        return _public(perf)

    # ---------------- analyst / admin ----------------
    @router.post("/analyst/portfolios/{pid}/performance/recompute")
    async def analyst_recompute(pid: str, user: dict = Depends(require_analyst)):
        if not await portfolios.find_one({"id": pid, "owner_id": user["id"]}):
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return _public(await compute(pid))

    @router.get("/analyst/portfolios/{pid}/performance")
    async def analyst_performance(pid: str, user: dict = Depends(require_analyst)):
        if not await portfolios.find_one({"id": pid, "owner_id": user["id"]}):
            raise HTTPException(status_code=404, detail="Portfolio not found")
        perf = await perf_col.find_one({"_id": pid})
        return _public(perf) if perf else {"portfolio_id": pid, "status": "not_computed"}

    @router.post("/admin/performance/recompute")
    async def admin_recompute(_: dict = Depends(require_admin)):
        if await _client() is None:
            raise HTTPException(status_code=503, detail="Kite market-data session not connected. Connect it in the Market data tab first.")
        ids = [d["id"] async for d in portfolios.find({"status": {"$in": ["approved", "pending"]}}, {"_id": 0, "id": 1})]
        done, failed = 0, []
        for pid in ids:
            try:
                await compute(pid)
                done += 1
            except Exception as e:  # noqa: BLE001
                failed.append({"id": pid, "error": str(e)[:200]})
        return {"ok": True, "computed": done, "failed": failed}

    return router

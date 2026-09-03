"""Listing performance engine (Listing 2.0).

Performance is COMPUTED, never typed, and it starts on launch day:

* On first approval the listing gets a `launch_price_date` — the date of the
  last NSE close available at the moment of approval (weekends/holidays and
  approvals before the 15:30 close roll back to the previous trading day).
  Every constituent is "bought" at that close; NAV starts at 100 there.
* Buy-and-hold from then on. A rebalance (new `versions` entry) sells and
  re-buys at that day's close, so the track record stays continuous.
* From the NAV series we derive: return since launch, CAGR (after 1 year),
  window returns (1M…5Y, only once the listing is old enough), max drawdown,
  annualised volatility (Low/Med/High after 20 trading days), the same for
  the core-4 benchmark indices, and an auto minimum investment at today's
  prices. There is NO backtest of pre-launch history.
* Refresh is automatic: a cached doc is stale once a newer close exists, and
  the public/analyst endpoints refresh it (background / inline). Nothing for
  a partner to click.

Collections:
  price_history         {_id:"NSE:RELIANCE", token, refreshed_at, candles:[[YYYY-MM-DD, close], ...]}
  portfolio_performance {_id:<portfolio id>, as_of, status, launch_date, launch_price_date, series, metrics, ...}
"""
from __future__ import annotations

import logging
import math
import os
import uuid
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace
from typing import Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

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
RETRY_MINUTES = 30                   # don't hammer Kite when a refresh keeps failing
ENGINE_VERSION = 2                   # bump when the doc shape/rules change; older docs are recomputed on read
IST = timezone(timedelta(hours=5, minutes=30))
MARKET_CLOSE = time(15, 35)          # NSE closes 15:30; candles settle a few minutes later

ENGINE: Optional[SimpleNamespace] = None   # set by build_router(); used by analyst.py hooks


class LaunchFix(BaseModel):
    """Admin correction of a listing's launch / purchase date (module-level so FastAPI resolves it as a body)."""
    launch_date: str
    launch_price_date: Optional[str] = None
    reason: str = ""


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


def ist_today(now_utc: Optional[datetime] = None) -> date:
    return (now_utc or _now()).astimezone(IST).date()


def last_close_date(now_utc: Optional[datetime] = None) -> date:
    """Date of the most recent NSE closing price available at `now`.
    Before the 15:35 IST settle → previous day; weekends → Friday. Exchange
    holidays are handled downstream by taking the last candle on/before this
    date, so this never needs a holiday calendar."""
    now = (now_utc or _now()).astimezone(IST)
    d = now.date()
    if now.time() < MARKET_CLOSE:
        d -= timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


# ----------------------------------------------------------------------------
# Pure math (no I/O) — unit-testable
# ----------------------------------------------------------------------------
def build_nav(versions: List[dict], prices: Dict[str, Dict[str, float]], calendar: List[str]) -> List[dict]:
    """versions: [{effective: 'YYYY-MM-DD', weights: {sym: pct}}] sorted ascending.
    prices: sym -> {date: close}. calendar: sorted trading dates to walk (from
    the benchmark), the first of which is the purchase date.
    Buy-and-hold between versions; NAV = 100 on the first calendar date on
    which every symbol of the first version has a (forward-filled) price."""
    if not versions or not calendar:
        return []
    last: Dict[str, float] = {}
    # prime forward-fill with the latest close on/before the purchase date, so a
    # stock whose exchange skipped that day (BSE vs NSE calendar) still has a price
    first = calendar[0]
    for v in versions:
        for s in v["weights"]:
            if s in last:
                continue
            prior = [d for d in prices.get(s, {}) if d <= first]
            if prior:
                last[s] = prices[s][max(prior)]

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
                # rebalance: sell everything and re-buy the new targets at today's close
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
                continue  # not all constituents have a price yet
            units = {s: (w / 100.0) * 100.0 / current[s] for s, w in weights.items()}
            nav = 100.0
            started = True
            series.append({"d": d, "nav": 100.0})
            continue
        nav = sum(units[s] * (current.get(s) or last.get(s) or 0) for s in units)
        series.append({"d": d, "nav": round(nav, 4)})
    return series


def _metrics(points: List[dict]) -> dict:
    """points: [{d, nav}] ascending. Returns window returns, cagr, drawdown, vol.
    Windows/CAGR/volatility stay None until enough history exists."""
    out = {"start": None, "end": None, "days": 0, "return_pct": None, "cagr_pct": None,
           "windows": {k: None for k in WINDOWS}, "max_drawdown_pct": None, "volatility_pct": None, "volatility_label": None}
    if not points:
        return out
    out.update({"start": points[0]["d"], "end": points[-1]["d"]})
    if len(points) < 2:
        return out
    end_d = date.fromisoformat(points[-1]["d"])
    start_d = date.fromisoformat(points[0]["d"])
    end_nav, start_nav = points[-1]["nav"], points[0]["nav"]
    days = (end_d - start_d).days
    out["days"] = days
    out["return_pct"] = round((end_nav / start_nav - 1) * 100, 2)
    if days >= 365:
        out["cagr_pct"] = round(((end_nav / start_nav) ** (365.0 / days) - 1) * 100, 2)
    for key, wd in WINDOWS.items():
        target = end_d - timedelta(days=wd)
        if target < start_d:
            continue
        base = None
        for p in points:  # first point at/after target date
            if date.fromisoformat(p["d"]) >= target:
                base = p["nav"]
                break
        out["windows"][key] = round((end_nav / base - 1) * 100, 2) if base else None
    peak, mdd = points[0]["nav"], 0.0
    for p in points:
        peak = max(peak, p["nav"])
        mdd = min(mdd, p["nav"] / peak - 1)
    out["max_drawdown_pct"] = round(mdd * 100, 2)
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


def summary(perf: Optional[dict]) -> Optional[dict]:
    """Card-sized view of a performance doc (no series) for list endpoints."""
    if not perf:
        return None
    m = perf.get("metrics") or {}
    bench = (perf.get("bench_metrics") or {}).get(perf.get("benchmark")) or {}
    alpha = None
    if m.get("cagr_pct") is not None and bench.get("cagr_pct") is not None:
        alpha = round(m["cagr_pct"] - bench["cagr_pct"], 2)
    elif m.get("return_pct") is not None and bench.get("return_pct") is not None:
        alpha = round(m["return_pct"] - bench["return_pct"], 2)
    return {
        "status": perf.get("status"), "launch_date": perf.get("launch_date"), "launched_days_ago": perf.get("launched_days_ago"),
        "days": m.get("days") or 0, "return_pct": m.get("return_pct"), "cagr_pct": m.get("cagr_pct"),
        "volatility_label": m.get("volatility_label"), "max_drawdown_pct": m.get("max_drawdown_pct"),
        "benchmark": perf.get("benchmark"), "alpha_pct": alpha,
        "min_investment": (perf.get("min_investment") or {}).get("amount"), "price_date": perf.get("price_date"),
    }


# ----------------------------------------------------------------------------
def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    global ENGINE
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
        """Daily closes up to the last settled close (today's running candle is dropped)."""
        key = f"{exchange}:{sym}"
        cutoff = last_close_date().isoformat()
        cached = await prices_col.find_one({"_id": key})

        def _cut(doc):
            return [c for c in doc["candles"] if c[0] <= cutoff] if doc and doc.get("candles") else None

        fresh = bool(cached and cached.get("refreshed_at") and (_now() - cached["refreshed_at"].replace(tzinfo=timezone.utc)) < timedelta(hours=PRICE_STALE_HOURS))
        has_latest = bool(cached and cached.get("candles") and cached["candles"][-1][0] >= cutoff)
        if cached and (has_latest or (fresh and k is None)):
            return _cut(cached)
        if k is None:
            return _cut(cached)
        inst = await _instrument(sym, exchange)
        if not inst:
            return _cut(cached)
        to_d, from_d = date.today(), date.today() - timedelta(days=HISTORY_DAYS)
        try:
            raw = await run_in_threadpool(k.historical_data, inst["instrument_token"], from_d.isoformat(), to_d.isoformat(), "day")
        except Exception as e:  # noqa: BLE001
            if kite_exceptions is not None and isinstance(e, kite_exceptions.TokenException):
                await sessions.update_one({"account": ACCOUNT}, {"$set": {"needs_reconnect": True}})
            logger.warning("historical fetch failed for %s: %s", key, e)
            return _cut(cached)
        candles = [[str(c["date"])[:10], float(c["close"])] for c in raw if c.get("close")]
        await prices_col.update_one({"_id": key}, {"$set": {"_id": key, "token": inst["instrument_token"], "refreshed_at": _now(), "candles": candles}}, upsert=True)
        return [c for c in candles if c[0] <= cutoff]

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
        if out:  # the first version is what was bought on launch day
            out[0] = {**out[0], "effective": "0000-01-01"}
        return out

    def _launch_price_date(doc: dict) -> Optional[date]:
        d = _parse_date(doc.get("launch_price_date"))
        if d:
            return d
        launch = _parse_date(doc.get("launch_date"))
        if not launch:
            return None
        # legacy docs approved before launch_price_date existed: treat as end-of-day approval
        return last_close_date(datetime.combine(launch, time(23, 0), tzinfo=IST))

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
        price_dates: List[str] = []
        for s in syms:
            c = await _candles(k, s, exch.get(s, "NSE"))
            if not c:
                errors.append(f"No price history for {s}")
                continue
            prices[s] = {d: v for d, v in c}
            latest[s] = c[-1][1]
            price_dates.append(c[-1][0])
        current_w = versions[-1]["weights"] if versions else {}
        launch = _parse_date(doc.get("launch_date"))
        launch_s = launch.isoformat() if launch else None
        lpd_date = _launch_price_date(doc) if launch else None
        base = {"_id": pid, "id": pid, "engine": ENGINE_VERSION, "as_of": _now(), "launch_date": launch_s,
                "launch_price_date": lpd_date.isoformat() if lpd_date else None,
                "launched_days_ago": (ist_today() - launch).days if launch else None,
                "benchmark": doc.get("benchmark") if doc.get("benchmark") in BENCHMARKS else DEFAULT_BENCHMARK,
                "benchmark_labels": BENCH_LABELS, "min_investment": min_investment(current_w, latest),
                "latest_prices": latest, "price_date": max(price_dates) if price_dates else None, "errors": errors}

        if not prices:
            perf = {**base, "status": "unavailable", "errors": errors or ["Market data not connected — ask the admin to connect Kite."]}
            await perf_col.update_one({"_id": pid}, {"$set": perf}, upsert=True)
            return perf
        if not launch:
            # Draft / pending: nothing to track yet — only today's prices and the auto minimum.
            perf = {**base, "status": "not_launched", "versions": [{"effective": None, "count": len(v["weights"])} for v in versions]}
            await perf_col.update_one({"_id": pid}, {"$set": perf}, upsert=True)
            return perf

        bench_series: Dict[str, List[list]] = {}
        for b in BENCHMARKS:
            c = await _candles(k, b, "NSE")
            if c:
                bench_series[b] = c
        calendar_src = bench_series.get(base["benchmark"]) or next(iter(bench_series.values()), None)
        if not calendar_src:
            perf = {**base, "status": "unavailable", "errors": errors + ["Benchmark history unavailable"]}
            await perf_col.update_one({"_id": pid}, {"$set": perf}, upsert=True)
            return perf
        lpd = base["launch_price_date"]
        calendar = [d for d, _ in calendar_src]
        on_or_before = [d for d in calendar if d <= lpd]
        start = on_or_before[-1] if on_or_before else calendar[0]   # purchase date = last close at approval
        live_cal = [d for d in calendar if d >= start]
        series = build_nav(versions, prices, live_cal)
        metrics = _metrics(series)
        bench_out, bench_metrics = {}, {}
        for b, c in bench_series.items():
            pts = [{"d": d, "nav": v} for d, v in c if d >= start]
            if not pts:
                continue
            b0 = pts[0]["nav"]
            norm = [{"d": p["d"], "nav": round(p["nav"] / b0 * 100, 4)} for p in pts]
            bench_out[b] = norm
            bench_metrics[b] = _metrics(norm)
        perf = {
            **base, "status": "ok", "start_date": series[0]["d"] if series else start,
            "series": series, "benchmarks": bench_out, "metrics": metrics, "bench_metrics": bench_metrics,
            "price_date": series[-1]["d"] if series else base["price_date"],
            "versions": [{"effective": v["effective"] if v["effective"] != "0000-01-01" else start, "count": len(v["weights"])} for v in versions],
        }
        await perf_col.update_one({"_id": pid}, {"$set": perf}, upsert=True)
        return perf

    def _is_stale(perf: Optional[dict]) -> bool:
        """Refresh when a newer close exists (or nothing was computed); back off on failures."""
        if not perf or perf.get("engine") != ENGINE_VERSION:
            return True
        as_of = perf.get("as_of")
        age = (_now() - as_of.replace(tzinfo=timezone.utc)) if isinstance(as_of, datetime) else timedelta(days=1)
        if perf.get("status") not in ("ok", "not_launched"):
            return age > timedelta(minutes=RETRY_MINUTES)
        behind = (perf.get("price_date") or "") < last_close_date().isoformat()
        return behind and age > timedelta(minutes=RETRY_MINUTES)

    def _iso_utc(dt) -> Optional[str]:
        """Mongo returns naive UTC datetimes; always emit an explicit offset so browsers parse them correctly."""
        if not isinstance(dt, datetime):
            return None
        return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()

    def _public(perf: dict) -> dict:
        p = dict(perf)
        p["portfolio_id"] = p.pop("_id", None)
        if isinstance(p.get("as_of"), datetime):
            p["as_of"] = _iso_utc(p["as_of"])
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

    async def _refresh_inline(pid: str) -> Optional[dict]:
        if pid in _inflight:
            return await perf_col.find_one({"_id": pid})
        _inflight.add(pid)
        try:
            return await compute(pid)
        except Exception as e:  # noqa: BLE001
            logger.warning("inline performance compute failed for %s: %s", pid, e)
            return await perf_col.find_one({"_id": pid})
        finally:
            _inflight.discard(pid)

    async def summaries(ids: List[str], background: Optional[BackgroundTasks] = None) -> Dict[str, dict]:
        """Card summaries for many listings; schedules refreshes for stale ones."""
        out: Dict[str, dict] = {}
        docs = {d["_id"]: d async for d in perf_col.find({"_id": {"$in": ids}}, {"series": 0, "benchmarks": 0, "latest_prices": 0})}
        scheduled = 0
        for pid in ids:
            perf = docs.get(pid)
            if background is not None and _is_stale(perf) and pid not in _inflight and scheduled < 10:
                background.add_task(_refresh_bg, pid)
                scheduled += 1
            s = summary(perf)
            if s:
                out[pid] = s
        return out

    ENGINE = SimpleNamespace(compute=compute, refresh_bg=_refresh_bg, is_stale=_is_stale, summaries=summaries)

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
        if _is_stale(perf) and pid not in _inflight:
            if perf:
                background.add_task(_refresh_bg, pid)
            else:  # first view after approval: compute inline so the page never shows a blank
                perf = await _refresh_inline(pid)
        if not perf:
            return {"portfolio_id": pid, "status": "computing"}
        return _public(perf)

    # ---------------- analyst / admin ----------------
    @router.get("/analyst/portfolios/{pid}/performance")
    async def analyst_performance(pid: str, user: dict = Depends(require_analyst)):
        """Partner view: auto-refreshes when stale (drafts get a min-investment preview)."""
        if not await portfolios.find_one({"id": pid, "owner_id": user["id"]}):
            raise HTTPException(status_code=404, detail="Portfolio not found")
        perf = await perf_col.find_one({"_id": pid})
        if _is_stale(perf):
            perf = await _refresh_inline(pid) or perf
        return _public(perf) if perf else {"portfolio_id": pid, "status": "unavailable", "errors": ["Market data unavailable right now."]}

    # ---------------- admin: monitor + control ----------------
    async def _kite_status() -> dict:
        row = await sessions.find_one({"account": ACCOUNT})
        return {"connected": bool(row and row.get("access_token") and not row.get("needs_reconnect") and KITE_API_KEY and KiteConnect is not None),
                "needs_reconnect": bool(row and row.get("needs_reconnect")),
                "connected_at": _iso_utc(row.get("connected_at")) if row else None,
                "user_name": row.get("user_name") if row else None}

    async def _engine_rows() -> dict:
        """Everything the admin panel needs: per-listing engine state + data health."""
        expected = last_close_date().isoformat()
        docs = await portfolios.find({"status": {"$in": ["approved", "pending"]}},   # drafts never appear in admin
                                     {"_id": 0, "id": 1, "name": 1, "owner_name": 1, "status": 1, "launch_date": 1, "launch_price_date": 1,
                                      "benchmark": 1, "versions": 1, "constituents": 1, "launch_history": 1, "updated_at": 1}).sort("updated_at", -1).to_list(1000)
        perfs = {d["_id"]: d async for d in perf_col.find({}, {"series": 0, "benchmarks": 0, "latest_prices": 0})}
        cached = {d["_id"] async for d in prices_col.find({}, {"_id": 1})}
        rows, behind, needed = [], [], set()
        for d in docs:
            p = perfs.get(d["id"]) or {}
            s = summary(p) or {}
            syms = [f"{(c.get('exchange') or 'NSE')}:{(c.get('symbol') or '').upper()}" for c in (d.get("constituents") or []) if c.get("symbol")]
            if d["status"] == "approved":
                needed.update(syms)
            is_behind = d["status"] == "approved" and bool(d.get("launch_date")) and ((p.get("price_date") or "") < expected)
            if is_behind:
                behind.append(d["id"])
            rows.append({
                "id": d["id"], "name": d.get("name"), "owner_name": d.get("owner_name"), "status": d["status"],
                "launch_date": d.get("launch_date"), "launch_price_date": d.get("launch_price_date"), "benchmark": d.get("benchmark") or DEFAULT_BENCHMARK,
                "versions": len(d.get("versions") or []) or (1 if d.get("launch_date") else 0), "symbols": syms,
                "perf_status": p.get("status") or "not_computed", "price_date": p.get("price_date"), "start_date": p.get("start_date"),
                "as_of": _iso_utc(p.get("as_of")), "errors": p.get("errors") or [],
                "days": s.get("days") or 0, "return_pct": s.get("return_pct"), "cagr_pct": s.get("cagr_pct"), "alpha_pct": s.get("alpha_pct"),
                "volatility_label": s.get("volatility_label"), "min_investment": s.get("min_investment"), "launched_days_ago": s.get("launched_days_ago"),
                "behind": is_behind, "launch_history": d.get("launch_history") or [],
            })
        failed = sorted(needed - cached)
        for p in perfs.values():
            for e in p.get("errors") or []:
                if e.startswith("No price history for "):
                    sym = e.replace("No price history for ", "").strip()
                    if not any(k.endswith(":" + sym) for k in cached) and sym not in failed:
                        failed.append(sym)
        bench_missing = [b for b in BENCHMARKS if f"NSE:{b}" not in cached]
        return {"expected_close_date": expected, "symbols_cached": len(cached), "listings": rows, "behind": behind,
                "failed_symbols": failed, "benchmarks_missing": bench_missing}

    POLICY = {
        "engine_version": ENGINE_VERSION, "purchase_price": "last NSE close available at approval (before 15:35 IST or weekend → previous trading day)",
        "cagr_after_days": 365, "volatility_after_trading_days": 20, "volatility_bands": {"Low": "< 12% annualised", "Medium": "12–20%", "High": "> 20%"},
        "windows": WINDOWS, "returns_basis": "price returns from exchange closes — bonus/split adjusted, dividends, brokerage and taxes excluded",
        "benchmarks": BENCHMARKS, "history_days": HISTORY_DAYS, "refresh": "automatic after each market close (page views trigger it); approval triggers the first compute",
    }

    @router.get("/admin/performance/overview")
    async def admin_overview(_: dict = Depends(require_admin)):
        data = await _engine_rows()
        audit = await db.audit_log.find({"type": "launch_date_change"}, {"_id": 0}).sort("at", -1).to_list(20)
        return {**data, "kite": await _kite_status(), "policy": POLICY, "audit": audit, "now_ist": datetime.now(IST).isoformat()}

    @router.get("/admin/performance/alerts")
    async def admin_alerts(_: dict = Depends(require_admin)):
        data = await _engine_rows()
        kite = await _kite_status()
        approved = [r for r in data["listings"] if r["status"] == "approved"]
        total = len(data["behind"]) + len(data["failed_symbols"]) + len(data["benchmarks_missing"]) + (0 if (kite["connected"] or not approved) else 1)
        return {"behind": len(data["behind"]), "failed_symbols": len(data["failed_symbols"]), "benchmarks_missing": len(data["benchmarks_missing"]),
                "kite_connected": kite["connected"], "approved": len(approved), "total": total}

    @router.post("/admin/performance/recompute/{pid}")
    async def admin_recompute_one(pid: str, _: dict = Depends(require_admin)):
        if not await portfolios.find_one({"id": pid}, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=404, detail="Portfolio not found")
        perf = await _refresh_inline(pid)
        return {"ok": True, "market_data": "live" if await _client() else "cached", "performance": _public(perf) if perf else None}

    @router.put("/admin/portfolios/{pid}/launch")
    async def admin_set_launch(pid: str, payload: LaunchFix, user: dict = Depends(require_admin)):
        """Correct a listing's launch / purchase date. Requires a reason; logged to audit_log and on the listing."""
        doc = await portfolios.find_one({"id": pid}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        reason = (payload.reason or "").strip()
        if len(reason) < 5:
            raise HTTPException(status_code=422, detail="Give a reason (at least 5 characters) — it is logged with your name.")
        ld = _parse_date(payload.launch_date)
        if not ld:
            raise HTTPException(status_code=422, detail="Launch date must be YYYY-MM-DD")
        lpd = _parse_date(payload.launch_price_date) if payload.launch_price_date else last_close_date(datetime.combine(ld, time(23, 0), tzinfo=IST))
        if not lpd:
            raise HTTPException(status_code=422, detail="Purchase date must be YYYY-MM-DD")
        if lpd > ld:
            raise HTTPException(status_code=422, detail="Purchase (price) date cannot be after the launch date")
        if lpd > last_close_date():
            raise HTTPException(status_code=422, detail=f"No close exists for {lpd.isoformat()} yet — latest available is {last_close_date().isoformat()}")
        if lpd.weekday() >= 5:
            raise HTTPException(status_code=422, detail="Purchase date must be a trading day (Mon–Fri)")
        before = {"launch_date": doc.get("launch_date"), "launch_price_date": doc.get("launch_price_date")}
        after = {"launch_date": ld.isoformat(), "launch_price_date": lpd.isoformat()}
        entry = {"id": str(uuid.uuid4()), "type": "launch_date_change", "portfolio_id": pid, "portfolio_name": doc.get("name"),
                 "before": before, "after": after, "reason": reason, "admin": user.get("email") or user.get("name") or user.get("id"), "at": _now().isoformat()}
        await portfolios.update_one({"id": pid}, {"$set": after, "$push": {"launch_history": entry}})
        await db.audit_log.insert_one(dict(entry))
        perf = await _refresh_inline(pid)
        return {"ok": True, "launch": after, "audit": entry, "performance": _public(perf) if perf else None}

    @router.post("/admin/performance/recompute")
    async def admin_recompute(_: dict = Depends(require_admin)):
        live = await _client() is not None
        ids = [d["id"] async for d in portfolios.find({"status": {"$in": ["approved", "pending"]}}, {"_id": 0, "id": 1})]
        done, failed = 0, []
        for pid in ids:
            try:
                await compute(pid)
                done += 1
            except Exception as e:  # noqa: BLE001
                failed.append({"id": pid, "error": str(e)[:200]})
        return {"ok": True, "computed": done, "failed": failed, "market_data": "live" if live else "cached",
                "note": None if live else "Kite market-data session not connected — recomputed from cached prices; connect it in the Market data tab for today's closes."}

    return router

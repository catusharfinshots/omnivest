import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, RefreshCw, TrendingUp, Activity, ArrowDownRight, IndianRupee, Info } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (v, suffix = '%') => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v}${suffix}`);
const VOL_CLS = { Low: 'bg-[#DCFCE7] text-[#0E9F5E]', Medium: 'bg-[#FEF3C7] text-[#B45309]', High: 'bg-[#FEE2E2] text-[#DC2626]' };

// Partner-side view of the computed performance engine for one listing.
export default function ComputedPerformance({ pid, token }) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const [perf, setPerf] = useState(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pid) return;
    axios.get(`${API}/analyst/portfolios/${pid}/performance`, auth).then(({ data }) => setPerf(data)).catch(() => setPerf(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  const recompute = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/analyst/portfolios/${pid}/performance/recompute`, {}, auth);
      setPerf(data);
      if (data.status === 'ok') toast.success('Performance computed from market data');
      else toast.error(data.errors?.[0] || 'Could not compute performance yet');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not compute performance'); }
    finally { setBusy(false); }
  };

  if (!pid) return null;
  const ok = perf && perf.status === 'ok';
  const live = ok ? perf.metrics.live : null;
  const all = ok ? perf.metrics.all : null;
  const useLive = live && live.days >= 30;
  const m = useLive ? live : all;
  const bench = ok ? perf.bench_metrics?.[perf.benchmark]?.[useLive ? 'live' : 'all'] : null;
  const alpha = m && bench && m.cagr_pct !== null && bench.cagr_pct !== null ? +(m.cagr_pct - bench.cagr_pct).toFixed(2) : null;

  return (
    <section className="surface p-6" data-testid="computed-performance">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-[#6C2BD9]" /> Computed performance</div>
          <div className="text-xs text-[#6B6480] mt-0.5">Calculated by Omnivest from exchange price history of your constituents — investors see these numbers, not typed ones.</div>
        </div>
        <button type="button" onClick={recompute} disabled={busy} className="btn-outline text-xs" data-testid="compute-performance">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {perf && perf.status === 'ok' ? 'Recompute' : 'Compute now'}
        </button>
      </div>

      {perf === undefined && <div className="mt-4 text-xs text-[#94A3B8]">Loading…</div>}
      {perf && perf.status !== 'ok' && (
        <div className="mt-4 rounded-xl border border-dashed border-[#E8E1F0] p-4 text-xs text-[#64748B]">
          {perf.status === 'not_computed'
            ? 'Not computed yet — save your constituents, then click Compute now.'
            : (perf.errors?.[0] || 'Market data unavailable right now.')}
        </div>
      )}

      {ok && m && (
        <>
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl bg-[#F8FAFC] p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">CAGR {useLive ? '(live)' : '(backtest)'}</div>
              <div className="mt-1 text-2xl font-bold text-[#0E9F5E] flex items-center gap-1"><TrendingUp className="h-5 w-5" /> {m.cagr_pct !== null ? fmt(m.cagr_pct) : fmt(m.return_pct)}</div>
              {m.cagr_pct === null && <div className="text-[10px] text-[#94A3B8]">absolute return · under 1 year of data</div>}
            </div>
            <div className="rounded-xl bg-[#F8FAFC] p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">vs {perf.benchmark_labels?.[perf.benchmark] || perf.benchmark}</div>
              <div className={`mt-1 text-2xl font-bold ${alpha === null ? 'text-[#94A3B8]' : alpha >= 0 ? 'text-[#0E9F5E]' : 'text-[#DC2626]'}`}>{alpha === null ? '—' : fmt(alpha)}</div>
              <div className="text-[10px] text-[#94A3B8]">benchmark CAGR {bench ? fmt(bench.cagr_pct) : '—'}</div>
            </div>
            <div className="rounded-xl bg-[#F8FAFC] p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Volatility</div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${VOL_CLS[m.volatility_label] || 'bg-[#F1F5F9] text-[#64748B]'}`}>{m.volatility_label || '—'}</span>
                <span className="text-xs text-[#64748B]">{m.volatility_pct !== null ? `${m.volatility_pct}% ann.` : ''}</span>
              </div>
              <div className="mt-1 text-[10px] text-[#94A3B8] flex items-center gap-1"><ArrowDownRight className="h-3 w-3" /> max drawdown {fmt(m.max_drawdown_pct)}</div>
            </div>
            <div className="rounded-xl bg-[#F8FAFC] p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Auto min. investment</div>
              <div className="mt-1 text-2xl font-bold text-[#1A1030] flex items-center gap-0.5"><IndianRupee className="h-5 w-5" />{perf.min_investment ? perf.min_investment.amount.toLocaleString('en-IN') : '—'}</div>
              <div className="text-[10px] text-[#94A3B8]">1+ share of every constituent</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {['1M', '3M', '6M', '1Y', '3Y', '5Y'].map((w) => (
              <div key={w} className="rounded-lg border border-[#F1EBF9] py-2">
                <div className="text-[10px] font-bold text-[#94A3B8]">{w}</div>
                <div className={`text-sm font-semibold ${m.windows[w] === null ? 'text-[#CBD5E1]' : m.windows[w] >= 0 ? 'text-[#0E9F5E]' : 'text-[#DC2626]'}`}>{fmt(m.windows[w])}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-start gap-1.5 text-[11px] text-[#94A3B8]">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              {perf.launch_date
                ? `Live track record since ${perf.launch_date}${useLive ? '' : ' (under 30 days — showing backtested history, clearly labelled to investors)'}. `
                : 'Not approved yet — figures are a backtest of the current weights. '}
              Prices as of {perf.price_date} · {perf.series?.length || 0} trading days · {(perf.versions || []).length} version{(perf.versions || []).length === 1 ? '' : 's'}.
            </span>
          </div>
        </>
      )}
    </section>
  );
}

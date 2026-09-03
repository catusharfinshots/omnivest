import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Activity, ArrowDownRight, CalendarCheck, IndianRupee, Info, Lock, TrendingDown, TrendingUp } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (v, suffix = '%') => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v}${suffix}`);
const VOL_CLS = { Low: 'bg-[#DCFCE7] text-[#0E9F5E]', Medium: 'bg-[#FEF3C7] text-[#B45309]', High: 'bg-[#FEE2E2] text-[#DC2626]' };
const WINDOW_NEEDS = { '1M': '1 month', '3M': '3 months', '6M': '6 months', '1Y': '1 year', '3Y': '3 years', '5Y': '5 years' };
const nice = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function Tile({ label, children, sub }) {
  return (
    <div className="rounded-xl bg-[#F8FAFC] p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">{label}</div>
      <div className="mt-1">{children}</div>
      {sub && <div className="mt-0.5 text-[10px] text-[#94A3B8]">{sub}</div>}
    </div>
  );
}

// Partner-side view of the computed performance engine for one listing.
// Fully automatic: the track record starts at the last close on approval day
// and refreshes itself after every market close. Nothing to click.
export default function ComputedPerformance({ pid, token }) {
  const [perf, setPerf] = useState(undefined);

  useEffect(() => {
    if (!pid) return;
    let active = true;
    setPerf(undefined);
    axios.get(`${API}/analyst/portfolios/${pid}/performance`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => { if (active) setPerf(data); })
      .catch(() => { if (active) setPerf(null); });
    return () => { active = false; };
  }, [pid, token]);

  if (!pid) return null;
  const ok = perf && perf.status === 'ok';
  const m = ok ? perf.metrics : null;
  const bench = ok ? perf.bench_metrics?.[perf.benchmark] : null;
  const benchLabel = perf?.benchmark_labels?.[perf?.benchmark] || perf?.benchmark || 'benchmark';
  const useCagr = m && m.cagr_pct !== null;
  const headline = m ? (useCagr ? m.cagr_pct : m.return_pct) : null;
  const benchHeadline = bench ? (useCagr ? bench.cagr_pct : bench.return_pct) : null;
  const alpha = headline !== null && benchHeadline !== null && benchHeadline !== undefined ? +(headline - benchHeadline).toFixed(2) : null;
  const minInv = perf?.min_investment;

  return (
    <section className="surface p-6" data-testid="computed-performance">
      <div>
        <div className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-[#6C2BD9]" /> Computed performance</div>
        <div className="text-xs text-[#6B6480] mt-0.5">
          Calculated by Omnivest from exchange closing prices, starting the day your listing is approved. Investors see these numbers — you never type returns.
        </div>
      </div>

      {perf === undefined && <div className="mt-4 text-xs text-[#94A3B8]">Loading market data…</div>}

      {(perf === null || (perf && perf.status === 'unavailable')) && (
        <div className="mt-4 rounded-xl border border-dashed border-[#E8E1F0] p-4 text-xs text-[#64748B]">
          {perf?.errors?.[0] || 'Market data unavailable right now — figures will appear automatically once it reconnects.'}
        </div>
      )}

      {perf && perf.status === 'not_launched' && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] items-stretch">
          <div className="rounded-xl border border-[#E8E1F0] bg-[#FBF9FE] p-4 flex gap-3">
            <CalendarCheck className="h-5 w-5 text-[#6C2BD9] shrink-0 mt-0.5" />
            <div className="text-xs text-[#4B4560] leading-relaxed">
              <div className="font-semibold text-[#1A1030] text-sm">Your track record starts on the day of approval</div>
              On approval, every constituent is “bought” at that day's closing price. From then on returns, CAGR (after 1 year),
              volatility and benchmark comparison update automatically after each market close.
            </div>
          </div>
          <Tile label="Auto min. investment" sub={minInv ? `1+ share of every constituent · prices ${nice(perf.price_date)}` : 'save constituents to see'}>
            <div className="text-2xl font-bold text-[#1A1030] flex items-center gap-0.5"><IndianRupee className="h-5 w-5" />{minInv ? minInv.amount.toLocaleString('en-IN') : '—'}</div>
          </Tile>
        </div>
      )}

      {ok && m && (
        <>
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label={useCagr ? 'CAGR (live)' : 'Since launch'}
              sub={useCagr ? `${m.days} days live` : (m.days > 0 ? `${m.days} days live · CAGR appears after 1 year` : 'first close after launch pending')}>
              <div className={`text-2xl font-bold flex items-center gap-1 ${headline === null ? 'text-[#6C2BD9]' : headline < 0 ? 'text-[#DC2626]' : 'text-[#0E9F5E]'}`}>
                {headline !== null && headline < 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />} {headline === null ? 'New' : fmt(headline)}
              </div>
            </Tile>
            <Tile label={`vs ${benchLabel}`} sub={`${benchLabel} ${useCagr ? 'CAGR' : 'since launch'} ${fmt(benchHeadline)}`}>
              <div className={`text-2xl font-bold ${alpha === null ? 'text-[#94A3B8]' : alpha >= 0 ? 'text-[#0E9F5E]' : 'text-[#DC2626]'}`}>{alpha === null ? '—' : fmt(alpha)}</div>
            </Tile>
            <Tile label="Volatility" sub={m.max_drawdown_pct !== null ? <span className="inline-flex items-center gap-1"><ArrowDownRight className="h-3 w-3" /> max drawdown {fmt(m.max_drawdown_pct)}</span> : null}>
              {m.volatility_label ? (
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${VOL_CLS[m.volatility_label]}`}>{m.volatility_label}</span>
                  <span className="text-xs text-[#64748B]">{m.volatility_pct}% ann.</span>
                </div>
              ) : <div className="text-xs text-[#94A3B8] pt-1">after 20 trading days</div>}
            </Tile>
            <Tile label="Auto min. investment" sub="1+ share of every constituent">
              <div className="text-2xl font-bold text-[#1A1030] flex items-center gap-0.5"><IndianRupee className="h-5 w-5" />{minInv ? minInv.amount.toLocaleString('en-IN') : '—'}</div>
            </Tile>
          </div>

          <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {Object.keys(WINDOW_NEEDS).map((w) => {
              const v = m.windows?.[w];
              const has = v !== null && v !== undefined;
              return (
                <div key={w} className={`rounded-lg border py-2 ${has ? 'border-[#F1EBF9]' : 'border-dashed border-[#EEF1F6]'}`} title={has ? '' : `Available once the listing is ${WINDOW_NEEDS[w]} old`}>
                  <div className="text-[10px] font-bold text-[#94A3B8]">{w}</div>
                  {has
                    ? <div className={`text-sm font-semibold ${v >= 0 ? 'text-[#0E9F5E]' : 'text-[#DC2626]'}`}>{fmt(v)}</div>
                    : <div className="text-[#CBD5E1] flex justify-center pt-0.5"><Lock className="h-3.5 w-3.5" /></div>}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-start gap-1.5 text-[11px] text-[#94A3B8]">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Launched {nice(perf.launch_date)} · bought at {nice(perf.start_date)} close · prices as of {nice(perf.price_date)} ·{' '}
              {(perf.versions || []).length} version{(perf.versions || []).length === 1 ? '' : 's'}. Updates automatically after every market close.
            </span>
          </div>
        </>
      )}
    </section>
  );
}

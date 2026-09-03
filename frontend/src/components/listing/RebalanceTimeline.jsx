import React from 'react';
import { Rocket, RefreshCw, CalendarClock } from 'lucide-react';

const nice = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const weights = (cons) => Object.fromEntries((cons || []).filter((c) => c.symbol).map((c) => [String(c.symbol).toUpperCase(), Number(c.weight) || 0]));
const NEXT = { Monthly: 1, Quarterly: 3, 'Half-yearly': 6, Yearly: 12 };

function diff(prev, next) {
  const a = weights(prev), b = weights(next);
  const syms = new Set([...Object.keys(a), ...Object.keys(b)]);
  let added = 0, removed = 0, changed = 0;
  syms.forEach((s) => { if (a[s] === undefined) added += 1; else if (b[s] === undefined) removed += 1; else if (a[s] !== b[s]) changed += 1; });
  return { added, removed, changed };
}

// smallcase-style rebalance timeline built from the listing's version history.
export default function RebalanceTimeline({ basket }) {
  if (!basket?.launch_date) return null;
  const versions = basket.versions?.length ? basket.versions : [{ effective_date: basket.launch_date, constituents: basket.constituents }];
  const events = versions.map((v, i) => ({
    date: v.effective_date, first: i === 0,
    change: i === 0 ? null : diff(versions[i - 1].constituents, v.constituents),
  }));
  const months = NEXT[basket.rebalanceFreq];
  let next = null;
  if (months) {
    const d = new Date(`${String(events[events.length - 1].date).slice(0, 10)}T00:00:00`);
    d.setMonth(d.getMonth() + months);
    next = d.toISOString().slice(0, 10);
  }
  return (
    <div className="surface p-5" data-testid="rebalance-timeline">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-base font-semibold">Rebalance timeline</h3>
        <div className="text-xs text-[#64748B]">Reviewed <b>{(basket.rebalanceFreq || 'quarterly').toLowerCase()}</b> · {events.length - 1} rebalance{events.length - 1 === 1 ? '' : 's'} since launch</div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <ol className="flex items-start gap-6 min-w-max pb-1">
          {events.map((e, i) => (
            <li key={i} className="relative flex flex-col items-center text-center w-28">
              {i < events.length - 1 || next ? <span className="absolute top-4 left-1/2 w-[calc(100%+1.5rem)] h-px bg-[#E8E1F0]" /> : null}
              <span className={`relative z-10 h-8 w-8 rounded-full grid place-items-center ${e.first ? 'grad-card text-white' : 'bg-[#DCFCE7] text-[#0E9F5E]'}`}>{e.first ? <Rocket className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}</span>
              <div className="mt-2 text-xs font-semibold text-[#1A1030]">{nice(e.date)}</div>
              <div className="text-[11px] text-[#64748B]">{e.first ? 'Went live' : 'Constituents updated'}</div>
              {e.change && (
                <div className="mt-1 flex gap-1 text-[10px] font-bold">
                  {e.change.added > 0 && <span className="rounded-full bg-[#DCFCE7] text-[#0E9F5E] px-1.5">+{e.change.added}</span>}
                  {e.change.removed > 0 && <span className="rounded-full bg-[#FEE2E2] text-[#DC2626] px-1.5">−{e.change.removed}</span>}
                  {e.change.changed > 0 && <span className="rounded-full bg-[#FEF3C7] text-[#B45309] px-1.5">~{e.change.changed}</span>}
                </div>
              )}
            </li>
          ))}
          {next && (
            <li className="relative flex flex-col items-center text-center w-28">
              <span className="relative z-10 h-8 w-8 rounded-full grid place-items-center bg-[#F1F1F4] text-[#6B6480] border border-dashed border-[#CBD5E1]"><CalendarClock className="h-4 w-4" /></span>
              <div className="mt-2 text-xs font-semibold text-[#1A1030]">{nice(next)}</div>
              <div className="text-[11px] text-[#64748B]">Next review</div>
            </li>
          )}
        </ol>
      </div>
      <div className="mt-2 text-[11px] text-[#94A3B8]">Each rebalance is applied at that day's closing prices, so the track record stays continuous.</div>
    </div>
  );
}

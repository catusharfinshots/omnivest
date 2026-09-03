import React from 'react';
import { ArrowRight, CalendarCheck, GitCommitHorizontal } from 'lucide-react';

const nice = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const weights = (cons) => Object.fromEntries((cons || []).filter((c) => c.symbol).map((c) => [String(c.symbol).toUpperCase(), Number(c.weight) || 0]));

// Admin review card helper: shows launch info and, for a post-launch rebalance,
// exactly what changed between the last approved version and the new one.
export default function VersionDiff({ p }) {
  if (!p?.launch_date) return null;
  const versions = p.versions || [];
  const prev = versions.length >= 2 ? versions[versions.length - 2] : versions.length === 1 ? versions[0] : null;
  const next = versions.length >= 2 ? versions[versions.length - 1] : null;
  const isRebalance = !!(prev && next && p.status !== 'approved');
  if (!isRebalance) {
    return (
      <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-[#6B6480]" data-testid="launch-info">
        <CalendarCheck className="h-3 w-3 text-[#6C2BD9]" /> Live since {nice(p.launch_date)} · bought at {nice(p.launch_price_date || p.launch_date)} close · {Math.max(1, versions.length)} version{versions.length > 1 ? 's' : ''}
      </div>
    );
  }
  const a = weights(prev.constituents), b = weights(next.constituents);
  const syms = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  const rows = syms.map((s) => ({ s, from: a[s], to: b[s], kind: a[s] === undefined ? 'added' : b[s] === undefined ? 'removed' : a[s] !== b[s] ? 'changed' : 'same' })).filter((r) => r.kind !== 'same');
  return (
    <div className="mt-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-2.5 text-[11px]" data-testid="rebalance-diff">
      <div className="flex items-center gap-1.5 font-semibold text-[#92400E]">
        <GitCommitHorizontal className="h-3.5 w-3.5" /> Rebalance — version {versions.length} · effective {nice(next.effective_date)} close · live since {nice(p.launch_date)}
      </div>
      <div className="mt-1.5 grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[#4B4560]">
        {rows.map((r) => (
          <div key={r.s} className="flex items-center gap-1.5">
            <span className="font-semibold text-[#1A1030] w-24 truncate">{r.s}</span>
            {r.kind === 'added' && <span className="text-[#0E9F5E]">added at {r.to}%</span>}
            {r.kind === 'removed' && <span className="text-[#DC2626]">removed (was {r.from}%)</span>}
            {r.kind === 'changed' && <span className="inline-flex items-center gap-1">{r.from}% <ArrowRight className="h-3 w-3 text-[#94A3B8]" /> <b className={r.to > r.from ? 'text-[#0E9F5E]' : 'text-[#DC2626]'}>{r.to}%</b></span>}
          </div>
        ))}
        {rows.length === 0 && <div className="text-[#6B6480]">No weight changes (same constituents).</div>}
      </div>
      <div className="mt-1.5 text-[#92400E]">Approving keeps the track record continuous — the engine sells and re-buys at that day's close.</div>
    </div>
  );
}

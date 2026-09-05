import React from 'react';
import { Lock } from 'lucide-react';

const CAP_COLORS = { Large: '#6C2BD9', Mid: '#A78BFA', Small: '#F59E0B', Micro: '#F97316', Other: '#CBD5E1' };
const INR = (n) => (n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

// Weights table + market-cap / sector distribution (from the engine's classification).
export default function HoldingsSection({ basket, perf, onSubscribe, plan, interestSent }) {
  const cons = basket.constituents || [];
  const locked = !!basket.holdings_locked;
  const count = basket.holdings_count ?? cons.length;
  const prices = perf?.latest_prices || {};
  const dist = perf?.distribution;
  const capEntries = dist?.cap ? Object.entries(dist.cap) : [];
  const sectorEntries = dist?.sector ? Object.entries(dist.sector).slice(0, 6) : [];
  const maxW = Math.max(1, ...cons.map((c) => Number(c.weight) || 0));

  return (
    <div className="space-y-5" data-testid="holdings-section">
      {(capEntries.length > 0 || sectorEntries.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {capEntries.length > 0 && (
            <div className="surface p-5">
              <h3 className="text-base font-semibold">Holdings distribution</h3>
              <div className="text-xs text-[#526071]">By market cap, from NSE index membership</div>
              <div className="mt-3 h-3 rounded-full overflow-hidden flex bg-[#F1F1F4]">
                {capEntries.map(([k, v]) => <div key={k} style={{ width: `${Math.min(100, v)}%`, background: CAP_COLORS[k] || '#CBD5E1' }} title={`${k} ${v}%`} />)}
              </div>
              <div className="mt-3 space-y-1.5">
                {capEntries.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-[#475569]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CAP_COLORS[k] || '#CBD5E1' }} /> {k === 'Other' ? 'Other / unclassified' : `${k} cap`}</span>
                    <span className="num font-semibold text-[#0F1729]">{v.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {sectorEntries.length > 0 && (
            <div className="surface p-5">
              <h3 className="text-base font-semibold">Sector exposure</h3>
              <div className="text-xs text-[#526071]">Top sectors by weight</div>
              <div className="mt-3 space-y-2">
                {sectorEntries.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3 text-sm">
                    <span className="w-40 truncate text-[#475569]" title={k}>{k}</span>
                    <div className="flex-1 h-2 rounded-full bg-[#F1F1F4] overflow-hidden"><div className="h-full grad-card" style={{ width: `${Math.min(100, v)}%` }} /></div>
                    <span className="num w-14 text-right font-semibold text-[#0F1729]">{v.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {locked && (
        // Server sends no names, symbols or prices for a paid listing until subscribed; these rows are pure placeholders.
        <div className="surface relative overflow-hidden" data-testid="holdings-locked">
          <div className="px-4 py-3 bg-[#F5F7FB] text-[#526071] text-sm flex items-center justify-between"><span>Constituent</span><span>Weight</span></div>
          <div aria-hidden="true" className="select-none">
            {Array.from({ length: Math.min(Math.max(count, 6), 8) }).map((_, i) => (
              <div key={i} className="border-t border-[#EEF1F6] px-4 py-3 flex items-center justify-between">
                <div><div className="h-3.5 rounded bg-[#E2E8F0]" style={{ width: `${120 + ((i * 37) % 80)}px` }} /><div className="mt-1.5 h-2.5 w-16 rounded bg-[#EEF1F6]" /></div>
                <div className="flex items-center gap-2"><div className="h-1.5 w-24 rounded-full bg-[#EEF1F6]" /><div className="h-3.5 w-10 rounded bg-[#E2E8F0]" /></div>
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 top-11 bg-gradient-to-b from-white/30 via-white/85 to-white flex items-center justify-center px-4 py-6">
            <div className="text-center max-w-sm">
              <div className="mx-auto h-10 w-10 rounded-full bg-[#E3F4EB] text-[#096B3E] grid place-items-center"><Lock className="h-5 w-5" /></div>
              <div className="mt-2 text-[15px] font-bold text-[#0F1729]">{count} {basket.holdings_kind || 'stocks'}{basket.top_weight_pct ? ` · largest weight ${basket.top_weight_pct}%` : ''}</div>
              <div className="mt-1 text-[13px] text-[#526071]">Names, weights and prices unlock on subscribing. Performance, sector split and rebalance dates stay public.</div>
              {interestSent ? (
                <div className="mt-3 text-[13px] font-semibold text-[#1D4ED8]">Request received — we'll confirm shortly.</div>
              ) : (
                <button type="button" onClick={onSubscribe} className="btn-primary mt-3" data-testid="holdings-subscribe"><Lock className="h-4 w-4" /> Subscribe{plan ? ` · from ₹${Math.round(plan.price / plan.months).toLocaleString('en-IN')}/mo` : ''}</button>
              )}
            </div>
          </div>
        </div>
      )}
      {!locked && (
      <div className="surface overflow-x-auto">
        <table className="w-full text-sm" data-testid="weights-table">
          <thead className="bg-[#F5F7FB] text-[#526071]">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Constituent</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium text-right">Last close (₹)</th>
              <th className="px-4 py-3 font-medium text-right">Weight</th>
            </tr>
          </thead>
          <tbody>
            {cons.map((c) => {
              const sym = String(c.symbol || '').toUpperCase();
              return (
                <tr key={sym} className="border-t border-[#EEF1F6]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#0F1729]">{c.name}</div>
                    <div className="text-xs text-[#667085]">{sym} · {c.exchange || 'NSE'}</div>
                  </td>
                  <td className="px-4 py-3 text-[#526071]">{c.type}</td>
                  <td className="px-4 py-3 text-right num">{INR(prices[sym])}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="h-1.5 w-24 rounded-full bg-[#EEF1F6] overflow-hidden"><div className="h-full grad-card" style={{ width: `${Math.min(100, (Number(c.weight) / maxW) * 100)}%` }} /></div>
                      <span className="num font-semibold w-12 text-right">{Number(c.weight)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {perf?.price_date && <div className="px-4 py-2 text-[12px] text-[#667085] border-t border-[#EEF1F6]">Closing prices as of {perf.price_date}. Weights are the partner's targets; your actual quantities depend on the amount you invest.</div>}
      </div>
      )}
    </div>
  );
}

import React from 'react';

const CAP_COLORS = { Large: '#6C2BD9', Mid: '#A78BFA', Small: '#F59E0B', Micro: '#F97316', Other: '#CBD5E1' };
const INR = (n) => (n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

// Weights table + market-cap / sector distribution (from the engine's classification).
export default function HoldingsSection({ basket, perf }) {
  const cons = basket.constituents || [];
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
              <div className="text-xs text-[#64748B]">By market cap, from NSE index membership</div>
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
              <div className="text-xs text-[#64748B]">Top sectors by weight</div>
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

      <div className="surface overflow-x-auto">
        <table className="w-full text-sm" data-testid="weights-table">
          <thead className="bg-[#F5F7FB] text-[#64748B]">
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
                    <div className="text-xs text-[#94A3B8]">{sym} · {c.exchange || 'NSE'}</div>
                  </td>
                  <td className="px-4 py-3 text-[#64748B]">{c.type}</td>
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
        {perf?.price_date && <div className="px-4 py-2 text-[11px] text-[#94A3B8] border-t border-[#EEF1F6]">Closing prices as of {perf.price_date}. Weights are the partner's targets; your actual quantities depend on the amount you invest.</div>}
      </div>
    </div>
  );
}

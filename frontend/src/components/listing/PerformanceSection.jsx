import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart } from 'recharts';
import { HelpCircle, TrendingUp, TrendingDown, CalendarCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

const RANGES = [{ k: '1M', d: 30 }, { k: '6M', d: 182 }, { k: '1Y', d: 365 }, { k: '3Y', d: 1095 }, { k: '5Y', d: 1825 }, { k: 'MAX', d: null }];
const INR = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const pct = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`);
const nice = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
const SIP_AMOUNT = 10000;

function slice(series, days) {
  if (!series?.length) return [];
  if (!days) return series;
  const end = new Date(`${series[series.length - 1].d}T00:00:00`);
  const start = new Date(end); start.setDate(start.getDate() - days);
  const iso = start.toISOString().slice(0, 10);
  const out = series.filter((p) => p.d >= iso);
  return out.length >= 2 ? out : series;
}
function rebase(points) {
  if (!points.length) return [];
  const b = points[0].nav || 1;
  return points.map((p) => ({ d: p.d, v: (p.nav / b) * 100 }));
}
// Monthly SIP simulation: buy on the first trading day of each month at that day's NAV.
function sip(points) {
  if (!points.length) return [];
  let units = 0, invested = 0, lastMonth = null;
  return points.map((p) => {
    const m = p.d.slice(0, 7);
    if (m !== lastMonth) { units += SIP_AMOUNT / p.nav; invested += SIP_AMOUNT; lastMonth = m; }
    return { d: p.d, v: units * p.nav, invested };
  });
}

// Investor-facing performance block: growth-of-100 (or SIP) for the listing vs a benchmark,
// switchable ranges, "how is this calculated" explainer. Everything comes from the engine doc.
export default function PerformanceSection({ perf, name }) {
  const [range, setRange] = useState('1Y');
  const [compare, setCompare] = useState(null);
  const [mode, setMode] = useState('growth');
  const [howOpen, setHowOpen] = useState(false);

  const ok = perf && perf.status === 'ok' && (perf.series || []).length >= 2;
  const benchKeys = ok ? Object.keys(perf.benchmarks || {}) : [];
  const labels = perf?.benchmark_labels || {};
  const days = RANGES.find((r) => r.k === range)?.d ?? null;
  const available = useMemo(() => {
    if (!ok) return new Set();
    const total = perf.metrics?.days || 0;
    return new Set(RANGES.filter((r) => !r.d || r.d <= total + 3).map((r) => r.k));
  }, [ok, perf]);
  const effRange = available.has(range) ? range : 'MAX';
  const effDays = RANGES.find((r) => r.k === effRange)?.d ?? null;

  const data = useMemo(() => {
    if (!ok) return [];
    const base = slice(perf.series, effDays);
    const b = compare && perf.benchmarks?.[compare] ? slice(perf.benchmarks[compare], effDays).filter((p) => p.d >= base[0].d) : null;
    const a = mode === 'sip' ? sip(base) : rebase(base);
    const bm = b ? (mode === 'sip' ? sip(b) : rebase(b)) : null;
    const bmap = new Map((bm || []).map((p) => [p.d, p]));
    return a.map((p) => ({ d: p.d, v: +p.v.toFixed(2), invested: p.invested, b: bmap.get(p.d)?.v !== undefined ? +bmap.get(p.d).v.toFixed(2) : undefined }));
  }, [ok, perf, effDays, compare, mode]);

  const first = data[0], last = data[data.length - 1];
  const ret = first && last ? (mode === 'sip' ? ((last.v / last.invested) - 1) * 100 : ((last.v / first.v) - 1) * 100) : null;
  const bret = first && last && last.b !== undefined && first.b !== undefined ? (mode === 'sip' ? ((last.b / last.invested) - 1) * 100 : ((last.b / first.b) - 1) * 100) : null;
  const up = (ret ?? 0) >= 0;

  return (
    <section className="surface p-5" data-testid="performance-section">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">Performance
            <button type="button" onClick={() => setHowOpen(true)} className="text-[#667085] hover:text-[#6C2BD9]" title="How is this calculated?" data-testid="how-calculated"><HelpCircle className="h-4 w-4" /></button>
          </h3>
          <div className="text-xs text-[#526071]">{ok ? `Live track record since ${nice(perf.start_date)} · prices as of ${nice(perf.price_date)}` : 'Live track record starts on the day of approval.'}</div>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-[#F1F1F4] p-0.5 text-xs">
          {[['growth', 'Growth of ₹100'], ['sip', `SIP ${INR(SIP_AMOUNT)}/mo`]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-full px-3 py-1 font-semibold ${mode === k ? 'bg-white shadow text-[#5320A8]' : 'text-[#526071]'}`}>{l}</button>
          ))}
        </div>
      </div>

      {!ok ? (
        <div className="mt-5 rounded-xl border border-dashed border-[#E8E1F0] p-6 text-center">
          <CalendarCheck className="h-6 w-6 mx-auto text-[#6C2BD9]" />
          <div className="mt-2 text-sm font-semibold text-[#1A1030]">{perf?.launched_days_ago === 0 ? 'Launched today' : 'Track record building'}</div>
          <div className="text-xs text-[#526071] mt-1">The chart appears after the first market close following approval. No backtests — only what actually happened.</div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085]">{name}</div>
                <div className={`text-xl font-bold flex items-center gap-1 ${up ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'}`}>{up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />} {pct(ret)}</div>
              </div>
              {compare && (
                <div>
                  <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085]">{labels[compare] || compare}</div>
                  <div className={`text-xl font-bold ${(bret ?? 0) >= 0 ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'}`}>{pct(bret)}</div>
                </div>
              )}
              <div className="text-xs text-[#526071]">
                <select value={compare || ''} onChange={(e) => setCompare(e.target.value || null)} className="h-8 rounded-lg border border-[#E8E1F0] px-2 text-xs bg-white" data-testid="compare-select">
                  <option value="">Compare with…</option>
                  {benchKeys.map((b) => <option key={b} value={b}>{labels[b] || b}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-1" data-testid="range-buttons">
              {RANGES.map((r) => (
                <button key={r.k} type="button" disabled={!available.has(r.k)} onClick={() => setRange(r.k)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${effRange === r.k ? 'bg-[#6C2BD9] text-white' : 'text-[#526071] hover:bg-[#F1E7FE]'} disabled:opacity-30 disabled:hover:bg-transparent`}
                  title={available.has(r.k) ? '' : 'Not enough live history yet'}>{r.k}</button>
              ))}
            </div>
          </div>

          <div className="mt-4 h-64" data-testid="performance-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6C2BD9" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#6C2BD9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#F1EBF9" />
                <XAxis dataKey="d" tickFormatter={nice} tick={{ fontSize: 10, fill: '#94A3B8' }} minTickGap={40} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={48} domain={['auto', 'auto']} tickFormatter={(v) => (mode === 'sip' ? `${Math.round(v / 1000)}k` : v.toFixed(0))} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #E8E1F0', fontSize: 12 }}
                  labelFormatter={(d) => nice(d)}
                  formatter={(val, key) => [mode === 'sip' ? INR(val) : val.toFixed(2), key === 'v' ? name : key === 'b' ? (labels[compare] || compare) : 'Invested']}
                />
                <Area type="monotone" dataKey="v" stroke="#6C2BD9" strokeWidth={2} fill="url(#perfFill)" dot={data.length < 40} isAnimationActive={false} />
                {compare && <Line type="monotone" dataKey="b" stroke="#F59E0B" strokeWidth={1.5} dot={false} strokeDasharray="4 3" isAnimationActive={false} />}
                {mode === 'sip' && <Line type="stepAfter" dataKey="invested" stroke="#94A3B8" strokeWidth={1} dot={false} isAnimationActive={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#526071]">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded bg-[#6C2BD9]" /> {name}</span>
            {compare && <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-[#F59E0B]" /> {labels[compare] || compare}</span>}
            {mode === 'sip' && <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-[#94A3B8]" /> Amount invested ({INR(last?.invested)})</span>}
          </div>
        </>
      )}

      <Dialog open={howOpen} onOpenChange={setHowOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>How is performance calculated?</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm text-[#475569]">
            <p><b className="text-[#1A1030]">Starts on launch day.</b> When Omnivest approves a portfolio, every stock is “bought” at that day's NSE closing price at the partner's weights. That is day zero — there is no backtest of what might have happened earlier.</p>
            <p><b className="text-[#1A1030]">Growth of ₹100.</b> The line shows what ₹100 invested on day zero is worth each day, using official closing prices. Rebalances sell and re-buy at that day's close, so the line never resets.</p>
            <p><b className="text-[#1A1030]">CAGR</b> is shown once the portfolio is a year old; before that you see the plain return since launch. <b className="text-[#1A1030]">Volatility</b> is the annualised day-to-day swing (Low under 12%, Medium 12–20%, High above 20%).</p>
            <p><b className="text-[#1A1030]">SIP mode</b> assumes ₹10,000 invested on the first trading day of every month over the selected range and compares the value with the amount put in.</p>
            <p><b className="text-[#1A1030]">Benchmarks</b> are NSE indices treated the same way, so the comparison is like-for-like. Figures are price returns: bonus and split adjusted, but dividends, brokerage and taxes are excluded.</p>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

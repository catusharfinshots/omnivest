import React from 'react';
import { Rocket, Repeat, Target, Layers, Sparkles, Activity, GitCommitHorizontal, PieChart } from 'lucide-react';

const NEXT = { Monthly: 1, Quarterly: 3, 'Half-yearly': 6, Yearly: 12 };
const nice = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const TONE = {
  purple: 'bg-[#F1E7FE] text-[#5320A8]', blue: 'bg-[#EFF6FF] text-[#1D4ED8]', teal: 'bg-[#E0F5F1] text-[#0F766E]',
  amber: 'bg-[#FEF3C7] text-[#9A4A05]', green: 'bg-[#E3F4EB] text-[#096B3E]', red: 'bg-[#FBE4E4] text-[#B91C1C]', grey: 'bg-[#F1F5F9] text-[#526071]',
};

function Fact({ icon: Icon, tone, label, value, sub, testid }) {
  return (
    <div className="flex items-start gap-3 min-w-0" data-testid={testid}>
      <span className={`shrink-0 h-9 w-9 rounded-xl grid place-items-center ${TONE[tone] || TONE.grey}`}><Icon className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0">
        <div className="text-[12px] text-[#667085] leading-4">{label}</div>
        <div className="num text-[16px] font-bold text-[#0F1729] leading-5 mt-0.5 truncate">{value}</div>
        {sub ? <div className="text-[12px] text-[#526071] leading-4 mt-0.5">{sub}</div> : null}
      </div>
    </div>
  );
}

/**
 * Key facts: the six things an investor asks first, as icon tiles in a two-column grid (three on desktop).
 * Engine detail (purchase-price date, drawdown) stays out; it lives in the Performance explainer.
 */
export default function KeyFacts({ basket, perf, benchLabel, holdingsCount }) {
  const pm = perf && perf.status === 'ok' ? perf.metrics : null;
  const versions = basket.versions || [];
  const lastRebalance = versions.length > 1 ? versions[versions.length - 1] : null;
  const base = lastRebalance?.effective_date || basket.launch_date;
  const months = NEXT[basket.rebalanceFreq];
  let next = null;
  if (base && months) {
    // the next review after today, stepping from the last rebalance (or launch) in whole cycles
    const d = new Date(`${String(base).slice(0, 10)}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let guard = 0;
    do { d.setMonth(d.getMonth() + months); guard += 1; } while (d <= today && guard < 240);
    next = d;
  }
  const cons = basket.constituents || [];
  const topW = basket.top_weight_pct ?? (cons.length ? Math.max(...cons.map((c) => Number(c.weight) || 0)) : null);
  const kind = basket.holdings_kind || (cons.length && cons.every((c) => c.type === 'ETF') ? 'ETFs' : 'stocks');
  const sectors = perf?.distribution?.sector ? Object.entries(perf.distribution.sector).filter(([k]) => k !== 'Other').sort((a, b) => b[1] - a[1]) : [];
  const topSector = sectors[0] && sectors[0][1] >= 50 ? sectors[0] : null;
  const vol = pm?.volatility_label;
  const volTone = vol === 'Low' ? 'green' : vol === 'High' ? 'red' : vol === 'Medium' ? 'amber' : 'grey';
  const tags = (basket.tags || []).slice(0, 2);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#E8E1F0] bg-white p-5" data-testid="key-facts">
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-[radial-gradient(closest-side,#EDE7FB,transparent)]" />
      <h3 className="relative text-[16px] sm:text-lg font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-[#6C2BD9]" /> Key facts</h3>
      <div className="relative mt-4 grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-5">
        <Fact icon={Rocket} tone="purple" label="Launched" value={basket.launch_date ? nice(basket.launch_date) : 'Not yet'} sub={basket.launch_date ? 'live track record since then' : 'awaiting approval'} testid="fact-launched" />
        <Fact icon={Repeat} tone="blue" label="Rebalance" value={basket.rebalanceFreq || 'Quarterly'} sub={next ? `next review ${nice(next.toISOString())}` : (basket.rebalanceFreq === 'As needed' ? 'when the thesis changes' : '')} testid="fact-rebalance" />
        <Fact icon={Activity} tone="teal" label="Benchmark" value={benchLabel} sub="compared on the chart" testid="fact-benchmark" />
        <Fact icon={Layers} tone="amber" label="Constituents" value={`${holdingsCount} ${kind}`} sub={topSector ? `${Math.round(topSector[1])}% in ${topSector[0]}` : (topW ? `largest weight ${topW}%` : '')} testid="fact-constituents" />
        <Fact icon={Sparkles} tone="purple" label="Strategy" value={(basket.strategy || 'thematic').replace('-', ' ').replace(/^\w/, (c) => c.toUpperCase())} sub={tags.join(' · ')} testid="fact-strategy" />
        <Fact icon={Activity} tone={volTone} label="Volatility" value={vol || 'Measuring'} sub={vol ? `${pm.volatility_pct}% annualised` : 'after 20 trading days'} testid="fact-volatility" />
        {lastRebalance && <Fact icon={GitCommitHorizontal} tone="blue" label="Last rebalance" value={nice(lastRebalance.effective_date)} sub={`${versions.length - 1} so far`} testid="fact-last-rebalance" />}
        {topSector && sectors.length > 1 && <Fact icon={PieChart} tone="grey" label="Sectors" value={`${sectors.length} sectors`} sub={`${topSector[0]} leads`} testid="fact-sectors" />}
      </div>
    </div>
  );
}

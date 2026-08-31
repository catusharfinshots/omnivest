import React, { useMemo, useState } from 'react';
import { Slider } from '../components/ui/slider';
import { Input } from '../components/ui/input';

function Ring({ invested, returns }) {
  const total = invested + returns;
  const investPct = total ? (invested / total) * 100 : 100;
  const gain = 100 - investPct;
  const c = 2 * Math.PI * 70;
  const investLen = (investPct / 100) * c;
  const gainLen = (gain / 100) * c;
  return (
    <svg viewBox="0 0 180 180" className="w-56 h-56">
      <circle cx="90" cy="90" r="70" fill="none" stroke="#F1E7FE" strokeWidth="20" />
      <circle cx="90" cy="90" r="70" fill="none" stroke="#6C2BD9" strokeWidth="20" strokeLinecap="round" strokeDasharray={`${investLen} ${c - investLen}`} transform="rotate(-90 90 90)" />
      <circle cx="90" cy="90" r="70" fill="none" stroke="#12B76A" strokeWidth="20" strokeLinecap="round" strokeDasharray={`${gainLen} ${c - gainLen}`} strokeDashoffset={-investLen} transform="rotate(-90 90 90)" />
      <text x="90" y="86" textAnchor="middle" className="num" style={{ fontSize: 12, fill: '#6B6480' }}>Total value</text>
      <text x="90" y="106" textAnchor="middle" className="num" style={{ fontSize: 20, fontWeight: 700, fill: '#1A1030' }}>₹{total >= 100000 ? (total/100000).toFixed(1)+'L' : total.toLocaleString('en-IN')}</text>
    </svg>
  );
}

export default function SIPCalculator() {
  const [monthly, setMonthly] = useState(10000);
  const [rate, setRate] = useState(12);
  const [years, setYears] = useState(10);

  const { invested, futureVal, gains, chartData } = useMemo(() => {
    const months = years * 12;
    const r = rate / 100 / 12;
    const fv = monthly * ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
    const inv = monthly * months;
    // yearly cumulative chart
    const data = [];
    for (let y = 1; y <= years; y++) {
      const ms = y * 12;
      const val = monthly * ((Math.pow(1 + r, ms) - 1) / r) * (1 + r);
      const invY = monthly * ms;
      data.push({ year: y, invested: invY, value: val });
    }
    return { invested: inv, futureVal: fv, gains: fv - inv, chartData: data };
  }, [monthly, rate, years]);

  // build svg for bars
  const maxV = Math.max(...chartData.map(d => d.value), 1);

  return (
    <div className="container-x py-10 lg:py-14">
      <div className="eyebrow">SIP Calculator</div>
      <h1 className="mt-2 text-4xl md:text-5xl font-bold">See how a monthly SIP could grow</h1>

      <div className="mt-10 grid lg:grid-cols-2 gap-8">
        <div className="surface p-6 space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Monthly investment</label>
              <div className="inline-flex items-center gap-1 rounded-lg bg-[#F7F4FB] px-3 py-1 num font-semibold">
                <span className="text-[#6B6480]">₹</span>
                <Input type="number" value={monthly} onChange={e => setMonthly(Number(e.target.value))} className="w-24 h-7 bg-transparent border-none p-0 focus-visible:ring-0 num text-right" />
              </div>
            </div>
            <Slider className="mt-3" value={[monthly]} onValueChange={([v])=>setMonthly(v)} min={500} max={200000} step={500} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Expected return (p.a.)</label>
              <div className="inline-flex items-center gap-1 rounded-lg bg-[#F7F4FB] px-3 py-1 num font-semibold">
                <Input type="number" value={rate} onChange={e => setRate(Number(e.target.value))} className="w-14 h-7 bg-transparent border-none p-0 focus-visible:ring-0 num text-right" />
                <span className="text-[#6B6480]">%</span>
              </div>
            </div>
            <Slider className="mt-3" value={[rate]} onValueChange={([v])=>setRate(v)} min={1} max={30} step={0.5} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Time period</label>
              <div className="inline-flex items-center gap-1 rounded-lg bg-[#F7F4FB] px-3 py-1 num font-semibold">
                <Input type="number" value={years} onChange={e => setYears(Number(e.target.value))} className="w-14 h-7 bg-transparent border-none p-0 focus-visible:ring-0 num text-right" />
                <span className="text-[#6B6480]">yrs</span>
              </div>
            </div>
            <Slider className="mt-3" value={[years]} onValueChange={([v])=>setYears(v)} min={1} max={40} step={1} />
          </div>

          <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-[#6B6480] uppercase tracking-wider">Invested</div>
              <div className="num mt-1 text-lg font-bold text-[#5320A8] truncate">₹{invested.toLocaleString('en-IN', {maximumFractionDigits: 0})}</div>
            </div>
            <div>
              <div className="text-xs text-[#6B6480] uppercase tracking-wider">Est. returns</div>
              <div className="num mt-1 text-lg font-bold text-[#12B76A] truncate">₹{gains.toLocaleString('en-IN', {maximumFractionDigits: 0})}</div>
            </div>
            <div>
              <div className="text-xs text-[#6B6480] uppercase tracking-wider">Total value</div>
              <div className="num mt-1 text-lg font-bold truncate">₹{futureVal.toLocaleString('en-IN', {maximumFractionDigits: 0})}</div>
            </div>
          </div>
        </div>

        <div className="surface p-6 flex flex-col items-center gap-6">
          <Ring invested={Math.round(invested)} returns={Math.round(gains)} />
          <div className="w-full">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#6B6480] mb-3">Year-wise growth</div>
            <div className="grid gap-1 h-40 items-end" style={{ gridTemplateColumns: `repeat(${chartData.length}, minmax(0, 1fr))` }}>
              {chartData.map(d => (
                <div key={d.year} className="flex flex-col items-center gap-1 h-full justify-end">
                  <div className="w-full rounded-t bg-gradient-to-t from-[#6C2BD9] to-[#B15CFF]" style={{ height: `${Math.max(2, (d.value / maxV) * 100)}%` }} title={`Yr ${d.year}: ₹${d.value.toFixed(0)}`} />
                  <div className="text-[9px] text-[#6B6480] num leading-none">{d.year}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

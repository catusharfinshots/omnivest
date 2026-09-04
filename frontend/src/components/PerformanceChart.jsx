import React, { useMemo, useState } from 'react';
import { Sparkline } from './BasketCard';
import { TrendingUp } from 'lucide-react';
import { generatePerformance } from '../mock';

const RANGES = [
  { key: 'm1', label: '1M', months: 1 },
  { key: 'm6', label: '6M', months: 6 },
  { key: 'y1', label: '1Y', months: 12 },
  { key: 'y3', label: '3Y', months: 36 },
  { key: 'y5', label: '5Y', months: 60 },
  { key: 'max', label: 'Max', months: 120 },
];

export default function PerformanceChart({ basket }) {
  const [range, setRange] = useState('y3');
  const activeRange = RANGES.find(r => r.key === range) || RANGES[3];
  const data = useMemo(() => generatePerformance(basket.id, activeRange.months), [basket.id, activeRange.months]);

  // build svg path
  const { path, area, minV, maxV, first, last } = useMemo(() => {
    if (!data.length) return { path: '', area: '', minV: 0, maxV: 0, first: 0, last: 0 };
    const values = data.map(p => p.value);
    const min = Math.min(...values), max = Math.max(...values);
    const norm = data.map((p, i) => [ (i / (data.length - 1)) * 100, 100 - ((p.value - min) / Math.max(1, (max - min))) * 100 ]);
    const d = norm.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
    const area = `${d} L100,100 L0,100 Z`;
    return { path: d, area, minV: min, maxV: max, first: values[0], last: values[values.length - 1] };
  }, [data]);

  const rangeReturn = ((last - first) / first) * 100;
  const positive = rangeReturn >= 0;

  return (
    <div className="surface p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow">Performance</div>
          <div className="mt-2 flex items-baseline gap-3">
            <div className={`num text-2xl font-bold ${positive ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'} flex items-center gap-1`}>
              <TrendingUp className="h-5 w-5" />
              {positive ? '+' : ''}{rangeReturn.toFixed(2)}%
            </div>
            <div className="text-sm text-[#6B6480]">over {activeRange.label}</div>
          </div>
        </div>
        <div className="inline-flex bg-[#F7F4FB] rounded-full p-1">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${range === r.key ? 'bg-white text-[#6C2BD9] shadow-sm' : 'text-[#6B6480] hover:text-[#1A1030]'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 relative">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-56">
          <defs>
            <linearGradient id="perf-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6C2BD9" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#6C2BD9" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g stroke="#F1E7FE" strokeWidth="0.2">
            {[20, 40, 60, 80].map(y => <line key={y} x1="0" y1={y} x2="100" y2={y} />)}
          </g>
          <path d={area} fill="url(#perf-area)" />
          <path d={path} fill="none" stroke="#6C2BD9" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-[12px] text-[#6B6480] px-1">
          <span>{data[0]?.date}</span>
          <span>{data[data.length-1]?.date}</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 sm:grid-cols-6 gap-3">
        {['m1','m6','y1','y3','y5','cagr'].map((k) => (
          <div key={k} className="rounded-xl border border-[#E8E1F0] p-3 text-center">
            <div className="text-[12px] text-[#6B6480] font-semibold uppercase tracking-wider">{k === 'cagr' ? 'CAGR' : k.toUpperCase()}</div>
            <div className={`num mt-1 text-sm font-semibold ${basket.returns[k] >= 0 ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'}`}>
              {basket.returns[k] >= 0 ? '+' : ''}{basket.returns[k].toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

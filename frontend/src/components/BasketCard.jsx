import React from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Heart } from 'lucide-react';
import { getManager } from '../mock';
import { usePortfolio } from '../context/PortfolioContext';

function Sparkline({ seed = 1, positive = true }) {
  const points = [];
  const N = 24;
  let v = 50;
  for (let i = 0; i < N; i++) {
    const noise = Math.sin((seed + i) * 0.7) * 6 + Math.cos((seed + i) * 0.3) * 4;
    v += (positive ? 1.2 : -0.8) + noise * 0.1;
    points.push(v);
  }
  const min = Math.min(...points), max = Math.max(...points);
  const norm = points.map((p, i) => [ (i / (N-1)) * 100, 100 - ((p - min) / Math.max(1, (max-min))) * 100 ]);
  const d = norm.map((p, i) => `${i===0?'M':'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const color = positive ? '#12B76A' : '#F04438';
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-12">
      <defs>
        <linearGradient id={`g-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L100,100 L0,100 Z`} fill={`url(#g-${seed})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function BasketCard({ basket, compact = false }) {
  const mgr = getManager(basket.managerId);
  const positive = basket.returns.y3 >= 0;
  const { toggleWatch, isWatched } = usePortfolio();
  const watched = isWatched(basket.id);

  return (
    <Link to={`/smallcase/${basket.id}`}
      className="group surface p-5 hover:shadow-[0_12px_30px_-15px_rgba(76,29,149,0.25)] hover:border-[#D8C7F1] transition-all block">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`chip ${basket.risk === 'Low' ? 'text-[#0B7F4A]' : basket.risk === 'High' ? 'text-[#B15CFF]' : 'text-[#5320A8]'}`}>
              {basket.risk} risk
            </span>
            <span className="chip">{basket.strategy.replace('-', ' ')}</span>
          </div>
          <h3 className="mt-3 text-[17px] font-semibold text-[#1A1030] leading-snug group-hover:text-[#6C2BD9]">
            {basket.name}
          </h3>
          {!compact && (
            <p className="mt-1 text-sm text-[#6B6480] line-clamp-2">{basket.subtitle}</p>
          )}
        </div>
        <button
          onClick={(e) => { e.preventDefault(); toggleWatch(basket.id); }}
          className={`h-8 w-8 grid place-items-center rounded-full border ${watched ? 'border-[#E23FA0] bg-[#FCEAF4] text-[#E23FA0]' : 'border-[#E8E1F0] text-[#6B6480] hover:text-[#E23FA0]'}`}
          aria-label="Add to watchlist"
        >
          <Heart className={`h-4 w-4 ${watched ? 'fill-[#E23FA0]' : ''}`} />
        </button>
      </div>

      <div className="mt-4">
        <Sparkline seed={basket.id.charCodeAt(0) + basket.id.length} positive={positive} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[12px] text-[#6B6480] font-medium uppercase tracking-wider">3Y CAGR</div>
          <div className={`num mt-0.5 text-[18px] font-semibold ${positive ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'} flex items-center gap-1`}>
            {positive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {positive ? '+' : ''}{basket.returns.y3.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-[12px] text-[#6B6480] font-medium uppercase tracking-wider">Min. amount</div>
          <div className="num mt-0.5 text-[18px] font-semibold text-[#1A1030]">₹{basket.minAmount.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {!compact && (
        <div className="mt-4 pt-3 border-t border-[#F1E7FE] flex items-center justify-between text-xs text-[#6B6480]">
          <span className="font-medium">{mgr?.name}</span>
          <span className={basket.subscription === 'Free' ? 'text-[#0B7F4A] font-semibold' : 'text-[#6C2BD9] font-semibold'}>
            {basket.subscription === 'Free' ? 'Free' : `₹${basket.fee.amount}/${basket.fee.cycle === 'monthly' ? 'mo' : basket.fee.cycle === 'quarterly' ? 'qtr' : 'yr'}`}
          </span>
        </div>
      )}
    </Link>
  );
}

export { Sparkline };

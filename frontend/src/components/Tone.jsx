import React from 'react';
import { TrendingUp, TrendingDown, Lock, Sparkles, Flame, Leaf, ShieldAlert } from 'lucide-react';

// Omnivest colour language (design system, Sept 2026):
//   purple  = brand + primary actions only — never for data
//   green   = gains, CAGR, "free access" / "subscribers only" (positive, safe)
//   amber   = medium risk, warnings, pending review
//   red     = losses, high risk, blocking problems
//   blue    = neutral information tags (plan type, category)
// Every colour below passes WCAG AA on white and on its own tint.
export const TONES = {
  pos:     { text: 'text-[#096B3E]', bg: 'bg-[#E3F4EB]', ring: 'ring-[#BFE6D0]' },   // 5.3:1 on its tint (AA at 12px)
  neg:     { text: 'text-[#B91C1C]', bg: 'bg-[#FBE4E4]', ring: 'ring-[#F5C2C2]' },
  warn:    { text: 'text-[#9A4A05]', bg: 'bg-[#FEF3C7]', ring: 'ring-[#FCE2A0]' },
  info:    { text: 'text-[#1D4ED8]', bg: 'bg-[#EFF6FF]', ring: 'ring-[#C7DBFE]' },
  brand:   { text: 'text-[#5320A8]', bg: 'bg-[#F1E7FE]', ring: 'ring-[#DDCBF8]' },
  neutral: { text: 'text-[#334155]', bg: 'bg-[#F1F5F9]', ring: 'ring-[#E2E8F0]' },
};

/** Small rounded label. `tone` picks the colour; `icon` is an optional lucide element. */
export function Badge({ tone = 'neutral', icon = null, children, className = '', testid }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span data-testid={testid} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold leading-5 whitespace-nowrap ${t.text} ${t.bg} ${className}`}>
      {icon}{children}
    </span>
  );
}

/** Low / Medium / High volatility, coloured and iconed the way investors already read it on smallcase and Groww. */
export function VolatilityBadge({ level, pct, className = '', compact = false }) {
  if (!level) return null;
  const map = {
    Low: { tone: 'pos', icon: <Leaf className="h-3.5 w-3.5" aria-hidden="true" />, label: 'Low volatility', short: 'Low' },
    Medium: { tone: 'warn', icon: <Flame className="h-3.5 w-3.5" aria-hidden="true" />, label: 'Med. volatility', short: 'Med.' },
    High: { tone: 'neg', icon: <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />, label: 'High volatility', short: 'High' },
  };
  const m = map[level] || map.Medium;
  if (compact) {
    // icon + one word, no fill: reads as a value in a metric column (the smallcase treatment)
    return <span data-testid="volatility-badge" className={`inline-flex items-center gap-1 text-[15px] font-bold ${TONES[m.tone].text} ${className}`}>{m.icon}{m.short}</span>;
  }
  return <Badge tone={m.tone} icon={m.icon} className={className} testid="volatility-badge">{m.label}{pct ? <span className="num font-medium opacity-80"> · {pct}%</span> : null}</Badge>;
}

/** Free access vs paid ("Subscribers only", or "from ₹x/mo" when the price is known). Green in both cases: access is good news. */
export function AccessBadge({ paid, perMonth, className = '' }) {
  if (!paid) return <Badge tone="pos" icon={<Sparkles className="h-3 w-3" aria-hidden="true" />} className={className} testid="access-badge">Free access</Badge>;
  return <Badge tone="pos" icon={<Lock className="h-3 w-3" aria-hidden="true" />} className={className} testid="access-badge">{perMonth ? <>from <span className="num">₹{Math.round(perMonth).toLocaleString('en-IN')}</span>/mo</> : 'Subscribers only'}</Badge>;
}

/** A signed percentage with arrow + colour. `null` shows a neutral placeholder. */
export function Delta({ value, digits = 1, className = '', placeholder = '—' }) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return <span className={`num text-[#667085] ${className}`}>{placeholder}</span>;
  const v = Number(value);
  const up = v >= 0;
  return (
    <span className={`num inline-flex items-center gap-1 ${up ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'} ${className}`}>
      {up ? <TrendingUp className="h-[1em] w-[1em]" aria-hidden="true" /> : <TrendingDown className="h-[1em] w-[1em]" aria-hidden="true" />}
      {up ? '+' : ''}{v.toFixed(digits)}%
    </span>
  );
}

/** Label-over-value metric, the same shape on every card and page so the eye lands in the same place. */
export function Metric({ label, value, sub, tone, size = 'md', align = 'left', className = '', testid }) {
  const t = tone ? (TONES[tone] || TONES.neutral).text : 'text-[#0F1729]';
  const val = size === 'lg' ? 'text-[26px] sm:text-[30px]' : size === 'sm' ? 'text-[15px]' : 'text-[18px]';
  return (
    <div data-testid={testid} className={`min-w-0 ${align === 'right' ? 'text-right' : ''} ${className}`}>
      <div className="text-[13px] text-[#667085] leading-4 whitespace-nowrap truncate">{label}</div>
      <div className={`num mt-0.5 font-bold leading-tight ${val} ${t}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[12px] text-[#667085] leading-4">{sub}</div> : null}
    </div>
  );
}

export const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

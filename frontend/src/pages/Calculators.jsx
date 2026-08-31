import React from 'react';
import { Link } from 'react-router-dom';
import * as Icons from 'lucide-react';

function Icon({ name, className }) {
  const C = Icons[name] || Icons.Calculator;
  return <C className={className} />;
}

const list = [
  { key: 'sip', name: 'SIP Calculator', icon: 'CalendarClock', to: '/calculators/sip', desc: 'How your monthly SIP could grow.' },
  { key: 'lumpsum', name: 'Lumpsum Calculator', icon: 'Wallet', desc: 'Growth of a one-time investment.' },
  { key: 'cagr', name: 'CAGR Calculator', icon: 'TrendingUp', desc: 'Annualised growth between two values.' },
  { key: 'fd', name: 'FD Calculator', icon: 'Landmark', desc: 'Maturity of a fixed deposit.' },
  { key: 'retire', name: 'Retirement Calculator', icon: 'PalmtreeIcon', desc: 'Corpus needed for retirement.' },
  { key: 'swp', name: 'SWP Calculator', icon: 'Repeat', desc: 'Steady withdrawals from your corpus.' },
  { key: 'stepup', name: 'Step-up SIP', icon: 'ArrowUpRight', desc: 'SIP that grows with income.' },
  { key: 'goal', name: 'Goal / Target', icon: 'Target', desc: 'SIP needed to hit a target amount.' },
  { key: 'compound', name: 'Compound Interest', icon: 'PercentSquare', desc: 'The 8th wonder, quantified.' },
  { key: 'ppf', name: 'PPF Calculator', icon: 'Building', desc: 'Public provident fund maturity.' },
  { key: 'emi', name: 'EMI Calculator', icon: 'Coins', desc: 'Monthly loan installments.' },
  { key: 'inflation', name: 'Inflation Calculator', icon: 'Flame', desc: 'The real value of money over time.' },
];

export default function Calculators() {
  return (
    <div className="container-x py-10 lg:py-14">
      <div className="eyebrow">Calculators</div>
      <h1 className="mt-2 text-4xl md:text-5xl font-bold">Plan every financial decision</h1>
      <p className="mt-3 text-[#6B6480] max-w-xl">Interactive tools with live charts. Start with SIP or lumpsum, then explore the rest.</p>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {list.map(c => (
          <Link key={c.key} to={c.to || '/calculators/sip'} className="surface p-5 hover:border-[#D8C7F1] hover:-translate-y-0.5 transition-all">
            <div className="h-10 w-10 rounded-xl bg-[#F1E7FE] text-[#6C2BD9] grid place-items-center"><Icon name={c.icon} className="h-5 w-5" /></div>
            <div className="mt-4 text-sm font-semibold">{c.name}</div>
            <div className="text-xs text-[#6B6480] mt-1">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

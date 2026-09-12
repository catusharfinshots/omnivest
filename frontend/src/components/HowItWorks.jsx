import React from 'react';
import { Link } from 'react-router-dom';
import { Link2, ScanSearch, Scale, Wrench, ClipboardList, Clock, CheckCircle2, RefreshCw } from 'lucide-react';

/** Sidebar explainer as a short illustrated path instead of paragraphs (Tushar, 12 Sep 2026: "text plus some graphics"). */
const SETS = {
  investments: [
    [Link2, 'Connect your broker', 'Once. Orders go to your own account; Omnivest never holds money.'],
    [ScanSearch, 'We read what you hold', 'Holdings and today\'s positions, on every visit and every 30 s while open.'],
    [Scale, 'Compare with the target', 'Every stock: Held, Ordered, Missing or Sold outside. No guessing from orders.'],
    [Wrench, 'Fix only the difference', 'Buy what is missing, sell everything to exit. You review before anything is placed.'],
  ],
  orders: [
    [ClipboardList, 'Placed through Omnivest', 'Whole shares at a limit price, in your own broker account.'],
    [Clock, 'With your broker', 'After-market orders wait for 9:15 AM; day orders execute now.'],
    [CheckCircle2, 'Filled, refused or cancelled', 'Statuses refresh every 30 s while this page is open. Cancel open orders here.'],
    [RefreshCw, 'What you hold decides', 'Missing stocks are judged from holdings on Your investments, and fixed there.'],
  ],
};

export default function HowItWorks({ kind = 'investments', title = 'How this works' }) {
  const steps = SETS[kind] || SETS.investments;
  return (
    <div className="surface p-4" data-testid={`how-${kind}`}>
      <div className="font-semibold text-[#0F1729] text-[15px]">{title}</div>
      <ol className="mt-3 relative">
        <span className="absolute left-[17px] top-3 bottom-3 w-px bg-[#E8E1F0]" aria-hidden="true" />
        {steps.map(([Icon, t, d], i) => (
          <li key={t} className="relative flex gap-3 py-2">
            <span className="relative z-10 h-9 w-9 rounded-full bg-[#F1EDF7] text-[#6C2BD9] grid place-items-center shrink-0 ring-4 ring-white"><Icon className="h-4 w-4" /></span>
            <span className="min-w-0"><span className="block text-[13px] font-semibold text-[#0F1729]"><span className="text-[#6C2BD9] mr-1">{i + 1}.</span>{t}</span><span className="block text-[12px] text-[#526071] leading-relaxed">{d}</span></span>
          </li>
        ))}
      </ol>
      <div className="mt-2 text-[12px] text-[#667085]">More in the <Link to="/faq" className="text-[#5320A8] font-semibold">FAQ</Link> or <Link to="/contact" className="text-[#5320A8] font-semibold">contact us</Link>.</div>
    </div>
  );
}

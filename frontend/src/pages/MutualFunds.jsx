import React, { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { mutualFunds } from '../mock';
import { Input } from '../components/ui/input';
import { Search, TrendingUp } from 'lucide-react';

const CATS = [
  { key: 'equity', label: 'Equity' },
  { key: 'debt', label: 'Debt' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'other', label: 'Other' },
];

export default function MutualFunds() {
  const { category } = useParams();
  const [cat, setCat] = useState(category || 'all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    let f = mutualFunds;
    if (cat !== 'all') f = f.filter(x => x.category === cat);
    if (q) f = f.filter(x => (x.name + x.amc).toLowerCase().includes(q.toLowerCase()));
    return f;
  }, [cat, q]);

  return (
    <div className="container-x py-10 lg:py-14">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow">Mutual funds</div>
          <h1 className="mt-2 text-4xl md:text-5xl font-bold">Direct mutual funds</h1>
          <p className="mt-3 text-[#6B6480] max-w-xl">Zero commission direct mutual funds across every category.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B6480]" />
          <Input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search funds" className="pl-9 h-10 rounded-full w-64 border-[#E8E1F0] bg-white" />
        </div>
      </div>

      <div className="mt-8 inline-flex bg-[#F7F4FB] rounded-full p-1 flex-wrap">
        <button onClick={()=>setCat('all')} className={`px-4 py-2 rounded-full text-sm font-semibold ${cat==='all' ? 'bg-white text-[#6C2BD9] shadow-sm' : 'text-[#6B6480]'}`}>All</button>
        {CATS.map(c => (
          <button key={c.key} onClick={()=>setCat(c.key)} className={`px-4 py-2 rounded-full text-sm font-semibold ${cat===c.key ? 'bg-white text-[#6C2BD9] shadow-sm' : 'text-[#6B6480]'}`}>{c.label}</button>
        ))}
      </div>

      <div className="mt-8 surface overflow-hidden">
        <div className="grid grid-cols-12 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[#6B6480] bg-[#F7F4FB]">
          <div className="col-span-5">Fund</div>
          <div className="col-span-1">Type</div>
          <div className="col-span-2 text-right">NAV</div>
          <div className="col-span-1 text-right">Exp.</div>
          <div className="col-span-1 text-right">1Y</div>
          <div className="col-span-1 text-right">3Y</div>
          <div className="col-span-1 text-right">5Y</div>
        </div>
        <div className="divide-y divide-[#F1E7FE]">
          {filtered.map(f => (
            <div key={f.id} className="grid grid-cols-12 px-5 py-4 items-center text-sm hover:bg-[#FBF8FF] transition-colors">
              <div className="col-span-5">
                <div className="font-semibold text-[#1A1030]">{f.name}</div>
                <div className="text-xs text-[#6B6480]">{f.amc}</div>
              </div>
              <div className="col-span-1 text-xs text-[#6B6480] capitalize">{f.category}</div>
              <div className="col-span-2 num text-right font-semibold">₹{f.nav.toLocaleString('en-IN')}</div>
              <div className="col-span-1 num text-right text-[#6B6480]">{f.expenseRatio}%</div>
              <div className="col-span-1 num text-right text-[#0B7F4A] font-semibold">+{f.returns.y1.toFixed(1)}%</div>
              <div className="col-span-1 num text-right text-[#0B7F4A] font-semibold">+{f.returns.y3.toFixed(1)}%</div>
              <div className="col-span-1 num text-right text-[#0B7F4A] font-semibold">+{f.returns.y5.toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10 rounded-2xl grad-band text-white p-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm text-white/80">Curated for you</div>
          <div className="text-2xl font-bold">Mutual fund baskets</div>
          <p className="mt-2 text-white/80 max-w-xl">Diversified baskets of direct mutual funds — built and rebalanced by SEBI-registered managers.</p>
        </div>
        <Link to="/explore/smallcases" className="inline-flex items-center gap-2 rounded-full bg-white text-[#6C2BD9] px-5 py-2.5 text-sm font-semibold">Explore MF baskets <TrendingUp className="h-4 w-4" /></Link>
      </div>
    </div>
  );
}

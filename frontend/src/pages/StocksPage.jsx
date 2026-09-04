import React, { useState } from 'react';
import { stocks } from '../mock';
import { Input } from '../components/ui/input';
import { Search, TrendingUp, TrendingDown } from 'lucide-react';

export default function StocksPage() {
  const [q, setQ] = useState('');
  const [bucket, setBucket] = useState('all');

  const filtered = stocks.filter(s => {
    if (bucket !== 'all' && s.marketCap !== bucket) return false;
    if (q && !(s.name + s.symbol).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="container-x py-10 lg:py-14">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow">Stocks</div>
          <h1 className="mt-2 text-4xl md:text-5xl font-bold">Direct stocks & custom baskets</h1>
          <p className="mt-3 text-[#6B6480] max-w-xl">Search, screen and build your own basket from individual stocks.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B6480]" />
          <Input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search stocks" className="pl-9 h-10 rounded-full w-64 border-[#E8E1F0] bg-white" />
        </div>
      </div>

      <div className="mt-8 inline-flex bg-[#F7F4FB] rounded-full p-1">
        {['all','Large Cap','Mid Cap','Small Cap'].map(b => (
          <button key={b} onClick={()=>setBucket(b)} className={`px-4 py-2 rounded-full text-sm font-semibold ${bucket===b ? 'bg-white text-[#6C2BD9] shadow-sm' : 'text-[#6B6480]'}`}>{b === 'all' ? 'All' : b}</button>
        ))}
      </div>

      <div className="mt-6 surface overflow-hidden">
        <div className="grid grid-cols-12 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[#6B6480] bg-[#F7F4FB]">
          <div className="col-span-5">Company</div>
          <div className="col-span-2">Sector</div>
          <div className="col-span-2">Market cap</div>
          <div className="col-span-2 text-right">Price</div>
          <div className="col-span-1 text-right">Change</div>
        </div>
        <div className="divide-y divide-[#F1E7FE]">
          {filtered.map(s => (
            <div key={s.symbol} className="grid grid-cols-12 px-5 py-4 items-center text-sm hover:bg-[#FBF8FF] transition-colors">
              <div className="col-span-5 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-[#F1E7FE] text-[#5320A8] grid place-items-center text-[12px] font-bold">{s.symbol.slice(0,2)}</div>
                <div>
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-xs text-[#6B6480]">{s.symbol}</div>
                </div>
              </div>
              <div className="col-span-2 text-xs text-[#6B6480]">{s.sector}</div>
              <div className="col-span-2 text-xs text-[#6B6480]">{s.marketCap}</div>
              <div className="col-span-2 num text-right font-semibold">₹{s.price.toLocaleString('en-IN')}</div>
              <div className={`col-span-1 num text-right font-semibold flex items-center justify-end gap-1 ${s.change >= 0 ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'}`}>
                {s.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {s.change >= 0 ? '+' : ''}{s.change.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

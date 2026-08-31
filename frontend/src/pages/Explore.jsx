import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { baskets, strategies } from '../mock';
import BasketCard from '../components/BasketCard';
import { Slider } from '../components/ui/slider';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Search, SlidersHorizontal, X } from 'lucide-react';

const SORT_OPTIONS = [
  { key: 'popularity', label: 'Popularity' },
  { key: 'returns_y3', label: 'Returns (3Y)' },
  { key: 'returns_y1', label: 'Returns (1Y)' },
  { key: 'returns_y5', label: 'Returns (5Y)' },
  { key: 'min_amt', label: 'Minimum amount' },
  { key: 'new', label: 'Recently launched' },
];

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [strategy, setStrategy] = useState(params.get('strategy') || '');
  const [risk, setRisk] = useState([]); // [Low, Medium, High]
  const [minRange, setMinRange] = useState([0, 25000]);
  const [sub, setSub] = useState([]); // Free, Paid
  const [types, setTypes] = useState([]); // Stock, ETF, MF
  const [sort, setSort] = useState('popularity');
  const [filtersOpen, setFiltersOpen] = useState(true);

  const filtered = useMemo(() => {
    let list = [...baskets];
    if (strategy) list = list.filter(b => b.strategy === strategy);
    if (risk.length) list = list.filter(b => risk.includes(b.risk));
    if (sub.length) list = list.filter(b => sub.includes(b.subscription));
    list = list.filter(b => b.minAmount >= minRange[0] && b.minAmount <= minRange[1]);
    if (types.length) list = list.filter(b => b.constituents.some(c => types.includes(c.type)));
    if (q) list = list.filter(b => (b.name + ' ' + b.subtitle).toLowerCase().includes(q.toLowerCase()));
    if (sort === 'returns_y3') list.sort((a,b) => b.returns.y3 - a.returns.y3);
    else if (sort === 'returns_y1') list.sort((a,b) => b.returns.y1 - a.returns.y1);
    else if (sort === 'returns_y5') list.sort((a,b) => b.returns.y5 - a.returns.y5);
    else if (sort === 'min_amt') list.sort((a,b) => a.minAmount - b.minAmount);
    return list;
  }, [strategy, risk, minRange, sub, types, q, sort]);

  const toggleArr = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const clearAll = () => { setStrategy(''); setRisk([]); setMinRange([0, 25000]); setSub([]); setTypes([]); setQ(''); setParams({}); };

  return (
    <div className="container-x py-10 lg:py-14">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow">Discover</div>
          <h1 className="mt-2 text-4xl md:text-5xl font-bold">Explore baskets</h1>
          <p className="mt-3 text-[#6B6480] max-w-xl">Filter by strategy, volatility, and minimum amount to find one that fits.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B6480]" />
            <Input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search baskets" className="pl-9 h-10 rounded-full w-64 border-[#E8E1F0] bg-white" />
          </div>
          <button onClick={() => setFiltersOpen(v => !v)} className="btn-outline lg:hidden"><SlidersHorizontal className="h-4 w-4" /> Filters</button>
        </div>
      </div>

      <div className="mt-8 grid lg:grid-cols-[280px_1fr] gap-8">
        {/* Filters */}
        <aside className={`${filtersOpen ? 'block' : 'hidden'} lg:block surface p-5 h-fit lg:sticky lg:top-24`}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Filters</div>
            <button onClick={clearAll} className="text-xs font-semibold text-[#6C2BD9]">Clear all</button>
          </div>

          <div className="mt-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#6B6480] mb-2">Strategy</div>
            <div className="flex flex-wrap gap-1.5">
              {strategies.map(s => (
                <button key={s.key} onClick={()=>setStrategy(strategy===s.key?'':s.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${strategy===s.key ? 'bg-[#6C2BD9] text-white border-[#6C2BD9]' : 'bg-white text-[#1A1030] border-[#E8E1F0] hover:border-[#B15CFF]'}`}>{s.label}</button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#6B6480] mb-2">Volatility / Risk</div>
            <div className="space-y-2">
              {['Low','Medium','High'].map(r => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={risk.includes(r)} onCheckedChange={()=>toggleArr(risk, setRisk, r)} />
                  {r}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#6B6480] mb-2">Minimum amount</div>
            <div className="px-1">
              <Slider value={minRange} onValueChange={setMinRange} min={0} max={25000} step={500} />
              <div className="mt-2 flex justify-between text-xs text-[#6B6480]">
                <span>₹{minRange[0].toLocaleString('en-IN')}</span>
                <span>₹{minRange[1].toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#6B6480] mb-2">Subscription</div>
            <div className="space-y-2">
              {['Free','Paid'].map(s => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={sub.includes(s)} onCheckedChange={()=>toggleArr(sub, setSub, s)} />
                  {s}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#6B6480] mb-2">Constituents</div>
            <div className="space-y-2">
              {['Stock','ETF','Mutual Fund'].map(t => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={types.includes(t)} onCheckedChange={()=>toggleArr(types, setTypes, t)} />
                  {t}
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* Results */}
        <div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-[#6B6480]"><span className="font-semibold text-[#1A1030]">{filtered.length}</span> baskets</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[#6B6480]">Sort</span>
              <div className="inline-flex bg-[#F7F4FB] rounded-full p-1">
                {SORT_OPTIONS.map(o => (
                  <button key={o.key} onClick={()=>setSort(o.key)} className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${sort===o.key ? 'bg-white text-[#6C2BD9] shadow-sm' : 'text-[#6B6480] hover:text-[#1A1030]'}`}>{o.label}</button>
                ))}
              </div>
            </div>
          </div>

          {(strategy || risk.length || sub.length || types.length || q) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {strategy && <button onClick={()=>setStrategy('')} className="chip-brand">{strategies.find(s=>s.key===strategy)?.label} <X className="h-3 w-3" /></button>}
              {risk.map(r => <button key={r} onClick={()=>toggleArr(risk,setRisk,r)} className="chip-brand">{r} <X className="h-3 w-3" /></button>)}
              {sub.map(s => <button key={s} onClick={()=>toggleArr(sub,setSub,s)} className="chip-brand">{s} <X className="h-3 w-3" /></button>)}
              {types.map(t => <button key={t} onClick={()=>toggleArr(types,setTypes,t)} className="chip-brand">{t} <X className="h-3 w-3" /></button>)}
            </div>
          )}

          <div className="mt-6 grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map(b => <BasketCard key={b.id} basket={b} />)}
          </div>

          {filtered.length === 0 && (
            <div className="surface p-14 text-center mt-6">
              <div className="text-lg font-semibold">No baskets match your filters</div>
              <div className="text-sm text-[#6B6480] mt-1">Try loosening a filter or clearing all.</div>
              <button onClick={clearAll} className="btn-primary mt-5">Clear filters</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

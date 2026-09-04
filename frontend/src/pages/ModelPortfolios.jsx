import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { track } from '../lib/track';
import CoverArt from '../components/CoverArt';
import { Badge, VolatilityBadge, AccessBadge, Delta, Metric, INR } from '../components/Tone';
import { Search, Sparkles, Bookmark, SlidersHorizontal, ChevronDown, TrendingUp, ArrowRight, X } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ---- filter model (URL-backed so every filtered view is shareable) ----
const CATEGORIES = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'asset-allocation', label: 'Asset allocation', match: (b) => b.strategy === 'asset-allocation' },
  { key: 'sectoral', label: 'Sectoral', match: (b) => b.strategy === 'sectoral' },
  { key: 'thematic', label: 'Thematic', match: (b) => b.strategy === 'thematic' },
  { key: 'smart-beta', label: 'Smart beta', match: (b) => b.strategy === 'smart-beta' || b.strategy === 'model-based' },
];
const ACCESS = [
  { key: 'all', label: 'Show all' },
  { key: 'free', label: 'Free access', match: (b) => b.subscription !== 'Paid' },
  { key: 'paid', label: 'Fee based', match: (b) => b.subscription === 'Paid' },
];
const VOL = [
  { key: 'all', label: 'Any' },
  { key: 'Low', label: 'Low' },
  { key: 'Medium', label: 'Medium' },
  { key: 'High', label: 'High' },
];
const SORTS = [
  { key: 'popular', label: 'Popularity', cmp: (a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.subscribers || 0) - (a.subscribers || 0) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')) },
  { key: 'newest', label: 'Newest', cmp: (a, b) => String(b.launch_date || '').localeCompare(String(a.launch_date || '')) },
  { key: 'returns', label: 'Returns', cmp: (a, b) => (b.headline ?? -1e9) - (a.headline ?? -1e9) },
  { key: 'amount', label: 'Min. amount', cmp: (a, b) => (a.minAmount || 0) - (b.minAmount || 0) },
];

const launchedLabel = (days) => (days === 0 ? 'launched today' : days === 1 ? 'launched yesterday' : days > 1 ? `${days} days live` : 'since launch');
const perMonth = (b) => (b.feeAmount ? b.feeAmount / ({ monthly: 1, quarterly: 3, 'half-yearly': 6, yearly: 12 }[b.feeCycle] || 1) : null);

// saved-for-later lives in the browser only (no account needed to browse)
const SAVED_KEY = 'omnivest-saved-v1';
const readSaved = () => { try { return new Set(JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')); } catch { return new Set(); } };

function PortfolioRow({ b, i, saved, onSave }) {
  const c = b.computed && b.computed.status === 'ok' ? b.computed : null;
  const useCagr = !!(c && c.cagr_pct !== null && c.cagr_pct !== undefined);
  const isNew = !!(c && !useCagr && (c.launched_days_ago ?? 0) <= 30);
  const stocks = (b.constituents || []).length;
  const kind = (b.constituents || []).every((x) => x.type === 'ETF') && stocks ? 'ETFs' : 'stocks';
  return (
    <div className={`relative surface lift rise rise-${Math.min(i + 1, 6)} ${b.featured ? 'border-[#D8C7F1] ring-1 ring-[#EDE9FE]' : ''}`} data-testid="explore-row">
      {/* The whole row is one link; the bookmark sits beside it, never inside it. */}
      <Link to={`/model-portfolios/${b.id}`} data-testid="explore-card" className="block p-4 sm:p-5 pr-14 sm:pr-16 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6C2BD9] rounded-2xl">
        <div className="grid gap-x-3 gap-y-4 sm:gap-x-4 grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)] lg:grid-cols-[64px_minmax(0,1fr)_auto] lg:items-center">
          {/* one cover element at every width (the journey test and screen readers see exactly one) */}
          <div className="self-start">
            {b.cover ? <CoverArt cover={b.cover} name={b.name} size={52} radius={14} className="sm:!h-16 sm:!w-16" /> : <span className="h-[52px] w-[52px] sm:h-16 sm:w-16 rounded-2xl grad-card text-white grid place-items-center text-lg font-bold">{b.name.slice(0, 2).toUpperCase()}</span>}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[17px] sm:text-[18px] font-bold text-[#0F1729] leading-snug">{b.name}</h3>
              {b.featured && <Badge tone="brand" icon={<Sparkles className="h-3 w-3" aria-hidden="true" />}>Featured</Badge>}
              {isNew && <Badge tone="info">New</Badge>}
            </div>
            <div className="text-[13px] text-[#526071] mt-0.5">by {b.managerName}</div>
            <p className="mt-2.5 text-[14px] text-[#526071] leading-relaxed line-clamp-2">{b.subtitle}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral">{stocks} {kind}</Badge>
              <Badge tone="neutral">{(b.strategy || 'thematic').replace('-', ' ')}</Badge>
              {(b.tags || []).slice(0, 2).map((t) => <Badge key={t} tone="info">{t}</Badge>)}
              <AccessBadge paid={b.subscription === 'Paid'} perMonth={perMonth(b)} />
            </div>
          </div>
          {/* Same three metrics, same order, on every row — the eye learns where to look. */}
          <div className="col-span-2 lg:col-span-1 grid grid-cols-3 gap-3 lg:gap-6 lg:w-[360px] pt-3 lg:pt-0 border-t lg:border-t-0 border-[#EEF1F6]">
            <Metric label="Min. amount" value={INR(b.minAmount)} sub={c ? "today's prices" : 'to start'} size="sm" testid="row-min" />
            <Metric label={useCagr ? 'CAGR' : 'Since launch'} size="sm" testid="row-return"
              value={c ? (b.headline === null ? <span className="text-[#5320A8]">New</span> : <Delta value={b.headline} />) : <span className="text-[#667085]">—</span>}
              sub={c ? launchedLabel(c.launched_days_ago) : 'computing'} />
            <div className="min-w-0">
              <div className="t-label leading-4">Volatility</div>
              <div className="mt-1">{b.volatility ? <VolatilityBadge level={b.volatility} /> : <span className="text-[13px] text-[#667085]">after 20 days</span>}</div>
            </div>
          </div>
        </div>
      </Link>
      <button type="button" onClick={() => onSave(b.id)} aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save for later'}
        className={`absolute top-3 right-3 h-10 w-10 grid place-items-center rounded-full transition-colors ${saved ? 'text-[#5320A8] bg-[#F1E7FE]' : 'text-[#667085] hover:text-[#5320A8] hover:bg-[#F7F4FB]'}`} data-testid="save-btn">
        <Bookmark className="h-[18px] w-[18px]" fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
    </div>
  );
}

function RailGroup({ title, children }) {
  return (
    <div className="pt-5 first:pt-0">
      <div className="t-label mb-2">{title}</div>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children, testid }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} aria-pressed={active}
      className={`h-10 sm:h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors whitespace-nowrap ${active ? 'bg-[#6C2BD9] text-white' : 'bg-white border border-[#E6E8F0] text-[#334155] hover:border-[#6C2BD9] hover:text-[#6C2BD9]'}`}>
      {children}
    </button>
  );
}

export default function ModelPortfolios() {
  const [params, setParams] = useSearchParams();
  const category = params.get('filter') || 'all';
  const access = params.get('access') || 'all';
  const vol = params.get('vol') || 'all';
  const sort = params.get('sort') || 'popular';
  const savedOnly = params.get('saved') === '1';
  const [q, setQ] = useState('');
  const [dbPortfolios, setDbPortfolios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(readSaved);
  const [moreOpen, setMoreOpen] = useState(false);

  const setParam = useCallback((k, v, def = 'all') => {
    const next = new URLSearchParams(params);
    if (!v || v === def) next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  }, [params, setParams]);
  const reset = () => setParams({}, { replace: true });
  const activeCount = [category !== 'all', access !== 'all', vol !== 'all', savedOnly].filter(Boolean).length;

  const toggleSave = (id) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(next))); } catch { /* private mode */ }
      track(next.has(id) ? 'portfolio_save' : 'portfolio_unsave', { portfolio_id: id });
      return next;
    });
  };

  useEffect(() => {
    axios.get(`${API}/portfolios`)
      .then(({ data }) => {
        const list = data.portfolios || [];
        setDbPortfolios(list);
        list.forEach((p) => track('portfolio_impression', { portfolio_id: p.id }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const all = useMemo(() => dbPortfolios.map((p) => {
    const c = p.computed && p.computed.status === 'ok' ? p.computed : null;
    const useCagr = !!(c && c.cagr_pct !== null && c.cagr_pct !== undefined);
    return {
      ...p,
      managerName: p.owner_name || 'Research Analyst',
      subtitle: p.subtitle || '',
      strategy: p.strategy || 'thematic',
      minAmount: (c && c.min_investment) || p.minAmount || 0,
      headline: c ? (useCagr ? c.cagr_pct : c.return_pct) : null,
      volatility: c ? c.volatility_label : null,
      constituents: p.constituents || [],
    };
  }), [dbPortfolios]);

  const list = useMemo(() => {
    const cat = CATEGORIES.find((x) => x.key === category) || CATEGORIES[0];
    const acc = ACCESS.find((x) => x.key === access) || ACCESS[0];
    const s = SORTS.find((x) => x.key === sort) || SORTS[0];
    const needle = q.trim().toLowerCase();
    return all
      .filter(cat.match)
      .filter((b) => !acc.match || acc.match(b))
      .filter((b) => vol === 'all' || b.volatility === vol)
      .filter((b) => !savedOnly || saved.has(b.id))
      .filter((b) => !needle || b.name.toLowerCase().includes(needle) || b.subtitle.toLowerCase().includes(needle) || (b.tags || []).some((t) => t.toLowerCase().includes(needle)) || b.managerName.toLowerCase().includes(needle))
      .sort(s.cmp);
  }, [all, category, access, vol, sort, savedOnly, saved, q]);

  const rail = (
    <>
      <RailGroup title="Category">
        <div className="flex flex-col gap-1">
          {CATEGORIES.map((f) => (
            <button key={f.key} type="button" onClick={() => setParam('filter', f.key)} aria-pressed={category === f.key}
              className={`h-10 text-left rounded-lg px-3 text-[14px] font-medium transition-colors ${category === f.key ? 'bg-[#F1E7FE] text-[#5320A8] font-semibold' : 'text-[#334155] hover:bg-[#F7F4FB]'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </RailGroup>
      <RailGroup title="Subscription type">
        <div className="grid grid-cols-3 rounded-xl border border-[#E6E8F0] overflow-hidden">
          {ACCESS.map((a) => (
            <button key={a.key} type="button" onClick={() => setParam('access', a.key)} aria-pressed={access === a.key}
              className={`h-10 text-[13px] font-semibold transition-colors ${access === a.key ? 'bg-[#F1E7FE] text-[#5320A8]' : 'bg-white text-[#334155] hover:bg-[#F7F4FB]'}`}>
              {a.label}
            </button>
          ))}
        </div>
      </RailGroup>
      <RailGroup title="Volatility">
        <div className="flex flex-wrap gap-1.5">
          {VOL.map((v) => <Pill key={v.key} active={vol === v.key} onClick={() => setParam('vol', v.key)}>{v.label}</Pill>)}
        </div>
      </RailGroup>
      <RailGroup title="Saved">
        <Pill active={savedOnly} onClick={() => setParam('saved', savedOnly ? '' : '1', '')} testid="saved-filter"><Bookmark className="h-3.5 w-3.5" aria-hidden="true" /> Saved only{saved.size ? ` (${saved.size})` : ''}</Pill>
      </RailGroup>
    </>
  );

  return (
    <div>
      <section className="grad-hero border-b border-[#E6E8F0]">
        <div className="container-x py-10 sm:py-14">
          <div className="eyebrow">Model portfolios</div>
          <h1 className="mt-3 t-h1 sm:t-display">Invest in ideas, <span className="text-[#6C2BD9]">not just stocks</span></h1>
          <p className="mt-4 t-lead max-w-2xl">Curated baskets of stocks and ETFs, built and rebalanced by SEBI-registered managers. Buy the whole idea in one click.</p>
          <div className="mt-6 max-w-xl relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#667085]" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, theme, tag or manager" aria-label="Search model portfolios"
              className="w-full h-12 rounded-full border border-[#E6E8F0] bg-white pl-11 pr-4 text-[15px] outline-none focus:border-[#6C2BD9] focus:ring-2 focus:ring-[#EDE9FE] transition-shadow" data-testid="explore-search" />
          </div>
        </div>
      </section>

      <section className="container-x py-6 sm:py-10">
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
          {/* Desktop rail */}
          <aside className="hidden lg:block sticky top-24 self-start">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-bold text-[#0F1729]">Filters {activeCount ? <span className="ml-1 inline-grid place-items-center h-5 min-w-[20px] px-1 rounded-full bg-[#6C2BD9] text-white text-[12px]">{activeCount}</span> : null}</div>
              <button type="button" onClick={reset} className="text-[13px] font-semibold text-[#5320A8] hover:underline disabled:opacity-40" disabled={!activeCount}>Reset</button>
            </div>
            <div className="mt-3 divide-y divide-[#EEF1F6]">{rail}</div>
          </aside>

          <div className="min-w-0">
            {/* Mobile: category chips + a filter sheet */}
            <div className="lg:hidden -mx-5 px-5 flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {CATEGORIES.map((f) => <Pill key={f.key} active={category === f.key} onClick={() => setParam('filter', f.key)}>{f.label}</Pill>)}
              <Pill active={moreOpen || access !== 'all' || vol !== 'all' || savedOnly} onClick={() => setMoreOpen((o) => !o)} testid="more-filters"><SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> Filters{activeCount ? ` · ${activeCount}` : ''}</Pill>
            </div>
            {moreOpen && (
              <div className="lg:hidden mt-3 surface p-4 relative" data-testid="filter-sheet">
                <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close filters" className="absolute top-2 right-2 h-10 w-10 grid place-items-center rounded-full text-[#667085] hover:bg-[#F7F4FB]"><X className="h-4 w-4" /></button>
                <div className="divide-y divide-[#EEF1F6] pr-8">{rail}</div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-[14px] text-[#526071]" data-testid="explore-count"><b className="num text-[#0F1729]">{list.length}</b> model portfolio{list.length !== 1 ? 's' : ''}</div>
              <label className="relative inline-flex items-center gap-2 text-[13px] text-[#526071]">
                <span className="hidden sm:inline">Sort by</span>
                <select value={sort} onChange={(e) => setParam('sort', e.target.value, 'popular')} aria-label="Sort by"
                  className="appearance-none h-10 rounded-full border border-[#E6E8F0] bg-white pl-3.5 pr-9 text-[13px] font-semibold text-[#0F1729] outline-none focus:border-[#6C2BD9]" data-testid="explore-sort">
                  {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-[#667085]" aria-hidden="true" />
              </label>
            </div>

            <div className="mt-4 space-y-3">
              {list.map((b, i) => <PortfolioRow key={b.id} b={b} i={i} saved={saved.has(b.id)} onSave={toggleSave} />)}
            </div>

            {loading ? (
              <div className="mt-3 space-y-3" data-testid="explore-skeleton" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="surface p-5 grid gap-4 sm:grid-cols-[64px_1fr] lg:grid-cols-[64px_1fr_360px]">
                    <div className="skeleton h-16 w-16 rounded-2xl hidden sm:block" />
                    <div className="space-y-2"><div className="skeleton h-5 w-2/5" /><div className="skeleton h-3.5 w-1/4" /><div className="skeleton h-4 w-4/5 mt-3" /><div className="skeleton h-6 w-1/2 rounded-full mt-2" /></div>
                    <div className="grid grid-cols-3 gap-4"><div className="skeleton h-10" /><div className="skeleton h-10" /><div className="skeleton h-10" /></div>
                  </div>
                ))}
              </div>
            ) : all.length === 0 ? (
              <div className="mt-6 surface overflow-hidden" data-testid="explore-empty">
                <div className="grad-band text-white px-6 py-8 sm:px-10 sm:py-10">
                  <div className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-white/80"><TrendingUp className="h-4 w-4" aria-hidden="true" /> Opening soon</div>
                  <h2 className="mt-3 t-h2 text-white">The first model portfolios are in review</h2>
                  <p className="mt-2 text-white/85 max-w-xl">SEBI-registered managers are building their baskets right now. Every listing is checked by Omnivest before it goes live, and its track record starts on the day it is approved. No backtests.</p>
                </div>
                <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#EEF1F6]">
                  <Link to="/partner" className="p-5 hover:bg-[#FAFAFE] transition-colors group">
                    <div className="text-[15px] font-bold text-[#0F1729]">Are you a research analyst?</div>
                    <div className="mt-1 text-[13px] text-[#526071]">List your model portfolio and reach investors on day one.</div>
                    <div className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#5320A8]">Become a partner <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></div>
                  </Link>
                  <Link to="/learn" className="p-5 hover:bg-[#FAFAFE] transition-colors group">
                    <div className="text-[15px] font-bold text-[#0F1729]">How model portfolios work</div>
                    <div className="mt-1 text-[13px] text-[#526071]">Baskets, rebalances, fees and what a track record really means.</div>
                    <div className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#5320A8]">Read the guide <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></div>
                  </Link>
                  <Link to="/calculators/sip" className="p-5 hover:bg-[#FAFAFE] transition-colors group">
                    <div className="text-[15px] font-bold text-[#0F1729]">Plan your first SIP</div>
                    <div className="mt-1 text-[13px] text-[#526071]">See what a monthly amount grows into before the listings open.</div>
                    <div className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#5320A8]">Open the calculator <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></div>
                  </Link>
                </div>
              </div>
            ) : list.length === 0 ? (
              <div className="mt-10 surface p-10 text-center" data-testid="explore-no-match">
                <div className="text-[16px] font-bold text-[#0F1729]">Nothing matches those filters</div>
                <p className="mt-1 text-[14px] text-[#526071]">Try a broader category or clear the filters.</p>
                <button type="button" onClick={() => { reset(); setQ(''); }} className="btn-outline mt-4">Clear filters</button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

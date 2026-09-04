import React, { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { track } from '../lib/track';
import { getManager } from '../mock';
import CoverArt from '../components/CoverArt';
import { TrendingUp, TrendingDown, Users, Search, Sparkles, Lock } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'asset-allocation', label: 'Asset allocation', match: (b) => b.strategy === 'asset-allocation' },
  { key: 'sectoral', label: 'Sectoral', match: (b) => b.strategy === 'sectoral' },
  { key: 'thematic', label: 'Thematic', match: (b) => b.strategy === 'thematic' },
  { key: 'smart-beta', label: 'Smart beta', match: (b) => b.strategy === 'smart-beta' || b.strategy === 'model-based' },
];

const riskColor = (risk) => risk === 'Low' ? 'text-[#0B7F4A] bg-[#DCFCE7]' : risk === 'High' ? 'text-[#B91C1C] bg-[#FEE2E2]' : 'text-[#9A4A05] bg-[#FEF3C7]';

const pct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`);
const launchedLabel = (days) => (days === 0 ? 'Launched today' : days === 1 ? 'Launched yesterday' : days > 1 ? `Launched ${days} days ago` : 'Since launch');

function PortfolioCard({ b }) {
  const mgr = b.managerId ? getManager(b.managerId) : null;
  const managerName = mgr?.name || b.managerName || b.owner_name || 'Research Analyst';
  const c = b.computed && b.computed.status === 'ok' ? b.computed : null;
  const useCagr = !!(c && c.cagr_pct !== null && c.cagr_pct !== undefined);
  const headline = c ? (useCagr ? c.cagr_pct : c.return_pct) : null;
  const risk = c ? c.volatility_label : (b._db ? null : b.risk);
  const minAmount = (c && c.min_investment) || b.minAmount;
  const isNew = b._db && c && !useCagr;
  return (
    <Link to={`/model-portfolios/${b.id}`} data-testid="explore-card"
      className={`group surface p-5 hover:shadow-[0_16px_40px_-24px_rgba(108,43,217,0.35)] hover:border-[#D8C7F1] transition-all block relative ${b.featured ? 'border-[#D8C7F1] ring-1 ring-[#EDE9FE]' : ''}`}>
      {b.featured && <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full grad-card text-white text-[12px] font-bold px-2.5 py-0.5 shadow"><Sparkles className="h-3 w-3" /> Featured</span>}
      <div className="flex items-start gap-3">
        {b.cover ? <CoverArt cover={b.cover} name={b.name} size={48} radius={14} /> : (
          <span className="h-11 w-11 shrink-0 rounded-xl grad-card text-white grid place-items-center text-sm font-bold">{b.name.slice(0, 2).toUpperCase()}</span>
        )}
        <div className="min-w-0">
          <div className="text-xs text-[#526071]">by {managerName}</div>
          <h3 className="text-[16px] font-semibold text-[#0F1729] leading-snug group-hover:text-[#6C2BD9]">{b.name}</h3>
        </div>
      </div>
      <p className="mt-3 text-sm text-[#526071] line-clamp-2 min-h-[40px]">{b.subtitle}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {risk ? <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${riskColor(risk)}`}>{risk} volatility</span> : null}
        {isNew ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold bg-[#EDE9FE] text-[#6C2BD9]">New</span> : null}
        <span className="chip-brand">{b.strategy.replace('-', ' ')}</span>
        {(b.tags || []).slice(0, 2).map((t) => <span key={t} className="chip">{t}</span>)}
        <span className="chip">{(b.constituents || []).length} stocks</span>
        {b.subscription === 'Paid' ? <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold bg-[#FEF3C7] text-[#9A4A05]"><Lock className="h-3 w-3" /> {b.feeAmount ? `from ₹${Math.round(b.feeAmount / ({ monthly: 1, quarterly: 3, 'half-yearly': 6, yearly: 12 }[b.feeCycle] || 1))}/mo` : 'Paid'}</span> : null}
      </div>

      <div className="mt-4 pt-3 border-t border-[#EEF1F6] grid grid-cols-2 gap-3">
        <div>
          {b._db ? (
            <>
              <div className="text-[12px] text-[#526071] font-medium uppercase tracking-wider">{useCagr ? 'CAGR' : 'Since launch'}</div>
              <div className={`num mt-0.5 text-[17px] font-semibold flex items-center gap-1 ${headline === null ? (c ? 'text-[#6C2BD9]' : 'text-[#667085]') : headline < 0 ? 'text-[#B91C1C]' : 'text-[#0B7F4A]'}`}>
                {headline !== null && headline < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />} {c ? (headline === null ? 'New' : pct(headline)) : '—'}
              </div>
              <div className="text-[12px] text-[#667085]">{c ? launchedLabel(c.launched_days_ago) : (b.launch_date ? launchedLabel(Math.max(0, Math.round((Date.now() - new Date(`${b.launch_date}T00:00:00`)) / 86400000))) : 'computing…')}</div>
            </>
          ) : (
            <>
              <div className="text-[12px] text-[#526071] font-medium uppercase tracking-wider">3Y Return</div>
              <div className="num mt-0.5 text-[17px] font-semibold text-[#0B7F4A] flex items-center gap-1">
                <TrendingUp className="h-4 w-4" /> {b.returns.y3.toFixed(1)}%
              </div>
            </>
          )}
        </div>
        <div>
          <div className="text-[12px] text-[#526071] font-medium uppercase tracking-wider">Min. amount</div>
          <div className="num mt-0.5 text-[17px] font-semibold text-[#0F1729]">₹{Number(minAmount || 0).toLocaleString('en-IN')}</div>
        </div>
      </div>
    </Link>
  );
}

export default function ModelPortfolios() {
  const [params, setParams] = useSearchParams();
  const active = params.get('filter') || 'all';
  const [q, setQ] = useState('');
  const [dbPortfolios, setDbPortfolios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/portfolios`)
      .then(({ data }) => {
        const list = data.portfolios || [];
        setDbPortfolios(list);
        // partner analytics: one impression per listed portfolio per page view
        list.forEach((p) => track('portfolio_impression', { portfolio_id: p.id }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const allBaskets = useMemo(() => {
    return dbPortfolios.map((p) => ({
      ...p,
      managerName: p.owner_name,
      _db: true,
      subtitle: p.subtitle || '',
      risk: p.risk || 'Medium',
      strategy: p.strategy || 'thematic',
      minAmount: p.minAmount || 0,
      returns: { y1: 0, y3: 0, y5: 0, cagr: 0, ...(p.returns || {}) },
      constituents: p.constituents || [],
    }));
  }, [dbPortfolios]);

  const list = useMemo(() => {
    const f = FILTERS.find((x) => x.key === active) || FILTERS[0];
    return allBaskets.filter(f.match).filter((b) =>
      !q || b.name.toLowerCase().includes(q.toLowerCase()) || (b.subtitle || '').toLowerCase().includes(q.toLowerCase()) || (b.tags || []).some((t) => t.toLowerCase().includes(q.toLowerCase()))
    );
  }, [active, q, allBaskets]);

  return (
    <div>
      {/* Hero */}
      <section className="grad-hero border-b border-[#E6E8F0]">
        <div className="container-x py-14">
          <div className="eyebrow">Model Portfolios</div>
          <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight">
            Invest in ideas, <span className="text-[#6C2BD9]">not just stocks</span>
          </h1>
          <p className="mt-4 text-lg text-[#526071] max-w-2xl">
            Curated baskets of stocks & ETFs, built and rebalanced by SEBI-registered managers. Buy the whole idea in one click.
          </p>

          <div className="mt-6 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#667085]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search model portfolios…"
              className="w-full rounded-full border border-[#E6E8F0] bg-white pl-10 pr-4 py-3 text-sm outline-none focus:border-[#6C2BD9]" />
          </div>
        </div>
      </section>

      {/* Filters + grid */}
      <section className="container-x py-10">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.key}
              onClick={() => setParams(f.key === 'all' ? {} : { filter: f.key })}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${active === f.key ? 'bg-[#6C2BD9] text-white' : 'bg-white border border-[#E6E8F0] text-[#334155] hover:border-[#6C2BD9] hover:text-[#6C2BD9]'}`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-[#526071]">
          <Users className="h-4 w-4" /> {list.length} model portfolio{list.length !== 1 ? 's' : ''}
        </div>

        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((b) => <PortfolioCard key={b.id} b={b} />)}
        </div>

        {loading ? (
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse" data-testid="explore-skeleton">
            {[0, 1, 2].map((i) => (
              <div key={i} className="surface p-5"><div className="flex items-start gap-3"><div className="h-12 w-12 rounded-xl bg-[#EEE8F7]" /><div className="flex-1 space-y-2"><div className="h-3 w-1/3 rounded bg-[#F1EBF9]" /><div className="h-4 w-2/3 rounded bg-[#EEE8F7]" /></div></div><div className="mt-4 h-4 w-5/6 rounded bg-[#F1EBF9]" /><div className="mt-2 h-4 w-1/2 rounded bg-[#F1EBF9]" /><div className="mt-5 h-12 rounded-xl bg-[#F5F2FA]" /></div>
            ))}
          </div>
        ) : allBaskets.length === 0 ? (
          <div className="mt-12 surface p-12 text-center max-w-xl mx-auto">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-[#F1E7FE] text-[#6C2BD9] grid place-items-center"><TrendingUp className="h-6 w-6" /></div>
            <div className="mt-4 text-lg font-semibold text-[#0F1729]">No model portfolios published yet</div>
            <p className="mt-2 text-sm text-[#526071]">Research analysts are building baskets right now. Once they're reviewed and approved, they'll appear here.</p>
          </div>
        ) : list.length === 0 ? (
          <div className="mt-16 text-center text-[#526071]">No model portfolios match your search.</div>
        ) : null}
      </section>
    </div>
  );
}

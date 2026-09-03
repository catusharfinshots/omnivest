import React, { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { track } from '../lib/track';
import { getManager } from '../mock';
import { TrendingUp, TrendingDown, Users, Search } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'asset-allocation', label: 'Asset allocation', match: (b) => b.strategy === 'asset-allocation' },
  { key: 'sectoral', label: 'Sectoral', match: (b) => b.strategy === 'sectoral' },
  { key: 'thematic', label: 'Thematic', match: (b) => b.strategy === 'thematic' },
  { key: 'smart-beta', label: 'Smart beta', match: (b) => b.strategy === 'smart-beta' || b.strategy === 'model-based' },
];

const riskColor = (risk) => risk === 'Low' ? 'text-[#0E9F5E] bg-[#DCFCE7]' : risk === 'High' ? 'text-[#DC2626] bg-[#FEE2E2]' : 'text-[#B45309] bg-[#FEF3C7]';

const pct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`);
const launchedLabel = (days) => (days === 0 ? 'Launched today' : days === 1 ? 'Launched yesterday' : days > 1 ? `Launched ${days} days ago` : 'Since launch');

function PortfolioCard({ b }) {
  const mgr = b.managerId ? getManager(b.managerId) : null;
  const managerName = mgr?.name || b.managerName || b.owner_name || 'Research Analyst';
  const c = b.computed && b.computed.status === 'ok' ? b.computed : null;
  const useCagr = !!(c && c.cagr_pct !== null && c.cagr_pct !== undefined);
  const headline = c ? (useCagr ? c.cagr_pct : c.return_pct) : null;
  const risk = (c && c.volatility_label) || b.risk;
  const minAmount = (c && c.min_investment) || b.minAmount;
  const isNew = b._db && c && !useCagr;
  return (
    <Link to={`/model-portfolios/${b.id}`}
      className="group surface p-5 hover:shadow-[0_16px_40px_-24px_rgba(108,43,217,0.35)] hover:border-[#D8C7F1] transition-all block">
      <div className="flex items-start gap-3">
        <span className="h-11 w-11 shrink-0 rounded-xl grad-card text-white grid place-items-center text-sm font-bold">
          {b.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="text-xs text-[#64748B]">by {managerName}</div>
          <h3 className="text-[16px] font-semibold text-[#0F1729] leading-snug group-hover:text-[#6C2BD9]">{b.name}</h3>
        </div>
      </div>
      <p className="mt-3 text-sm text-[#64748B] line-clamp-2 min-h-[40px]">{b.subtitle}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {risk ? <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${riskColor(risk)}`}>{risk} volatility</span> : null}
        {isNew ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-[#EDE9FE] text-[#6C2BD9]">New</span> : null}
        <span className="chip-brand">{b.strategy.replace('-', ' ')}</span>
        <span className="chip">{(b.constituents || []).length} stocks</span>
      </div>

      <div className="mt-4 pt-3 border-t border-[#EEF1F6] grid grid-cols-2 gap-3">
        <div>
          {b._db ? (
            <>
              <div className="text-[11px] text-[#64748B] font-medium uppercase tracking-wider">{useCagr ? 'CAGR' : 'Since launch'}</div>
              <div className={`num mt-0.5 text-[17px] font-semibold flex items-center gap-1 ${headline === null ? (c ? 'text-[#6C2BD9]' : 'text-[#94A3B8]') : headline < 0 ? 'text-[#DC2626]' : 'text-[#0E9F5E]'}`}>
                {headline !== null && headline < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />} {c ? (headline === null ? 'New' : pct(headline)) : '—'}
              </div>
              <div className="text-[10px] text-[#94A3B8]">{c ? launchedLabel(c.launched_days_ago) : (b.launch_date ? launchedLabel(Math.max(0, Math.round((Date.now() - new Date(`${b.launch_date}T00:00:00`)) / 86400000))) : 'computing…')}</div>
            </>
          ) : (
            <>
              <div className="text-[11px] text-[#64748B] font-medium uppercase tracking-wider">3Y Return</div>
              <div className="num mt-0.5 text-[17px] font-semibold text-[#0E9F5E] flex items-center gap-1">
                <TrendingUp className="h-4 w-4" /> {b.returns.y3.toFixed(1)}%
              </div>
            </>
          )}
        </div>
        <div>
          <div className="text-[11px] text-[#64748B] font-medium uppercase tracking-wider">Min. amount</div>
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
      !q || b.name.toLowerCase().includes(q.toLowerCase()) || (b.subtitle || '').toLowerCase().includes(q.toLowerCase())
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
          <p className="mt-4 text-lg text-[#64748B] max-w-2xl">
            Curated baskets of stocks & ETFs, built and rebalanced by SEBI-registered managers. Buy the whole idea in one click.
          </p>

          <div className="mt-6 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
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

        <div className="mt-4 flex items-center gap-2 text-sm text-[#64748B]">
          <Users className="h-4 w-4" /> {list.length} model portfolio{list.length !== 1 ? 's' : ''}
        </div>

        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((b) => <PortfolioCard key={b.id} b={b} />)}
        </div>

        {loading ? (
          <div className="mt-16 text-center text-[#64748B]">Loading model portfolios…</div>
        ) : allBaskets.length === 0 ? (
          <div className="mt-12 surface p-12 text-center max-w-xl mx-auto">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-[#F1E7FE] text-[#6C2BD9] grid place-items-center"><TrendingUp className="h-6 w-6" /></div>
            <div className="mt-4 text-lg font-semibold text-[#0F1729]">No model portfolios published yet</div>
            <p className="mt-2 text-sm text-[#64748B]">Research analysts are building baskets right now. Once they're reviewed and approved, they'll appear here.</p>
          </div>
        ) : list.length === 0 ? (
          <div className="mt-16 text-center text-[#64748B]">No model portfolios match your search.</div>
        ) : null}
      </section>
    </div>
  );
}

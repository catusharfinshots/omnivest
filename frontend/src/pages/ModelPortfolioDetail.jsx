import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { track } from '../lib/track';
import { getBasket, getManager } from '../mock';
import { getPrice } from '../lib/prices';
import PerformanceChart from '../components/PerformanceChart';
import Seo from '../components/Seo';
import InvestFlow from '../components/InvestFlow';
import ShareButton from '../components/ShareButton';
import { useAuth } from '../context/AuthContext';
import { usePortfolio } from '../context/PortfolioContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, TrendingUp, TrendingDown, ShieldCheck, Repeat, Layers, FileText, BookOpen, FlaskConical,
  Heart, ChevronRight, Award, Info,
} from 'lucide-react';

const TABS = ['Overview', 'Stocks & Weights', 'Methodology', 'Returns'];
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ModelPortfolioDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const mockBasket = getBasket(id);
  const { isAuthed, openAuth } = useAuth();
  const { toggleWatch, isWatched } = usePortfolio();
  const [tab, setTab] = useState('Overview');
  const [investOpen, setInvestOpen] = useState(false);
  const [perf, setPerf] = useState(null); // computed performance (engine)
  const [methodOpen, setMethodOpen] = useState(false);
  const [basket, setBasket] = useState(mockBasket || null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (mockBasket) { setBasket(mockBasket); setNotFound(false); return; }
    let active = true;
    axios.get(`${API}/portfolios/${id}`).then(({ data }) => {
      if (!active) return;
      const p = data.portfolio;
      setBasket({
        ...p,
        fee: { amount: p.feeAmount || 0, cycle: p.feeCycle || 'monthly' },
        lastRebalancedAt: p.updated_at || new Date().toISOString(),
        managerName: p.owner_name,
      });
      track('portfolio_view', { portfolio_id: p.id });
      axios.get(`${API}/portfolios/${p.id}/performance`).then((r) => { if (active) setPerf(r.data); }).catch(() => {});
    }).catch(() => { if (active) setNotFound(true); });
    return () => { active = false; };
  }, [id, mockBasket]);

  const manager = useMemo(() => {
    if (!basket) return null;
    if (basket.managerId) return getManager(basket.managerId);
    return {
      name: basket.owner_name || basket.managerName || 'Research Analyst',
      logo: (basket.owner_name || basket.managerName || 'AN').slice(0, 2).toUpperCase(),
      baskets: '—', sebiReg: '—', description: '', philosophy: 'Research-analyst managed portfolio',
    };
  }, [basket]);

  if (notFound) {
    return (
      <div className="container-x py-24 text-center">
        <h1 className="text-2xl font-bold">Model portfolio not found</h1>
        <Link to="/model-portfolios" className="btn-primary mt-6 inline-flex">Browse model portfolios</Link>
      </div>
    );
  }
  if (!basket) {
    return <div className="container-x py-24 text-center text-[#6B6480]">Loading portfolio…</div>;
  }

  const watched = isWatched(basket.id);

  const onInvest = () => {
    if (basket?._db !== false) track('invest_click', { portfolio_id: basket.id });
    if (!isAuthed) {
      openAuth({ next: `/model-portfolios/${basket.id}` });
      return;
    }
    setInvestOpen(true);
  };

  // Computed performance (engine): live since launch day, never typed.
  const perfOk = perf && perf.status === 'ok';
  const pm = perfOk ? perf.metrics : null;
  const pmBench = perfOk ? perf.bench_metrics?.[perf.benchmark] : null;
  const pmUseCagr = !!(pm && pm.cagr_pct !== null);
  const pmHeadline = pm ? (pmUseCagr ? pm.cagr_pct : pm.return_pct) : null;
  const pmBenchHeadline = pmBench ? (pmUseCagr ? pmBench.cagr_pct : pmBench.return_pct) : null;
  const pmAlpha = pmHeadline !== null && pmBenchHeadline !== null && pmBenchHeadline !== undefined ? +(pmHeadline - pmBenchHeadline).toFixed(2) : null;
  const pmVol = (pm && pm.volatility_label) || null;
  const minAmount = perfOk && perf.min_investment?.amount ? perf.min_investment.amount : basket.minAmount;
  const launchedAgo = perf?.launched_days_ago;
  const launchedLabel = launchedAgo === 0 ? 'launched today' : launchedAgo === 1 ? 'launched yesterday' : launchedAgo > 1 ? `launched ${launchedAgo} days ago` : 'since launch';
  const pct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`);
  const headlineText = pmHeadline === null ? 'New' : pct(pmHeadline);
  const stats = perfOk ? [
    { label: pmUseCagr ? 'CAGR' : 'Since launch', value: headlineText, sub: pmUseCagr ? `${pm.days} days live` : (pmHeadline === null ? 'returns from next market close' : launchedLabel), good: pmHeadline !== null && pmHeadline >= 0, bad: pmHeadline !== null && pmHeadline < 0 },
    { label: `vs ${perf.benchmark_labels?.[perf.benchmark] || perf.benchmark}`, value: pct(pmAlpha), sub: pmAlpha === null ? 'from next market close' : (pmAlpha >= 0 ? 'ahead of benchmark' : 'behind benchmark'), good: pmAlpha !== null && pmAlpha >= 0, bad: pmAlpha !== null && pmAlpha < 0 },
    { label: 'Min. Investment', value: INR(minAmount), sub: "at today's prices" },
    { label: 'Rebalance', value: basket.rebalanceFreq, sub: 'by manager' },
  ] : [
    { label: 'Performance', value: '—', sub: perf?.status === 'unavailable' ? 'market data reconnecting' : 'computing from exchange data' },
    { label: 'Launched', value: basket.launch_date ? new Date(`${basket.launch_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—', sub: 'live track record' },
    { label: 'Min. Investment', value: INR(minAmount), sub: 'to start' },
    { label: 'Rebalance', value: basket.rebalanceFreq, sub: 'by manager' },
  ];

  return (
    <div>
      <Seo title={basket.name} description={basket.subtitle || `${basket.name} — an expert-managed model portfolio on Omnivest.`} />
      {/* Header band */}
      <section className="grad-hero border-b border-[#E6E8F0]">
        <div className="container-x pt-6 pb-8">
          <div className="flex items-center justify-between gap-4">
            <button onClick={() => navigate('/model-portfolios')} className="inline-flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#6C2BD9]">
              <ArrowLeft className="h-4 w-4" /> All model portfolios
            </button>
            <ShareButton path={`/model-portfolios/${basket.id}`} title={`${basket.name} | Omnivest`} text={basket.subtitle || ''} onShare={() => track('share_click', { portfolio_id: basket.id })} />
          </div>

          <div className="mt-5 flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-start gap-4">
              <span className="h-14 w-14 rounded-2xl grad-card text-white grid place-items-center text-lg font-bold">
                {basket.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{basket.name}</h1>
                <button onClick={() => navigate(`/manager/${basket.managerId}`)} className="mt-1 text-sm text-[#64748B] hover:text-[#6C2BD9]">by {manager?.name}</button>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="chip"><Layers className="h-3.5 w-3.5" /> {basket.strategy.replace('-', ' ')}</span>
                  <span className="chip"><ShieldCheck className="h-3.5 w-3.5" /> {pmVol || basket.risk} volatility</span>
                  <span className={basket.subscription === 'Free' ? 'chip-brand' : 'chip-accent'}>{basket.subscription === 'Free' ? 'Free access' : `₹${basket.fee.amount}/${basket.fee.cycle === 'monthly' ? 'mo' : basket.fee.cycle}`}</span>
                </div>
              </div>
            </div>
            <div className="text-right" data-testid="header-cagr">
              <div className="text-xs text-[#64748B]">{perfOk ? (pmUseCagr ? 'CAGR' : 'Since launch') : 'Performance'}</div>
              <div className={`num text-3xl font-bold flex items-center gap-1 justify-end ${pmHeadline !== null && pmHeadline < 0 ? 'text-[#DC2626]' : pmHeadline !== null ? 'text-[#0E9F5E]' : perfOk ? 'text-[#6C2BD9]' : 'text-[#94A3B8]'}`}>
                {pmHeadline !== null && pmHeadline < 0 ? <TrendingDown className="h-6 w-6" /> : <TrendingUp className="h-6 w-6" />} {perfOk ? headlineText : '—'}
              </div>
              <div className="mt-1 text-[11px] text-[#64748B]">
                {perfOk
                  ? `${launchedLabel.charAt(0).toUpperCase() + launchedLabel.slice(1)}${pmVol ? ` · ${pmVol} volatility` : ''} · computed from exchange data`
                  : (perf?.status === 'unavailable' ? 'Market data reconnecting' : 'Computing from exchange data…')}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container-x py-8 grid lg:grid-cols-12 gap-8">
        {/* Main column */}
        <div className="lg:col-span-8">
          {/* Stat tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="surface p-4">
                <div className="text-[11px] uppercase tracking-wider text-[#64748B] font-semibold">{s.label}</div>
                <div className={`num mt-1 text-lg font-bold ${s.bad ? 'text-[#DC2626]' : s.good ? 'text-[#0E9F5E]' : 'text-[#0F1729]'}`}>{s.value}</div>
                <div className="text-[11px] text-[#94A3B8] mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="mt-8 border-b border-[#E6E8F0] flex gap-6">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t ? 'border-[#6C2BD9] text-[#6C2BD9]' : 'border-transparent text-[#64748B] hover:text-[#0F1729]'}`}>
                {t}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {tab === 'Overview' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold">Investment rationale</h3>
                  <p className="mt-2 text-[15px] text-[#475569] leading-relaxed">{basket.methodology}</p>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Link to="/learn" className="surface p-4 hover:border-[#D8C7F1] transition-all group">
                    <BookOpen className="h-5 w-5 text-[#6C2BD9]" />
                    <div className="mt-3 text-sm font-semibold group-hover:text-[#6C2BD9]">Blog</div>
                    <div className="text-xs text-[#64748B]">Read more about {basket.name}</div>
                  </Link>
                  <button onClick={() => setMethodOpen(true)} className="surface p-4 text-left hover:border-[#D8C7F1] transition-all group">
                    <FlaskConical className="h-5 w-5 text-[#6C2BD9]" />
                    <div className="mt-3 text-sm font-semibold group-hover:text-[#6C2BD9]">Methodology</div>
                    <div className="text-xs text-[#64748B]">How this portfolio was created</div>
                  </button>
                  {basket.factsheet_pdf ? (
                    <a data-testid="factsheet-download" href={`${API}/portfolios/${basket.id}/factsheet`} target="_blank" rel="noreferrer" onClick={() => track('factsheet_download', { portfolio_id: basket.id })} className="surface p-4 hover:border-[#D8C7F1] transition-all group block">
                      <FileText className="h-5 w-5 text-[#6C2BD9]" />
                      <div className="mt-3 text-sm font-semibold group-hover:text-[#6C2BD9]">Factsheet</div>
                      <div className="text-xs text-[#64748B]">Download the PDF factsheet</div>
                    </a>
                  ) : (
                    <a href="#" onClick={(e) => { e.preventDefault(); toast.info('No factsheet PDF has been attached to this portfolio yet.'); }} className="surface p-4 hover:border-[#D8C7F1] transition-all group">
                      <FileText className="h-5 w-5 text-[#6C2BD9]" />
                      <div className="mt-3 text-sm font-semibold group-hover:text-[#6C2BD9]">Factsheet</div>
                      <div className="text-xs text-[#64748B]">Download key points</div>
                    </a>
                  )}
                </div>
              </div>
            )}

            {tab === 'Stocks & Weights' && (
              <div className="surface overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#F5F7FB] text-[#64748B]">
                    <tr className="text-left">
                      <th className="px-4 py-3 font-medium">Constituent</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium text-right">Price (₹)</th>
                      <th className="px-4 py-3 font-medium text-right">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {basket.constituents.map((c) => (
                      <tr key={c.symbol} className="border-t border-[#EEF1F6]">
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#0F1729]">{c.name}</div>
                          <div className="text-xs text-[#94A3B8]">{c.symbol}</div>
                        </td>
                        <td className="px-4 py-3 text-[#64748B]">{c.type}</td>
                        <td className="px-4 py-3 text-right num">{getPrice(c.symbol).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <div className="h-1.5 w-24 rounded-full bg-[#EEF1F6] overflow-hidden">
                              <div className="h-full grad-card" style={{ width: `${Math.min(100, c.weight * 3)}%` }} />
                            </div>
                            <span className="num font-semibold w-10 text-right">{c.weight}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'Methodology' && (
              <div className="space-y-6">
                <div className="surface p-5">
                  <h3 className="text-base font-semibold flex items-center gap-2"><FlaskConical className="h-4 w-4 text-[#6C2BD9]" /> How this portfolio is built</h3>
                  <p className="mt-2 text-[15px] text-[#475569] leading-relaxed">{basket.methodology}</p>
                </div>
                <div className="surface p-5">
                  <h3 className="text-base font-semibold flex items-center gap-2"><Repeat className="h-4 w-4 text-[#6C2BD9]" /> Rebalance</h3>
                  <p className="mt-2 text-[15px] text-[#475569]">Reviewed and rebalanced <b>{basket.rebalanceFreq.toLowerCase()}</b> by {manager?.name}. Last rebalanced on {new Date(basket.lastRebalancedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.</p>
                </div>
              </div>
            )}

            {tab === 'Returns' && <PerformanceChart basket={basket} />}
          </div>

          {/* About the manager */}
          <div className="mt-10">
            <h3 className="text-lg font-semibold">About the manager</h3>
            <div className="mt-3 surface p-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className="h-11 w-11 rounded-xl grad-accent text-white grid place-items-center text-sm font-bold">{manager?.logo}</span>
                  <div>
                    <div className="font-semibold text-[#0F1729]">{manager?.name}</div>
                    <div className="text-xs text-[#64748B]">Manages {manager?.baskets} portfolios · SEBI {manager?.sebiReg}</div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-[#475569] max-w-xl">{manager?.description} {manager?.philosophy}.</p>
                <Link to={`/manager/${basket.managerId}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#6C2BD9] hover:text-[#5320A8]">
                  View manager <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              <Award className="h-8 w-8 text-[#94A3B8] shrink-0" />
            </div>
          </div>
        </div>

        {/* Invest box */}
        <div className="lg:col-span-4">
          <div className="surface p-6 lg:sticky lg:top-24">
            <div className="flex items-center gap-1.5 text-xs text-[#64748B]"><span>Minimum Investment Amount</span><Info className="h-3.5 w-3.5" /></div>
            <div className="num mt-1 text-3xl font-bold text-[#0F1729]">{INR(minAmount)}</div>
            {perfOk && perf.min_investment?.amount ? <div className="text-[11px] text-[#94A3B8]">buys 1+ share of every stock at today's prices</div> : null}
            <div className="mt-1 text-sm text-[#64748B]">{basket.subscription === 'Free' ? 'Free access forever' : `Subscription ₹${basket.fee.amount}/${basket.fee.cycle}`}</div>

            <button onClick={onInvest} className="btn-invest w-full mt-5">Invest now</button>
            <button
              onClick={() => { toggleWatch(basket.id); toast.success(watched ? 'Removed from watchlist' : 'Added to watchlist'); }}
              className={`w-full mt-3 inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors ${watched ? 'border-[#6C2BD9] text-[#6C2BD9] bg-[#F7F4FB]' : 'border-[#E6E8F0] text-[#0F1729] hover:border-[#6C2BD9] hover:text-[#6C2BD9]'}`}>
              <Heart className={`h-4 w-4 ${watched ? 'fill-[#6C2BD9]' : ''}`} /> {watched ? 'In watchlist' : 'Add to watchlist'}
            </button>

            <div className="mt-5 pt-5 border-t border-[#EEF1F6] space-y-2 text-xs text-[#64748B]">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#12B76A]" /> Stocks stay in your own demat account</div>
              <div className="flex items-center gap-2"><Repeat className="h-4 w-4 text-[#6C2BD9]" /> {basket.rebalanceFreq} rebalancing</div>
              <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-[#6C2BD9]" /> {basket.constituents.length} constituents</div>
            </div>
          </div>
        </div>
      </div>

      {/* Methodology modal */}
      <Dialog open={methodOpen} onOpenChange={setMethodOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Methodology</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-[#475569]">
            <div>
              <div className="font-semibold text-[#0F1729]">Defining the universe</div>
              <p className="mt-1">The eligible universe covers listed stocks & ETFs relevant to the {basket.strategy.replace('-', ' ')} strategy.</p>
            </div>
            <div>
              <div className="font-semibold text-[#0F1729]">Screening & selection</div>
              <p className="mt-1">{basket.methodology}</p>
            </div>
            <div>
              <div className="font-semibold text-[#0F1729]">Rebalance</div>
              <p className="mt-1">Reviewed {basket.rebalanceFreq.toLowerCase()} to realign weights with the target strategy.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <InvestFlow open={investOpen} onOpenChange={setInvestOpen} basket={basket} onViewInvestments={() => navigate('/dashboard')} />
    </div>
  );
}

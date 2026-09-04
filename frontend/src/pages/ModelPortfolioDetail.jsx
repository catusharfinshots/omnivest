import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { track } from '../lib/track';
import { getBasket, getManager } from '../mock';
import Seo from '../components/Seo';
import InvestFlow from '../components/InvestFlow';
import ShareButton from '../components/ShareButton';
import PerformanceSection from '../components/listing/PerformanceSection';
import RebalanceTimeline from '../components/listing/RebalanceTimeline';
import HoldingsSection from '../components/listing/HoldingsSection';
import UpdatesSection from '../components/listing/UpdatesSection';
import CoverArt from '../components/CoverArt';
import { Badge, VolatilityBadge, AccessBadge, Metric } from '../components/Tone';
import { useAuth } from '../context/AuthContext';
import { usePortfolio } from '../context/PortfolioContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, TrendingUp, TrendingDown, ShieldCheck, Repeat, Layers, FileText, FlaskConical,
  Heart, ChevronRight, Award, Info, PlayCircle, Eye, Lock, Sparkles, AlertTriangle, Target, Users,
} from 'lucide-react';

const TABS = ['Overview', 'Stocks & weights', 'Updates'];
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const DURATION = { 1: 'month', 3: 'quarter', 6: 'half-year', 12: 'year' };
const pct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`);
const nice = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const videoEmbed = (url) => {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
};

export default function ModelPortfolioDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const mockBasket = getBasket(id);
  const { isAuthed, openAuth, token, user } = useAuth();
  const { toggleWatch, isWatched } = usePortfolio();
  const [tab, setTab] = useState('Overview');
  const [investOpen, setInvestOpen] = useState(false);
  const [perf, setPerf] = useState(null);
  const [disclaimer, setDisclaimer] = useState('');
  const [methodOpen, setMethodOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [basket, setBasket] = useState(mockBasket || null);
  const [notFound, setNotFound] = useState(false);
  const [plan, setPlan] = useState(null);

  useEffect(() => { axios.get(`${API}/content`).then(({ data }) => setDisclaimer(data?.performanceDisclaimer || '')).catch(() => {}); }, []);

  useEffect(() => {
    if (mockBasket) { setBasket(mockBasket); setNotFound(false); return; }
    let active = true;
    const headers = user?.role === 'admin' && token ? { Authorization: `Bearer ${token}` } : undefined;
    const wantRevision = headers && new URLSearchParams(window.location.search).get('revision') === '1';
    axios.get(`${API}/portfolios/${id}${wantRevision ? '?revision=1' : ''}`, headers ? { headers } : undefined).then(({ data }) => {
      if (!active) return;
      const p = data.portfolio;
      setBasket({ ...p, fee: { amount: p.feeAmount || 0, cycle: p.feeCycle || 'monthly' }, managerName: p.owner_name, constituents: p.constituents || [], plans: p.plans || [], tags: p.tags || [] });
      setPlan((p.plans || [])[0] || null);
      if (!p.preview) track('portfolio_view', { portfolio_id: p.id });
      axios.get(`${API}/portfolios/${p.id}/performance`).then((r) => { if (active) setPerf(r.data); }).catch(() => {});
    }).catch(() => { if (active) setNotFound(true); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mockBasket, token]);

  const manager = useMemo(() => {
    if (!basket) return null;
    if (basket.manager) return { ...basket.manager, baskets: basket.manager.listings };
    if (basket.managerId) return getManager(basket.managerId);
    return { name: basket.owner_name || basket.managerName || 'Research Analyst', logo: (basket.owner_name || 'AN').slice(0, 2).toUpperCase(), baskets: '—', sebiReg: '—', description: '', philosophy: '' };
  }, [basket]);

  if (notFound) {
    return (
      <div className="container-x py-24 text-center">
        <h1 className="text-2xl font-bold">Model portfolio not found</h1>
        <Link to="/model-portfolios" className="btn-primary mt-6 inline-flex">Browse model portfolios</Link>
      </div>
    );
  }
  if (!basket) return (
    <div className="container-x py-8 animate-pulse" data-testid="listing-skeleton">
      <div className="flex items-start gap-4"><div className="h-14 w-14 rounded-2xl bg-[#EEE8F7]" /><div className="flex-1 space-y-3"><div className="h-7 w-2/3 rounded bg-[#EEE8F7]" /><div className="h-4 w-1/3 rounded bg-[#F1EBF9]" /><div className="h-4 w-5/6 rounded bg-[#F1EBF9]" /></div></div>
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-[#F5F2FA]" />)}</div>
      <div className="mt-8 h-64 rounded-2xl bg-[#F5F2FA]" />
    </div>
  );

  const watched = isWatched(basket.id);
  const paid = basket.subscription === 'Paid';
  const isDb = basket._db !== false && !mockBasket;
  const onInvest = () => {
    if (isDb) track('invest_click', { portfolio_id: basket.id });
    if (!isAuthed) { openAuth({ next: `/model-portfolios/${basket.id}` }); return; }
    setInvestOpen(true);
  };
  const onSubscribe = () => {
    if (isDb) track('subscribe_click', { portfolio_id: basket.id, plan: plan?.months });
    if (!isAuthed) { openAuth({ next: `/model-portfolios/${basket.id}` }); return; }
    toast.success(`Thanks — we've noted your interest in the ${plan ? `${plan.months}-month` : ''} plan. Payments open soon; you'll be first to know.`);
  };

  // engine-derived numbers (never typed)
  const perfOk = perf && perf.status === 'ok';
  const pm = perfOk ? perf.metrics : null;
  const pmBench = perfOk ? perf.bench_metrics?.[perf.benchmark] : null;
  const useCagr = !!(pm && pm.cagr_pct !== null);
  const headline = pm ? (useCagr ? pm.cagr_pct : pm.return_pct) : null;
  const benchHead = pmBench ? (useCagr ? pmBench.cagr_pct : pmBench.return_pct) : null;
  const alpha = headline !== null && benchHead !== null && benchHead !== undefined ? +(headline - benchHead).toFixed(2) : null;
  const vol = (pm && pm.volatility_label) || null;
  const minAmount = perfOk && perf.min_investment?.amount ? perf.min_investment.amount : basket.minAmount;
  const ago = perf?.launched_days_ago;
  const launchedLabel = ago === 0 ? 'Launched today' : ago === 1 ? 'Launched yesterday' : ago > 1 ? `Launched ${ago} days ago` : (basket.launch_date ? `Launched ${nice(basket.launch_date)}` : 'Since launch');
  const headlineText = headline === null ? 'New' : pct(headline);
  const benchLabel = perf?.benchmark_labels?.[perf?.benchmark] || basket.benchmark || 'NIFTY 50';
  const rationaleHtml = basket.rationale || (basket.methodology ? `<p>${basket.methodology}</p>` : '');
  const embed = videoEmbed(basket.videoUrl);

  const stats = [
    { label: useCagr ? 'CAGR' : 'Since launch', value: perfOk ? headlineText : '—', sub: perfOk ? (useCagr ? `${pm.days} days live` : (headline === null ? 'from next market close' : launchedLabel.toLowerCase())) : (perf?.status === 'unavailable' ? 'market data reconnecting' : 'computing from exchange data'), good: headline !== null && headline >= 0, bad: headline !== null && headline < 0 },
    // the benchmark's own move is always shown, so a flat index day never looks like missing data
    { label: `vs ${benchLabel}`, value: pct(alpha), sub: alpha === null ? 'from next market close' : `${benchLabel} ${pct(benchHead)} · ${alpha >= 0 ? 'ahead' : 'behind'}`, good: alpha !== null && alpha >= 0, bad: alpha !== null && alpha < 0 },
    { label: 'Volatility', value: vol || '—', sub: vol ? `${pm.volatility_pct}% annualised` : 'after 20 trading days', tone: vol === 'Low' ? 'good' : vol === 'High' ? 'bad' : vol === 'Medium' ? 'warn' : '' },
    { label: 'Min. investment', value: INR(minAmount), sub: perfOk && perf.min_investment ? "at today's prices" : 'to start' },
  ];

  return (
    <div>
      <Seo title={basket.name} description={basket.subtitle || `${basket.name} — an expert-managed model portfolio on Omnivest.`} />
      {basket.preview && (
        <div className="bg-[#FFFBEB] border-b border-[#FDE68A] text-[#92400E] text-xs px-4 py-2 text-center flex items-center justify-center gap-2" data-testid="preview-banner"><Eye className="h-3.5 w-3.5" /> Admin preview — this listing is <b>{basket.status}</b> and not visible to investors.</div>
      )}
      {/* Header band */}
      <section className="grad-hero border-b border-[#E6E8F0]">
        <div className="container-x pt-6 pb-8">
          <div className="flex items-center justify-between gap-4">
            <button onClick={() => navigate('/model-portfolios')} className="inline-flex items-center gap-1.5 text-sm text-[#526071] hover:text-[#6C2BD9]"><ArrowLeft className="h-4 w-4" /> All model portfolios</button>
            <ShareButton path={`/model-portfolios/${basket.id}`} shortCode={isDb ? basket.id.replace(/-/g, '').slice(0, 8) : undefined} title={`${basket.name} | Omnivest`} text={`Check out ${basket.name} on Omnivest.`} onShare={() => track('share_click', { portfolio_id: basket.id })} />
          </div>
          <div className="mt-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
            <div className="flex items-start gap-3 sm:gap-4 min-w-0">
              {basket.cover ? <CoverArt cover={basket.cover} name={basket.name} size={56} radius={16} className="sm:!h-16 sm:!w-16" /> : <span className="h-14 w-14 shrink-0 rounded-2xl grad-card text-white grid place-items-center text-lg font-bold">{basket.name.slice(0, 2).toUpperCase()}</span>}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{basket.name}</h1>
                  {basket.featured && <span className="chip-brand text-[12px]"><Sparkles className="h-3 w-3" /> Featured</span>}
                </div>
                <button onClick={() => manager?.id && navigate(`/manager/${manager.id}`)} className="mt-1 text-sm text-[#526071] hover:text-[#6C2BD9]">by {manager?.name}{manager?.sebiReg && manager.sebiReg !== '—' ? ` · SEBI ${manager.sebiReg}` : ''}</button>
                <p className="mt-2 text-[15px] text-[#475569] max-w-2xl">{basket.subtitle}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="neutral" icon={<Layers className="h-3 w-3" aria-hidden="true" />}>{(basket.strategy || 'thematic').replace('-', ' ')}</Badge>
                  {(basket.tags || []).map((t) => <Badge key={t} tone="info">{t}</Badge>)}
                  <VolatilityBadge level={vol} />
                  <AccessBadge paid={paid} perMonth={paid && plan ? plan.price / (plan.months || 1) : null} />
                </div>
              </div>
            </div>
            <div className="shrink-0 flex items-center justify-between gap-3 rounded-2xl bg-white/70 border border-[#EEE8F7] px-4 py-3 sm:block sm:bg-transparent sm:border-0 sm:p-0 sm:text-right" data-testid="header-cagr">
              <div>
                <div className="text-xs text-[#526071]">{perfOk ? (useCagr ? 'CAGR' : 'Since launch') : 'Performance'}</div>
                <div className="text-[12px] text-[#526071] sm:hidden">{perfOk ? launchedLabel : ''}</div>
              </div>
              <div className={`num text-2xl sm:text-3xl font-bold flex items-center gap-1 sm:justify-end ${headline !== null && headline < 0 ? 'text-[#B91C1C]' : headline !== null ? 'text-[#0B7F4A]' : perfOk ? 'text-[#6C2BD9]' : 'text-[#667085]'}`}>
                {headline !== null && headline < 0 ? <TrendingDown className="h-6 w-6" /> : <TrendingUp className="h-6 w-6" />} {perfOk ? headlineText : '—'}
              </div>
              <div className="hidden sm:block mt-1 text-[12px] text-[#526071]">{perfOk ? `${launchedLabel} · computed from exchange data` : (perf?.status === 'unavailable' ? 'Market data reconnecting' : 'Computing from exchange data…')}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="container-x py-8 grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 min-w-0">
          {/* Stat tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="stat-tiles">
            {stats.map((s, i) => (
              <div key={s.label} className={`surface p-4 rise rise-${i + 1}`}>
                <Metric label={s.label} value={s.value} sub={s.sub} tone={s.bad || s.tone === 'bad' ? 'neg' : s.good || s.tone === 'good' ? 'pos' : s.tone === 'warn' ? 'warn' : undefined} />
              </div>
            ))}
          </div>
          {disclaimer && <div className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-[#667085]" data-testid="performance-disclaimer"><Info className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span>{disclaimer}</span></div>}

          {/* Tabs */}
          <div className="mt-8 border-b border-[#E6E8F0] flex gap-6" data-testid="listing-tabs">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t ? 'border-[#6C2BD9] text-[#6C2BD9]' : 'border-transparent text-[#526071] hover:text-[#0F1729]'}`}>{t}</button>
            ))}
          </div>

          <div className="mt-6">
            {tab === 'Overview' && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-[1fr_auto] gap-5 items-start">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold">Investment rationale</h3>
                    {rationaleHtml ? <div className="rich-text mt-2 text-[15px] text-[#475569]" data-testid="rationale" dangerouslySetInnerHTML={{ __html: rationaleHtml }} /> : <p className="mt-2 text-sm text-[#667085]">The manager hasn't added a rationale yet.</p>}
                  </div>
                  {embed && (
                    <button type="button" onClick={() => setVideoOpen(true)} className="relative h-24 w-24 md:h-28 md:w-28 rounded-2xl grad-card text-white grid place-items-center shrink-0 shadow-[0_12px_30px_-16px_rgba(108,43,217,0.6)] hover:scale-[1.03] transition-transform" data-testid="intro-video">
                      <PlayCircle className="h-10 w-10" />
                      <span className="absolute bottom-2 text-[12px] font-bold uppercase tracking-wider">Intro video</span>
                    </button>
                  )}
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <button onClick={() => setMethodOpen(true)} className="surface p-4 text-left hover:border-[#D8C7F1] transition-all group">
                    <FlaskConical className="h-5 w-5 text-[#6C2BD9]" />
                    <div className="mt-3 text-sm font-semibold group-hover:text-[#6C2BD9]">Methodology</div>
                    <div className="text-xs text-[#526071]">How this portfolio is built and rebalanced</div>
                  </button>
                  {basket.factsheet_pdf ? (
                    <a data-testid="factsheet-download" href={`${API}/portfolios/${basket.id}/factsheet`} target="_blank" rel="noreferrer" onClick={() => track('factsheet_download', { portfolio_id: basket.id })} className="surface p-4 hover:border-[#D8C7F1] transition-all group block">
                      <FileText className="h-5 w-5 text-[#6C2BD9]" />
                      <div className="mt-3 text-sm font-semibold group-hover:text-[#6C2BD9]">Factsheet</div>
                      <div className="text-xs text-[#526071]">Download the PDF factsheet</div>
                    </a>
                  ) : (
                    <div className="surface p-4 opacity-70">
                      <FileText className="h-5 w-5 text-[#667085]" />
                      <div className="mt-3 text-sm font-semibold text-[#526071]">Factsheet</div>
                      <div className="text-xs text-[#667085]">Not attached yet</div>
                    </div>
                  )}
                  <button onClick={() => setTab('Updates')} className="surface p-4 text-left hover:border-[#D8C7F1] transition-all group">
                    <Users className="h-5 w-5 text-[#6C2BD9]" />
                    <div className="mt-3 text-sm font-semibold group-hover:text-[#6C2BD9]">Updates</div>
                    <div className="text-xs text-[#526071]">Rebalance notes and market views</div>
                  </button>
                </div>

                {isDb && <PerformanceSection perf={perf} name={basket.name} />}

                {/* Key facts */}
                <div className="surface p-5" data-testid="key-facts">
                  <h3 className="text-base font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-[#6C2BD9]" /> Key facts</h3>
                  <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    {basket.factsheet?.objective && <div><dt className="text-[12px] uppercase tracking-wider text-[#667085] font-semibold">Objective</dt><dd className="text-[#475569] mt-0.5">{basket.factsheet.objective}</dd></div>}
                    <div><dt className="text-[12px] uppercase tracking-wider text-[#667085] font-semibold">Launched</dt><dd className="text-[#475569] mt-0.5">{basket.launch_date ? nice(basket.launch_date) : '—'}{perf?.start_date ? ` · bought at ${nice(perf.start_date)} close` : ''}</dd></div>
                    <div><dt className="text-[12px] uppercase tracking-wider text-[#667085] font-semibold">Rebalance</dt><dd className="text-[#475569] mt-0.5">{basket.rebalanceFreq || 'Quarterly'}{(basket.versions || []).length > 1 ? ` · ${basket.versions.length - 1} so far` : ''}</dd></div>
                    <div><dt className="text-[12px] uppercase tracking-wider text-[#667085] font-semibold">Benchmark</dt><dd className="text-[#475569] mt-0.5">{benchLabel}</dd></div>
                    <div><dt className="text-[12px] uppercase tracking-wider text-[#667085] font-semibold">Constituents</dt><dd className="text-[#475569] mt-0.5">{basket.constituents.length} {basket.constituents.every((c) => c.type === 'ETF') ? 'ETFs' : 'stocks & ETFs'}</dd></div>
                    {pm?.max_drawdown_pct !== null && pm?.max_drawdown_pct !== undefined && <div><dt className="text-[12px] uppercase tracking-wider text-[#667085] font-semibold">Max drawdown</dt><dd className="text-[#475569] mt-0.5">{pct(pm.max_drawdown_pct)} since launch</dd></div>}
                    {basket.factsheet?.whoShouldInvest && <div className="sm:col-span-2"><dt className="text-[12px] uppercase tracking-wider text-[#667085] font-semibold">Who should invest</dt><dd className="text-[#475569] mt-0.5">{basket.factsheet.whoShouldInvest}</dd></div>}
                  </dl>
                </div>

                {basket.factsheet?.riskFactors && (
                  <div className="surface p-5 border-[#FDE68A] bg-[#FFFBEB]/40" data-testid="risk-factors">
                    <h3 className="text-base font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-[#9A4A05]" /> Key risks</h3>
                    <p className="mt-2 text-sm text-[#475569] whitespace-pre-line">{basket.factsheet.riskFactors}</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'Stocks & weights' && (
              <div className="space-y-5">
                {isDb && <RebalanceTimeline basket={basket} />}
                <HoldingsSection basket={basket} perf={perf} />
              </div>
            )}

            {tab === 'Updates' && (isDb ? <UpdatesSection basket={basket} token={token} onSubscribe={onSubscribe} managerName={manager?.name} /> : <div className="text-sm text-[#526071]">No updates.</div>)}
          </div>

          {/* About the manager */}
          <div className="mt-10" data-testid="manager-card">
            <h3 className="text-lg font-semibold">About the manager</h3>
            <div className="mt-3 surface p-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="h-11 w-11 rounded-xl grad-accent text-white grid place-items-center text-sm font-bold">{manager?.logo}</span>
                  <div>
                    <div className="font-semibold text-[#0F1729]">{manager?.name}{manager?.firm ? <span className="text-[#526071] font-normal"> · {manager.firm}</span> : null}</div>
                    <div className="text-xs text-[#526071]">Manages {manager?.baskets ?? '—'} portfolio{manager?.baskets === 1 ? '' : 's'}{manager?.sebiReg && manager.sebiReg !== '—' ? ` · SEBI ${manager.sebiReg}` : ''}{manager?.experienceYears ? ` · ${manager.experienceYears}+ yrs experience` : ''}</div>
                  </div>
                </div>
                {manager?.philosophy && <div className="mt-3 text-sm font-medium text-[#1A1030]">“{manager.philosophy}”</div>}
                {manager?.description && <p className="mt-2 text-sm text-[#475569] max-w-xl">{manager.description}</p>}
                {manager?.id && <Link to={`/manager/${manager.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#6C2BD9] hover:text-[#5320A8]">View manager <ChevronRight className="h-4 w-4" /></Link>}
              </div>
              <Award className="h-8 w-8 text-[#667085] shrink-0" />
            </div>
          </div>
        </div>

        {/* Sticky invest box */}
        <div className="lg:col-span-4">
          <div className="surface p-6 lg:sticky lg:top-24" data-testid="invest-box">
            <div className="flex items-center gap-1.5 text-xs text-[#526071]"><span>Minimum investment amount</span><Info className="h-3.5 w-3.5" /></div>
            <div className="num mt-1 text-3xl font-bold text-[#0F1729]">{INR(minAmount)}</div>
            {perfOk && perf.min_investment?.amount ? <div className="text-[12px] text-[#667085]">buys 1+ share of every stock at today's prices</div> : null}

            {paid ? (
              <div className="mt-4">
                <div className="text-xs font-semibold text-[#1A1030]">Choose a plan</div>
                <div className="mt-2 grid grid-cols-2 gap-2" data-testid="plan-picker">
                  {(basket.plans || []).map((p) => (
                    <button key={p.months} type="button" onClick={() => setPlan(p)} className={`rounded-xl border p-2.5 text-left transition-colors ${plan?.months === p.months ? 'border-[#6C2BD9] bg-[#F7F4FB]' : 'border-[#E8E1F0] hover:border-[#D8C7F1]'}`}>
                      <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085]">{p.months} month{p.months > 1 ? 's' : ''}</div>
                      <div className="text-sm font-bold text-[#1A1030]">₹{p.price.toLocaleString('en-IN')}</div>
                      <div className="text-[12px] text-[#667085]">≈ ₹{Math.round(p.price / p.months)}/mo</div>
                    </button>
                  ))}
                </div>
                <button onClick={onSubscribe} className="btn-primary w-full mt-4" data-testid="subscribe-btn"><Lock className="h-4 w-4" /> Subscribe now</button>
                <div className="mt-2 text-[12px] text-[#667085] text-center">Holdings and performance are always visible — subscription unlocks the manager's updates and research.</div>
              </div>
            ) : (
              <div className="mt-1 text-sm text-[#526071]">Free access forever</div>
            )}

            <button onClick={onInvest} className={`btn-invest w-full ${paid ? 'mt-3' : 'mt-5'}`}>Invest now</button>
            <button onClick={() => { toggleWatch(basket.id); toast.success(watched ? 'Removed from watchlist' : 'Added to watchlist'); }}
              className={`w-full mt-3 inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors ${watched ? 'border-[#6C2BD9] text-[#6C2BD9] bg-[#F7F4FB]' : 'border-[#E6E8F0] text-[#0F1729] hover:border-[#6C2BD9] hover:text-[#6C2BD9]'}`}>
              <Heart className={`h-4 w-4 ${watched ? 'fill-[#6C2BD9]' : ''}`} /> {watched ? 'In watchlist' : 'Add to watchlist'}
            </button>

            <div className="mt-5 pt-5 border-t border-[#EEF1F6] space-y-2 text-xs text-[#526071]">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#0B7F4A]" /> Stocks stay in your own demat account</div>
              <div className="flex items-center gap-2"><Repeat className="h-4 w-4 text-[#6C2BD9]" /> {basket.rebalanceFreq || 'Quarterly'} review</div>
              <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-[#6C2BD9]" /> {basket.constituents.length} constituents</div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={methodOpen} onOpenChange={setMethodOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Methodology</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm text-[#475569]">
            {basket.methodology ? <div className="rich-text" dangerouslySetInnerHTML={{ __html: basket.rationale ? basket.methodology : `<p>${basket.methodology}</p>` }} /> : <p>Not provided.</p>}
            <div><div className="font-semibold text-[#0F1729]">Rebalance</div><p className="mt-1">Reviewed {(basket.rebalanceFreq || 'quarterly').toLowerCase()} by {manager?.name}. Each change is applied at that day's closing prices and recorded on the rebalance timeline.</p></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-4"><DialogTitle>{basket.name} — intro</DialogTitle></DialogHeader>
          {embed && <div className="aspect-video w-full"><iframe title="Intro video" src={embed} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>}
        </DialogContent>
      </Dialog>

      <InvestFlow open={investOpen} onOpenChange={setInvestOpen} basket={basket} onViewInvestments={() => navigate('/dashboard')} />
    </div>
  );
}

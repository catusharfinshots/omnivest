import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { track } from '../lib/track';
import { getBasket, getManager } from '../mock';
import Seo from '../components/Seo';
import InvestFlow from '../components/InvestFlow';
import ShareButton from '../components/ShareButton';
import ShareRow from '../components/ShareRow';
import { BookOpen, FlaskConical, FileText } from 'lucide-react';
import PerformanceSection from '../components/listing/PerformanceSection';
import RebalanceTimeline from '../components/listing/RebalanceTimeline';
import HoldingsSection from '../components/listing/HoldingsSection';
import UpdatesSection from '../components/listing/UpdatesSection';
import CoverArt from '../components/CoverArt';
import { Badge, VolatilityBadge, AccessBadge, Metric } from '../components/Tone';
import { useAuth } from '../context/AuthContext';
import CheckoutModal from '../components/CheckoutModal';
import ReadMore from '../components/ReadMore';
import KeyFacts from '../components/listing/KeyFacts';
import AboutSheet from '../components/listing/AboutSheet';
import { createPortal } from 'react-dom';
import { usePortfolio } from '../context/PortfolioContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, TrendingUp, TrendingDown, ShieldCheck, Repeat, Layers, Heart, ChevronRight, Award, Info, PlayCircle, Eye, Lock, Sparkles, AlertTriangle, Target,
} from 'lucide-react';

const TABS = ['Overview', 'Stocks & weights', 'Updates'];
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const DURATION = { 1: 'month', 3: 'quarter', 6: 'half-year', 12: 'year' };
const pct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`);
const plain = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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
  const [interestSent, setInterestSent] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutSub, setAboutSub] = useState(null);      // desktop side list opens straight into Methodology / Factsheet
  const [methodDefs, setMethodDefs] = useState([]);
  useEffect(() => { axios.get(`${API}/listing-rules`).then(({ data }) => setMethodDefs(data?.methodology_sections || [])).catch(() => {}); }, []);
  const openAbout = (sub = null) => { setAboutSub(sub); setAboutOpen(true); };

  useEffect(() => { axios.get(`${API}/content`).then(({ data }) => setDisclaimer(data?.performanceDisclaimer || '')).catch(() => {}); }, []);

  useEffect(() => {
    if (mockBasket) { setBasket(mockBasket); setNotFound(false); return; }
    let active = true;
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const wantRevision = user?.role === 'admin' && headers && new URLSearchParams(window.location.search).get('revision') === '1';
    axios.get(`${API}/portfolios/${id}${wantRevision ? '?revision=1' : ''}`, headers ? { headers } : undefined).then(({ data }) => {
      if (!active) return;
      const p = data.portfolio;
      setBasket({ ...p, fee: { amount: p.feeAmount || 0, cycle: p.feeCycle || 'monthly' }, managerName: p.owner_name, constituents: p.constituents || [], plans: p.plans || [], tags: p.tags || [] });
      setPlan((p.plans || [])[0] || null);
      if (!p.preview) track('portfolio_view', { portfolio_id: p.id });
      axios.get(`${API}/portfolios/${p.id}/performance`, headers ? { headers } : undefined).then((r) => { if (active) setPerf(r.data); }).catch(() => {});
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
  const access = basket.access || { paid, unlocked: true, reason: 'free' };
  const locked = !!basket.holdings_locked;
  const holdingsCount = basket.holdings_count ?? (basket.constituents || []).length;
  const reloadListing = async () => {
    const h = { headers: { Authorization: `Bearer ${token}` } };
    try {
      const { data: fresh } = await axios.get(`${API}/portfolios/${basket.id}`, h);
      const p = fresh.portfolio;
      setBasket({ ...p, fee: { amount: p.feeAmount || 0, cycle: p.feeCycle || 'monthly' }, managerName: p.owner_name, constituents: p.constituents || [], plans: p.plans || [], tags: p.tags || [] });
      axios.get(`${API}/portfolios/${p.id}/performance`, h).then((r) => setPerf(r.data)).catch(() => {});
    } catch { /* keep what we have */ }
  };
  const onSubscribe = () => {
    if (isDb) track('subscribe_click', { portfolio_id: basket.id, plan: plan?.months });
    if (!isAuthed) { openAuth({ next: `/model-portfolios/${basket.id}` }); return; }
    if (!isDb) { toast.success('Demo listing'); return; }
    setCheckoutOpen(true);
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
        <div className="container-x pt-3 pb-4 sm:pt-6 sm:pb-8">
          <div className="flex items-center justify-between gap-4">
            <button onClick={() => navigate('/model-portfolios')} aria-label="All model portfolios" className="inline-flex items-center gap-1.5 h-10 -ml-2 px-2 rounded-lg text-sm text-[#526071] hover:text-[#6C2BD9]"><ArrowLeft className="h-5 w-5 sm:h-4 sm:w-4" /><span className="hidden sm:inline">All model portfolios</span></button>
            <ShareButton path={`/model-portfolios/${basket.id}`} shortCode={isDb ? basket.id.replace(/-/g, '').slice(0, 8) : undefined} title={`${basket.name} | Omnivest`} text={`Check out ${basket.name} on Omnivest.`} onShare={() => track('share_click', { portfolio_id: basket.id })} />
          </div>
          <div className="mt-2 sm:mt-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
            <div className="flex items-start gap-3 sm:gap-4 min-w-0">
              {basket.cover ? <CoverArt cover={basket.cover} name={basket.name} size={48} radius={14} className="sm:!h-16 sm:!w-16" /> : <span className="h-12 w-12 sm:h-16 sm:w-16 shrink-0 rounded-2xl grad-card text-white grid place-items-center text-lg font-bold">{basket.name.slice(0, 2).toUpperCase()}</span>}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-[20px] leading-tight sm:text-3xl font-bold tracking-tight">{basket.name}</h1>
                  {basket.featured && <span className="chip-brand text-[12px]"><Sparkles className="h-3 w-3" /> Featured</span>}
                </div>
                <button onClick={() => manager?.id && navigate(`/manager/${manager.id}`)} className="mt-0.5 sm:mt-1 text-[13px] sm:text-sm text-[#526071] hover:text-[#6C2BD9]">by {manager?.name}{manager?.sebiReg && manager.sebiReg !== '—' ? ` · SEBI ${manager.sebiReg}` : ''}</button>
                {/* phones: one row, access + volatility only — strategy and tags live in Key facts */}
                <div className="mt-1.5 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                  <AccessBadge paid={paid} perMonth={paid && plan ? plan.price / (plan.months || 1) : null} />
                  <VolatilityBadge level={vol} />
                  <span className="hidden sm:inline-flex"><Badge tone="neutral" icon={<Layers className="h-3 w-3" aria-hidden="true" />}>{(basket.strategy || 'thematic').replace('-', ' ')}</Badge></span>
                  {(basket.tags || []).map((t) => <span key={t} className="hidden sm:inline-flex"><Badge tone="info">{t}</Badge></span>)}
                </div>
              </div>
            </div>
            <div className="hidden sm:block shrink-0 sm:text-right" data-testid="header-cagr">
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
          {/* phones: the three figures the reference shows, in one quiet strip */}
          <div className="sm:hidden mt-4 grid grid-cols-3 divide-x divide-[#EEF1F6] rounded-xl border border-[#E6E8F0] bg-white" data-testid="figure-strip">
            <div className="px-3 py-2.5"><div className="text-[12px] text-[#667085]">Min. amount</div><div className="num text-[16px] font-bold text-[#0F1729] mt-0.5">{INR(minAmount)}</div></div>
            <div className="px-3 py-2.5"><div className="text-[12px] text-[#667085]">{useCagr ? 'CAGR' : 'Since launch'}</div><div className={`num text-[16px] font-bold mt-0.5 ${headline !== null && headline < 0 ? 'text-[#B91C1C]' : headline !== null ? 'text-[#0B7F4A]' : 'text-[#5320A8]'}`}>{perfOk ? headlineText : '—'}</div></div>
            <div className="px-3 py-2.5"><div className="text-[12px] text-[#667085]">Volatility</div><div className="mt-0.5">{vol ? <VolatilityBadge level={vol} compact /> : <span className="text-[16px] font-bold text-[#98A2B3]">—</span>}</div></div>
          </div>
        </div>
      </section>

      <div className="container-x py-4 sm:py-8 grid lg:grid-cols-12 gap-6 sm:gap-8 pb-28 lg:pb-8">
        <div className="lg:col-span-8 min-w-0">
          {/* Stat tiles (sm+); phones use the figure strip in the header */}
          <div className="hidden sm:grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="stat-tiles">
            {stats.map((s, i) => (
              <div key={s.label} className={`surface p-4 rise rise-${i + 1}`}>
                <Metric label={s.label} value={s.value} sub={s.sub} tone={s.bad || s.tone === 'bad' ? 'neg' : s.good || s.tone === 'good' ? 'pos' : s.tone === 'warn' ? 'warn' : undefined} />
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="mt-4 sm:mt-8 border-b border-[#E6E8F0] flex gap-6 -mx-5 px-5 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar" data-testid="listing-tabs">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t ? 'border-[#6C2BD9] text-[#6C2BD9]' : 'border-transparent text-[#526071] hover:text-[#0F1729]'}`}>{t}</button>
            ))}
          </div>

          <div className="mt-6">
            {tab === 'Overview' && (
              <div className="space-y-4 sm:space-y-6">
                {/* The face of Overview (smallcase pattern): the one-liner, Read more, and the manager's video. Everything longer lives in the About sheet. */}
                <div className="flex items-start gap-4" data-testid="overview-face">
                  <div className="min-w-0 flex-1">
                    <ReadMore lines={2} className="text-[15px] sm:text-[16px] leading-relaxed text-[#334155]" testid="pitch-read-more" onMore={() => openAbout(null)} always>
                      {basket.subtitle || plain(rationaleHtml) || 'About this portfolio'}
                    </ReadMore>
                    <div className="mt-3"><ShareRow shortCode={isDb ? basket.id.replace(/-/g, '').slice(0, 8) : undefined} path={`/model-portfolios/${basket.id}`} title={`${basket.name} | Omnivest`} text={`Check out ${basket.name} on Omnivest.`} onShare={(ch) => track('share_click', { portfolio_id: basket.id, channel: ch })} /></div>
                  </div>
                  {/* desktop: the reference's side list — Blog · Methodology · Factsheet with one-line descriptions */}
                  <div className="hidden lg:flex flex-col gap-3 w-64 shrink-0" data-testid="overview-links">
                    {[
                      { icon: BookOpen, label: 'Blog', sub: `Read more about ${basket.name}`, onClick: () => { if (manager?.website && /^https?:/.test(manager.website)) window.open(manager.website, '_blank', 'noreferrer'); else setTab('Updates'); } },
                      { icon: FlaskConical, label: 'Methodology', sub: 'Know how this portfolio was created', onClick: () => openAbout('methodology') },
                      { icon: FileText, label: 'Factsheet', sub: 'Key points of this portfolio', onClick: () => openAbout('factsheet') },
                    ].map((l) => (
                      <button key={l.label} type="button" onClick={l.onClick} className="flex items-start gap-3 text-left group" data-testid={`overview-link-${l.label.toLowerCase()}`}>
                        <span className="h-9 w-9 shrink-0 rounded-full bg-[#EFF6FF] text-[#1D4ED8] grid place-items-center"><l.icon className="h-4 w-4" /></span>
                        <span className="min-w-0"><span className="block text-[14px] font-semibold text-[#1D4ED8] group-hover:underline">{l.label}</span><span className="block text-[12px] text-[#526071] leading-4">{l.sub}</span></span>
                      </button>
                    ))}
                  </div>
                  {embed && (
                    <button type="button" onClick={() => setVideoOpen(true)} aria-label="Play the intro video" className="relative shrink-0 h-[72px] w-[72px] sm:h-20 sm:w-20 rounded-full p-[3px] bg-gradient-to-br from-[#6C2BD9] to-[#12B79A]" data-testid="intro-video">
                      <span className="h-full w-full rounded-full bg-white grid place-items-center overflow-hidden">
                        {manager?.logo && /^https?:/.test(manager.logo) ? <img src={manager.logo} alt="" className="h-full w-full object-cover" /> : <span className="text-[18px] font-bold text-[#5320A8]">{(manager?.name || basket.name).slice(0, 2).toUpperCase()}</span>}
                      </span>
                      <span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-full bg-[#1D4ED8] text-white grid place-items-center ring-2 ring-white"><PlayCircle className="h-4 w-4" /></span>
                    </button>
                  )}
                </div>
                {isDb && <PerformanceSection perf={perf} name={basket.name} />}
                {disclaimer && (
                  <div className="flex items-start gap-1.5 text-[12px] leading-relaxed text-[#667085]" data-testid="performance-disclaimer">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <ReadMore lines={1} className="min-w-0 flex-1" testid="disclaimer-read-more">{disclaimer}</ReadMore>
                  </div>
                )}
                <div className="lg:hidden rounded-xl border border-[#EEF1F6] bg-[#FAFAFE] px-4 py-3 space-y-1.5 text-[13px] text-[#526071]" data-testid="trust-lines">
                  <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#0B7F4A]" /> Stocks stay in your own demat account</div>
                  <div className="flex items-center gap-2"><Repeat className="h-4 w-4 text-[#6C2BD9]" /> {basket.rebalanceFreq || 'Quarterly'} review</div>
                  <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-[#6C2BD9]" /> {holdingsCount} constituents{locked ? ' · names unlock on subscribing' : ''}</div>
                </div>

                {/* Key facts */}
                <KeyFacts basket={basket} perf={perf} benchLabel={benchLabel} holdingsCount={holdingsCount} />

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
                <HoldingsSection basket={basket} perf={perf} onSubscribe={onSubscribe} plan={plan} interestSent={interestSent} />
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

        {/* Sticky invest box — desktop only. Phones use the pinned action bar; plans are chosen inside the checkout. */}
        <div className="hidden lg:block lg:col-span-4">
          <div className="surface p-6 lg:sticky lg:top-24" data-testid="invest-box">
            <div className="flex items-center gap-1.5 text-xs text-[#526071]"><span>Minimum investment amount</span><Info className="h-3.5 w-3.5" /></div>
            <div className="num mt-1 text-3xl font-bold text-[#0F1729]">{INR(minAmount)}</div>
            {perfOk && perf.min_investment?.amount ? <div className="text-[12px] text-[#667085]">buys 1+ share of every stock at today's prices</div> : null}

            {paid && access.unlocked && access.reason === 'subscriber' ? (
              <div className="mt-4 rounded-xl bg-[#E3F4EB] border border-[#BFE6D0] px-3 py-2.5 text-sm text-[#096B3E]" data-testid="subscribed-badge">
                <div className="font-semibold inline-flex items-center gap-1.5"><Lock className="h-4 w-4" /> Subscribed</div>
                <div className="text-[12px] mt-0.5">{access.plan_months}-month plan · valid until {new Date(access.subscribed_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
            ) : paid ? (
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
                {interestSent ? (
                  <div className="mt-4 rounded-xl bg-[#EFF6FF] border border-[#C7DBFE] px-3 py-2.5 text-sm text-[#1D4ED8]" data-testid="interest-sent"><b>Request received.</b> We'll confirm your subscription shortly and unlock the stocks, weights and updates.</div>
                ) : (
                  <button onClick={onSubscribe} className="btn-primary w-full mt-4" data-testid="subscribe-btn"><Lock className="h-4 w-4" /> Subscribe{plan ? ` · ₹${plan.price.toLocaleString('en-IN')}` : ''}</button>
                )}
                <div className="mt-2 text-[12px] text-[#667085] text-center">Unlocks the stocks and weights, the factsheet and the manager's updates. Performance is always public.</div>
              </div>
            ) : (
              <div className="mt-1 text-sm text-[#526071]">Free access forever</div>
            )}

            {/* you cannot buy what you cannot see: investing opens once the recipe is unlocked */}
            {!locked && <button onClick={onInvest} className={`btn-invest w-full ${paid ? 'mt-3' : 'mt-5'}`}>Invest now</button>}
            <button onClick={() => { toggleWatch(basket.id); toast.success(watched ? 'Removed from watchlist' : 'Added to watchlist'); }}
              className={`w-full mt-3 inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors ${watched ? 'border-[#6C2BD9] text-[#6C2BD9] bg-[#F7F4FB]' : 'border-[#E6E8F0] text-[#0F1729] hover:border-[#6C2BD9] hover:text-[#6C2BD9]'}`}>
              <Heart className={`h-4 w-4 ${watched ? 'fill-[#6C2BD9]' : ''}`} /> {watched ? 'In watchlist' : 'Add to watchlist'}
            </button>

            <div className="mt-5 pt-5 border-t border-[#EEF1F6] space-y-2 text-xs text-[#526071]">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#0B7F4A]" /> Stocks stay in your own demat account</div>
              <div className="flex items-center gap-2"><Repeat className="h-4 w-4 text-[#6C2BD9]" /> {basket.rebalanceFreq || 'Quarterly'} review</div>
              <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-[#6C2BD9]" /> {holdingsCount} constituents{locked ? ' · names unlock on subscribing' : ''}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Phones: the primary action never scrolls away. Portaled to <body>: the page wrapper is transformed, which would trap position:fixed. */}
      {typeof document !== 'undefined' && createPortal(
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[#E6E8F0] bg-white/95 backdrop-blur-md px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]" data-testid="mobile-cta">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            {paid && !access.unlocked && plan ? (
              <>
                <div className="text-[12px] text-[#526071] leading-4">Get access for <b className="num text-[#0F1729]">{INR(plan.price)}</b>/{plan.months}m</div>
                <button type="button" onClick={onSubscribe} className="text-[12px] font-semibold text-[#5320A8] leading-4 mt-0.5">See all plans &amp; benefits</button>
              </>
            ) : (
              <>
                <div className="text-[12px] text-[#667085] leading-4">Min. amount</div>
                <div className="num text-[17px] font-bold text-[#0F1729] leading-5">{INR(minAmount)}</div>
              </>
            )}
          </div>
          {paid && !access.unlocked ? (
            <button onClick={onSubscribe} className="btn-primary flex-1 h-12 rounded-xl text-[15px]" data-testid="mobile-cta-btn"><Lock className="h-4 w-4" /> Subscribe now</button>
          ) : (
            <button onClick={onInvest} className="btn-invest flex-1 h-12 rounded-xl text-[15px]" data-testid="mobile-cta-btn">Invest now</button>
          )}
        </div>
      </div>, document.body)}

      <AboutSheet open={aboutOpen} onClose={() => setAboutOpen(false)} basket={basket} methodologyDefs={methodDefs} initialSub={aboutSub}
        blogHref={manager?.website && /^https?:/.test(manager.website) ? manager.website : null} onBlog={() => { setAboutOpen(false); setTab('Updates'); }}
        onFactsheet={basket.factsheet_pdf?.locked ? () => { setAboutOpen(false); onSubscribe(); } : `${API}/portfolios/${basket.id}/factsheet${token ? `?auth=${encodeURIComponent(token)}` : ''}`} />
      {isDb && (
        <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} basket={basket} plan={plan} setPlan={setPlan} token={token} user={user}
          onSubscribed={() => { setInterestSent(true); reloadListing(); }} />
      )}
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

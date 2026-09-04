import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import axios from 'axios';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import PhoneField from '../components/PhoneField';
import PartnerHeader from '../components/PartnerHeader';
import PartnerFooter from '../components/PartnerFooter';
import Seo from '../components/Seo';
import AnalystConsole from '../components/AnalystConsole';
import { useAuth } from '../context/AuthContext';
import { smoothScrollTo } from '../lib/smoothScroll';
import CountUpStat from '../components/CountUpStat';
import { Loader2, LineChart, CheckCircle2, TrendingUp, SearchCheck, Clock3, XCircle, ArrowRight, MessageCircle, FileText, PhoneCall, ShoppingCart, FileSpreadsheet, IndianRupee, RefreshCw, BarChart3, ShieldCheck } from 'lucide-react';
import omniMark from '../assets/omnivest-mark-white.svg';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function TrackApplication({ openSignal = 0 }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (openSignal > 0) {
      setOpen(true);
      smoothScrollTo(document.querySelector('[data-testid="track-application"]'));
    }
  }, [openSignal]);
  const [ref, setRef] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const check = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setResult(null);
    try {
      const { data } = await axios.post(`${API}/partners/status`, { ref_no: ref.trim().toUpperCase(), phone });
      setResult(data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not check the status right now.');
    } finally { setBusy(false); }
  };

  const STATUS_UI = {
    pending: { icon: Clock3, cls: 'bg-[#FEF3C7] text-[#9A4A05]', label: 'Under review', copy: 'We are verifying your details and documents — typically 2–3 working days.' },
    approved: { icon: CheckCircle2, cls: 'bg-[#DCFCE7] text-[#0B7F4A]', label: 'Approved 🎉', copy: 'Use “Partner login” above with your registered mobile to open your analyst console.' },
    rejected: { icon: XCircle, cls: 'bg-[#FEE2E2] text-[#B91C1C]', label: 'Not approved', copy: 'You can correct the issue and submit a fresh application any time.' },
  };
  const ui = result ? STATUS_UI[result.status] : null;

  return (
    <div className="surface p-4 sm:p-5" data-testid="track-application">
      <button type="button" data-testid="track-toggle" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 text-left">
        <div>
          <div className="text-sm font-semibold text-[#1A1030] flex items-center gap-2"><SearchCheck className="h-4 w-4 text-[#6C2BD9]" /> Track an existing application</div>
          <div className="text-xs text-[#526071]">Check your status with your reference number (OMN-RA-…) and registered mobile.</div>
        </div>
        <span className="text-xs font-semibold text-[#6C2BD9]">{open ? 'Hide' : 'Check status'}</span>
      </button>
      {open && (
        <form onSubmit={check} className="mt-4 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <Label>Reference number</Label>
            <Input data-testid="track-ref" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} className="h-11 mt-1.5" placeholder="OMN-RA-2026-0001" />
          </div>
          <div>
            <Label>Registered mobile</Label>
            <PhoneField testid="track-phone" value={phone} onChange={setPhone} />
          </div>
          <button data-testid="track-submit" disabled={busy || !ref.trim() || !phone} className="btn-primary h-11 px-5 disabled:opacity-60 disabled:cursor-not-allowed">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
          </button>
        </form>
      )}
      {open && error && <p data-testid="track-error" className="mt-3 text-sm text-[#B91C1C]">{error}</p>}
      {open && result && ui && (
        <div data-testid="track-result" className="mt-4 rounded-xl border border-[#E8E1F0] bg-white p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${ui.cls}`}><ui.icon className="h-3.5 w-3.5" /> {ui.label}</span>
            <span className="text-xs text-[#667085]">{result.ref_no} · applied {new Date(result.created_at).toLocaleDateString('en-IN')}</span>
          </div>
          {result.review_note && (
            <div data-testid="track-review-note" className="mt-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm text-[#475569]">
              <b className="text-[#1A1030]">Message from our review team:</b> {result.review_note}
            </div>
          )}
          <p className="mt-2 text-xs text-[#526071]">{ui.copy}</p>
        </div>
      )}
    </div>
  );
}

// ---- Motion helpers (respect prefers-reduced-motion) ----
function Reveal({ children, delay = 0, className = '' }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

function Floating({ children, className = '' }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} animate={reduce ? { y: 0 } : { y: [0, -9, 0] }} transition={reduce ? { duration: 0 } : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
      {children}
    </motion.div>
  );
}

function FloatChip({ children, className = '', delay = 0 }) {
  const reduce = useReducedMotion();
  const inner = (
    <div className="flex items-center gap-2 rounded-full bg-white shadow-lg border border-[#EDE9FE] pl-1.5 pr-3.5 py-1.5">
      {children}
    </div>
  );
  if (reduce) return <div className={className}>{inner}</div>;
  return (
    <motion.div className={className}
      initial={reduce ? false : { opacity: 0, scale: 0.6 }} animate={reduce ? { opacity: 1, scale: 1, y: 0 } : { opacity: 1, scale: 1, y: [0, -7, 0] }}
      transition={{ opacity: { duration: 0.4, delay }, scale: { duration: 0.4, delay, type: 'spring', bounce: 0.4 }, y: { duration: 4, repeat: Infinity, ease: 'easeInOut', delay: delay + 0.4 } }}>
      {inner}
    </motion.div>
  );
}

// ---- Decorative product mockups (pure CSS, illustrate the console) ----
function MockCreate() {
  const reduce = useReducedMotion();
  const rows = [
    { s: 'RELIANCE', w: 24 }, { s: 'HDFCBANK', w: 22 }, { s: 'TCS', w: 18 }, { s: 'INFY', w: 16 }, { s: 'LT', w: 20 },
  ];
  return (
    <div className="relative rounded-2xl bg-white shadow-xl border border-[#EDE9FE] p-5 text-left">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085]">Create model portfolio</div>
          <div className="text-sm font-bold text-[#1A1030]">Momentum Picks</div>
        </div>
        <span className="h-8 w-8 rounded-lg grad-card grid place-items-center text-white"><TrendingUp className="h-4 w-4" /></span>
      </div>
      <div className="mt-4 space-y-2.5">
        {rows.map((r, i) => (
          <div key={r.s} className="flex items-center gap-3">
            <span className="w-20 text-[12px] font-semibold text-[#475569]">{r.s}</span>
            <div className="flex-1 h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
              {reduce ? (
                <div className="h-full rounded-full bg-[#8B5CF6]" style={{ width: `${r.w * 3}%` }} />
              ) : (
                <motion.div className="h-full rounded-full bg-[#8B5CF6]"
                  initial={{ width: 0 }} whileInView={{ width: `${r.w * 3}%` }}
                  viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.3 + i * 0.12, ease: 'easeOut' }} />
              )}
            </div>
            <span className="w-8 text-right text-[12px] font-bold text-[#1A1030]">{r.w}%</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[#F1EBF9] pt-3">
        <span className="text-[12px] font-semibold text-[#0B7F4A]">✓ Total weight 100%</span>
        <span className="rounded-full bg-[#6C2BD9] text-white text-[12px] font-semibold px-3 py-1.5">Submit for review</span>
      </div>
    </div>
  );
}

function MockManage() {
  const rows = [
    { n: 'Momentum Picks', st: 'Approved', cls: 'bg-[#DCFCE7] text-[#0B7F4A]' },
    { n: 'Quality Compounders', st: 'In review', cls: 'bg-[#FEF3C7] text-[#9A4A05]' },
    { n: 'Dividend Shield', st: 'Draft', cls: 'bg-[#F1F5F9] text-[#526071]' },
  ];
  return (
    <div className="rounded-2xl bg-white shadow-xl border border-[#EDE9FE] p-5">
      <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085]">Analyst console · My listings</div>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.n} className="flex items-center justify-between rounded-xl border border-[#F1EBF9] px-3.5 py-3">
            <div className="text-sm font-semibold text-[#1A1030]">{r.n}</div>
            <span className={`text-[12px] font-bold uppercase px-2 py-0.5 rounded-full ${r.cls}`}>{r.st}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[12px] text-[#667085]">Factsheets, rebalances and reviews — all in one place.</div>
    </div>
  );
}

function MockGrow() {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {[
        { n: 'Momentum Picks', r: '+18.4%', by: 'Tushar Research' },
        { n: 'Dividend Shield', r: '+12.9%', by: 'Tushar Research' },
      ].map((c) => (
        <div key={c.n} className="rounded-2xl bg-white shadow-xl border border-[#EDE9FE] p-5">
          <div className="h-9 w-9 rounded-xl grad-card grid place-items-center text-white text-xs font-bold">{c.n[0]}</div>
          <div className="mt-3 text-sm font-bold text-[#1A1030]">{c.n}</div>
          <div className="text-[12px] text-[#667085]">by {c.by} · SEBI-registered</div>
          <div className="mt-3 flex items-center justify-between">
            <div><div className="text-[12px] text-[#667085]">3Y CAGR</div><div className="text-sm font-bold text-[#0B7F4A]">{c.r}</div></div>
            <span className="rounded-full bg-[#F1E7FE] text-[#5320A8] text-[12px] font-semibold px-3 py-1.5">Subscribe</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const FEATURE_MOCKS = [MockCreate, MockManage, MockGrow];

// ---- "Old way vs Omnivest way" illustrated diagram ----
const OLD_NODES = [
  { icon: MessageCircle, x: 12, y: 6, bg: 'bg-[#FEF3C7]', fg: 'text-[#9A4A05]' },
  { icon: FileText, x: 58, y: 2, bg: 'bg-[#DBEAFE]', fg: 'text-[#1D4ED8]' },
  { icon: PhoneCall, x: 30, y: 30, bg: 'bg-[#FCE7F3]', fg: 'text-[#BE185D]' },
  { icon: ShoppingCart, x: 66, y: 42, bg: 'bg-[#DCFCE7]', fg: 'text-[#0B7F4A]' },
  { icon: FileSpreadsheet, x: 14, y: 56, bg: 'bg-[#FFEDD5]', fg: 'text-[#C2410C]' },
  { icon: IndianRupee, x: 52, y: 72, bg: 'bg-[#EDE9FE]', fg: 'text-[#5320A8]' },
];
const NEW_SPOKES = [
  { icon: CheckCircle2, x: 50, y: 8, bg: 'bg-[#DCFCE7]', fg: 'text-[#0B7F4A]' },
  { icon: FileText, x: 84, y: 28, bg: 'bg-[#DBEAFE]', fg: 'text-[#1D4ED8]' },
  { icon: RefreshCw, x: 84, y: 64, bg: 'bg-[#EDE9FE]', fg: 'text-[#5320A8]' },
  { icon: BarChart3, x: 50, y: 84, bg: 'bg-[#FEF3C7]', fg: 'text-[#9A4A05]' },
  { icon: IndianRupee, x: 16, y: 64, bg: 'bg-[#FCE7F3]', fg: 'text-[#BE185D]' },
  { icon: ShieldCheck, x: 16, y: 28, bg: 'bg-[#FFEDD5]', fg: 'text-[#C2410C]' },
];

function Pop({ children, delay, className, style }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className} style={style}>{children}</div>;
  return (
    <motion.div className={className} style={style}
      initial={{ opacity: 0, scale: 0.4 }} whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }} transition={{ duration: 0.45, delay, type: 'spring', bounce: 0.45 }}>
      {children}
    </motion.div>
  );
}

function OldNewWay({ data }) {
  if (!data) return null;
  const labels = data.oldSteps || [];
  return (
    <section className="mt-20" data-testid="old-new-way">
      <Reveal>
        <h2 className="text-2xl sm:text-3xl font-bold text-center">{data.heading}</h2>
        <p className="mt-2 text-sm text-[#526071] text-center max-w-2xl mx-auto">{data.sub}</p>
      </Reveal>
      <div className="relative mt-10 grid lg:grid-cols-2 gap-8 items-stretch">
        <div className="hidden lg:grid absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 h-12 w-12 place-items-center rounded-full bg-[#1A1030] text-white text-xs font-bold shadow-xl" aria-hidden="true">VS</div>
        <Reveal className="h-full">
          <div className="relative h-[430px] rounded-2xl border border-[#F3E2DD] bg-[#FFFBFA] p-5 overflow-hidden">
            <div className="text-[12px] font-bold uppercase tracking-widest text-[#B91C1C]">{data.oldTitle}</div>
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d="M18 14 Q 45 2 62 10 Q 78 20 38 36 Q 20 44 70 50 Q 88 56 24 62 Q 8 70 56 80"
                fill="none" stroke="#CBD5E1" strokeWidth="0.6" strokeDasharray="2 2.4" />
            </svg>
            {OLD_NODES.map((n, i) => (
              <Pop key={i} delay={0.15 + i * 0.13} className="absolute w-[110px] text-center" style={{ left: `${n.x}%`, top: `${n.y + 8}%` }}>
                <span className={`mx-auto h-11 w-11 rounded-full ${n.bg} ${n.fg} grid place-items-center shadow-sm`}><n.icon className="h-5 w-5" /></span>
                <div className="mt-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#667085] leading-snug">{labels[i] || ''}</div>
              </Pop>
            ))}
          </div>
        </Reveal>
        <Reveal delay={0.15} className="h-full">
          <div className="relative h-[430px] rounded-2xl border border-[#E4DAF6] bg-[#FCFBFE] p-5 overflow-hidden">
            <div className="text-[12px] font-bold uppercase tracking-widest text-[#6C2BD9]">{data.newTitle}</div>
            <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 w-[86%] max-w-[360px] aspect-square">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" aria-hidden="true">
                {NEW_SPOKES.map((s, i) => (
                  <line key={i} x1="50" y1="46" x2={s.x} y2={s.y} stroke="#E8E1F0" strokeWidth="0.8" />
                ))}
              </svg>
              <Floating className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2">
                <span className="h-16 w-16 rounded-2xl grad-card grid place-items-center shadow-lg"><img src={omniMark} alt="" className="h-9 w-9" /></span>
              </Floating>
              {NEW_SPOKES.map((s, i) => (
                <Pop key={i} delay={0.25 + i * 0.1} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                  <span className={`h-11 w-11 rounded-full ${s.bg} ${s.fg} grid place-items-center shadow-sm`}><s.icon className="h-5 w-5" /></span>
                </Pop>
              ))}
            </div>
            <p className="absolute bottom-5 left-5 right-5 text-center text-xs text-[#526071] leading-relaxed">{data.newText}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function PartnerLanding() {
  const { user, isAuthed, loading: authLoading, token } = useAuth();
  const [pp, setPp] = useState(null); // partnerPage content (admin-editable)
  const [myApp, setMyApp] = useState(undefined);
  const [trackSignal, setTrackSignal] = useState(0);

  useEffect(() => {
    axios.get(`${API}/content`).then(({ data }) => setPp(data?.partnerPage || null)).catch(() => setPp(null));
  }, []);

  useEffect(() => {
    if (!isAuthed || !token || user?.role === 'analyst') { setMyApp(null); return; }
    axios.get(`${API}/partners/my-application`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => setMyApp(data))
      .catch(() => setMyApp(null));
  }, [isAuthed, token, user]);

  if (authLoading) {
    return <div className="min-h-screen grid place-items-center text-[#6B6480]">Loading…</div>;
  }
  if (isAuthed && user?.role === 'analyst') {
    return <AnalystConsole />;
  }

  // Logged-in user whose number has a pending/rejected application: status view.
  if (isAuthed && myApp && (myApp.status === 'pending' || myApp.status === 'rejected')) {
    const rejected = myApp.status === 'rejected';
    return (
      <div className="min-h-screen flex flex-col">
        <Seo title="Your Partner Application" description="Track your Omnivest partner application." />
        <PartnerHeader minimal />
        <main className="flex-1 fade-in grid place-items-center bg-[#F7F4FB] p-6">
          <div className="surface p-8 sm:p-10 max-w-lg w-full" data-testid="my-application-status">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${rejected ? 'bg-[#FEE2E2] text-[#B91C1C]' : 'bg-[#FEF3C7] text-[#9A4A05]'}`}>
                {rejected ? <XCircle className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />} {rejected ? 'Not approved' : 'Under review'}
              </span>
              {myApp.ref_no && <span className="text-xs font-bold text-[#1A1030]">{myApp.ref_no}</span>}
            </div>
            <h1 className="mt-4 text-2xl font-bold">{rejected ? 'Your application was not approved' : 'Your partner application is under review'}</h1>
            {!rejected && <p className="mt-2 text-sm text-[#526071]">We're verifying your SEBI registration and documents — typically 2–3 working days. Once approved, this page becomes your analyst console the next time you log in.</p>}
            {myApp.review_note && (
              <div className="mt-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm text-[#475569]">
                <b className="text-[#1A1030]">Message from our review team:</b> {myApp.review_note}
              </div>
            )}
            {rejected && (
              <Link to="/partner/apply" data-testid="reapply-btn" className="btn-primary inline-flex mt-5 px-5 py-2.5 text-sm">Correct &amp; submit a fresh application</Link>
            )}
            <p className="mt-5 text-xs text-[#667085]">Questions? Write to <a className="font-semibold text-[#6C2BD9]" href={`mailto:support@omnivest.in?subject=Partner application ${myApp.ref_no || ''}`}>support@omnivest.in</a>{myApp.ref_no ? ' with your reference number.' : '.'}</p>
          </div>
        </main>
        <PartnerFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Seo title="Become a Partner" description="Partner with Omnivest as a SEBI-registered research analyst." />
      <PartnerHeader onTrack={() => setTrackSignal((s) => s + 1)} />
      <main className="flex-1 fade-in bg-[#F7F4FB]">
        {!pp ? (
          <div className="container-x py-24 text-center text-sm text-[#6B6480]">Loading…</div>
        ) : (
          <div className="container-x py-14">
            <section id="why-partner" className="relative scroll-mt-24 grad-card rounded-3xl p-8 sm:p-12 text-white overflow-hidden">
              <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
              <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-[#F26AA5]/20 blur-3xl" aria-hidden="true" />
              <div className="relative grid lg:grid-cols-[1.15fr_1fr] gap-10 items-center">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/15 text-white text-xs font-semibold px-3 py-1.5"><LineChart className="h-3.5 w-3.5" /> {pp.hero?.badge}</span>
                  <h1 className="mt-5 text-4xl sm:text-5xl font-bold leading-tight" data-testid="partner-hero-headline">{pp.hero?.headline}</h1>
                  <p className="mt-4 text-base text-white/85 max-w-xl">{pp.hero?.sub}</p>
                  <div className="mt-8 flex items-center gap-3 flex-wrap">
                    <Link to="/partner/apply" data-testid="landing-apply-cta" className="inline-flex items-center gap-2 rounded-full bg-white text-[#5320A8] font-semibold px-6 py-3 hover:bg-[#F1E7FE] transition-colors">{pp.hero?.primaryCta || 'Apply as a partner'} <ArrowRight className="h-4 w-4" /></Link>
                    <a href="#requirements" onClick={(e) => { e.preventDefault(); smoothScrollTo('requirements'); }} className="inline-flex items-center rounded-full border border-white/40 text-white font-semibold px-6 py-3 hover:bg-white/10 transition-colors">{pp.hero?.secondaryCta || 'See requirements'}</a>
                  </div>
                  <div className="mt-8 flex items-center gap-2 flex-wrap text-xs font-semibold">
                    {['Zero platform fees for founding partners', '2–3 day verification', 'SEBI-first onboarding'].map((c) => (
                      <span key={c} className="rounded-full bg-white/10 border border-white/20 px-3 py-1.5">{c}</span>
                    ))}
                  </div>
                </div>
                <div className="relative hidden sm:block" data-testid="hero-mockup">
                  <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl bg-white/10" />
                  <Floating><div data-decorative><MockCreate /></div></Floating>
                  <FloatChip className="absolute -left-8 top-6" delay={0.8}>
                    <span className="h-6 w-6 rounded-full bg-[#DCFCE7] text-[#0B7F4A] grid place-items-center text-[12px] font-bold">+1</span>
                    <span className="text-[12px] font-semibold text-[#1A1030]">New subscriber · Momentum Picks</span>
                  </FloatChip>
                  <FloatChip className="absolute -right-4 bottom-10" delay={1.4}>
                    <span className="h-6 w-6 rounded-full bg-[#EDE9FE] text-[#5320A8] grid place-items-center"><IndianRupee className="h-3 w-3" /></span>
                    <span className="text-[12px] font-semibold text-[#1A1030]">₹4,999 subscription received</span>
                  </FloatChip>
                </div>
              </div>
            </section>

            <Reveal>
              <div className="mt-8 flex items-center justify-center gap-3 sm:gap-6 flex-wrap" data-testid="trust-strip">
                {[
                  { icon: ShieldCheck, t: 'SEBI-registered analysts only' },
                  { icon: CheckCircle2, t: 'RAASB & NISM verified' },
                  { icon: LineChart, t: 'Live market data from the exchange' },
                  { icon: TrendingUp, t: 'Investors trade via their own broker' },
                ].map((b) => (
                  <span key={b.t} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#526071]">
                    <b.icon className="h-3.5 w-3.5 text-[#6C2BD9]" /> {b.t}
                  </span>
                ))}
              </div>
            </Reveal>

            {(pp.stats || []).length > 0 && (
              <Reveal>
                <div className="mt-14 grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="partner-stats">
                  {(pp.stats || []).map((s, i) => (
                    <div key={i} className="surface p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                      <div className="text-3xl font-bold text-[#5320A8] tracking-tight"><CountUpStat value={s.value} /></div>
                      <div className="mt-1.5 text-xs text-[#526071] leading-snug">{s.label}</div>
                    </div>
                  ))}
                </div>
              </Reveal>
            )}

            {(pp.features || []).length > 0 && (
              <div className="mt-4" data-testid="partner-features">
                {(pp.features || []).map((f, i) => {
                  const Mock = FEATURE_MOCKS[i % FEATURE_MOCKS.length];
                  const flip = i % 2 === 1;
                  return (
                    <section key={i} className="mt-14 grid lg:grid-cols-2 gap-10 items-center">
                      <Reveal className={flip ? 'lg:order-2' : ''}>
                        <div className="text-[12px] font-bold uppercase tracking-widest text-[#6C2BD9]">{f.eyebrow}</div>
                        <h2 className="mt-2 text-2xl sm:text-3xl font-bold leading-snug">{f.title}</h2>
                        <ul className="mt-5 space-y-3">
                          {(f.bullets || []).filter((b) => b.trim()).map((b, j) => (
                            <li key={j} className="flex items-start gap-2.5 text-sm text-[#475569]">
                              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[#0B7F4A]" /> {b}
                            </li>
                          ))}
                        </ul>
                      </Reveal>
                      <Reveal delay={0.15} className={flip ? 'lg:order-1' : ''}><Mock /></Reveal>
                    </section>
                  );
                })}
              </div>
            )}

            <OldNewWay data={pp.oldNew} />

            <section className="mt-16" data-testid="partner-how">
              <Reveal><h2 className="text-2xl font-bold">How it works</h2></Reveal>
              <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {(pp.how || []).map((s, i) => (
                  <Reveal key={i} delay={i * 0.1}>
                    <div className="surface p-5 h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                      <div className="h-8 w-8 rounded-full grad-card text-white grid place-items-center text-sm font-bold">{i + 1}</div>
                      <div className="mt-3 text-sm font-semibold text-[#1A1030]">{s.title}</div>
                      <div className="mt-1 text-xs text-[#526071] leading-relaxed">{s.text}</div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </section>

            <div className="mt-16">
              <TrackApplication openSignal={trackSignal} />
            </div>

            <section id="requirements" className="mt-16 scroll-mt-24" data-testid="partner-requirements">
              <h2 className="text-2xl font-bold">What you need to apply</h2>
              <p className="mt-1 text-sm text-[#526071]">We verify every partner before listing — have these ready and the application takes about ten minutes.</p>
              <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(pp.requirements || []).map((r, i) => (
                  <Reveal key={i} delay={(i % 3) * 0.1}>
                    <div className="surface p-5 h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                      <div className="flex items-start gap-3">
                        <span className="h-8 w-8 shrink-0 rounded-lg bg-[#EDE9FE] text-[#5320A8] grid place-items-center"><CheckCircle2 className="h-4 w-4" /></span>
                        <div>
                          <div className="text-sm font-semibold text-[#1A1030]">{r.title}</div>
                          <div className="mt-1 text-xs text-[#526071] leading-relaxed">{r.text}</div>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
              {pp.requirementsTip && <p className="mt-4 text-xs text-[#667085]">{pp.requirementsTip}</p>}
            </section>

            <section id="partner-faq" className="mt-16 scroll-mt-24" data-testid="partner-faq-section">
              <h2 className="text-2xl font-bold">Partner FAQ</h2>
              <div className="mt-6 space-y-3 max-w-3xl">
                {(pp.faqs || []).map((f, i) => (
                  <details key={i} className="surface px-5 py-4 group transition-colors hover:border-[#D8C7F1]">
                    <summary className="text-sm font-semibold text-[#1A1030] cursor-pointer list-none flex items-center justify-between gap-3">
                      {f.q}
                      <span className="text-[#6C2BD9] transition-transform group-open:rotate-45 text-lg leading-none shrink-0">+</span>
                    </summary>
                    <p className="mt-2 text-sm text-[#475569] leading-relaxed">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>

            <Reveal>
              <section className="relative overflow-hidden mt-20 grad-card rounded-2xl p-8 sm:p-12 text-white flex flex-col sm:flex-row items-center justify-between gap-5" data-testid="partner-bottom-cta">
                <div className="pointer-events-none absolute -top-20 -left-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
                <div className="pointer-events-none absolute -bottom-24 -right-10 h-64 w-64 rounded-full bg-[#F26AA5]/20 blur-3xl" aria-hidden="true" />
                <div className="relative">
                  <div className="text-2xl font-bold">Ready to list your research on Omnivest?</div>
                  <div className="mt-1.5 text-sm text-white/85">Founding partners keep 100% of their subscription revenue.</div>
                </div>
                <Link to="/partner/apply" className="relative shrink-0 rounded-full bg-white text-[#5320A8] font-semibold px-7 py-3.5 hover:bg-[#F1E7FE] hover:scale-[1.03] transition-all">Apply as a partner →</Link>
              </section>
            </Reveal>
          </div>
        )}
      </main>
      <PartnerFooter />
    </div>
  );
}

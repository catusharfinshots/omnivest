import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import PhoneField from '../components/PhoneField';
import PartnerHeader from '../components/PartnerHeader';
import PartnerFooter from '../components/PartnerFooter';
import Seo from '../components/Seo';
import AnalystConsole from '../components/AnalystConsole';
import { useAuth } from '../context/AuthContext';
import { Loader2, LineChart, CheckCircle2, TrendingUp, SearchCheck, Clock3, XCircle, ArrowRight } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function TrackApplication({ openSignal = 0 }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (openSignal > 0) {
      setOpen(true);
      document.querySelector('[data-testid="track-application"]')?.scrollIntoView({ block: 'start' });
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
    pending: { icon: Clock3, cls: 'bg-[#FEF3C7] text-[#B45309]', label: 'Under review', copy: 'We are verifying your details and documents — typically 2–3 working days.' },
    approved: { icon: CheckCircle2, cls: 'bg-[#DCFCE7] text-[#0E9F5E]', label: 'Approved 🎉', copy: 'Use “Partner login” above with your registered mobile to open your analyst console.' },
    rejected: { icon: XCircle, cls: 'bg-[#FEE2E2] text-[#DC2626]', label: 'Not approved', copy: 'You can correct the issue and submit a fresh application any time.' },
  };
  const ui = result ? STATUS_UI[result.status] : null;

  return (
    <div className="surface p-4 sm:p-5" data-testid="track-application">
      <button type="button" data-testid="track-toggle" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 text-left">
        <div>
          <div className="text-sm font-semibold text-[#1A1030] flex items-center gap-2"><SearchCheck className="h-4 w-4 text-[#6C2BD9]" /> Track an existing application</div>
          <div className="text-xs text-[#64748B]">Check your status with your reference number (OMN-RA-…) and registered mobile.</div>
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
      {open && error && <p data-testid="track-error" className="mt-3 text-sm text-[#DC2626]">{error}</p>}
      {open && result && ui && (
        <div data-testid="track-result" className="mt-4 rounded-xl border border-[#E8E1F0] bg-white p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${ui.cls}`}><ui.icon className="h-3.5 w-3.5" /> {ui.label}</span>
            <span className="text-xs text-[#94A3B8]">{result.ref_no} · applied {new Date(result.created_at).toLocaleDateString('en-IN')}</span>
          </div>
          {result.review_note && (
            <div data-testid="track-review-note" className="mt-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm text-[#475569]">
              <b className="text-[#1A1030]">Message from our review team:</b> {result.review_note}
            </div>
          )}
          <p className="mt-2 text-xs text-[#64748B]">{ui.copy}</p>
        </div>
      )}
    </div>
  );
}

// ---- Decorative product mockups (pure CSS, illustrate the console) ----
function MockCreate() {
  const rows = [
    { s: 'RELIANCE', w: 24 }, { s: 'HDFCBANK', w: 22 }, { s: 'TCS', w: 18 }, { s: 'INFY', w: 16 }, { s: 'LT', w: 20 },
  ];
  return (
    <div className="relative rounded-2xl bg-white shadow-xl border border-[#EDE9FE] p-5 text-left">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Create model portfolio</div>
          <div className="text-sm font-bold text-[#1A1030]">Momentum Picks</div>
        </div>
        <span className="h-8 w-8 rounded-lg grad-card grid place-items-center text-white"><TrendingUp className="h-4 w-4" /></span>
      </div>
      <div className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <div key={r.s} className="flex items-center gap-3">
            <span className="w-20 text-[11px] font-semibold text-[#475569]">{r.s}</span>
            <div className="flex-1 h-2 rounded-full bg-[#F1F5F9] overflow-hidden"><div className="h-full rounded-full bg-[#8B5CF6]" style={{ width: `${r.w * 3}%` }} /></div>
            <span className="w-8 text-right text-[11px] font-bold text-[#1A1030]">{r.w}%</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[#F1EBF9] pt-3">
        <span className="text-[11px] font-semibold text-[#0E9F5E]">✓ Total weight 100%</span>
        <span className="rounded-full bg-[#6C2BD9] text-white text-[11px] font-semibold px-3 py-1.5">Submit for review</span>
      </div>
    </div>
  );
}

function MockManage() {
  const rows = [
    { n: 'Momentum Picks', st: 'Approved', cls: 'bg-[#DCFCE7] text-[#0E9F5E]' },
    { n: 'Quality Compounders', st: 'In review', cls: 'bg-[#FEF3C7] text-[#B45309]' },
    { n: 'Dividend Shield', st: 'Draft', cls: 'bg-[#F1F5F9] text-[#64748B]' },
  ];
  return (
    <div className="rounded-2xl bg-white shadow-xl border border-[#EDE9FE] p-5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Analyst console · My listings</div>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.n} className="flex items-center justify-between rounded-xl border border-[#F1EBF9] px-3.5 py-3">
            <div className="text-sm font-semibold text-[#1A1030]">{r.n}</div>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${r.cls}`}>{r.st}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-[#94A3B8]">Factsheets, rebalances and reviews — all in one place.</div>
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
          <div className="text-[11px] text-[#94A3B8]">by {c.by} · SEBI-registered</div>
          <div className="mt-3 flex items-center justify-between">
            <div><div className="text-[10px] text-[#94A3B8]">3Y CAGR</div><div className="text-sm font-bold text-[#0E9F5E]">{c.r}</div></div>
            <span className="rounded-full bg-[#F1E7FE] text-[#5320A8] text-[11px] font-semibold px-3 py-1.5">Subscribe</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const FEATURE_MOCKS = [MockCreate, MockManage, MockGrow];

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
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${rejected ? 'bg-[#FEE2E2] text-[#DC2626]' : 'bg-[#FEF3C7] text-[#B45309]'}`}>
                {rejected ? <XCircle className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />} {rejected ? 'Not approved' : 'Under review'}
              </span>
              {myApp.ref_no && <span className="text-xs font-bold text-[#1A1030]">{myApp.ref_no}</span>}
            </div>
            <h1 className="mt-4 text-2xl font-bold">{rejected ? 'Your application was not approved' : 'Your partner application is under review'}</h1>
            {!rejected && <p className="mt-2 text-sm text-[#64748B]">We're verifying your SEBI registration and documents — typically 2–3 working days. Once approved, this page becomes your analyst console the next time you log in.</p>}
            {myApp.review_note && (
              <div className="mt-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm text-[#475569]">
                <b className="text-[#1A1030]">Message from our review team:</b> {myApp.review_note}
              </div>
            )}
            {rejected && (
              <Link to="/partner/apply" data-testid="reapply-btn" className="btn-primary inline-flex mt-5 px-5 py-2.5 text-sm">Correct &amp; submit a fresh application</Link>
            )}
            <p className="mt-5 text-xs text-[#94A3B8]">Questions? Write to <a className="font-semibold text-[#6C2BD9]" href={`mailto:support@omnivest.in?subject=Partner application ${myApp.ref_no || ''}`}>support@omnivest.in</a>{myApp.ref_no ? ' with your reference number.' : '.'}</p>
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
            <section id="why-partner" className="scroll-mt-24 grad-card rounded-3xl p-8 sm:p-12 text-white overflow-hidden">
              <div className="grid lg:grid-cols-[1.15fr_1fr] gap-10 items-center">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/15 text-white text-xs font-semibold px-3 py-1.5"><LineChart className="h-3.5 w-3.5" /> {pp.hero?.badge}</span>
                  <h1 className="mt-5 text-4xl sm:text-5xl font-bold leading-tight" data-testid="partner-hero-headline">{pp.hero?.headline}</h1>
                  <p className="mt-4 text-base text-white/85 max-w-xl">{pp.hero?.sub}</p>
                  <div className="mt-8 flex items-center gap-3 flex-wrap">
                    <Link to="/partner/apply" data-testid="landing-apply-cta" className="inline-flex items-center gap-2 rounded-full bg-white text-[#5320A8] font-semibold px-6 py-3 hover:bg-[#F1E7FE] transition-colors">{pp.hero?.primaryCta || 'Apply as a partner'} <ArrowRight className="h-4 w-4" /></Link>
                    <a href="#requirements" onClick={(e) => { e.preventDefault(); document.getElementById('requirements')?.scrollIntoView({ block: 'start' }); }} className="inline-flex items-center rounded-full border border-white/40 text-white font-semibold px-6 py-3 hover:bg-white/10 transition-colors">{pp.hero?.secondaryCta || 'See requirements'}</a>
                  </div>
                  <div className="mt-8 flex items-center gap-2 flex-wrap text-xs font-semibold">
                    {['Zero platform fees for founding partners', '2–3 day verification', 'SEBI-first onboarding'].map((c) => (
                      <span key={c} className="rounded-full bg-white/10 border border-white/20 px-3 py-1.5">{c}</span>
                    ))}
                  </div>
                </div>
                <div className="relative hidden sm:block" data-testid="hero-mockup">
                  <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl bg-white/10" />
                  <MockCreate />
                </div>
              </div>
            </section>

            {(pp.features || []).length > 0 && (
              <div className="mt-4" data-testid="partner-features">
                {(pp.features || []).map((f, i) => {
                  const Mock = FEATURE_MOCKS[i % FEATURE_MOCKS.length];
                  const flip = i % 2 === 1;
                  return (
                    <section key={i} className="mt-12 grid lg:grid-cols-2 gap-10 items-center">
                      <div className={flip ? 'lg:order-2' : ''}>
                        <div className="text-[11px] font-bold uppercase tracking-widest text-[#6C2BD9]">{f.eyebrow}</div>
                        <h2 className="mt-2 text-2xl sm:text-3xl font-bold leading-snug">{f.title}</h2>
                        <ul className="mt-5 space-y-3">
                          {(f.bullets || []).filter((b) => b.trim()).map((b, j) => (
                            <li key={j} className="flex items-start gap-2.5 text-sm text-[#475569]">
                              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[#12B76A]" /> {b}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className={flip ? 'lg:order-1' : ''}><Mock /></div>
                    </section>
                  );
                })}
              </div>
            )}

            <section className="mt-16" data-testid="partner-how">
              <h2 className="text-2xl font-bold">How it works</h2>
              <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {(pp.how || []).map((s, i) => (
                  <div key={i} className="surface p-5">
                    <div className="h-8 w-8 rounded-full grad-card text-white grid place-items-center text-sm font-bold">{i + 1}</div>
                    <div className="mt-3 text-sm font-semibold text-[#1A1030]">{s.title}</div>
                    <div className="mt-1 text-xs text-[#64748B] leading-relaxed">{s.text}</div>
                  </div>
                ))}
              </div>
            </section>

            <div className="mt-16">
              <TrackApplication openSignal={trackSignal} />
            </div>

            <section id="requirements" className="mt-16 scroll-mt-24" data-testid="partner-requirements">
              <h2 className="text-2xl font-bold">What you need to apply</h2>
              <p className="mt-1 text-sm text-[#64748B]">We verify every partner before listing — have these ready and the application takes about ten minutes.</p>
              <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(pp.requirements || []).map((r, i) => (
                  <div key={i} className="surface p-5">
                    <div className="flex items-start gap-3">
                      <span className="h-8 w-8 shrink-0 rounded-lg bg-[#EDE9FE] text-[#5320A8] grid place-items-center"><CheckCircle2 className="h-4 w-4" /></span>
                      <div>
                        <div className="text-sm font-semibold text-[#1A1030]">{r.title}</div>
                        <div className="mt-1 text-xs text-[#64748B] leading-relaxed">{r.text}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {pp.requirementsTip && <p className="mt-4 text-xs text-[#94A3B8]">{pp.requirementsTip}</p>}
            </section>

            <section id="partner-faq" className="mt-16 scroll-mt-24" data-testid="partner-faq-section">
              <h2 className="text-2xl font-bold">Partner FAQ</h2>
              <div className="mt-6 space-y-3 max-w-3xl">
                {(pp.faqs || []).map((f, i) => (
                  <details key={i} className="surface px-5 py-4 group">
                    <summary className="text-sm font-semibold text-[#1A1030] cursor-pointer list-none flex items-center justify-between gap-3">
                      {f.q}
                      <span className="text-[#6C2BD9] transition-transform group-open:rotate-45 text-lg leading-none shrink-0">+</span>
                    </summary>
                    <p className="mt-2 text-sm text-[#475569] leading-relaxed">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>

            <section className="mt-16 grad-card rounded-2xl p-8 sm:p-10 text-white flex flex-col sm:flex-row items-center justify-between gap-5" data-testid="partner-bottom-cta">
              <div>
                <div className="text-xl font-bold">Ready to list your research on Omnivest?</div>
                <div className="mt-1 text-sm text-white/80">Founding partners keep 100% of their subscription revenue.</div>
              </div>
              <Link to="/partner/apply" className="shrink-0 rounded-full bg-white text-[#5320A8] font-semibold px-6 py-3 hover:bg-[#F1E7FE] transition-colors">Apply as a partner →</Link>
            </section>
          </div>
        )}
      </main>
      <PartnerFooter />
    </div>
  );
}

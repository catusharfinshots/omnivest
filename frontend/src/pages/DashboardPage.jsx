import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Eye, EyeOff, Loader2, Wrench, Clock, User, Link2, BadgeCheck, AlertTriangle, Info, PieChart, Landmark, Compass, Building2, LineChart, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import CoverArt from '../components/CoverArt';
import WatchButton from '../components/WatchButton';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const IST = 'Asia/Kolkata';
const HIDE_KEY = 'omnivest-hide-amounts';
const day = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', timeZone: IST }) : '');
const dayY = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST }) : '');
const pct = (v, signed = true) => (v == null ? '—' : `${signed && v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`);
const NUDGE = { broker: [Link2, 'bg-[#F1EDF7] text-[#6C2BD9]'], expired: [AlertTriangle, 'bg-[#FEF3C7] text-[#9A4A05]'], fix: [Wrench, 'bg-[#FEF3C7] text-[#9A4A05]'], pending: [Clock, 'bg-[#EFF6FF] text-[#1D4ED8]'], profile: [User, 'bg-[#F1EDF7] text-[#5320A8]'], renewal: [BadgeCheck, 'bg-[#E3F4EB] text-[#096B3E]'] };
const PRODUCTS = [
  { to: '/model-portfolios', icon: PieChart, t: 'Model portfolios', d: 'Expert-built stock baskets, invested from your own broker account', live: true },
  { to: '/aif', icon: Landmark, t: 'AIF', d: 'Alternative investment funds for ₹1 Cr+ investors' },
  { to: '/advisory', icon: Compass, t: 'Advisory', d: 'SEBI-registered advisers, matched to you' },
  { to: '/fixed-deposits', icon: Building2, t: 'Fixed deposits', d: 'Bank FDs with the best rates, in one place' },
  { to: '/mutual-funds', icon: LineChart, t: 'Mutual funds', d: 'Direct plans, tracked next to everything else' },
];

function useHidden() {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } });
  const toggle = () => setHidden((h) => { try { localStorage.setItem(HIDE_KEY, h ? '0' : '1'); } catch { /* ignore */ } return !h; });
  return [hidden, toggle];
}

function Money({ v, hidden, className = '' }) {
  if (hidden) return <span className={`tracking-widest ${className}`} aria-label="hidden">••••</span>;
  return <span className={`num ${className}`}>₹{Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>;
}

function Ranked({ title, sub, rows, metric }) {
  return (
    <div className="surface p-4" data-testid="dash-rank">
      <div className="flex items-baseline justify-between"><b className="text-[14px] text-[#0F1729]">{title}</b><span className="text-[11px] text-[#667085]">{sub}</span></div>
      {rows.length === 0 && <div className="text-[12.5px] text-[#667085] py-4">Nothing yet.</div>}
      {rows.map((r) => (
        <Link key={r.id} to={`/model-portfolios/${r.id}`} className="flex items-center gap-2.5 py-2 border-t border-[#F5F2FA] first:border-t-0 hover:bg-[#FBFAFD] -mx-1 px-1 rounded-lg">
          <CoverArt cover={r.cover} name={r.name} size={28} radius={8} />
          <span className="text-[13px] font-medium text-[#0F1729] truncate flex-1">{r.name}</span>
          <span className="text-right text-[11px] text-[#667085] shrink-0">{metric(r)}</span>
        </Link>
      ))}
    </div>
  );
}

/** Dashboard: the logged-in home. Everything the investor's money touches, on one screen (smallcase Overview + our own signals). */
export default function DashboardPage() {
  const { token, isAuthed, loading: authLoading, user, openAuth } = useAuth();
  const navigate = useNavigate();
  const h = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const [d, setD] = useState(null);
  const [hidden, toggleHidden] = useHidden();
  const [chip, setChip] = useState('all');

  useEffect(() => { document.title = 'Dashboard | Omnivest'; }, []);
  useEffect(() => { if (!authLoading && user?.role === 'analyst') navigate('/partner', { replace: true }); if (!authLoading && user?.role === 'admin') navigate('/admin', { replace: true }); }, [authLoading, user, navigate]);
  useEffect(() => { if (!authLoading && !isAuthed) openAuth?.({ next: '/dashboard' }); }, [authLoading, isAuthed, openAuth]);
  useEffect(() => {
    if (!isAuthed) return undefined;
    const load = async () => { try { const { data } = await axios.get(`${API}/dashboard`, h); setD(data); } catch { setD({ error: true }); } };
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => clearInterval(id);
  }, [isAuthed, h]);

  if (authLoading) return <div className="container-x py-24 text-center text-[#526071]">Loading…</div>;
  if (!isAuthed) return <div className="container-x py-24 text-center"><h1 className="text-2xl font-bold">Please log in</h1><button onClick={() => openAuth({ next: '/dashboard' })} className="btn-primary mt-6 inline-flex">Log in</button></div>;

  const ov = d?.overview || {};
  const fees = d?.fees;
  const m = d?.market || {};
  const filt = (rows) => (rows || []).filter((r) => chip === 'all' || (chip === 'free' ? !r.paid : chip === 'paid' ? r.paid : chip === 'low' ? r.volatility_label === 'Low' : true));
  const first = (user?.name || '').split(' ')[0];

  return (
    <div className="bg-[#F7F4FB] min-h-screen">
      <div className="container-x py-6 sm:py-8">
        {/* 1. Overview strip */}
        <section className="surface overflow-hidden" data-testid="dash-overview">
          <div className="p-5 sm:p-6 grid grid-cols-2 lg:grid-cols-[1.1fr_1fr_1fr_1fr_auto] gap-x-6 gap-y-4 items-center">
            <div className="col-span-2 lg:col-span-1">
              <h1 className="font-heading text-[22px] sm:text-[24px] font-bold text-[#0F1729] flex items-center gap-2">{first ? `Hi ${first}` : 'Overview'} <button type="button" onClick={toggleHidden} className="text-[#667085] hover:text-[#0F1729]" aria-label={hidden ? 'Show amounts' : 'Hide amounts'} data-testid="dash-eye">{hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></h1>
              <div className="flex gap-1.5 mt-2 flex-wrap">{(m.ticks || []).length ? m.ticks.map((t) => <span key={t.label} className="text-[11px] border border-[#E8E1F0] rounded-md px-2 py-0.5 text-[#526071] bg-white">{t.label} <b className="text-[#0F1729] num">{Number(t.ltp).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b> {t.change_pct != null && <span className={t.change_pct >= 0 ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'}>{t.change_pct >= 0 ? '▲' : '▼'}{Math.abs(t.change_pct).toFixed(2)}%</span>}</span>) : <span className="text-[11px] text-[#667085]">{m.open ? 'Market is open' : 'Market is closed'}{m.next_open_text && !m.open ? ` · opens ${m.next_open_text}` : ''}</span>}</div>
            </div>
            <div><div className="text-[12px] text-[#667085]">Current value</div><div className="font-heading text-[22px] font-extrabold text-[#0F1729]"><Money v={ov.value} hidden={hidden} />{ov.day_pct != null && !hidden && <span className={`text-[12px] font-semibold ml-2 ${ov.day_pct >= 0 ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'}`}>{ov.day_pct >= 0 ? '▲' : '▼'} {Math.abs(ov.day_pct).toFixed(1)}%</span>}</div></div>
            <div><div className="text-[12px] text-[#667085]">Total returns</div><div className={`font-heading text-[22px] font-extrabold ${(ov.returns || 0) >= 0 ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'}`}>{hidden ? <span className="tracking-widest">••••</span> : <><span className="num">{(ov.returns || 0) >= 0 ? '+' : '−'}₹{Math.abs(ov.returns || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>{ov.returns_pct != null && <span className="text-[12px] font-semibold ml-2">{pct(ov.returns_pct, false)}{ov.since ? ` · since ${day(ov.since)}` : ''}</span>}</>}</div></div>
            <div><div className="text-[12px] text-[#667085]">Subscriptions</div><div className="font-heading text-[22px] font-extrabold text-[#0F1729]">{ov.subscriptions || 0} active{ov.next_renewal && <span className="text-[12px] font-semibold text-[#667085] ml-2">renews {day(ov.next_renewal)}</span>}</div></div>
            <Link to="/investments" className="btn-outline h-11 col-span-2 lg:col-span-1" data-testid="dash-see-investments">See investments</Link>
          </div>
          {d && !d.error && m.context && (
            <div className="mx-5 sm:mx-6 mb-5 rounded-xl bg-[#F1EDF7] text-[#3F3A50] px-3.5 py-2.5 text-[13px] flex gap-2.5 items-start" data-testid="dash-context"><Info className="h-4 w-4 shrink-0 mt-0.5 text-[#6C2BD9]" /><span>{m.context}{ov.checked_at ? ` Holdings last matched ${dayY(ov.checked_at)}.` : ''}</span></div>
          )}
          {d === null && <div className="px-6 pb-5 text-[13px] text-[#667085]"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Putting your dashboard together…</div>}
        </section>

        {/* 2. What's next + fees vs returns */}
        <div className="mt-4 grid lg:grid-cols-2 gap-4">
          <section className="surface p-5" data-testid="dash-next">
            <h2 className="font-heading font-bold text-[15px] text-[#0F1729]">What's next for you</h2>
            {d && (d.nudges || []).length === 0 && <div className="mt-3 text-[13px] text-[#526071] flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-[#0B7F4A]" /> Nothing needs you right now.</div>}
            {(d?.nudges || []).map((n, i) => { const [Icon, cls] = NUDGE[n.type] || NUDGE.profile; return (
              <div key={i} className="flex items-center gap-3 py-2.5 border-t border-[#F5F2FA] first:border-t-0 first:mt-1">
                <span className={`h-9 w-9 rounded-[10px] grid place-items-center shrink-0 ${cls}`}><Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold text-[#0F1729]">{n.title}</span><span className="block text-[12px] text-[#526071]">{n.body}</span></span>
                <Link to={n.link} className="text-[12px] font-bold text-[#5320A8] shrink-0">{n.cta} →</Link>
              </div>
            ); })}
          </section>
          <section className="surface p-5" data-testid="dash-fees">
            <h2 className="font-heading font-bold text-[15px] text-[#0F1729]">Fees vs returns</h2>
            {fees && (fees.fees > 0 ? (
              <>
                <div className="mt-2 flex justify-between text-[13px] py-1.5"><span className="text-[#526071]">Subscription fees paid</span><b><Money v={fees.fees} hidden={hidden} /></b></div>
                <div className="flex justify-between text-[13px] py-1.5 border-t border-[#F5F2FA]"><span className="text-[#526071]">Returns earned so far</span><b className={fees.returns >= 0 ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'}>{hidden ? '••••' : <span className="num">{fees.returns >= 0 ? '+' : '−'}₹{Math.abs(fees.returns).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}</b></div>
                <div className="h-2 rounded-full bg-[#EEEAF4] overflow-hidden mt-3"><i className="block h-full bg-gradient-to-r from-[#0A7D48] to-[#6C2BD9]" style={{ width: `${Math.min(100, Math.max(0, fees.covered_pct || 0))}%` }} /></div>
                <div className="text-[12.5px] text-[#526071] mt-2 leading-relaxed">{fees.covered_pct >= 100 ? <>Your returns have covered your fees <b>{(fees.covered_pct / 100).toFixed(1)}×</b> over.</> : <>Returns cover <b>{Math.round(fees.covered_pct || 0)}%</b> of fees. Break-even needs another <b><Money v={fees.gap} hidden={hidden} /></b>{ov.invested ? ` (${pct(fees.gap * 100 / ov.invested, false)})` : ''}.</>} Investments are subject to market risk; past returns do not predict future ones.</div>
              </>
            ) : <div className="mt-3 text-[13px] text-[#526071]">No subscription fees paid yet. Free portfolios cost nothing; this box starts tracking the day you subscribe to a paid one.</div>)}
          </section>
        </div>

        {/* 3. Based on your interests */}
        {(d?.interests || []).length > 0 && (
          <section className="mt-6" data-testid="dash-interests">
            <h2 className="font-heading font-bold text-[18px] text-[#0F1729]">Based on your interests</h2>
            <div className="text-[12.5px] text-[#667085]">Portfolios you looked at, and how they moved since</div>
            <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {d.interests.map((p) => (
                <div key={p.id} className="surface p-4 flex flex-col gap-2.5">
                  <Link to={`/model-portfolios/${p.id}`} className="flex items-center gap-2.5"><CoverArt cover={p.cover} name={p.name} size={40} radius={10} /><span className="min-w-0"><span className="block font-semibold text-[14px] text-[#0F1729] truncate">{p.name}</span><span className="block text-[12px] text-[#667085] truncate">{p.manager ? `by ${p.manager}` : ''}</span></span></Link>
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end text-[12px] text-[#667085]">
                    <span>Moved since you viewed<b className={`block text-[13.5px] ${p.moved_since_view_pct == null ? 'text-[#667085]' : p.moved_since_view_pct >= 0 ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'}`}>{pct(p.moved_since_view_pct)}</b></span>
                    <span>Since launch<b className="block text-[13.5px] text-[#0F1729]">{pct(p.return_pct)}</b></span>
                    <WatchButton portfolioId={p.id} watching={p.watching} />
                  </div>
                  <div className="text-[11px] text-[#667085] border-t border-[#F5F2FA] pt-1.5">{p.first_viewed_at ? `First viewed ${dayY(p.first_viewed_at)} · ` : ''}{p.paid ? 'Paid' : 'Free'}{p.volatility_label ? ` · ${p.volatility_label} volatility` : ''}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 4. Trending */}
        <section className="mt-6" data-testid="dash-trending">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div><h2 className="font-heading font-bold text-[18px] text-[#0F1729]">Trending on Omnivest</h2><div className="text-[12.5px] text-[#667085]">Ranked from what investors did in the last 7 days</div></div>
            <div className="flex gap-1.5 flex-wrap">{[['all', 'All'], ['free', 'Free'], ['paid', 'Paid'], ['low', 'Low volatility']].map(([k, l]) => <button key={k} type="button" onClick={() => setChip(k)} className={`h-10 sm:h-8 px-3 rounded-full text-[12px] font-semibold border ${chip === k ? 'bg-[#1A1030] text-white border-[#1A1030]' : 'bg-white border-[#E8E1F0] text-[#334155]'}`}>{l}</button>)}</div>
          </div>
          <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Ranked title="Most invested" sub="30 days · by amount" rows={filt(d?.trending?.most_invested)} metric={(r) => <>since launch<b className={`block text-[12.5px] ${(r.return_pct || 0) >= 0 ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'}`}>{pct(r.return_pct)}</b></>} />
            <Ranked title="Most viewed" sub="7 days" rows={filt(d?.trending?.most_viewed)} metric={(r) => <>views<b className="block text-[12.5px] text-[#0F1729] num">{r.views}</b></>} />
            <Ranked title="New launches" sub="newest first" rows={filt(d?.trending?.new_launches)} metric={(r) => <>launched<b className="block text-[12.5px] text-[#0F1729]">{r.launched ? day(r.launched) : '—'}</b></>} />
          </div>
        </section>

        {/* 5. Products */}
        <section className="mt-6" data-testid="dash-products">
          <h2 className="font-heading font-bold text-[18px] text-[#0F1729]">Everything on Omnivest</h2>
          <div className="text-[12.5px] text-[#667085]">One login, one dashboard, every product as it goes live</div>
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-5 gap-3">
            {PRODUCTS.map(({ to, icon: Icon, t, d: desc, live }) => (
              <Link key={to} to={to} className="surface p-4 hover:border-[#D8C7F1] transition-colors">
                <span className="h-10 w-10 rounded-xl bg-[#F1EDF7] text-[#6C2BD9] grid place-items-center"><Icon className="h-5 w-5" /></span>
                <div className="font-semibold text-[14px] text-[#0F1729] mt-2.5">{t}{!live && <span className="ml-1.5 align-middle text-[10px] font-bold text-[#9A4A05] bg-[#FEF3C7] rounded-full px-1.5 py-0.5">Coming</span>}</div>
                <div className="text-[12px] text-[#667085] mt-0.5 leading-relaxed">{desc}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* 6. Partner posts */}
        {(d?.posts || []).length > 0 && (
          <section className="mt-6" data-testid="dash-posts">
            <h2 className="font-heading font-bold text-[18px] text-[#0F1729]">Latest from your partners</h2>
            <div className="text-[12.5px] text-[#667085]">Updates posted by the managers of portfolios you follow</div>
            <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {d.posts.map((p) => (
                <Link key={p.id} to={`/model-portfolios/${p.portfolio_id}#updates`} className="surface p-4 hover:border-[#D8C7F1] transition-colors">
                  <div className="text-[11px] font-bold text-[#6C2BD9] uppercase tracking-wide truncate">{p.portfolio_name}{p.manager ? ` · ${p.manager}` : ''}</div>
                  <div className="font-semibold text-[14px] text-[#0F1729] mt-1">{p.title}</div>
                  <div className="text-[12.5px] text-[#526071] mt-1 leading-relaxed">{p.locked ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> {p.excerpt}</span> : p.excerpt}</div>
                  <div className="text-[11px] text-[#667085] mt-1.5">{dayY(p.at)}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

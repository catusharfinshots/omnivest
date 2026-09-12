import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { TrendingUp, RefreshCw, Loader2, Link2, CheckCircle2, AlertTriangle, Wrench, LogOut, ChevronDown, ChevronUp, Archive, Info, Undo2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBroker } from '../context/BrokerContext';
import CoverArt from '../components/CoverArt';
import ActionModal from '../components/ActionModal';
import HowItWorks from '../components/HowItWorks';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const IST = 'Asia/Kolkata';
const clock = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: IST }) : '');
const day = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST }) : '');
const PILL = { complete: ['bg-[#E3F4EB] text-[#096B3E]', 'Complete'], in_progress: ['bg-[#EFF6FF] text-[#1D4ED8]', 'Orders placed'], incomplete: ['bg-[#FBE4E4] text-[#B91C1C]', 'Incomplete'], exited: ['bg-[#EEEAF4] text-[#526071]', 'Exited'], exited_outside: ['bg-[#EEEAF4] text-[#526071]', 'Sold outside Omnivest'], unchecked: ['bg-[#FEF3C7] text-[#9A4A05]', 'Not checked yet'], empty: ['bg-[#EEEAF4] text-[#526071]', 'Nothing placed'] };
const ST = { held: ['bg-[#E3F4EB] text-[#096B3E]', 'Held'], ordered: ['bg-[#EFF6FF] text-[#1D4ED8]', 'Ordered'], partial: ['bg-[#FEF3C7] text-[#9A4A05]', 'Partial'], missing: ['bg-[#FBE4E4] text-[#B91C1C]', 'Missing'], sold: ['bg-[#EEEAF4] text-[#526071]', 'Sold outside'] };

/** The one actionable sentence per card, from data we already have (Tushar: "this is how a great product guy thinks"). */
const nextOpen = (market) => (market?.next_open_ist ? new Date(market.next_open_ist).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: IST }) : 'the next market session');
function smartLine(inv, balance, market) {
  const miss = inv.rows.filter((r) => r.missing_qty > 0);
  const pend = inv.rows.filter((r) => r.pending_qty > 0);
  if (inv.health === 'in_progress') {
    return { tone: 'info', text: <><b>{pend.length} order{pend.length > 1 ? 's are' : ' is'} with your broker</b> and execute{pend.length > 1 ? '' : 's'} at {nextOpen(market)}. Nothing to do until then; this page updates itself once they fill.</> };
  }
  if (inv.health === 'incomplete' && miss.length) {
    const cost = miss.reduce((s, r) => s + r.missing_qty * r.ltp, 0) * 1.005;
    const need = Math.ceil(cost * 1.02);
    const short = balance == null ? null : Math.max(0, Math.ceil((need - balance) / 10) * 10);
    const sold = miss.filter((r) => r.status === 'sold');
    return { tone: 'warn', text: <>
      {pend.length ? <>{pend.length} order{pend.length > 1 ? 's are' : ' is'} with your broker for {nextOpen(market)}. </> : ''}
      <b>{miss.length} stock{miss.length > 1 ? 's are' : ' is'} {sold.length === miss.length ? 'no longer held' : 'missing'}: {miss.map((r) => r.symbol).join(', ')}.</b>{' '}
      {sold.length ? 'They were sold outside Omnivest. ' : ''}Buying {miss.length > 1 ? 'them' : 'it'} today needs about <b>{INR(need)}</b> and brings every stock back to its target weight.
      {short != null && short > 0 ? <> Your available balance is {INR(balance)}, so add <b>{INR(short)}</b> first.</> : short === 0 ? ' Your available balance covers it.' : ''}
    </> };
  }
  if (inv.health === 'complete') {
    const dev = inv.worst_deviation_pp;
    return { tone: 'ok', text: <>Every stock is held{dev != null ? <>, all within <b>{dev.toFixed(1)}%</b> of target weight</> : ''}. Adding more keeps the same mix; open the portfolio and tap Invest now.</> };
  }
  if (inv.health === 'exited') return { tone: 'mute', text: <>You exited this portfolio on {day(inv.exited_at)}. The sell orders are in your Orders page.</> };
  if (inv.health === 'exited_outside') return { tone: 'warn', text: <>Everything this portfolio bought has since been sold at your broker. If you meant to exit, mark it as exited. If not, Buy back places the same quantities again at today's price.</> };
  if (inv.health === 'unchecked') return { tone: 'warn', text: <>Connect your broker and we will match these {inv.total_count} stocks against what your account actually holds.</> };
  return null;
}

function Card({ inv, balance, market, onFix, onExit, onMarkExited, open0 }) {
  const [open, setOpen] = useState(open0);
  const [p, ptext] = PILL[inv.health] || PILL.unchecked;
  const line = smartLine(inv, balance, market);
  const pillText = inv.health === 'incomplete' ? `${ptext} · ${inv.held_count} of ${inv.total_count} held${inv.pending_count ? ` · ${inv.pending_count} ordered` : ''}` : inv.health === 'in_progress' ? `${ptext} · ${inv.pending_count} of ${inv.total_count} ordered` : ptext;
  const canFix = ['incomplete', 'exited_outside'].includes(inv.health) && !inv.stale && inv.rows.some((r) => r.missing_qty > 0);
  const extras = inv.rows.filter((r) => r.extra_qty > 0);
  const canExit = ['complete', 'incomplete', 'in_progress'].includes(inv.health) && !inv.stale && inv.rows.some((r) => r.held_qty > 0);
  return (
    <section className={`surface overflow-hidden ${['exited', 'exited_outside'].includes(inv.health) ? 'opacity-90' : ''}`} data-testid="investment-card" data-health={inv.health}>
      <div className="flex items-start gap-3.5 px-4 sm:px-5 py-4">
        <CoverArt cover={inv.portfolio?.cover} name={inv.portfolio?.name} size={52} radius={12} />
        <div className="flex-1 min-w-0">
          <Link to={`/model-portfolios/${inv.portfolio_id}`} className="font-heading font-bold text-[16px] sm:text-[17px] text-[#0F1729] hover:text-[#6C2BD9] block truncate">{inv.portfolio?.name}</Link>
          <div className="text-[12px] text-[#667085] mt-0.5">{inv.portfolio?.manager ? `by ${inv.portfolio.manager} · ` : ''}v{inv.portfolio?.version || 1} · invested {day(inv.first_invested_at)}</div>
        </div>
        <span className={`shrink-0 text-[11px] font-bold rounded-full px-2.5 py-1 ${p}`}>{pillText}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 px-4 sm:px-5 py-3 bg-[#F7F4FB] text-[12.5px] text-[#526071]">
        <span>Invested<b className="block text-[#0F1729] num text-[15px]">{INR(inv.invested)}</b></span>
        <span>Current<b className="block text-[#0F1729] num text-[15px]">{INR(inv.current)}</b></span>
        <span>Returns<b className={`block num text-[15px] ${inv.returns >= 0 ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'}`}>{inv.returns >= 0 ? '+' : '−'}{INR(Math.abs(inv.returns))} · {Math.abs(inv.returns_pct || 0).toFixed(1)}%</b></span>
        <span>Stocks held<b className="block text-[#0F1729] num text-[15px]">{inv.held_count} of {inv.total_count}</b></span>
      </div>
      {line && (
        <div className={`mx-4 sm:mx-5 mt-3 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed flex gap-2 items-start ${line.tone === 'warn' ? 'bg-[#FEF3C7] text-[#9A4A05]' : line.tone === 'ok' ? 'bg-[#EEF7F1] text-[#0F5132]' : line.tone === 'info' ? 'bg-[#EFF6FF] text-[#1D4ED8]' : 'bg-[#F1EDF7] text-[#3F3A50]'}`} data-testid="investment-smart">
          {line.tone === 'warn' ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> : line.tone === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <Info className="h-4 w-4 shrink-0 mt-0.5" />}
          <span>{line.text}</span>
        </div>
      )}
      {extras.length > 0 && (
        <div className="mx-4 sm:mx-5 mt-2 rounded-xl px-3 py-2 text-[12.5px] leading-relaxed flex gap-2 items-start bg-[#F1EDF7] text-[#3F3A50]" data-testid="investment-extra">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{extras.map((r) => `You hold ${r.held_qty + r.extra_qty} ${r.symbol}, this portfolio needs ${r.target_qty}. The extra ${r.extra_qty} are yours and are not counted here.`).join(' ')}</span>
        </div>
      )}
      {open && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-[13px] min-w-[560px]">
            <thead><tr className="text-[11px] uppercase tracking-wider text-[#667085]"><th className="text-left font-semibold px-4 sm:px-5 py-2">Stock</th><th className="text-right font-semibold px-2 py-2">Target</th><th className="text-right font-semibold px-2 py-2">Held</th><th className="text-right font-semibold px-2 py-2">Actual</th><th className="text-right font-semibold px-2 py-2">Value</th><th className="text-right font-semibold px-4 sm:px-5 py-2">Status</th></tr></thead>
            <tbody>
              {inv.rows.map((r) => { const [c, t] = ST[r.status] || ST.missing; return (
                <tr key={r.symbol} className="border-t border-[#F5F2FA]">
                  <td className="px-4 sm:px-5 py-2.5"><div className="font-semibold text-[#0F1729]">{r.symbol}</div>{r.name ? <div className="text-[11.5px] text-[#667085]">{r.name}</div> : null}</td>
                  <td className="px-2 py-2.5 text-right num">{Math.round(r.weight_target)}%</td>
                  <td className="px-2 py-2.5 text-right num">{r.held_qty}{r.held_qty < r.target_qty ? <span className="text-[#667085] text-[11px]"> / {r.target_qty}</span> : ''}{r.pending_qty ? <div className="text-[11px] text-[#1D4ED8]">{r.pending_qty} ordered</div> : null}</td>
                  <td className="px-2 py-2.5 text-right num">{r.weight_actual ? `${r.weight_actual.toFixed(1)}%` : '0%'}</td>
                  <td className="px-2 py-2.5 text-right num">{r.value ? INR(r.value) : '—'}</td>
                  <td className="px-4 sm:px-5 py-2.5 text-right whitespace-nowrap"><span className={`text-[11px] font-bold rounded-md px-2 py-0.5 ${c}`}>{t}</span></td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 px-4 sm:px-5 py-3 border-t border-[#F1EDF7] text-[12px] text-[#667085]">
        <span>{inv.stale ? (inv.checked_at ? `Last matched with your broker at ${clock(inv.checked_at)} IST on ${day(inv.checked_at)}.` : 'Not yet matched with your broker account.') : 'Held quantities come from your broker holdings and today\'s positions.'}</span>
        <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
          <button type="button" onClick={() => setOpen((v) => !v)} className="btn-outline h-9 px-3 text-[13px]">{open ? <>Hide <ChevronUp className="h-3.5 w-3.5" /></> : <>Stocks <ChevronDown className="h-3.5 w-3.5" /></>}</button>
          <Link to={`/orders?portfolio=${inv.portfolio_id}`} className="btn-outline h-9 px-3 text-[13px]">Orders</Link>
          {canExit && <button type="button" onClick={() => onExit(inv)} className="btn-outline h-9 px-3 text-[13px]" data-testid="investment-exit"><LogOut className="h-3.5 w-3.5" /> Exit</button>}
          {inv.health === 'exited_outside' && <button type="button" onClick={() => onMarkExited(inv)} className="btn-outline h-9 px-3 text-[13px]" data-testid="investment-mark-exited"><Undo2 className="h-3.5 w-3.5" /> Mark as exited</button>}
          {canFix && <button type="button" onClick={() => onFix(inv)} className="btn-primary h-9 px-3.5 text-[13px]" data-testid="investment-fix"><Wrench className="h-3.5 w-3.5" /> {inv.health === 'exited_outside' ? `Buy back · ${inv.rows.filter((r) => r.missing_qty > 0).length}` : `Fix portfolio · buy ${inv.rows.filter((r) => r.missing_qty > 0).length}`}</button>}
        </div>
      </div>
    </section>
  );
}

function Tile({ label, value, sub, tone }) {
  return <div className="surface p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#667085]">{label}</div><div className={`font-heading text-[20px] sm:text-[22px] font-extrabold mt-1 num ${tone || 'text-[#0F1729]'}`}>{value}</div><div className="text-[12px] text-[#667085] mt-0.5">{sub}</div></div>;
}

/** Your investments: what the account actually holds, per portfolio, matched against the target on every visit. */
export default function InvestmentsPage() {
  const { token, isAuthed, loading: authLoading, user, openAuth } = useAuth();
  const { connections, kiteExpired, connectKite, refreshKite, getKiteMargins } = useBroker();
  const navigate = useNavigate();
  const kite = connections.kite;
  const h = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const [data, setData] = useState(null);
  const [checking, setChecking] = useState(false);
  const [balance, setBalance] = useState(null);
  const [action, setAction] = useState(null);   // { kind: 'fix'|'exit', inv }
  const [showExited, setShowExited] = useState(false);
  const firstLoad = useRef(true);

  useEffect(() => { if (!authLoading && user?.role === 'analyst') navigate('/partner', { replace: true }); }, [authLoading, user, navigate]);
  useEffect(() => { if (!authLoading && !isAuthed) openAuth?.({ next: '/investments' }); }, [authLoading, isAuthed, openAuth]);

  const load = async (announce = false) => {
    if (announce) setChecking(true);
    try {
      const { data: d } = await axios.get(`${API}/investments`, h);
      setData(d);
      if (announce) { if (d.live) toast.success('Matched with your broker holdings'); else toast.warning('Your broker is not connected, so this is the last known state. Connect again to check.'); }
    } catch (e) { setData({ investments: [], live: false }); if (announce) toast.error('Could not reach your broker. Try again in a moment.'); }
    finally { if (announce) setChecking(false); }
  };
  const markExited = async (inv) => {
    if (!window.confirm(`Mark ${inv.portfolio?.name} as exited? It moves to Exited and nothing is bought or sold.`)) return;
    try { await axios.post(`${API}/investments/${inv.portfolio_id}/mark-exited`, {}, h); toast.success(`${inv.portfolio?.name} marked as exited`); load(); }
    catch (e) { toast.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || 'Could not mark as exited'); }
  };
  const loadBalance = async () => { try { const m = await getKiteMargins(); const eq = m?.equity || {}; setBalance(Number(eq?.available?.live_balance ?? eq?.net ?? 0)); } catch { setBalance(null); } };

  useEffect(() => {
    if (!isAuthed) return;
    load(); if (kite) loadBalance(); else setBalance(null);
    firstLoad.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, kite?.connected_at]);
  useEffect(() => {
    if (!isAuthed || !kite) return undefined;
    const ask = () => { if (document.visibilityState === 'visible' && !checking && !action) load(false); };
    const id = setInterval(ask, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, kite?.connected_at, checking, action]);
  useEffect(() => {
    const onMsg = (ev) => { if (ev.data?.source === 'basketly-kite-callback' && ev.data.status === 'success') { refreshKite?.(); } };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = data?.investments || [];
  const RANK = { incomplete: 0, exited_outside: 0, unchecked: 1, in_progress: 2, complete: 3 };
  const active = items.filter((i) => !['exited', 'empty'].includes(i.health)).sort((a, b) => (RANK[a.health] ?? 3) - (RANK[b.health] ?? 3) || String(b.first_invested_at || '').localeCompare(String(a.first_invested_at || '')));
  const exited = items.filter((i) => ['exited', 'empty'].includes(i.health));
  const totals = useMemo(() => active.reduce((t, i) => ({ invested: t.invested + (i.invested || 0), current: t.current + (i.current || 0), fix: t.fix + (['incomplete', 'exited_outside'].includes(i.health) ? 1 : 0), ok: t.ok + (i.health === 'complete' ? 1 : 0), wip: t.wip + (i.health === 'in_progress' ? 1 : 0) }), { invested: 0, current: 0, fix: 0, ok: 0, wip: 0 }), [active]);
  const ret = totals.current - totals.invested;
  const since = active.map((i) => i.first_invested_at).filter(Boolean).sort()[0];
  const checkedAt = items.map((i) => i.checked_at).filter(Boolean).sort().slice(-1)[0];

  if (authLoading) return <div className="container-x py-24 text-center text-[#526071]">Loading your investments…</div>;
  if (!isAuthed) return (
    <div className="container-x py-24 text-center"><h1 className="text-2xl font-bold">Please log in</h1><p className="mt-2 text-[#526071]">You need an account to see your investments.</p><button onClick={() => openAuth({ next: '/investments' })} className="btn-primary mt-6 inline-flex">Get started</button></div>
  );

  return (
    <div className="bg-[#F7F4FB] min-h-screen">
      <div className="container-x py-8 sm:py-10">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-heading text-[26px] sm:text-4xl font-bold text-[#0F1729] flex items-center gap-2"><TrendingUp className="h-6 w-6 text-[#6C2BD9]" /> Your investments</h1>
            <p className="text-[14px] text-[#526071] mt-1">What you hold through Omnivest, checked against your broker account.</p>
          </div>
          <div className="text-right">
            {kite && <button type="button" onClick={() => load(true)} disabled={checking} className="btn-outline h-10 disabled:opacity-60" data-testid="investments-check">{checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check holdings</button>}
            <div className={`text-[11px] mt-1 ${data?.live ? 'text-[#667085]' : 'text-[#9A4A05]'}`}>{data?.live ? `Matched with your broker at ${clock(checkedAt)} IST · ${kite?.profile?.user_name || ''} (${data.kite_user || kite?.profile?.user_id_kite || ''})` : checkedAt ? `Last matched ${day(checkedAt)}, ${clock(checkedAt)} IST · broker not connected` : ''}</div>
          </div>
        </div>

        {!kite && active.length > 0 && (
          <div className="mt-4 rounded-xl bg-[#FFFBEB] border border-[#F1D48A] px-4 py-3 text-[13px] text-[#9A4A05] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4" data-testid="investments-broker-banner">
            <span className="flex-1">{kiteExpired ? 'Your broker login expired for today. Connect again to match holdings, fix a portfolio or exit.' : 'Connect your broker to match these against what your account actually holds.'}</span>
            {kiteExpired
              ? <button type="button" onClick={() => connectKite()} className="btn-primary h-10 shrink-0" data-testid="investments-connect">Connect again</button>
              : <Link to="/brokers/connect" className="btn-primary h-10 shrink-0" data-testid="investments-connect">Connect your broker</Link>}
          </div>
        )}

        {!user?.name && (
          <div className="mt-4 surface p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="investments-profile-nudge">
            <div className="flex-1"><div className="font-semibold text-[#0F1729]">Complete your profile</div><div className="text-[12.5px] text-[#526071]">Add your name and email so your orders and receipts carry them.</div></div>
            <Link to="/account" className="btn-primary h-10 shrink-0">Add your details</Link>
          </div>
        )}
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="investments-tiles">
          <Tile label="Current value" value={INR(totals.current)} sub={`${active.length} portfolio${active.length === 1 ? '' : 's'}${data?.live ? ' · live prices' : ''}`} />
          <Tile label="Invested" value={INR(totals.invested)} sub="cost of shares held" />
          <Tile label="Returns" value={`${ret >= 0 ? '+' : '−'}${INR(Math.abs(ret))}${totals.invested ? ` · ${(Math.abs(ret) * 100 / totals.invested).toFixed(1)}%` : ''}`} sub={since ? `since ${day(since)}` : ''} tone={ret >= 0 ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'} />
          <Tile label="Portfolio health" value={totals.fix ? `${totals.fix} need${totals.fix > 1 ? '' : 's'} a fix` : totals.wip ? `${totals.wip} in progress` : active.length ? 'All complete' : '—'} sub={[totals.ok ? `${totals.ok} complete` : '', totals.wip ? `${totals.wip} orders placed` : '', totals.fix ? `${totals.fix} incomplete` : ''].filter(Boolean).join(' · ') || 'nothing invested yet'} tone={totals.fix ? 'text-[#9A4A05]' : totals.wip ? 'text-[#1D4ED8]' : ''} />
        </div>

        <div className="mt-5 grid lg:grid-cols-[1fr_300px] gap-5 items-start">
          <div className="space-y-4 min-w-0">
            {data === null && <div className="surface p-6 text-[#667085] text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading your investments…</div>}
            {data && active.length === 0 && (
              <div className="surface p-6 sm:p-8" data-testid="investments-empty">
                <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                  <div className="h-16 w-16 rounded-2xl grad-card text-white grid place-items-center shrink-0"><TrendingUp className="h-8 w-8" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-heading font-bold text-[18px] text-[#0F1729]">{!kite && !kiteExpired ? 'Connect your broker to start' : kiteExpired ? 'Your broker login expired for today' : items.length ? 'Nothing invested right now' : 'No investments yet'}</div>
                    <p className="text-[13px] text-[#526071] mt-1 leading-relaxed">{!kite && !kiteExpired
                      ? 'Orders go to your own broker account; Omnivest never holds your money. Connect once, then invest in any model portfolio.'
                      : kiteExpired ? 'Your broker ends every login daily. Connect again to invest, match holdings or exit.'
                      : items.length ? 'Your exited portfolios are kept below. Pick a model portfolio to invest again.' : 'Pick a model portfolio and tap Invest now. What you hold shows up here, checked against your broker account.'}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap sm:flex-col sm:items-stretch shrink-0">
                    {!kite && !kiteExpired && <Link to="/brokers/connect" className="btn-primary h-11" data-testid="investments-connect"><Link2 className="h-4 w-4" /> Connect your broker</Link>}
                    {kiteExpired && <button type="button" onClick={() => connectKite()} className="btn-primary h-11" data-testid="investments-connect"><Link2 className="h-4 w-4" /> Connect again</button>}
                    <Link to="/model-portfolios" className={`${kite ? 'btn-primary' : 'btn-outline'} h-11`}>Browse portfolios</Link>
                  </div>
                </div>
              </div>
            )}
            {active.map((inv, i) => <Card key={inv.portfolio_id} inv={inv} balance={balance} market={data?.market} onFix={(x) => setAction({ kind: 'fix', inv: x })} onExit={(x) => setAction({ kind: 'exit', inv: x })} onMarkExited={markExited} open0={i === 0 || inv.health === 'incomplete'} />)}
            {exited.length > 0 && (
              <div data-testid="investments-exited">
                <button type="button" onClick={() => setShowExited((v) => !v)} className="inline-flex items-center gap-2 h-10 text-[13px] font-semibold text-[#526071]" aria-expanded={showExited}><Archive className="h-4 w-4" /> Exited · {exited.length} portfolio{exited.length > 1 ? 's' : ''} {showExited ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>
                {showExited && <div className="space-y-4 mt-2">{exited.map((inv) => <Card key={inv.portfolio_id} inv={inv} balance={balance} market={data?.market} onFix={() => {}} onExit={() => {}} onMarkExited={() => {}} open0={false} />)}</div>}
              </div>
            )}
          </div>
          <aside className="space-y-4">
            {(kite || kiteExpired) && (
              <div className={`surface p-4 ${kite ? '' : 'border-[#F1D48A] bg-[#FFFBEB]'}`} data-testid="dash-broker-card">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#FF9F0A] to-[#F04438] text-white grid place-items-center font-bold">Z</div>
                  <div className="min-w-0">
                    <div className={`flex items-center gap-2 font-semibold text-[14px] ${kite ? '' : 'text-[#9A4A05]'}`}>{kite ? <><CheckCircle2 className="h-4 w-4 text-[#0B7F4A]" /> Zerodha connected</> : 'Zerodha · login expired'}</div>
                    <div className="text-[12px] text-[#6B6480] truncate">{(kite || kiteExpired).profile?.user_name} · {(kite || kiteExpired).profile?.user_id_kite}</div>
                  </div>
                </div>
                {kite && <div className="mt-3 rounded-xl bg-[#F7F4FB] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B6480] font-semibold">Available to invest</div><div className="num mt-0.5 font-bold text-[16px]">{balance == null ? '—' : INR(balance)}</div></div>}
                <div className="mt-3 flex gap-2"><Link to="/orders" className="btn-outline h-9 px-3 text-[13px] flex-1">Orders</Link><Link to="/brokers/connect" className="btn-outline h-9 px-3 text-[13px] flex-1">Manage</Link></div>
              </div>
            )}
            <HowItWorks kind="investments" />
          </aside>
        </div>
      </div>
      {action && <ActionModal kind={action.kind} inv={action.inv} token={token} onClose={() => setAction(null)} onDone={() => { setAction(null); load(); loadBalance(); }} />}
    </div>
  );
}

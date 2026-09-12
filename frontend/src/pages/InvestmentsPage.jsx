import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { TrendingUp, RefreshCw, Loader2, Link2, CheckCircle2, AlertTriangle, Wrench, LogOut, ChevronDown, ChevronUp, Archive, ExternalLink, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBroker } from '../context/BrokerContext';
import CoverArt from '../components/CoverArt';
import MySubscriptions from '../components/MySubscriptions';
import ActionModal from '../components/ActionModal';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const IST = 'Asia/Kolkata';
const clock = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: IST }) : '');
const day = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST }) : '');
const PILL = { complete: ['bg-[#E3F4EB] text-[#096B3E]', 'Complete'], incomplete: ['bg-[#FBE4E4] text-[#B91C1C]', 'Incomplete'], exited: ['bg-[#EEEAF4] text-[#526071]', 'Exited'], exited_outside: ['bg-[#EEEAF4] text-[#526071]', 'Sold outside Omnivest'], unchecked: ['bg-[#FEF3C7] text-[#9A4A05]', 'Not checked yet'], empty: ['bg-[#EEEAF4] text-[#526071]', 'Nothing placed'] };
const ST = { held: ['bg-[#E3F4EB] text-[#096B3E]', 'Held'], partial: ['bg-[#FEF3C7] text-[#9A4A05]', 'Partial'], missing: ['bg-[#FBE4E4] text-[#B91C1C]', 'Missing'], sold: ['bg-[#EEEAF4] text-[#526071]', 'Sold outside'] };

/** The one actionable sentence per card, from data we already have (Tushar: "this is how a great product guy thinks"). */
function smartLine(inv, balance) {
  const miss = inv.rows.filter((r) => r.missing_qty > 0);
  if (inv.health === 'incomplete' && miss.length) {
    const cost = miss.reduce((s, r) => s + r.missing_qty * r.ltp, 0) * 1.005;
    const need = Math.ceil(cost * 1.02);
    const short = balance == null ? null : Math.max(0, Math.ceil((need - balance) / 10) * 10);
    const sold = miss.filter((r) => r.status === 'sold');
    return { tone: 'warn', text: <>
      <b>{miss.length} stock{miss.length > 1 ? 's are' : ' is'} {sold.length === miss.length ? 'no longer held' : 'missing'}: {miss.map((r) => r.symbol).join(', ')}.</b>{' '}
      {sold.length ? 'They were sold outside Omnivest. ' : ''}Buying {miss.length > 1 ? 'them' : 'it'} today needs about <b>{INR(need)}</b> and brings every stock back to its target weight.
      {short != null && short > 0 ? <> Your Zerodha balance is {INR(balance)}, so add <b>{INR(short)}</b> first.</> : short === 0 ? ' Your Zerodha balance covers it.' : ''}
    </> };
  }
  if (inv.health === 'complete') {
    const dev = inv.worst_deviation_pp;
    return { tone: 'ok', text: <>Every stock is held{dev != null ? <>, all within <b>{dev.toFixed(1)}%</b> of target weight</> : ''}. Adding more keeps the same mix; open the portfolio and tap Invest now.</> };
  }
  if (inv.health === 'exited') return { tone: 'mute', text: <>You exited this portfolio on {day(inv.exited_at)}. The sell orders are in your Orders page.</> };
  if (inv.health === 'exited_outside') return { tone: 'mute', text: <>Everything this portfolio bought has since been sold in Kite. Mark it as exited, or invest again from the portfolio page.</> };
  if (inv.health === 'unchecked') return { tone: 'warn', text: <>Connect Zerodha and we will match these {inv.total_count} stocks against what your account actually holds.</> };
  return null;
}

function Card({ inv, balance, onFix, onExit, open0 }) {
  const [open, setOpen] = useState(open0);
  const [p, ptext] = PILL[inv.health] || PILL.unchecked;
  const line = smartLine(inv, balance);
  const pillText = inv.health === 'incomplete' ? `${ptext} · ${inv.held_count} of ${inv.total_count} held` : ptext;
  const canFix = inv.health === 'incomplete' && !inv.stale;
  const canExit = ['complete', 'incomplete'].includes(inv.health) && !inv.stale && inv.rows.some((r) => r.held_qty > 0);
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
        <div className={`mx-4 sm:mx-5 mt-3 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed flex gap-2 items-start ${line.tone === 'warn' ? 'bg-[#FEF3C7] text-[#9A4A05]' : line.tone === 'ok' ? 'bg-[#EEF7F1] text-[#0F5132]' : 'bg-[#F1EDF7] text-[#3F3A50]'}`} data-testid="investment-smart">
          {line.tone === 'warn' ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> : line.tone === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <Info className="h-4 w-4 shrink-0 mt-0.5" />}
          <span>{line.text}</span>
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
                  <td className="px-2 py-2.5 text-right num">{r.held_qty}{r.held_qty < r.target_qty ? <span className="text-[#667085] text-[11px]"> / {r.target_qty}</span> : ''}</td>
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
        <span>{inv.stale ? (inv.checked_at ? `Last matched with Zerodha at ${clock(inv.checked_at)} IST on ${day(inv.checked_at)}.` : 'Not yet matched with your Zerodha account.') : 'Held quantities come from your Zerodha holdings and today\'s positions.'}</span>
        <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
          <button type="button" onClick={() => setOpen((v) => !v)} className="btn-outline h-9 px-3 text-[13px]">{open ? <>Hide <ChevronUp className="h-3.5 w-3.5" /></> : <>Stocks <ChevronDown className="h-3.5 w-3.5" /></>}</button>
          <Link to={`/orders?portfolio=${inv.portfolio_id}`} className="btn-outline h-9 px-3 text-[13px]">Orders</Link>
          {canExit && <button type="button" onClick={() => onExit(inv)} className="btn-outline h-9 px-3 text-[13px]" data-testid="investment-exit"><LogOut className="h-3.5 w-3.5" /> Exit</button>}
          {canFix && <button type="button" onClick={() => onFix(inv)} className="btn-primary h-9 px-3.5 text-[13px]" data-testid="investment-fix"><Wrench className="h-3.5 w-3.5" /> Fix portfolio · buy {inv.rows.filter((r) => r.missing_qty > 0).length}</button>}
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
      if (announce) { if (d.live) toast.success('Matched with your Zerodha holdings'); else toast.warning('Zerodha is not connected, so this is the last known state. Connect Zerodha to check again.'); }
    } catch (e) { setData({ investments: [], live: false }); if (announce) toast.error('Could not check with Zerodha. Try again in a moment.'); }
    finally { if (announce) setChecking(false); }
  };
  const loadBalance = async () => { try { const m = await getKiteMargins(); const eq = m?.equity || {}; setBalance(Number(eq?.available?.live_balance ?? eq?.net ?? 0)); } catch { setBalance(null); } };

  useEffect(() => {
    if (!isAuthed) return;
    load(); if (kite) loadBalance(); else setBalance(null);
    firstLoad.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, kite?.connected_at]);
  useEffect(() => {
    const onMsg = (ev) => { if (ev.data?.source === 'basketly-kite-callback' && ev.data.status === 'success') { refreshKite?.(); } };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = data?.investments || [];
  const RANK = { incomplete: 0, unchecked: 1, complete: 2 };
  const active = items.filter((i) => !['exited', 'exited_outside', 'empty'].includes(i.health)).sort((a, b) => (RANK[a.health] ?? 3) - (RANK[b.health] ?? 3) || String(b.first_invested_at || '').localeCompare(String(a.first_invested_at || '')));
  const exited = items.filter((i) => ['exited', 'exited_outside', 'empty'].includes(i.health));
  const totals = useMemo(() => active.reduce((t, i) => ({ invested: t.invested + (i.invested || 0), current: t.current + (i.current || 0), fix: t.fix + (i.health === 'incomplete' ? 1 : 0), ok: t.ok + (i.health === 'complete' ? 1 : 0) }), { invested: 0, current: 0, fix: 0, ok: 0 }), [active]);
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
            <p className="text-[14px] text-[#526071] mt-1">What you hold through Omnivest, checked against your Zerodha account.</p>
          </div>
          <div className="text-right">
            {kite
              ? <button type="button" onClick={() => load(true)} disabled={checking} className="btn-outline h-10 disabled:opacity-60" data-testid="investments-check">{checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check with Zerodha</button>
              : <button type="button" onClick={() => connectKite()} className="btn-primary h-10" data-testid="investments-connect"><Link2 className="h-4 w-4" /> {kiteExpired ? 'Connect Zerodha again' : 'Connect Zerodha'}</button>}
            <div className={`text-[11px] mt-1 ${data?.live ? 'text-[#667085]' : 'text-[#9A4A05]'}`}>{data?.live ? `Matched with Zerodha at ${clock(checkedAt)} IST · ${kite?.profile?.user_name || ''} (${data.kite_user || kite?.profile?.user_id_kite || ''})` : checkedAt ? `Last matched ${day(checkedAt)}, ${clock(checkedAt)} IST · Zerodha not connected` : items.length ? 'Not yet matched with Zerodha' : ''}</div>
          </div>
        </div>

        {!kite && items.length > 0 && (
          <div className="mt-4 rounded-xl bg-[#FFFBEB] border border-[#F1D48A] px-4 py-3 text-[13px] text-[#9A4A05] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4" data-testid="investments-broker-banner">
            <span className="flex-1">{kiteExpired ? 'Your Zerodha login expired for today. Connect again to match holdings, fix a portfolio or exit.' : 'Connect Zerodha to match these against what your account actually holds.'}</span>
            <button type="button" onClick={() => connectKite()} className="btn-primary h-10 shrink-0">{kiteExpired ? 'Connect Zerodha again' : 'Connect Zerodha'}</button>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="investments-tiles">
          <Tile label="Current value" value={INR(totals.current)} sub={`${active.length} portfolio${active.length === 1 ? '' : 's'}${data?.live ? ' · live prices' : ''}`} />
          <Tile label="Invested" value={INR(totals.invested)} sub="cost of shares held" />
          <Tile label="Returns" value={`${ret >= 0 ? '+' : '−'}${INR(Math.abs(ret))}${totals.invested ? ` · ${(Math.abs(ret) * 100 / totals.invested).toFixed(1)}%` : ''}`} sub={since ? `since ${day(since)}` : ''} tone={ret >= 0 ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'} />
          <Tile label="Portfolio health" value={totals.fix ? `${totals.fix} need${totals.fix > 1 ? '' : 's'} a fix` : active.length ? 'All complete' : '—'} sub={`${totals.ok} complete${totals.fix ? ` · ${totals.fix} incomplete` : ''}`} tone={totals.fix ? 'text-[#9A4A05]' : ''} />
        </div>

        <div className="mt-5 grid lg:grid-cols-[1fr_300px] gap-5 items-start">
          <div className="space-y-4 min-w-0">
            {data === null && <div className="surface p-6 text-[#667085] text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading your investments…</div>}
            {data && items.length === 0 && (
              <div className="surface p-8 text-center">
                <div className="font-semibold text-[#0F1729]">No investments yet</div>
                <p className="text-[13px] text-[#526071] mt-1">Open a model portfolio and tap Invest now. Orders go to your own Zerodha account, and what you hold shows up here.</p>
                <Link to="/model-portfolios" className="btn-primary mt-4 inline-flex">Browse portfolios</Link>
              </div>
            )}
            {active.map((inv, i) => <Card key={inv.portfolio_id} inv={inv} balance={balance} onFix={(x) => setAction({ kind: 'fix', inv: x })} onExit={(x) => setAction({ kind: 'exit', inv: x })} open0={i === 0 || inv.health === 'incomplete'} />)}
            {exited.length > 0 && (
              <div data-testid="investments-exited">
                <button type="button" onClick={() => setShowExited((v) => !v)} className="inline-flex items-center gap-2 h-10 text-[13px] font-semibold text-[#526071]" aria-expanded={showExited}><Archive className="h-4 w-4" /> Exited · {exited.length} portfolio{exited.length > 1 ? 's' : ''} {showExited ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>
                {showExited && <div className="space-y-4 mt-2">{exited.map((inv) => <Card key={inv.portfolio_id} inv={inv} balance={balance} onFix={() => {}} onExit={() => {}} open0={false} />)}</div>}
              </div>
            )}
            <MySubscriptions token={token} />
          </div>
          <aside className="space-y-4">
            {kite ? (
              <div className="surface p-4" data-testid="dash-broker-card">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#FF9F0A] to-[#F04438] text-white grid place-items-center font-bold">Z</div>
                  <div className="min-w-0"><div className="flex items-center gap-2 font-semibold text-[14px]"><CheckCircle2 className="h-4 w-4 text-[#0B7F4A]" /> Zerodha connected</div><div className="text-[12px] text-[#6B6480] truncate">{kite.profile?.user_name} · Kite ID {kite.profile?.user_id_kite}</div></div>
                </div>
                <div className="mt-3 rounded-xl bg-[#F7F4FB] p-3"><div className="text-[11px] uppercase tracking-wider text-[#6B6480] font-semibold">Available in Zerodha</div><div className="num mt-0.5 font-bold text-[16px]">{balance == null ? '—' : INR(balance)}</div></div>
                <div className="mt-3 flex gap-2"><Link to="/orders" className="btn-outline h-9 px-3 text-[13px] flex-1">Orders</Link><Link to="/brokers/connect" className="btn-outline h-9 px-3 text-[13px] flex-1">Manage</Link></div>
              </div>
            ) : kiteExpired ? (
              <div className="surface p-4 border-[#F1D48A] bg-[#FFFBEB]" data-testid="dash-broker-expired">
                <div className="font-semibold text-[#9A4A05] text-[14px]">Zerodha login expired for today</div>
                <div className="text-[12px] text-[#6B6480] mt-1">{kiteExpired.profile?.user_name} (Kite ID {kiteExpired.profile?.user_id_kite}). Zerodha ends every login at about 6 AM.</div>
                <button type="button" onClick={() => connectKite()} className="btn-primary h-10 mt-3 w-full" data-testid="dash-broker-reconnect"><Link2 className="h-4 w-4" /> Connect Zerodha again</button>
              </div>
            ) : (
              <Link to="/brokers/connect" className="rounded-2xl grad-band text-white p-4 flex items-center justify-between gap-3 hover:brightness-110 transition-all block">
                <div><div className="font-semibold">Connect your broker</div><div className="text-[12.5px] text-white/85">Link Zerodha to invest and to match holdings.</div></div>
                <span className="inline-flex items-center gap-1 rounded-full bg-white text-[#6C2BD9] px-3 py-1.5 text-[13px] font-semibold shrink-0">Connect <ExternalLink className="h-3.5 w-3.5" /></span>
              </Link>
            )}
            <div className="surface p-5 text-[12.5px] text-[#526071] space-y-3">
              <div className="font-semibold text-[#0F1729] text-[15px]">How this works</div>
              <p><b className="text-[#0F1729]">How is this checked?</b><br />On every visit we read your Zerodha holdings and today's positions and compare them with each portfolio's target. Orders placed anywhere count; Omnivest never assumes.</p>
              <p><b className="text-[#0F1729]">What is Fix portfolio?</b><br />Only the difference: buy what is missing. You review the exact orders and funds before anything is placed.</p>
              <p><b className="text-[#0F1729]">Bought or sold something in Kite?</b><br />It shows here on the next check. A stock sold outside Omnivest is marked so; Fix buys it back.</p>
              <p><b className="text-[#0F1729]">Exit</b><br />Sells everything this portfolio holds, with review first. The portfolio moves to Exited.</p>
              <p><b className="text-[#0F1729]">Still stuck?</b> <Link to="/faq" className="text-[#5320A8] font-semibold">Read the FAQ</Link> or <Link to="/contact" className="text-[#5320A8] font-semibold">contact us</Link>.</p>
            </div>
          </aside>
        </div>
      </div>
      {action && <ActionModal kind={action.kind} inv={action.inv} token={token} onClose={() => setAction(null)} onDone={() => { setAction(null); load(); loadBalance(); }} />}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ClipboardList, RefreshCw, Loader2, Wrench, ChevronDown, ChevronUp, Moon, Sun, AlertTriangle, Ban } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const INR2 = (n) => (n ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const IST = 'Asia/Kolkata';
const when = (iso) => (iso ? `${new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: IST })} IST` : '');
const short = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: IST }) : '');
const TONE = { COMPLETE: 'bg-[#E3F4EB] text-[#096B3E]', OPEN: 'bg-[#EFF6FF] text-[#1D4ED8]', REJECTED: 'bg-[#FBE4E4] text-[#B91C1C]', CANCELLED: 'bg-[#FBE4E4] text-[#B91C1C]' };
const label = (o) => { const s = (o.status || '').toUpperCase(); if (!o.order_id) return 'Rejected'; if (s === 'COMPLETE') return 'Filled'; if (s === 'REJECTED') return 'Rejected'; if (s === 'CANCELLED') return 'Cancelled'; if (s.includes('AMO')) return 'After-market'; return 'Open'; };
const tone = (o) => (!o.order_id ? TONE.REJECTED : TONE[(o.status || '').toUpperCase()] || TONE.OPEN);

/** Zerodha's raw rejection text -> one plain sentence an investor can act on. The raw text stays under "Why?". */
function plainCause(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('not allowed to place orders') || m.includes('ip (')) return "Omnivest's server was not recognised by Zerodha at that moment. Nothing was placed or charged; Repair places the orders again.";
  if (m.includes('insufficient') || m.includes('margin') || m.includes('funds')) return 'Your Zerodha account did not have enough funds for these orders. Add funds in Kite, then Repair.';
  if (m.includes('token') || m.includes('session')) return 'Your Zerodha login had expired. Connect Zerodha again, then Repair.';
  if (m.includes('circuit') || m.includes('price')) return "The limit price was outside the exchange's allowed band. Repair places fresh orders at today's price.";
  return msg || 'Zerodha did not accept these orders. Repair places them again.';
}

function Batch({ b, onRepair, onCancel, busy, openDefault }) {
  const [open, setOpen] = useState(openDefault);
  const [why, setWhy] = useState(null);
  const c = b.counts || {};
  const value = b.orders.reduce((s, o) => s + (o.filled_qty && o.avg_price ? o.filled_qty * o.avg_price : 0), 0);
  const rejected = b.orders.filter((o) => !o.order_id || ['REJECTED', 'CANCELLED'].includes((o.status || '').toUpperCase()));
  const reasons = [...new Set(rejected.map((o) => plainCause(o.message)))];
  const pill = c.rejected ? { cls: TONE.REJECTED, text: `${c.placed} of ${c.total} placed` } : c.complete === c.total ? { cls: TONE.COMPLETE, text: 'All filled' } : { cls: TONE.OPEN, text: b.mode === 'amo' && !c.complete ? `${c.placed} of ${c.total} placed · after-market` : `${c.complete} of ${c.total} filled` };
  return (
    <section className="surface overflow-hidden" data-testid="order-batch">
      <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4">
        <div className="min-w-0">
          <div className="font-semibold text-[#0F1729] text-[15px] sm:text-[16px] truncate">{b.portfolio_name}</div>
          <div className="text-[12px] text-[#667085] mt-0.5">Invest · {when(b.placed_at)}{b.mode === 'amo' ? ' · after-market' : ''}</div>
        </div>
        <span className={`shrink-0 text-[11px] font-bold rounded-full px-2.5 py-1 ${pill.cls}`}>{pill.text}</span>
      </div>
      {open ? (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 sm:px-5 py-2.5 bg-[#F7F4FB] text-[12.5px] text-[#526071]">
            <span>Amount <b className="text-[#0F1729] num">{INR(b.amount_adjusted)}</b></span>
            <span>Orders <b className="text-[#0F1729]">{c.total} · limit · delivery</b></span>
            <span>Filled <b className="text-[#0F1729] num">{c.complete} of {c.total}</b></span>
            <span>Buy value <b className="text-[#0F1729] num">{INR(value)}</b></span>
          </div>
          {reasons.length > 0 && (
            <div className="mx-4 sm:mx-5 mt-3 rounded-xl bg-[#FEF3C7] text-[#9A4A05] px-3 py-2.5 text-[12.5px] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3" data-testid="order-cause">
              <AlertTriangle className="h-4 w-4 shrink-0 hidden sm:block" />
              <span className="flex-1"><b>{rejected.length === c.total ? `All ${c.total} orders were refused by Zerodha:` : `${rejected.length} order${rejected.length > 1 ? 's were' : ' was'} refused by Zerodha:`}</b> {reasons.join(' ')}</span>
              <button type="button" onClick={() => onRepair(b.id)} disabled={busy} className="shrink-0 h-10 px-3 rounded-lg bg-white border border-[#F1D48A] font-bold text-[#9A4A05] disabled:opacity-60" data-testid="order-repair-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin inline" /> : <Wrench className="h-4 w-4 inline mr-1" />} Repair {rejected.length} order{rejected.length > 1 ? 's' : ''}</button>
            </div>
          )}
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-[13px] min-w-[560px]">
              <thead><tr className="text-[11px] uppercase tracking-wider text-[#667085]"><th className="text-left font-semibold px-4 sm:px-5 py-2">Stock</th><th className="text-right font-semibold px-2 py-2">Weight</th><th className="text-right font-semibold px-2 py-2">Qty</th><th className="text-right font-semibold px-2 py-2">Limit ₹</th><th className="text-right font-semibold px-2 py-2">Filled</th><th className="text-right font-semibold px-2 py-2">Avg ₹</th><th className="text-right font-semibold px-4 sm:px-5 py-2">Status</th></tr></thead>
              <tbody>
                {b.orders.map((o) => (
                  <React.Fragment key={o.symbol}>
                    <tr className="border-t border-[#F5F2FA]">
                      <td className="px-4 sm:px-5 py-2.5"><div className="font-semibold text-[#0F1729]">{o.symbol}</div>{o.name ? <div className="text-[11.5px] text-[#667085]">{o.name}</div> : null}</td>
                      <td className="px-2 py-2.5 text-right num">{o.weight_target != null ? `${Math.round(o.weight_target)}%` : '—'}</td>
                      <td className="px-2 py-2.5 text-right num">{o.qty}</td>
                      <td className="px-2 py-2.5 text-right num">{INR2(o.limit_price)}</td>
                      <td className="px-2 py-2.5 text-right num">{o.filled_qty || 0} / {o.qty}</td>
                      <td className="px-2 py-2.5 text-right num">{INR2(o.avg_price)}</td>
                      <td className="px-4 sm:px-5 py-2.5 text-right whitespace-nowrap"><span className={`text-[11px] font-bold rounded-md px-2 py-0.5 ${tone(o)}`}>{label(o)}</span>{o.message && (!o.order_id || label(o) === 'Rejected') ? <button type="button" onClick={() => setWhy(why === o.symbol ? null : o.symbol)} className="ml-2 text-[12px] font-semibold text-[#5320A8]">Why?</button> : null}</td>
                    </tr>
                    {why === o.symbol && <tr className="bg-[#FBFAFD]"><td colSpan={7} className="px-4 sm:px-5 py-2 text-[12px] text-[#526071]"><b className="text-[#0F1729]">Zerodha said:</b> {o.message}</td></tr>}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-[#F1EDF7] text-[12px] text-[#667085]">
            <span>{value === 0 && b.mode === 'amo' && c.rejected === 0 ? 'Fills update at market open.' : 'Every order keeps Zerodha\'s reference and status.'}</span>
            <div className="flex items-center gap-3">
              {c.open > 0 && <button type="button" onClick={() => onCancel(b)} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-[#B91C1C] h-9 disabled:opacity-60" data-testid="order-cancel-btn"><Ban className="h-3.5 w-3.5" /> Cancel {c.open} open</button>}
              <button type="button" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 font-semibold text-[#5320A8] h-9">Hide <ChevronUp className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-[#F1EDF7] text-[12.5px] text-[#526071]">
          <span>{c.complete} of {c.total} filled · buy value <b className="text-[#0F1729] num">{INR(value)}</b>{c.rejected ? <span className="text-[#B91C1C]"> · {c.rejected} rejected</span> : ''}</span>
          <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 font-semibold text-[#5320A8] h-9">Details <ChevronDown className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </section>
  );
}

function Tile({ label: l, value, sub, tone: t }) {
  return <div className="surface p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#667085]">{l}</div><div className={`font-heading text-[20px] sm:text-[22px] font-extrabold mt-1 num ${t || 'text-[#0F1729]'}`}>{value}</div><div className="text-[12px] text-[#667085] mt-0.5">{sub}</div></div>;
}

/** Your orders: every batch placed through Omnivest, refreshed from Zerodha while the daily session is valid. */
export default function OrdersPage() {
  const { token, isAuthed, openAuth } = useAuth();
  const [params] = useSearchParams();
  const [batches, setBatches] = useState(null);
  const [market, setMarket] = useState(null);
  const [busy, setBusy] = useState(false);
  const h = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const load = async (announce = false) => {
    if (announce) setRefreshing(true);
    try {
      const [{ data }, m] = await Promise.all([axios.get(`${API}/invest/batches`, h), axios.get(`${API}/invest/market`).catch(() => ({ data: null }))]);
      setBatches(data.batches || []); setMarket(m.data); setRefreshedAt(new Date());
      if (announce) toast.success('Statuses updated from Zerodha');
    } catch { setBatches([]); if (announce) toast.error('Could not reach Zerodha. Try again in a moment.'); }
    finally { if (announce) setRefreshing(false); }
  };
  useEffect(() => {
    document.title = 'Your orders | Omnivest';
    if (!isAuthed) { openAuth?.({ next: '/orders' }); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  const cancelBatch = async (b) => {
    if (!window.confirm(`Cancel ${b.counts.open} open order${b.counts.open > 1 ? 's' : ''} for ${b.portfolio_name}? Already-filled orders are kept.`)) return;
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/invest/batches/${b.id}/cancel`, {}, h);
      if (data.cancelled) toast.success(`${data.cancelled} order${data.cancelled > 1 ? 's' : ''} cancelled in Zerodha${data.failed?.length ? `, ${data.failed.length} could not be` : ''}`);
      else toast('No open orders left in this batch');
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || 'Cancel failed'); }
    finally { setBusy(false); }
  };

  const repair = async (bid) => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/invest/batches/${bid}/repair`, {}, h);
      toast.success(data.repaired ? `${data.repaired} order${data.repaired > 1 ? 's' : ''} placed again` : 'Nothing to repair');
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || 'Repair failed'); }
    finally { setBusy(false); }
  };

  const totals = useMemo(() => {
    const t = { invested: 0, open: 0, attention: 0 };
    (batches || []).forEach((b) => { b.orders.forEach((o) => { if (o.filled_qty && o.avg_price) t.invested += o.filled_qty * o.avg_price; }); t.open += b.counts?.open || 0; t.attention += b.counts?.rejected || 0; });
    return t;
  }, [batches]);

  return (
    <div className="bg-[#F7F4FB] min-h-screen">
      <div className="container-x py-8 sm:py-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-[26px] sm:text-4xl font-bold text-[#0F1729] flex items-center gap-2"><ClipboardList className="h-6 w-6 text-[#6C2BD9]" /> Your orders</h1>
            <p className="text-[14px] text-[#526071] mt-1">Every order placed through Omnivest in your Zerodha account, with Zerodha's live status.</p>
          </div>
          <div className="shrink-0 text-right">
            <button type="button" onClick={() => load(true)} disabled={refreshing} className="btn-outline h-10 disabled:opacity-60" aria-label="Refresh statuses from Zerodha" data-testid="orders-refresh">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} <span className="hidden sm:inline">Refresh</span></button>
            {refreshedAt && <div className="text-[11px] text-[#667085] mt-1">Zerodha status as of {refreshedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: IST })} IST</div>}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="orders-tiles">
          <Tile label="Invested via Omnivest" value={INR(totals.invested)} sub="buy value of filled orders" />
          <Tile label="Open orders" value={totals.open} sub={market && !market.open ? 'execute at market open' : 'with Zerodha now'} />
          <Tile label="Needs attention" value={totals.attention} sub={totals.attention ? 'rejected · repair to place again' : 'nothing to fix'} tone={totals.attention ? 'text-[#B91C1C]' : ''} />
          <Tile label="Market" value={market ? (market.open ? 'Open' : market.mode === 'amo' ? 'Closed · AMO' : 'Closed') : '—'} sub={market ? (market.open ? 'orders execute now' : `opens ${short(market.next_open_ist)}`) : ''} />
        </div>

        <div className="mt-5 grid lg:grid-cols-[1fr_300px] gap-5 items-start">
          <div className="space-y-4 min-w-0">
            {batches === null && <div className="surface p-6 text-[#667085] text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading your orders…</div>}
            {batches && batches.length === 0 && (
              <div className="surface p-8 text-center">
                <div className="font-semibold text-[#0F1729]">No orders yet</div>
                <p className="text-[13px] text-[#526071] mt-1">Open a model portfolio and tap Invest now to place your first batch.</p>
                <Link to="/model-portfolios" className="btn-primary mt-4 inline-flex">Browse portfolios</Link>
              </div>
            )}
            {batches && batches.map((b, i) => <Batch key={b.id} b={b} onRepair={repair} onCancel={cancelBatch} busy={busy} openDefault={i === 0 || params.get('batch') === b.id} />)}
          </div>
          <aside className="space-y-4">
            {market && (
              <div className={`rounded-xl px-3 py-2.5 text-[12.5px] flex gap-2 items-start ${market.open ? 'bg-[#E3F4EB] text-[#096B3E]' : 'bg-[#FEF3C7] text-[#9A4A05]'}`}>{market.open ? <Sun className="h-4 w-4 shrink-0 mt-0.5" /> : <Moon className="h-4 w-4 shrink-0 mt-0.5" />}<span>{market.note}</span></div>
            )}
            <div className="surface p-5 text-[12.5px] text-[#526071] space-y-3">
              <div className="font-semibold text-[#0F1729] text-[15px]">Need help?</div>
              <p><b className="text-[#0F1729]">Why are some orders unfilled?</b><br />A limit order fills only if the stock trades at or below your limit. Gaps at open, circuit limits or low liquidity can leave it open; it lapses at the end of the day.</p>
              <p><b className="text-[#0F1729]">What is Repair?</b><br />Fresh orders at a fresh limit price, only for the stocks whose orders were rejected or cancelled, so your holdings match the portfolio.</p>
              <p><b className="text-[#0F1729]">Insufficient funds?</b><br />Add money in Kite, then Repair.</p>
              <p><b className="text-[#0F1729]">Still stuck?</b> <Link to="/faq" className="text-[#5320A8] font-semibold">Read the FAQ</Link> or <Link to="/contact" className="text-[#5320A8] font-semibold">contact us</Link>.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

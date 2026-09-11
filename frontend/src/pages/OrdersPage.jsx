import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ClipboardList, RefreshCw, Loader2, Wrench, ChevronDown, ChevronUp, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const INR2 = (n) => (n ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const TONE = { COMPLETE: 'bg-[#E3F4EB] text-[#096B3E]', OPEN: 'bg-[#EFF6FF] text-[#1D4ED8]', REJECTED: 'bg-[#FBE4E4] text-[#B91C1C]', CANCELLED: 'bg-[#FBE4E4] text-[#B91C1C]' };
const label = (o) => { const s = (o.status || '').toUpperCase(); if (!o.order_id) return 'Rejected'; if (s === 'COMPLETE') return 'Filled'; if (s === 'REJECTED') return 'Rejected'; if (s === 'CANCELLED') return 'Cancelled'; if (s.includes('AMO')) return 'After-market'; return 'Open'; };

function Batch({ b, onRepair, busy, openDefault }) {
  const [open, setOpen] = useState(openDefault);
  const c = b.counts || {};
  const value = b.orders.reduce((s, o) => s + (o.filled_qty && o.avg_price ? o.filled_qty * o.avg_price : 0), 0);
  return (
    <div className="surface p-4 sm:p-5" data-testid="order-batch">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-[#0F1729] truncate">{b.portfolio_name}</div>
          <div className="text-[12px] text-[#667085] mt-0.5">Invest · {when(b.placed_at)}{b.mode === 'amo' ? ' · after-market' : ''} · #{b.id}</div>
        </div>
        <span className={`shrink-0 text-[11px] font-bold rounded-full px-2 py-1 ${c.complete === c.total ? TONE.COMPLETE : c.rejected ? TONE.REJECTED : TONE.OPEN}`}>{c.complete === c.total ? 'All filled' : `${c.placed} of ${c.total} placed`}</span>
      </div>
      <div className="h-2 rounded-full bg-[#E8E1F0] overflow-hidden mt-3"><i className="block h-full bg-[#0A7D48]" style={{ width: `${(c.complete / Math.max(1, c.total)) * 100}%` }} /></div>
      <div className="flex items-center justify-between mt-2 text-[12px] text-[#526071]">
        <span>{c.complete} filled · {c.open} open · {c.rejected} rejected</span>
        <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 font-semibold text-[#5320A8]">{open ? 'Hide' : 'Details'} {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>
      </div>
      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-[11px] uppercase tracking-wider text-[#667085]"><th className="text-left font-semibold py-1.5">Stock</th><th className="text-right font-semibold py-1.5">Filled</th><th className="text-right font-semibold py-1.5">Avg ₹</th><th className="text-right font-semibold py-1.5">Limit ₹</th><th className="text-right font-semibold py-1.5">Status</th></tr></thead>
            <tbody>
              {b.orders.map((o) => (
                <tr key={o.symbol} className="border-t border-[#F1EDF7]">
                  <td className="py-2 font-semibold text-[#0F1729]">{o.symbol}{o.message && !o.order_id ? <div className="text-[11px] font-normal text-[#B91C1C]">{o.message}</div> : null}</td>
                  <td className="py-2 text-right num">{o.filled_qty || 0} / {o.qty}</td>
                  <td className="py-2 text-right num">{INR2(o.avg_price)}</td>
                  <td className="py-2 text-right num">{INR2(o.limit_price)}</td>
                  <td className="py-2 text-right"><span className={`text-[11px] font-bold rounded-md px-1.5 py-0.5 ${TONE[(o.status || '').toUpperCase()] || TONE.OPEN}`}>{label(o)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between mt-3 text-[12px] text-[#526071]">
            <span>Buy value so far <b className="text-[#0F1729] num">{INR(value)}</b>{value === 0 && b.mode === 'amo' ? ' · updates at market open' : ''}</span>
            {c.rejected > 0 && <button type="button" onClick={() => onRepair(b.id)} disabled={busy} className="btn-outline h-9 text-[12px] disabled:opacity-60" data-testid="order-repair-btn">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />} Repair {c.rejected} order{c.rejected > 1 ? 's' : ''}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Your orders: every batch placed through Omnivest, refreshed from Zerodha while the daily session is valid. */
export default function OrdersPage() {
  const { token, isAuthed, openAuth } = useAuth();
  const [params] = useSearchParams();
  const [batches, setBatches] = useState(null);
  const [market, setMarket] = useState(null);
  const [busy, setBusy] = useState(false);
  const h = { headers: { Authorization: `Bearer ${token}` } };

  const load = async () => {
    try {
      const [{ data }, m] = await Promise.all([axios.get(`${API}/invest/batches`, h), axios.get(`${API}/invest/market`).catch(() => ({ data: null }))]);
      setBatches(data.batches || []); setMarket(m.data);
    } catch { setBatches([]); }
  };
  useEffect(() => {
    document.title = 'Your orders | Omnivest';
    if (!isAuthed) { openAuth?.({ next: '/orders' }); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  const repair = async (bid) => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/invest/batches/${bid}/repair`, {}, h);
      toast.success(data.repaired ? `${data.repaired} order${data.repaired > 1 ? 's' : ''} placed again` : 'Nothing to repair');
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || 'Repair failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-[#F7F4FB] min-h-screen">
      <div className="container-x py-8 sm:py-10 max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-[26px] sm:text-4xl font-bold text-[#0F1729] flex items-center gap-2"><ClipboardList className="h-6 w-6 text-[#6C2BD9]" /> Your orders</h1>
            <p className="text-[14px] text-[#526071] mt-1">Every order placed through Omnivest in your Zerodha account, with Zerodha's live status.</p>
          </div>
          <button type="button" onClick={load} className="btn-outline h-10 shrink-0" aria-label="Refresh"><RefreshCw className="h-4 w-4" /> <span className="hidden sm:inline">Refresh</span></button>
        </div>
        {market && !market.open && <div className="mt-4 rounded-xl bg-[#FEF3C7] text-[#9A4A05] px-3 py-2.5 text-[12.5px] flex gap-2 items-start"><Moon className="h-4 w-4 shrink-0 mt-0.5" /><span>{market.note}</span></div>}
        <div className="mt-5 space-y-4">
          {batches === null && <div className="surface p-6 text-[#667085] text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading your orders…</div>}
          {batches && batches.length === 0 && (
            <div className="surface p-8 text-center">
              <div className="font-semibold text-[#0F1729]">No orders yet</div>
              <p className="text-[13px] text-[#526071] mt-1">Open a model portfolio and tap Invest now to place your first batch.</p>
              <Link to="/model-portfolios" className="btn-primary mt-4 inline-flex">Browse portfolios</Link>
            </div>
          )}
          {batches && batches.map((b, i) => <Batch key={b.id} b={b} onRepair={repair} busy={busy} openDefault={i === 0 || params.get('batch') === b.id} />)}
        </div>
        <div className="mt-8 surface p-5 text-[13px] text-[#526071] space-y-2">
          <div className="font-semibold text-[#0F1729]">Need help?</div>
          <p><b>Why are some orders unfilled?</b> A limit order fills only if the stock trades at or below your limit. Gaps at open, circuit limits or low liquidity can leave it open; it lapses at the end of the day.</p>
          <p><b>What is Repair?</b> It places fresh orders, at a fresh limit price, only for the stocks whose orders were rejected or cancelled, so your holdings match the portfolio.</p>
          <p><b>Insufficient funds?</b> Add money in Kite, then tap Repair. Contact us at <a href="/contact" className="text-[#5320A8] font-semibold">omnivest.in/contact</a> for anything else.</p>
        </div>
      </div>
    </div>
  );
}

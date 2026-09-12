import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { X, Loader2, AlertTriangle, CheckCircle2, Info, Wrench, LogOut } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const INR2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
const CASHIER = (amt) => `https://cashier.zerodha.com/?type=login&amount=${Math.max(0, Math.round(amt || 0))}`;

function Note({ tone = 'info', icon: Icon = Info, children, testid }) {
  const cls = { info: 'bg-[#EFF6FF] text-[#1D4ED8]', warn: 'bg-[#FEF3C7] text-[#9A4A05]', pos: 'bg-[#E3F4EB] text-[#096B3E]', neg: 'bg-[#FBE4E4] text-[#B91C1C]' }[tone];
  return <div className={`rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed flex gap-2 items-start ${cls}`} data-testid={testid}><Icon className="h-4 w-4 shrink-0 mt-0.5" /><span>{children}</span></div>;
}

/**
 * Fix portfolio (buy the missing shares) and Exit (sell everything held): the same review -> funds gate -> place
 * path as Invest. The server computes the diff from live Zerodha holdings; nothing is placed without this review.
 */
export default function ActionModal({ kind, inv, token, onClose, onDone }) {
  const h = { headers: { Authorization: `Bearer ${token}` } };
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const isFix = kind === 'fix';

  const load = async () => {
    setBusy(true); setErr(null);
    try { const { data } = await axios.post(`${API}/investments/${inv.portfolio_id}/${kind}/preview`, {}, h); setPreview(data); }
    catch (e) { const d = e?.response?.data?.detail; setErr(typeof d === 'object' ? d : { message: d || 'Could not prepare the orders' }); }
    finally { setBusy(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const place = async () => {
    if (!isFix && !confirmExit) { setConfirmExit(true); return; }
    setBusy(true); setErr(null);
    try { const { data } = await axios.post(`${API}/investments/${inv.portfolio_id}/${kind}`, {}, h); setResult(data); }
    catch (e) { const d = e?.response?.data?.detail; setErr(typeof d === 'object' ? d : { message: d || 'Orders could not be placed' }); }
    finally { setBusy(false); }
  };

  const funds = preview?.funds && !preview.funds.ok ? preview.funds : err?.code === 'funds' ? err : null;
  const blocked = preview?.market?.mode === 'blocked';
  const b = result?.batch;
  const title = isFix ? 'Fix portfolio' : 'Exit portfolio';

  return (
    <div className="fixed inset-0 z-[70] bg-[#0F1729]/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose} data-testid={`action-modal-${kind}`}>
      <div className="bg-white w-full sm:max-w-[560px] rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white/95 backdrop-blur px-5 pt-4 pb-3 border-b border-[#F1EDF7] flex items-start justify-between gap-3">
          <div><div className="font-heading text-[18px] font-bold text-[#0F1729] flex items-center gap-2">{isFix ? <Wrench className="h-4 w-4 text-[#6C2BD9]" /> : <LogOut className="h-4 w-4 text-[#B91C1C]" />} {title}</div><div className="text-[12.5px] text-[#526071]">{inv.portfolio?.name}</div></div>
          <button type="button" onClick={onClose} className="h-9 w-9 grid place-items-center rounded-full hover:bg-[#F7F4FB]" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {!preview && !err && <div className="py-10 text-center text-[#667085] text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Checking your holdings and today's prices…</div>}
          {err && !preview && <Note tone={err.code === 'nothing' ? 'pos' : 'neg'} icon={err.code === 'nothing' ? CheckCircle2 : AlertTriangle}>{err.message}</Note>}

          {preview && !b && (
            <>
              {isFix
                ? <Note tone="info">These {preview.count} buy order{preview.count > 1 ? 's' : ''} bring the portfolio back to its target mix{preview.after?.worst_deviation_pp != null ? <>, every stock within <b>{preview.after.worst_deviation_pp.toFixed(1)}%</b> of target</> : ''}. Limit prices are today's price plus {preview.buffer_pct}%.</Note>
                : <Note tone="warn" icon={AlertTriangle}>This sells <b>everything</b> this portfolio holds in your Zerodha account, {preview.count} stock{preview.count > 1 ? 's' : ''}, at today's price minus {preview.buffer_pct}%. Shares bought today may not be sellable until they settle.</Note>}
              <div className="rounded-2xl border border-[#E8E1F0] overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead><tr className="text-[11px] uppercase tracking-wider text-[#667085] bg-[#FBFAFD]"><th className="text-left font-semibold px-3 py-2">Stock</th><th className="text-right font-semibold px-2 py-2">{preview.side === 'BUY' ? 'Buy' : 'Sell'}</th><th className="text-right font-semibold px-3 py-2">Limit ₹</th><th className="text-right font-semibold px-3 py-2">Value</th></tr></thead>
                  <tbody>{preview.orders.map((o) => (
                    <tr key={o.symbol} className="border-t border-[#F1EDF7]"><td className="px-3 py-2"><div className="font-semibold text-[#0F1729]">{o.symbol}</div>{o.name ? <div className="text-[11.5px] text-[#667085]">{o.name}</div> : null}</td><td className="px-2 py-2 text-right num font-semibold">{o.qty}</td><td className="px-3 py-2 text-right num">{INR2(o.limit_price)}</td><td className="px-3 py-2 text-right num">{INR(o.value)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="flex justify-between items-end">
                <div className="text-[12px] text-[#667085]">{preview.count} order{preview.count > 1 ? 's' : ''} · {preview.side} · {preview.market.mode === 'amo' ? 'after-market' : blocked ? 'market closed' : 'now'}{preview.funds ? ` · available ${INR(preview.funds.available)}` : ''}</div>
                <div className="font-heading text-[22px] font-extrabold num">{INR(preview.amount)}</div>
              </div>
              {blocked && <Note tone="warn" icon={AlertTriangle}>{preview.market.note}</Note>}
              {err && err.code !== 'funds' && <Note tone="neg" icon={AlertTriangle}>{err.message}</Note>}
              {funds ? (
                <div className="rounded-2xl border border-[#F1D48A] bg-[#FFFBEB] p-4" data-testid="action-funds-gate">
                  <div className="font-semibold text-[#0F1729] flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-[#9A4A05]" /> Add funds to continue</div>
                  <div className="mt-3 text-[13px] space-y-1.5">
                    <div className="flex justify-between"><span className="text-[#526071]">Required funds</span><b className="num">{INR(funds.required)}</b></div>
                    <div className="flex justify-between"><span className="text-[#526071]">Available in Zerodha</span><b className="num">{INR(funds.available)}</b></div>
                    <div className="flex justify-between border-t border-[#F1D48A] pt-1.5"><span className="text-[#0F1729] font-semibold">Funds to add</span><b className="num text-[#B91C1C]">{INR(funds.short)}</b></div>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <a href={CASHIER(funds.short)} target="_blank" rel="noreferrer" className="btn-primary h-11">Add {INR(funds.short)} on Zerodha</a>
                      <button type="button" onClick={load} disabled={busy} className="btn-outline h-11 disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Re-check balance</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_2fr] gap-2">
                  <button type="button" onClick={onClose} disabled={busy} className="btn-outline h-12">Back</button>
                  <button type="button" onClick={place} disabled={busy || blocked} className={`${isFix ? 'btn-invest' : 'bg-[#B91C1C] hover:bg-[#991B1B] text-white rounded-xl font-semibold'} h-12 text-[15px] disabled:opacity-60 inline-flex items-center justify-center gap-2`} data-testid="action-place-btn">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{isFix ? `Place ${preview.count} buy order${preview.count > 1 ? 's' : ''}` : confirmExit ? 'Yes, sell everything' : `Sell ${preview.count} stock${preview.count > 1 ? 's' : ''}`}
                  </button>
                </div>
              )}
              {!isFix && confirmExit && <Note tone="neg" icon={AlertTriangle}>Tap again to confirm. This cannot be undone once Zerodha executes the sells.</Note>}
              <div className="text-[11.5px] text-[#667085] text-center leading-relaxed">By placing, you instruct Zerodha to {preview.side === 'BUY' ? 'buy' : 'sell'} these quantities in your account. Execution prices may differ from the limits shown.</div>
            </>
          )}

          {b && (() => { const none = b.counts.placed === 0; const partial = !none && b.counts.rejected > 0; return (
            <div className="space-y-3" data-testid="action-placed">
              <div className={`h-16 w-16 rounded-full grid place-items-center mx-auto ${none ? 'bg-[#FBE4E4] text-[#B91C1C]' : partial ? 'bg-[#FEF3C7] text-[#9A4A05]' : 'bg-[#E3F4EB] text-[#0B7F4A]'}`}>{none ? <AlertTriangle className="h-8 w-8" /> : <CheckCircle2 className="h-8 w-8" />}</div>
              <h3 className="text-center font-heading text-[20px] font-bold text-[#0F1729]">{none ? 'Orders could not be placed' : partial ? 'Some orders placed' : b.mode === 'amo' ? 'After-market orders placed' : 'Orders placed'}</h3>
              <div className="text-center text-[13px] text-[#526071]">{b.counts.placed} of {b.counts.total} orders accepted by Zerodha{b.counts.rejected ? ` · ${b.counts.rejected} rejected` : ''}</div>
              {none ? <Note tone="neg" icon={AlertTriangle}>Nothing was placed and nothing was charged. See the reason on the Orders page and try again.</Note>
                : b.mode === 'amo' ? <Note tone="pos" icon={CheckCircle2}>They execute when NSE opens on {when(result.market.next_open_ist)}. This page updates itself once Zerodha reports the fills.</Note>
                : <Note tone="pos" icon={CheckCircle2}>Zerodha is executing them now. Check with Zerodha in a minute to see the holdings update.</Note>}
              <Link to={`/orders?batch=${b.id}`} className="btn-outline w-full h-11">See the orders</Link>
              <button type="button" onClick={onDone} className="btn-primary w-full h-11">Back to investments</button>
            </div>
          ); })()}
        </div>
      </div>
    </div>
  );
}

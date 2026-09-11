import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { X, Loader2, Moon, Info, CheckCircle2, AlertTriangle, ArrowRight, Link2, ShieldCheck, Sun } from 'lucide-react';
import { useBroker } from '../context/BrokerContext';
import { track } from '../lib/track';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const INR2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

/** Step bar: amount → review → placed */
function Steps({ n }) {
  return <div className="flex gap-1.5 mb-4" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={`flex-1 h-1 rounded-full ${i <= n ? 'bg-[#6C2BD9]' : 'bg-[#E8E1F0]'}`} />)}</div>;
}

function Note({ tone = 'info', icon: Icon = Info, children, testid }) {
  const cls = { info: 'bg-[#EFF6FF] text-[#1D4ED8]', warn: 'bg-[#FEF3C7] text-[#9A4A05]', pos: 'bg-[#E3F4EB] text-[#096B3E]', neg: 'bg-[#FBE4E4] text-[#B91C1C]' }[tone];
  return <div className={`rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed flex gap-2 items-start ${cls}`} data-testid={testid}><Icon className="h-4 w-4 shrink-0 mt-0.5" /><span>{children}</span></div>;
}

/**
 * Invest now → real orders in the investor's own Zerodha account (Kite Connect), smallcase-style:
 * amount (min = 1 share of every stock) → review whole-share quantities at limit prices → place →
 * placed/after-market summary → Orders page. Server does all maths and placement (investing.py).
 */
export default function InvestModal({ open, onClose, basket, token, minAmount }) {
  const h = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const { connections, connectKite, refreshKite } = useBroker();
  const kite = connections.kite;
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState('');
  const [market, setMarket] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);       // { code, message, min_amount }
  const [result, setResult] = useState(null); // { batch, market }
  const [connecting, setConnecting] = useState(false);
  const amountRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStep(1); setPreview(null); setResult(null); setErr(null);
    setAmount(String(Math.round(minAmount || basket?.minAmount || 0) || ''));
    axios.get(`${API}/invest/market`).then(({ data }) => setMarket(data)).catch(() => setMarket(null));
    refreshKite?.();
    setTimeout(() => amountRef.current?.focus({ preventScroll: true }), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, basket?.id]);

  if (!open || !basket) return null;

  const fail = (e) => {
    const d = e?.response?.data?.detail;
    const obj = typeof d === 'object' && d ? d : { code: 'error', message: typeof d === 'string' ? d : (e?.message || 'Something went wrong') };
    setErr(obj);
    if (obj.code !== 'min' && obj.code !== 'broker' && obj.code !== 'locked') toast.error(obj.message);
  };

  const connect = async () => {
    setConnecting(true);
    try {
      await connectKite();
      toast('Complete the Zerodha login in the popup, then continue here.');
    } catch { toast.error('Could not open the Zerodha login.'); }
    finally { setConnecting(false); }
  };

  const review = async () => {
    setBusy(true); setErr(null);
    try {
      const { data } = await axios.post(`${API}/invest/preview`, { portfolio_id: basket.id, amount: Number(amount) }, h);
      setPreview(data); setMarket(data.market); setStep(2);
      track('invest_review', { portfolio_id: basket.id, amount: data.amount_adjusted });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const place = async () => {
    setBusy(true); setErr(null);
    try {
      const { data } = await axios.post(`${API}/invest/place`, { portfolio_id: basket.id, amount: Number(amount) }, h);
      setResult(data); setStep(3);
      track('invest_placed', { portfolio_id: basket.id, amount: data.batch.amount_adjusted, placed: data.batch.counts.placed });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const closed = market && !market.open;
  const blocked = market?.mode === 'blocked';
  const b = result?.batch;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#0F1729]/55 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`Investing in ${basket.name}`} data-testid="invest-modal" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 sm:px-5 h-14 flex items-center justify-between border-b border-[#EEF1F6]">
          <div className="min-w-0"><div className="text-[12px] text-[#667085]">Investing in</div><div className="font-bold text-[#0F1729] truncate">{basket.name}</div></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="h-10 w-10 grid place-items-center rounded-full hover:bg-[#F7F4FB] text-[#526071]"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-4 sm:px-5 py-4">
          <Steps n={step} />

          {/* market state banner */}
          {market && step < 3 && (
            closed
              ? <Note tone={blocked ? 'neg' : 'warn'} icon={Moon} testid="invest-market-note">{market.note}</Note>
              : <Note tone="pos" icon={Sun} testid="invest-market-note">{market.note}</Note>
          )}

          {/* broker gate */}
          {!kite && step < 3 && (
            <div className="mt-3 rounded-2xl border border-[#E8E1F0] p-4" data-testid="invest-broker-gate">
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 rounded-xl bg-[#F1E7FE] text-[#5320A8] grid place-items-center shrink-0"><Link2 className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <div className="font-semibold text-[#0F1729]">Connect your Zerodha account</div>
                  <div className="text-[13px] text-[#526071] mt-0.5">You log in on Zerodha's own page. Orders are placed in your account; Omnivest never sees your password or holds your money.</div>
                </div>
              </div>
              <button type="button" onClick={connect} disabled={connecting} className="btn-primary w-full mt-3 disabled:opacity-60" data-testid="invest-connect-btn">{connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Connect Zerodha</button>
              <div className="text-[11.5px] text-[#667085] mt-1 text-center">Already connected on another device? <Link to="/brokers/connect" className="underline inline-flex items-center min-h-[44px] sm:min-h-0 px-1">Manage brokers</Link></div>
            </div>
          )}

          {/* step 1: amount */}
          {step === 1 && (
            <div className={`mt-3 space-y-3 ${!kite ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="rounded-2xl border border-[#E8E1F0] p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#667085]">Amount to invest</div>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="font-heading text-[28px] font-extrabold text-[#0F1729]">₹</span>
                  <input ref={amountRef} value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^\d]/g, '')); setErr(null); }} inputMode="numeric" className="num font-heading text-[30px] font-extrabold text-[#0F1729] w-full outline-none border-b-2 border-[#6C2BD9] py-1 bg-transparent" data-testid="invest-amount" aria-label="Amount to invest" />
                </div>
                <div className="text-[12px] text-[#667085] mt-1.5">Minimum {INR(minAmount || basket.minAmount)} · buys 1+ share of every stock at the last price</div>
                <div className="flex gap-2 flex-wrap mt-3">
                  {[['Minimum', Math.round(minAmount || basket.minAmount || 0)], ['₹25,000', 25000], ['₹50,000', 50000], ['₹1,00,000', 100000]].map(([label, v]) => (
                    <button key={label} type="button" onClick={() => setAmount(String(v))} className={`h-11 sm:h-9 px-3.5 rounded-full text-[13px] font-semibold border ${Number(amount) === v ? 'bg-[#1A1030] text-white border-[#1A1030]' : 'bg-white border-[#E8E1F0] text-[#334155]'}`}>{label}</button>
                  ))}
                </div>
              </div>
              {err?.code === 'min' && <Note tone="neg" icon={AlertTriangle} testid="invest-min-error">{err.message}</Note>}
              {err?.code === 'broker' && <Note tone="warn" icon={AlertTriangle}>{err.message}</Note>}
              <div className="rounded-2xl border border-[#E8E1F0] p-4 text-[13px] space-y-1.5">
                <div className="flex justify-between"><span className="text-[#526071]">Broker</span><b>{kite ? `Zerodha · ${kite.profile?.user_id_kite || kite.profile?.user_name || 'connected'} ✓` : 'Not connected'}</b></div>
                <div className="flex justify-between"><span className="text-[#526071]">Orders</span><b>{(basket.constituents || []).length || basket.holdings_count} stocks · limit · delivery</b></div>
                {market && <div className="flex justify-between"><span className="text-[#526071]">Timing</span><b>{market.open ? 'Now' : market.mode === 'amo' ? `After-market · ${when(market.next_open_ist)}` : 'Not right now'}</b></div>}
              </div>
              <button type="button" onClick={review} disabled={busy || !kite || !Number(amount) || blocked} className="btn-primary w-full h-12 disabled:opacity-60" data-testid="invest-review-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Review orders <ArrowRight className="h-4 w-4" /></button>
              <div className="text-[11.5px] text-[#667085] text-center leading-relaxed">Orders are placed in your own Zerodha account. Omnivest never holds your money or securities.</div>
            </div>
          )}

          {/* step 2: review */}
          {step === 2 && preview && (
            <div className="mt-3 space-y-3" data-testid="invest-review">
              <div className="flex justify-between items-baseline text-[13px]"><span className="text-[#526071]">Investment amount</span><b className="num">{INR(preview.amount_requested)} → <span className="text-[#0B7F4A]">{INR(preview.amount_adjusted)} adjusted</span></b></div>
              <div className="text-[12px] text-[#667085]">Rounded to whole shares so the mix stays close to the partner's weights. Limit orders at last price +{preview.buffer_pct}%{preview.market.mode === 'amo' ? ', placed as after-market orders' : ''}.</div>
              {preview.hint && <Note tone="info" testid="invest-hint">Add <b>{INR(preview.hint.add_amount)}</b> to bring every stock within 2% of its target weight. <button type="button" className="underline font-semibold" onClick={() => { setAmount(String(preview.hint.amount)); setStep(1); }}>Use {INR(preview.hint.amount)}</button></Note>}
              {preview.funds && preview.funds.available < preview.amount_adjusted && <Note tone="warn" icon={AlertTriangle} testid="invest-funds-warn">Zerodha shows {INR(preview.funds.available)} available; these orders need {INR(preview.amount_adjusted)}. Add funds in Kite or some orders will be rejected.</Note>}
              <div className="rounded-2xl border border-[#E8E1F0] overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead><tr className="text-[11px] uppercase tracking-wider text-[#667085] bg-[#F7F4FB]"><th className="text-left font-semibold px-3 py-2">Stock</th><th className="text-right font-semibold px-2 py-2">Weight</th><th className="text-right font-semibold px-2 py-2">Qty</th><th className="text-right font-semibold px-3 py-2">Limit ₹</th></tr></thead>
                  <tbody>
                    {preview.orders.map((o) => (
                      <tr key={o.symbol} className="border-t border-[#F1EDF7]">
                        <td className="px-3 py-2"><div className="font-semibold text-[#0F1729]">{o.symbol}</div><div className="text-[11.5px] text-[#667085]">target {o.weight_target}% · gets {o.weight_actual}%</div></td>
                        <td className="px-2 py-2 text-right num">{o.weight_target}%</td>
                        <td className="px-2 py-2 text-right num font-semibold">{o.qty}</td>
                        <td className="px-3 py-2 text-right num">{INR2(o.limit_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-end">
                <div className="text-[12px] text-[#667085]">{preview.count} orders · BUY · {preview.market.mode === 'amo' ? 'after-market' : 'now'}{preview.funds ? ` · available ${INR(preview.funds.available)}` : ''}</div>
                <div className="font-heading text-[22px] font-extrabold num">{INR(preview.amount_adjusted)}</div>
              </div>
              {err && <Note tone="neg" icon={AlertTriangle}>{err.message}</Note>}
              <div className="grid grid-cols-[1fr_2fr] gap-2">
                <button type="button" onClick={() => setStep(1)} disabled={busy} className="btn-outline h-12">Back</button>
                <button type="button" onClick={place} disabled={busy || blocked} className="btn-invest h-12 rounded-xl text-[15px] disabled:opacity-60" data-testid="invest-place-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Place {preview.count} orders</button>
              </div>
              <div className="text-[11.5px] text-[#667085] text-center leading-relaxed">By placing, you instruct Zerodha to buy these quantities in your account. Execution prices may differ from the limits shown.</div>
            </div>
          )}

          {/* step 3: placed */}
          {step === 3 && b && (
            <div className="mt-2 space-y-3" data-testid="invest-placed">
              {(() => { const none = b.counts.placed === 0; const partial = !none && b.counts.rejected > 0; return (<>
              <div className={`h-16 w-16 rounded-full grid place-items-center mx-auto ${none ? 'bg-[#FBE4E4] text-[#B91C1C]' : partial ? 'bg-[#FEF3C7] text-[#9A4A05]' : 'bg-[#E3F4EB] text-[#0B7F4A]'}`}>{none ? <AlertTriangle className="h-8 w-8" /> : <CheckCircle2 className="h-8 w-8" />}</div>
              <h3 className="text-center font-heading text-[20px] font-bold text-[#0F1729]" data-testid="invest-placed-title">{none ? 'Orders could not be placed' : partial ? (b.mode === 'amo' ? 'Some after-market orders placed' : 'Some orders placed') : (b.mode === 'amo' ? 'After-market orders placed' : 'Orders placed')}</h3>
              <div className="text-center text-[13px] text-[#526071]">{b.counts.placed} of {b.counts.total} orders accepted by Zerodha{b.counts.rejected ? ` · ${b.counts.rejected} rejected` : ''}</div>
              <div className="h-2 rounded-full bg-[#E8E1F0] overflow-hidden"><i className="block h-full bg-[#0A7D48]" style={{ width: `${(b.counts.placed / Math.max(1, b.counts.total)) * 100}%` }} /></div>
              {none
                ? <Note tone="neg" icon={AlertTriangle}>Nothing was placed and nothing was charged. Fix the reason below, then use Repair on the Orders page to place them again.</Note>
                : b.mode === 'amo'
                  ? <Note tone="pos" icon={CheckCircle2}>They execute when NSE opens on {when(result.market.next_open_ist)}. We update each order's fill in your Orders page.</Note>
                  : <Note tone="pos" icon={CheckCircle2}>Zerodha is executing them now. Fills appear in your Orders page within a few seconds.</Note>}
              </>); })()}
              {Object.entries(b.orders.filter((o) => !o.order_id).reduce((m, o) => { const k = o.message || 'not accepted by Zerodha'; (m[k] = m[k] || []).push(o.symbol); return m; }, {})).map(([msg, syms]) => (
                <Note key={msg} tone="warn" icon={AlertTriangle}><b>{syms.length === b.counts.total ? 'All orders' : syms.join(', ')} rejected:</b> {msg}</Note>
              ))}
              <div className="rounded-2xl border border-[#E8E1F0] p-4 text-[13px] space-y-1.5">
                <div className="flex justify-between"><span className="text-[#526071]">Batch</span><b>Invest · #{b.id}</b></div>
                <div className="flex justify-between"><span className="text-[#526071]">Placed</span><b>{when(b.placed_at)}</b></div>
                <div className="flex justify-between"><span className="text-[#526071]">Amount</span><b className="num">{INR(b.orders.filter((o) => o.order_id).reduce((s, o) => s + o.value, 0))} of {INR(b.amount_adjusted)}</b></div>
              </div>
              <Link to={`/orders?batch=${b.id}`} className="btn-primary w-full h-12" data-testid="invest-see-orders">{b.counts.rejected ? 'Go to orders to repair' : 'See orders'}</Link>
              <button type="button" onClick={onClose} className="btn-outline w-full h-11">Back to the portfolio</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

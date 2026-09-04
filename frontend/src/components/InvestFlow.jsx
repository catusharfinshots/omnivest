import React, { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { getManager } from '../mock';
import { computeOrders } from '../lib/prices';
import { useBroker } from '../context/BrokerContext';
import { usePortfolio } from '../context/PortfolioContext';
import { CheckCircle2, ChevronRight, ShieldCheck, Info, Loader2, PartyPopper } from 'lucide-react';
import { toast } from 'sonner';

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function InvestFlow({ open, onOpenChange, basket, onViewInvestments }) {
  const { connections, connectKite } = useBroker();
  const { invest, startSip } = usePortfolio();
  const kiteConnected = !!connections.kite;

  const [step, setStep] = useState('broker');
  const [orderType, setOrderType] = useState('sip'); // 'sip' = one-time + SIP, 'onetime'
  const [firstAmount, setFirstAmount] = useState(basket?.minAmount || 0);
  const [sipAmount, setSipAmount] = useState(Math.round((basket?.minAmount || 0) / 2));
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(kiteConnected ? 'type' : 'broker');
      setOrderType('sip');
      setFirstAmount(basket?.minAmount || 0);
      setSipAmount(Math.max(200, Math.round((basket?.minAmount || 0) / 2)));
    }
  }, [open, basket?.id, kiteConnected, basket?.minAmount]);

  // Auto-advance from broker step when a connection appears
  useEffect(() => {
    if (open && step === 'broker' && kiteConnected) setStep('type');
  }, [kiteConnected, open, step]);

  const manager = basket ? getManager(basket.managerId) : null;
  const { rows, adjusted } = useMemo(
    () => computeOrders(basket?.constituents || [], Number(firstAmount) || 0),
    [basket, firstAmount]
  );
  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }, []);

  if (!basket) return null;

  const belowMin = Number(firstAmount) < (basket.minAmount || 0);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      await connectKite();
      toast.info('Complete the Zerodha login in the popup window.');
    } catch (e) {
      toast.error('Could not open Zerodha login.');
    } finally {
      setConnecting(false);
    }
  };

  const placeOrder = () => {
    invest({ basketId: basket.id, basketName: basket.name, amount: adjusted });
    if (orderType === 'sip') {
      startSip({ basketId: basket.id, basketName: basket.name, amount: Number(sipAmount), frequency: 'monthly', mode: 'sip' });
    }
    setStep('placed');
  };

  const Header = (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-[#E6E8F0]">
      <span className="h-9 w-9 rounded-lg grad-card text-white grid place-items-center text-xs font-bold">
        {basket.name.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0">
        <div className="text-xs text-[#526071]">Investing in</div>
        <div className="text-sm font-semibold text-[#0F1729] truncate">{basket.name}</div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        {Header}

        {/* Broker step */}
        {step === 'broker' && (
          <div className="p-6">
            <div className="flex items-center gap-2 text-[#0F1729]">
              <ShieldCheck className="h-5 w-5 text-[#6C2BD9]" />
              <h3 className="text-base font-semibold">Connect Zerodha to invest</h3>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-[#334155]">
              {['View your account balance and margins', 'View your profile details', 'Place, modify and cancel orders', 'Access holdings and positions portfolio'].map((p) => (
                <li key={p} className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-[#0B7F4A] mt-0.5" /> {p}</li>
              ))}
            </ul>
            <button onClick={handleConnect} disabled={connecting}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5722] px-5 py-3 text-sm font-semibold text-white hover:bg-[#F4511E] disabled:opacity-60">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue with Zerodha
            </button>
            <button onClick={() => setStep('type')} className="mt-3 w-full text-xs font-semibold text-[#526071] hover:text-[#6C2BD9]">
              Continue in demo mode (skip broker)
            </button>
          </div>
        )}

        {/* Order type step */}
        {step === 'type' && (
          <div className="p-6">
            <h3 className="text-base font-semibold text-[#0F1729]">Select Order Type</h3>
            <div className="mt-4 grid gap-3">
              {[
                { key: 'sip', title: 'One-time + SIP', desc: 'Invest the entire model portfolio now & start monthly recurring investments' },
                { key: 'onetime', title: 'One-time', desc: 'Invest lump sum amount once' },
              ].map((o) => (
                <button key={o.key} onClick={() => setOrderType(o.key)}
                  className={`text-left rounded-xl border p-4 transition-all ${orderType === o.key ? 'border-[#6C2BD9] ring-1 ring-[#6C2BD9] bg-[#F7F4FB]' : 'border-[#E6E8F0] hover:border-[#D8C7F1]'}`}>
                  <div className="flex items-center justify-between">
                    <div className={`text-sm font-semibold ${orderType === o.key ? 'text-[#6C2BD9]' : 'text-[#0F1729]'}`}>{o.title}</div>
                    <span className={`h-4 w-4 rounded-full border grid place-items-center ${orderType === o.key ? 'border-[#6C2BD9]' : 'border-[#CBD5E1]'}`}>
                      {orderType === o.key && <span className="h-2 w-2 rounded-full bg-[#6C2BD9]" />}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[#526071]">{o.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setStep('amount')} className="btn-primary">Confirm Order Type <ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}

        {/* Amount step */}
        {step === 'amount' && (
          <div className="p-6">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-[#0F1729]"><span>First Investment Amount</span><Info className="h-3.5 w-3.5 text-[#667085]" /></div>
            <p className="text-xs text-[#526071] mt-1">This amount will be invested right away · Min. Investment: {INR(basket.minAmount)}</p>
            <div className="mt-2 flex items-center rounded-xl border border-[#E6E8F0] px-3 py-3">
              <span className="text-[#526071] mr-2">₹</span>
              <input type="number" value={firstAmount} onChange={(e) => setFirstAmount(e.target.value)}
                className="num w-full outline-none text-lg font-semibold text-[#0F1729] bg-transparent" />
            </div>
            {belowMin && <div className="mt-1 text-xs text-[#B91C1C]">Amount is below the minimum of {INR(basket.minAmount)}.</div>}

            {orderType === 'sip' && (
              <div className="mt-6">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-[#0F1729]"><span>Monthly SIP Investment</span><Info className="h-3.5 w-3.5 text-[#667085]" /></div>
                <p className="text-xs text-[#526071] mt-1">Auto-debited from your broker account each month</p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[#526071]">SIP Amount</label>
                    <div className="mt-1 flex items-center rounded-xl border border-[#E6E8F0] px-3 py-2.5">
                      <span className="text-[#526071] mr-2">₹</span>
                      <input type="number" value={sipAmount} onChange={(e) => setSipAmount(e.target.value)}
                        className="num w-full outline-none font-semibold text-[#0F1729] bg-transparent" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[#526071]">Start Date</label>
                    <div className="mt-1 flex items-center rounded-xl border border-[#E6E8F0] px-3 py-2.5 text-[#0F1729] font-medium">{startDate}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep('type')} className="btn-outline">Back</button>
              <button onClick={() => setStep('review')} disabled={belowMin} className="btn-invest disabled:opacity-50">Review Orders</button>
            </div>
          </div>
        )}

        {/* Review step */}
        {step === 'review' && (
          <div className="p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#0F1729]">Review Orders</h3>
              <div className="text-xs text-[#526071]">Confirm amount: <span className="num font-semibold text-[#0F1729]">{INR(adjusted)}</span></div>
            </div>
            <p className="mt-1 text-xs text-[#526071]">Amounts are adjusted to whole quantities (you cannot buy fractions).</p>
            <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-[#E6E8F0]">
              <table className="w-full text-sm">
                <thead className="bg-[#F5F7FB] text-[#526071]">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Constituent</th>
                    <th className="px-3 py-2 font-medium text-right">Price</th>
                    <th className="px-3 py-2 font-medium text-right">Wt%</th>
                    <th className="px-3 py-2 font-medium text-right">Qty</th>
                    <th className="px-3 py-2 font-medium text-right">Side</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.symbol} className="border-t border-[#EEF1F6]">
                      <td className="px-3 py-2 text-[#0F1729] font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-right num">{r.price.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right num">{r.weight}</td>
                      <td className="px-3 py-2 text-right num font-semibold">{r.quantity}</td>
                      <td className="px-3 py-2 text-right text-[#0B7F4A] font-semibold">BUY</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep('amount')} className="btn-outline">Back</button>
              <button onClick={placeOrder} className="btn-invest">Confirm & Place Order</button>
            </div>
          </div>
        )}

        {/* Placed step */}
        {step === 'placed' && (
          <div className="p-8 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-[#DCFCE7] grid place-items-center">
              <PartyPopper className="h-7 w-7 text-[#0B7F4A]" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-[#0F1729]">Order placed successfully</h3>
            <p className="mt-1 text-sm text-[#526071]">
              {INR(adjusted)} invested in <span className="font-semibold text-[#0F1729]">{basket.name}</span>
              {orderType === 'sip' ? ` · SIP of ${INR(sipAmount)}/mo starts ${startDate}` : ''}
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
              <button onClick={() => { onOpenChange(false); onViewInvestments && onViewInvestments(); }} className="btn-primary">View investments</button>
              <button onClick={() => onOpenChange(false)} className="btn-outline">Close</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

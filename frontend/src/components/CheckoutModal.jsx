import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Check, ChevronRight, Lock, X, ShieldCheck, FileText, CreditCard, Loader2 } from 'lucide-react';
import { openCheckout } from '../lib/razorpay';
import { track } from '../lib/track';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const nice = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const STEPS = ['plan', 'billing', 'terms', 'pay'];
const LABEL = { plan: 'Select a plan', billing: 'Billing information', terms: 'Sign terms of service', pay: 'Complete payment' };

/**
 * The smallcase-style subscription flow, as one modal:
 *   plan → billing details (PAN, name, DOB, state) → terms signed with a mobile OTP → payment.
 * Every check is repeated on the server; this component only walks the investor through them.
 */
export default function CheckoutModal({ open, onClose, basket, plan, setPlan, token, user, onSubscribed }) {
  const h = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const [step, setStep] = useState('plan');
  const [done, setDone] = useState({ plan: false, billing: false, terms: false, pay: false });
  const [billing, setBilling] = useState({ pan: '', pan_name: '', dob: '', state: '' });
  const [states, setStates] = useState([]);
  const [terms, setTerms] = useState(null);
  const [otpSent, setOtpSent] = useState(null);   // { demo, phone_hint }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [payCfg, setPayCfg] = useState(null);
  const [result, setResult] = useState(null);     // { kind: 'paid' | 'interest', expires_at }

  // load what is already on file, so a returning investor skips straight to payment
  useEffect(() => {
    if (!open || !token || !basket?.id) return;
    let alive = true;
    (async () => {
      try {
        const [st, bl, tm, cfg, sts] = await Promise.all([
          axios.get(`${API}/checkout/status`, { ...h, params: { portfolio_id: basket.id } }),
          axios.get(`${API}/me/billing`, h),
          axios.get(`${API}/portfolios/${basket.id}/terms`),
          axios.get(`${API}/payments/config`),
          axios.get(`${API}/checkout/states`),
        ]);
        if (!alive) return;
        const missing = st.data.missing || [];
        setBilling({ pan: '', pan_name: user?.name || '', dob: '', state: '', ...(bl.data.billing || {}) });
        setTerms(tm.data); setPayCfg(cfg.data); setStates(sts.data.states || []);
        const d = { plan: !!plan, billing: !missing.includes('billing'), terms: !missing.includes('terms'), pay: false };
        setDone(d);
        setStep(!plan ? 'plan' : !d.billing ? 'billing' : !d.terms ? 'terms' : 'pay');
      } catch { toast.error('Could not open checkout'); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, basket?.id]);

  if (!open) return null;
  const paid = basket.subscription === 'Paid';
  const plans = basket.plans || [];

  const saveBilling = async (e) => {
    e.preventDefault(); setBusy(true); setErrors([]);
    try {
      await axios.put(`${API}/me/billing`, billing, h);
      setDone((d) => ({ ...d, billing: true })); setStep('terms');
    } catch (err) { setErrors(err?.response?.data?.detail?.errors || [err?.response?.data?.detail?.message || err?.response?.data?.detail || 'Could not save']); }
    finally { setBusy(false); }
  };
  const sendOtp = async () => {
    setBusy(true);
    try { const { data } = await axios.post(`${API}/checkout/consent/request`, {}, h); setOtpSent(data); toast.success(data.demo ? 'Demo mode: use code 123456' : `Code sent to ${data.phone_hint}`); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Could not send the code'); }
    finally { setBusy(false); }
  };
  const confirmTerms = async () => {
    setBusy(true);
    try {
      await axios.post(`${API}/checkout/consent/confirm`, { portfolio_id: basket.id, code, terms_version: terms.version }, h);
      track('terms_signed', { portfolio_id: basket.id });
      setDone((d) => ({ ...d, terms: true })); setStep('pay'); setCode('');
    } catch (err) { toast.error(err?.response?.data?.detail || 'Could not confirm'); }
    finally { setBusy(false); }
  };
  const pay = async () => {
    setBusy(true);
    try {
      if (payCfg?.enabled) {
        const { data: order } = await axios.post(`${API}/payments/orders`, { portfolio_id: basket.id, plan_months: plan.months }, h);
        const resp = await openCheckout(order);
        const { data } = await axios.post(`${API}/payments/verify`, { ...resp }, h);
        track('subscribe_paid', { portfolio_id: basket.id, plan: plan.months });
        setResult({ kind: 'paid', expires_at: data.subscription.expires_at });
      } else {
        const { data } = await axios.post(`${API}/portfolios/${basket.id}/subscribe-interest`, { plan_months: plan.months }, h);
        setResult({ kind: 'interest', message: data.message });
      }
      setDone((d) => ({ ...d, pay: true }));
      onSubscribed?.();
    } catch (err) {
      const msg = err?.response?.data?.detail?.message || err?.response?.data?.detail || err?.message || 'Could not complete';
      if (/closed/i.test(String(msg))) toast('Payment window closed — nothing was charged.'); else toast.error(String(msg));
    } finally { setBusy(false); }
  };

  const Row = ({ k, children }) => {
    const idx = STEPS.indexOf(k), cur = STEPS.indexOf(step);
    const isDone = done[k] && k !== step;
    const reachable = idx <= cur || done[k];
    return (
      <div className={`rounded-xl border ${k === step ? 'border-[#D8C7F1] bg-white' : 'border-[#EEF1F6] bg-[#FAFAFE]'}`} data-testid={`step-${k}`}>
        <button type="button" disabled={!reachable || !!result} onClick={() => reachable && setStep(k)} className="w-full flex items-center gap-3 px-4 h-12 text-left">
          <span className={`h-6 w-6 rounded-full grid place-items-center text-[12px] font-bold ${isDone ? 'bg-[#0B7F4A] text-white' : k === step ? 'bg-[#6C2BD9] text-white' : 'bg-[#E6E8F0] text-[#526071]'}`}>{isDone ? <Check className="h-3.5 w-3.5" /> : idx + 1}</span>
          <span className={`text-[14px] font-semibold ${k === step ? 'text-[#0F1729]' : 'text-[#526071]'}`}>{LABEL[k]}</span>
          {isDone && k === 'plan' && plan && <span className="ml-auto text-[13px] text-[#526071]">{plan.months} month{plan.months > 1 ? 's' : ''} · {INR(plan.price)}</span>}
          {isDone && k === 'billing' && <span className="ml-auto text-[13px] text-[#526071] num">{billing.pan}</span>}
          {isDone && k === 'terms' && <span className="ml-auto text-[13px] text-[#0B7F4A]">Signed</span>}
          {!isDone && k !== step && reachable && <ChevronRight className="ml-auto h-4 w-4 text-[#98A2B3]" />}
        </button>
        {k === step && !result && <div className="px-4 pb-4 border-t border-[#EEF1F6] pt-4">{children}</div>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F1729]/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`Subscribing to ${basket.name}`} data-testid="checkout-modal">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#F5F6FA] shadow-2xl">
        <div className="sticky top-0 bg-[#F5F6FA]/95 backdrop-blur px-4 h-14 flex items-center justify-between border-b border-[#EEF1F6]">
          <div className="min-w-0"><div className="text-[12px] text-[#667085]">Subscribing to</div><div className="font-bold text-[#0F1729] truncate">{basket.name}</div></div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-10 w-10 grid place-items-center rounded-full hover:bg-white text-[#526071]"><X className="h-5 w-5" /></button>
        </div>

        {result ? (
          <div className="p-6 text-center" data-testid="checkout-done">
            <div className="mx-auto h-14 w-14 rounded-full bg-[#E3F4EB] text-[#0B7F4A] grid place-items-center"><Check className="h-7 w-7" /></div>
            <h3 className="mt-4 text-xl font-bold text-[#0F1729]">{result.kind === 'paid' ? "You're subscribed" : 'Request received'}</h3>
            <p className="mt-2 text-[15px] text-[#526071]">{result.kind === 'paid' ? `Stocks, weights, the factsheet and updates are unlocked until ${nice(result.expires_at)}.` : (result.message || "We'll confirm your subscription shortly.")}</p>
            <button type="button" onClick={onClose} className="btn-primary mt-6 w-full">Back to the portfolio</button>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            <Row k="plan">
              <div className="grid grid-cols-2 gap-2" data-testid="checkout-plans">
                {plans.map((p) => (
                  <button key={p.months} type="button" onClick={() => { setPlan(p); setDone((d) => ({ ...d, plan: true })); setStep(!done.billing ? 'billing' : !done.terms ? 'terms' : 'pay'); }}
                    className={`rounded-xl border p-3 text-left transition-colors ${plan?.months === p.months ? 'border-[#6C2BD9] bg-[#F7F4FB]' : 'border-[#E8E1F0] bg-white hover:border-[#D8C7F1]'}`}>
                    <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085]">{p.months} month{p.months > 1 ? 's' : ''}</div>
                    <div className="num text-[15px] font-bold text-[#0F1729]">{INR(p.price)}</div>
                    <div className="text-[12px] text-[#667085]">≈ {INR(Math.round(p.price / p.months))}/mo</div>
                  </button>
                ))}
              </div>
            </Row>

            <Row k="billing">
              <form onSubmit={saveBilling} className="space-y-3" data-testid="billing-form">
                <div className="text-[13px] text-[#526071]">Used for your invoice and the client record the research analyst must keep. Saved once, reused next time.</div>
                <label className="block text-[13px] text-[#526071]">PAN
                  <input value={billing.pan} onChange={(e) => setBilling({ ...billing, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" maxLength={10} className="mt-1 w-full h-11 rounded-lg border border-[#E8E1F0] px-3 text-[15px] uppercase tracking-wider" data-testid="billing-pan" required />
                </label>
                <label className="block text-[13px] text-[#526071]">Name as per PAN
                  <input value={billing.pan_name} onChange={(e) => setBilling({ ...billing, pan_name: e.target.value })} className="mt-1 w-full h-11 rounded-lg border border-[#E8E1F0] px-3 text-[15px]" data-testid="billing-name" required />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-[13px] text-[#526071]">Date of birth
                    <input type="date" value={billing.dob} onChange={(e) => setBilling({ ...billing, dob: e.target.value })} className="mt-1 w-full h-11 rounded-lg border border-[#E8E1F0] px-3 text-[15px]" data-testid="billing-dob" required />
                  </label>
                  <label className="block text-[13px] text-[#526071]">State
                    <select value={billing.state} onChange={(e) => setBilling({ ...billing, state: e.target.value })} className="mt-1 w-full h-11 rounded-lg border border-[#E8E1F0] px-2 text-[15px] bg-white" data-testid="billing-state" required>
                      <option value="">Choose…</option>
                      {states.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                </div>
                {errors.length > 0 && <ul className="text-[13px] text-[#B91C1C] list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
                <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60" data-testid="billing-continue">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue</button>
              </form>
            </Row>

            <Row k="terms">
              {terms ? (
                <div className="space-y-3" data-testid="terms-step">
                  <div className="text-[13px] text-[#526071]">Please read the terms for this model portfolio. You sign them with a one-time code sent to your mobile.</div>
                  <div className="terms-doc max-h-56 overflow-y-auto rounded-lg border border-[#E8E1F0] bg-white p-3 text-[13px] leading-relaxed text-[#334155]" dangerouslySetInnerHTML={{ __html: terms.html }} />
                  {!otpSent ? (
                    <button type="button" onClick={sendOtp} disabled={busy} className="btn-outline w-full" data-testid="terms-send-otp"><ShieldCheck className="h-4 w-4" /> Send code to my mobile</button>
                  ) : (
                    <div className="flex gap-2">
                      <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={otpSent.demo ? 'Demo code 123456' : `Code sent to ${otpSent.phone_hint}`} className="flex-1 h-11 rounded-lg border border-[#E8E1F0] px-3 text-[15px] num" data-testid="terms-otp" />
                      <button type="button" onClick={confirmTerms} disabled={busy || code.length < 4} className="btn-primary disabled:opacity-60" data-testid="terms-confirm"><FileText className="h-4 w-4" /> Sign</button>
                    </div>
                  )}
                  <div className="text-[12px] text-[#667085]">Version {terms.version}. A copy of what you signed stays in your account.</div>
                </div>
              ) : <div className="text-[13px] text-[#526071]">Loading terms…</div>}
            </Row>

            <Row k="pay">
              {plan && (
                <div className="space-y-3" data-testid="pay-step">
                  <div className="rounded-lg bg-white border border-[#E8E1F0] p-3 text-[14px]">
                    <div className="flex justify-between"><span className="text-[#526071]">{basket.name} · {plan.months} month{plan.months > 1 ? 's' : ''}</span><span className="num">{INR(plan.price)}</span></div>
                    <div className="flex justify-between mt-1 text-[12px] text-[#667085]"><span>Includes applicable taxes · billed by Omnivest</span><span /></div>
                    <div className="flex justify-between mt-2 pt-2 border-t border-[#EEF1F6] font-bold text-[#0F1729]"><span>Amount to pay</span><span className="num">{INR(plan.price)}</span></div>
                  </div>
                  {payCfg?.enabled ? (
                    <button type="button" onClick={pay} disabled={busy || !paid} className="btn-primary w-full disabled:opacity-60" data-testid="pay-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Pay {INR(plan.price)}</button>
                  ) : (
                    <>
                      <button type="button" onClick={pay} disabled={busy} className="btn-primary w-full disabled:opacity-60" data-testid="pay-btn"><Lock className="h-4 w-4" /> Request access</button>
                      <div className="text-[12px] text-[#667085] text-center">Online payment opens soon. We'll confirm your subscription and share payment details.</div>
                    </>
                  )}
                  <div className="text-[12px] text-[#667085] text-center">UPI, cards and net banking · secured by Razorpay</div>
                </div>
              )}
            </Row>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Loader2, Phone, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PhoneField from './PhoneField';

export default function PhoneAuthModal() {
  const { authOpen, authInvite, authNext, authFlow, closeAuth, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [demo, setDemo] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (authOpen) {
      setStep('phone'); setCode(''); setName(''); setError(''); setBusy(false);
    }
  }, [authOpen]);

  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [cooldown]);

  const sendCode = async (e) => {
    e?.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = await requestOtp(phone, authFlow);
      setDemo(!!res?.demo);
      setStep('code');
      setCooldown(30);
      toast.success(res?.demo ? 'Demo mode: use code 123456' : `OTP sent to ${phone}`);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not send code. Please try again.');
    } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e?.preventDefault();
    setError(''); setBusy(true);
    try {
      const user = await verifyOtp({ phone, code, name: name || undefined, invite_code: authInvite || undefined, flow: authFlow });
      closeAuth();
      toast.success('You are signed in');
      const dest = authNext || (user.role === 'analyst' ? '/analyst' : '/dashboard');
      navigate(dest);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Invalid or expired code');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={authOpen} onOpenChange={(o) => { if (!o) closeAuth(); }}>
      <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden" data-testid="phone-auth-modal">
        <DialogTitle className="sr-only">Sign in with your mobile number</DialogTitle>
        <DialogDescription className="sr-only">Enter your mobile number to receive a one-time code.</DialogDescription>
        <div className="grad-card px-6 py-5 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {step === 'phone' ? <Phone className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            {step === 'phone' ? (authFlow === 'partner' ? 'Partner login' : 'Get started') : 'Verify your number'}
          </div>
          <p className="mt-1 text-xs text-white/80">
            {step === 'phone'
              ? (authFlow === 'partner' ? 'Log in with the mobile number registered on your partner account.' : 'Log in or create your account with your mobile number.')
              : `We sent a 6-digit code to ${phone}`}
          </p>
        </div>

        <div className="p-6">
          {authInvite && (
            <div data-testid="modal-invite-banner" className="mb-4 rounded-xl border border-[#D8C7F1] bg-[#F7F4FB] px-3 py-2.5 text-sm">
              <span className="font-semibold text-[#5320A8]">Research analyst invitation</span>
              <span className="block text-xs text-[#526071]">You'll be onboarded as a research analyst after verification.</span>
            </div>
          )}

          {step === 'phone' ? (
            <form onSubmit={sendCode} className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wider text-[#526071]">Mobile number</label>
                <PhoneField testid="phone-input" value={phone} onChange={setPhone} autoFocus />
                <p className="mt-1.5 text-xs text-[#667085]">Pick your country and enter your mobile number.</p>
              </div>
              {error && <div data-testid="phone-auth-error" className="text-sm text-[#B91C1C]">{error}</div>}
              <button data-testid="send-otp-btn" disabled={busy || !phone} className="btn-primary w-full py-3 disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send OTP
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wider text-[#526071]">Enter OTP</label>
                <Input data-testid="otp-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required
                  placeholder="6-digit code" className="h-11 mt-1.5 tracking-[0.4em] text-center text-lg" inputMode="numeric" autoFocus />
                {demo && <p data-testid="demo-otp-hint" className="mt-1.5 text-xs font-medium text-[#5320A8]">Demo mode — enter <b>123456</b> to continue.</p>}
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-[#526071]">Your name (optional)</label>
                <Input data-testid="otp-name-input" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Full name" className="h-11 mt-1.5" />
              </div>
              {error && <div data-testid="phone-auth-error" className="text-sm text-[#B91C1C]">{error}</div>}
              <button data-testid="verify-otp-btn" disabled={busy || code.length < 4} className="btn-primary w-full py-3 disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Verify & continue
              </button>
              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={() => { setStep('phone'); setError(''); }} className="inline-flex items-center gap-1 text-[#6C2BD9] font-semibold"><ArrowLeft className="h-3.5 w-3.5" /> Change number</button>
                <button type="button" disabled={cooldown > 0 || busy} onClick={sendCode} className={`font-semibold ${cooldown > 0 ? 'text-[#667085]' : 'text-[#6C2BD9]'}`}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                </button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

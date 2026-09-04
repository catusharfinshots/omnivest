import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Loader2, Smartphone, Handshake, ShieldCheck, ChevronDown } from 'lucide-react';
import omniMark from '../assets/omnivest-mark-white.svg';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import Seo from '../components/Seo';

// One login page, three doors. Investors and partners sign in with their mobile number
// and a one-time code (the OTP modal); the email/password form is for the Omnivest team.
export default function LoginPage() {
  const { login, openAuth } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const wantsAdmin = params.get('admin') === '1' || (params.get('next') || '').startsWith('/admin');
  const [showAdmin, setShowAdmin] = useState(wantsAdmin);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const user = await login({ email, password });
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
      nav(params.get('next') || (user.role === 'admin' ? '/admin' : user.role === 'analyst' ? '/partner' : '/dashboard'));
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Invalid email or password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[80vh] grad-hero flex items-center">
      <Seo title="Log in" description="Log in to Omnivest with your mobile number." />
      <div className="container-x grid lg:grid-cols-2 gap-8 lg:gap-10 items-center py-8 lg:py-12">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <span className="h-10 w-10 rounded-xl grad-card text-white grid place-items-center"><img src={omniMark} alt="" className="h-6 w-6" /></span>
            <span className="font-[Inter] text-xl font-bold">Omnivest</span>
          </Link>
          <h1 className="mt-6 lg:mt-8 text-3xl lg:text-5xl font-bold max-w-lg">Welcome back.</h1>
          <p className="mt-3 lg:mt-4 text-[#526071] max-w-md">Log in with your mobile number — no passwords to remember.</p>
        </div>

        <div className="surface p-5 sm:p-8 shadow-[0_30px_60px_-30px_rgba(108,43,217,0.35)]" data-testid="login-card">
          <button type="button" onClick={() => openAuth({ next: params.get('next') || '/dashboard' })} className="w-full rounded-2xl border border-[#E8E1F0] hover:border-[#6C2BD9] bg-white p-4 text-left flex items-center gap-4 transition-colors" data-testid="login-investor">
            <span className="h-11 w-11 shrink-0 rounded-xl grad-card text-white grid place-items-center"><Smartphone className="h-5 w-5" /></span>
            <span className="min-w-0">
              <span className="block font-semibold text-[#1A1030]">I'm an investor</span>
              <span className="block text-sm text-[#526071]">Mobile number + one-time code. New here? Same door.</span>
            </span>
          </button>
          <button type="button" onClick={() => openAuth({ next: '/partner', flow: 'partner' })} className="mt-3 w-full rounded-2xl border border-[#E8E1F0] hover:border-[#6C2BD9] bg-white p-4 text-left flex items-center gap-4 transition-colors" data-testid="login-partner">
            <span className="h-11 w-11 shrink-0 rounded-xl bg-[#EDE9FE] text-[#5320A8] grid place-items-center"><Handshake className="h-5 w-5" /></span>
            <span className="min-w-0">
              <span className="block font-semibold text-[#1A1030]">I'm a research-analyst partner</span>
              <span className="block text-sm text-[#526071]">Your registered partner mobile number.</span>
            </span>
          </button>
          <div className="mt-4 text-center text-sm text-[#526071]">Not a partner yet? <Link to="/partner" className="font-semibold text-[#6C2BD9]">See how partnership works</Link></div>

          <div className="mt-5 pt-4 border-t border-[#EEF1F6]">
            <button type="button" onClick={() => setShowAdmin((v) => !v)} className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-[#667085] hover:text-[#6C2BD9] py-2" data-testid="login-admin-toggle">
              <ShieldCheck className="h-3.5 w-3.5" /> Omnivest team login <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdmin ? 'rotate-180' : ''}`} />
            </button>
            {showAdmin && (
              <form onSubmit={submit} className="mt-3 space-y-3" data-testid="login-admin-form">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-[#526071]">Email</Label>
                  <Input required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 mt-1.5" placeholder="you@omnivest.in" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-[#526071]">Password</Label>
                  <Input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 mt-1.5" placeholder="••••••••" />
                </div>
                <button disabled={busy} className="btn-primary w-full py-3 disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Log in</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

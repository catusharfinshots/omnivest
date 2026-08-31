import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Loader2 } from 'lucide-react';
import omniMark from '../assets/omnivest-mark-white.svg';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const user = await login({ email, password });
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
      const dest = params.get('next') || (user.role === 'admin' ? '/admin' : user.role === 'analyst' ? '/analyst' : '/dashboard');
      nav(dest);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Invalid email or password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[80vh] grad-hero flex items-center">
      <div className="container-x grid lg:grid-cols-2 gap-10 items-center py-12">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <span className="h-10 w-10 rounded-xl grad-card text-white grid place-items-center"><img src={omniMark} alt="" className="h-6 w-6" /></span>
            <span className="font-[Inter] text-xl font-bold">Omnivest</span>
          </Link>
          <h1 className="mt-8 text-4xl lg:text-5xl font-bold max-w-lg">Welcome back.</h1>
          <p className="mt-4 text-[#64748B] max-w-md">Sign in to see your model portfolios, SIPs, and holdings.</p>
        </div>

        <div className="surface p-8 shadow-[0_30px_60px_-30px_rgba(108,43,217,0.35)]">
          <h2 className="text-lg font-semibold">Log in</h2>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-[#64748B]">Email</Label>
              <Input required type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="h-11 mt-1.5" placeholder="you@company.com" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-[#64748B]">Password</Label>
              <Input required type="password" value={password} onChange={(e)=>setPassword(e.target.value)} className="h-11 mt-1.5" placeholder="••••••••" />
            </div>
            <button disabled={busy} className="btn-primary w-full py-3 disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Log in</button>
            <div className="text-sm text-center text-[#64748B]">New to Omnivest? <Link to="/signup" className="font-semibold text-[#6C2BD9]">Create an account</Link></div>
          </form>
        </div>
      </div>
    </div>
  );
}

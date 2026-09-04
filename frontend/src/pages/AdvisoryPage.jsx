import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Compass, Zap, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AdvisoryPage() {
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await axios.post(`${API}/leads`, { type: 'advisory', email, plan: plan || undefined });
      toast.success('Interest registered — our advisory team will reach out.');
      setEmail(''); setPlan('');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not register interest. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const choosePlan = (name) => {
    setPlan(name);
    toast.info(`Selected ${name} — add your email below and register interest.`);
    if (typeof document !== 'undefined') {
      const el = document.getElementById('advisory-lead');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  const tiers = [
    { name: 'Starter', price: 'Free', features: ['Weekly market digest','Basic Buy/Sell/Hold list','Community access'] },
    { name: 'Pro', price: '₹499/mo', features: ['Real-time Buy/Sell/Hold calls','Portfolio health checks','Priority support'], highlight: true },
    { name: 'Elite', price: '₹1,499/mo', features: ['1:1 research analyst calls','Custom portfolio review','Everything in Pro'] },
  ];
  return (
    <div>
      <section className="grad-hero border-b border-[#E6E8F0]">
        <div className="container-x py-16">
          <div className="eyebrow">Advisory</div>
          <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl">Buy / Sell / Hold insights in seconds</h1>
          <p className="mt-4 text-lg text-[#526071] max-w-2xl">Research-backed advisory tailored to your holdings and goals. Subscribe to a plan or register your interest.</p>
          <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FEF3C7] text-[#9A4A05] px-3 py-1 text-xs font-semibold">Phase 2 — subscriptions coming soon</span>
        </div>
      </section>

      <section className="container-x py-16 grid lg:grid-cols-3 gap-6">
        {tiers.map((t) => (
          <div key={t.name} className={`surface p-7 ${t.highlight ? 'ring-2 ring-[#6C2BD9]' : ''}`}>
            {t.highlight && <div className="chip-brand mb-3">Most popular</div>}
            <h3 className="text-lg font-semibold">{t.name}</h3>
            <div className="num mt-1 text-3xl font-bold">{t.price}</div>
            <ul className="mt-5 space-y-2 text-sm text-[#334155]">
              {t.features.map(f => <li key={f} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#0B7F4A]" /> {f}</li>)}
            </ul>
            <button onClick={()=>choosePlan(t.name)} className={`w-full mt-6 ${t.highlight ? 'btn-primary' : 'btn-outline'} py-3`}>Choose {t.name}</button>
          </div>
        ))}
      </section>

      <section className="container-x pb-20">
        <div className="surface p-8 lg:p-10 grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <Compass className="h-8 w-8 text-[#6C2BD9]" />
            <h2 className="mt-4 text-2xl font-bold">Not sure which plan?</h2>
            <p className="mt-2 text-[#526071]">Leave your email and our advisory desk will help you pick the right plan.</p>
            <div className="mt-5 flex gap-4 text-sm text-[#334155]">
              <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-[#6C2BD9]" /> Fast setup</span>
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#0B7F4A]" /> SEBI-registered</span>
            </div>
          </div>
          <form id="advisory-lead" onSubmit={submit} className="space-y-3">
            {plan && <div className="chip-brand">Selected plan: {plan}</div>}
            <Input required type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="h-12" placeholder="you@company.com" />
            <button disabled={busy} className="btn-primary w-full py-3 disabled:opacity-60">Register interest <ArrowRight className="h-4 w-4" /></button>
            <div className="text-center text-xs text-[#667085]">Or explore <Link to="/model-portfolios" className="text-[#6C2BD9] font-semibold">model portfolios</Link></div>
          </form>
        </div>
      </section>
    </div>
  );
}

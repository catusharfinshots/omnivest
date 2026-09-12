import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { User, Save, Loader2, ClipboardList, Link2, HelpCircle, MessageCircle, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBroker } from '../context/BrokerContext';
import MySubscriptions from '../components/MySubscriptions';

/** Account: who you are (name, email, phone), what you subscribe to, and every door in one place (smallcase's Account menu). */
export default function AccountPage() {
  const { user, token, isAuthed, loading, openAuth, updateProfile } = useAuth();
  const { connections, kiteExpired } = useBroker();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setName(user?.name || ''); setEmail(user?.email || ''); }, [user?.name, user?.email]);
  useEffect(() => { document.title = 'Your account | Omnivest'; if (!loading && !isAuthed) openAuth?.({ next: '/account' }); }, [loading, isAuthed, openAuth]);

  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Please enter your name'); return; }
    setBusy(true); setSaved(false);
    try { await updateProfile({ name: name.trim(), email: email.trim() || null }); setSaved(true); toast.success('Profile saved'); }
    catch (err) { toast.error(err?.response?.data?.detail?.message || err?.response?.data?.detail || 'Could not save'); }
    finally { setBusy(false); }
  };
  const dirty = (name || '') !== (user?.name || '') || (email || '') !== (user?.email || '');

  if (loading) return <div className="container-x py-24 text-center text-[#526071]">Loading…</div>;
  if (!isAuthed) return <div className="container-x py-24 text-center"><h1 className="text-2xl font-bold">Please log in</h1><button onClick={() => openAuth({ next: '/account' })} className="btn-primary mt-6 inline-flex">Log in</button></div>;

  const kite = connections.kite;
  const links = [
    { to: '/investments', icon: TrendingUp, t: 'Your investments', d: 'What you hold, checked against Zerodha' },
    { to: '/orders', icon: ClipboardList, t: 'Orders', d: 'Every order placed through Omnivest' },
    { to: '/brokers/connect', icon: Link2, t: kite ? 'Zerodha connected' : kiteExpired ? 'Zerodha login expired' : 'Connect Zerodha', d: kite ? `${kite.profile?.user_name || ''} · ${kite.profile?.user_id_kite || ''}` : 'Orders go to your own account' },
    { to: '/faq', icon: HelpCircle, t: 'FAQ', d: 'Fees, orders, rebalances, refunds' },
    { to: '/contact', icon: MessageCircle, t: 'Contact us', d: 'support@omnivest.in and the grievance process' },
  ];

  return (
    <div className="bg-[#F7F4FB] min-h-screen">
      <div className="container-x py-8 sm:py-10">
        <h1 className="font-heading text-[26px] sm:text-4xl font-bold text-[#0F1729] flex items-center gap-2"><User className="h-6 w-6 text-[#6C2BD9]" /> Your account</h1>
        <p className="text-[14px] text-[#526071] mt-1">Your details, your subscriptions, and every part of Omnivest in one place.</p>
        <div className="mt-6 grid lg:grid-cols-[1fr_320px] gap-5 items-start">
          <div className="space-y-5 min-w-0">
            <form onSubmit={save} className="surface p-5" data-testid="account-profile">
              <div className="font-semibold text-[#0F1729] text-[15px]">Profile</div>
              <div className="text-[12.5px] text-[#526071] mt-0.5">Your name appears on your orders and receipts. Email is where subscription receipts go.</div>
              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <label className="block"><span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#667085]">Name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="mt-1.5 w-full h-11 rounded-xl border border-[#E8E1F0] px-3 text-[14px] outline-none focus:border-[#6C2BD9]" placeholder="Your full name" data-testid="account-name" /></label>
                <label className="block"><span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#667085]">Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 w-full h-11 rounded-xl border border-[#E8E1F0] px-3 text-[14px] outline-none focus:border-[#6C2BD9]" placeholder="you@example.com" data-testid="account-email" /></label>
                <label className="block"><span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#667085]">Mobile</span><input value={user?.phone || ''} readOnly className="mt-1.5 w-full h-11 rounded-xl border border-[#E8E1F0] bg-[#F7F4FB] px-3 text-[14px] text-[#526071]" /><span className="text-[11.5px] text-[#667085] mt-1 block">This is your login. To change it, contact us.</span></label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button type="submit" disabled={busy || !dirty} className="btn-primary h-11 disabled:opacity-60" data-testid="account-save">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
                {saved && !dirty && <span className="text-[13px] text-[#0B7F4A] inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
              </div>
            </form>
            <div id="subscriptions"><MySubscriptions token={token} /></div>
          </div>
          <aside className="surface p-2" data-testid="account-links">
            {links.map(({ to, icon: Icon, t, d }) => (
              <Link key={to} to={to} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#F7F4FB]">
                <span className="h-9 w-9 rounded-xl bg-[#F1EDF7] text-[#6C2BD9] grid place-items-center shrink-0"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0"><span className="block text-[14px] font-semibold text-[#0F1729]">{t}</span><span className="block text-[12px] text-[#667085] truncate">{d}</span></span>
              </Link>
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Bell, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { styleOf, whenLabel, dayGroup, ctaFor } from '../lib/notify';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const TABS = [['', 'All'], ['order', 'Orders'], ['portfolio', 'Portfolios'], ['account', 'Account']];

function Switch({ on, disabled, onChange, testid }) {
  return <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange?.(!on)} className={`relative h-6 w-10 rounded-full transition-colors ${on ? 'bg-[#6C2BD9]' : 'bg-[#D9D3E3]'} ${disabled ? 'opacity-60' : ''}`} data-testid={testid}><span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all ${on ? 'left-[19px]' : 'left-[3px]'}`} /></button>;
}

/** Every notification, newest first, grouped by day, plus where the investor wants to be told. */
export default function NotificationsPage() {
  const { token, isAuthed, loading, user, openAuth } = useAuth();
  const navigate = useNavigate();
  const h = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('');
  const [prefs, setPrefs] = useState(null);

  const load = async () => {
    try { const [{ data }, p] = await Promise.all([axios.get(`${API}/notifications?limit=200`, h), axios.get(`${API}/notifications/prefs`, h).catch(() => ({ data: null }))]); setItems(data.items || []); if (p.data) setPrefs(p.data); }
    catch { setItems([]); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = 'Notifications | Omnivest'; if (!loading && !isAuthed) openAuth?.({ next: '/notifications' }); if (isAuthed) load(); }, [loading, isAuthed]);

  const ping = () => window.dispatchEvent(new Event('omnivest-notifications'));
  const markAll = async () => { try { await axios.post(`${API}/notifications/read`, { all: true }, h); } catch { /* ignore */ } setItems((xs) => (xs || []).map((x) => ({ ...x, read: true }))); ping(); };
  const openItem = async (n) => { if (!n.read) { setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: true } : x))); try { await axios.post(`${API}/notifications/read`, { ids: [n.id] }, h); } catch { /* ignore */ } ping(); } if (n.link) navigate(n.link); };
  const savePrefs = async (next) => { setPrefs((p) => ({ ...p, ...next })); try { const { data } = await axios.put(`${API}/notifications/prefs`, { ...prefs, ...next }, h); setPrefs(data); toast.success('Saved'); } catch { toast.error('Could not save'); } };

  if (loading) return <div className="container-x py-24 text-center text-[#526071]">Loading…</div>;
  if (!isAuthed) return <div className="container-x py-24 text-center"><h1 className="text-2xl font-bold">Please log in</h1><button onClick={() => openAuth({ next: '/notifications' })} className="btn-primary mt-6 inline-flex">Log in</button></div>;

  const shown = (items || []).filter((n) => !tab || n.kind === tab);
  const unread = (items || []).filter((n) => !n.read).length;
  const groups = shown.reduce((m, n) => { const g = dayGroup(n.at); (m[g] = m[g] || []).push(n); return m; }, {});

  return (
    <div className="bg-[#F7F4FB] min-h-screen">
      <div className="container-x py-8 sm:py-10">
        <div className="flex items-start justify-between gap-3">
          <div><h1 className="font-heading text-[26px] sm:text-4xl font-bold text-[#0F1729] flex items-center gap-2"><Bell className="h-6 w-6 text-[#6C2BD9]" /> Notifications</h1><p className="text-[14px] text-[#526071] mt-1">Orders, portfolio health and account events, newest first.</p></div>
          {unread > 0 && <button type="button" onClick={markAll} className="text-[13px] font-semibold text-[#5320A8] shrink-0 h-10" data-testid="notif-mark-all">Mark all read</button>}
        </div>
        <div className="flex gap-1.5 mt-4 flex-wrap">{TABS.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`h-9 px-3.5 rounded-full text-[12.5px] font-semibold border ${tab === k ? 'bg-[#1A1030] text-white border-[#1A1030]' : 'bg-white border-[#E8E1F0] text-[#334155]'}`}>{l}</button>)}</div>
        <div className="mt-4 grid lg:grid-cols-[1fr_320px] gap-5 items-start">
          <div className="surface overflow-hidden min-w-0" data-testid="notif-list">
            {items === null && <div className="p-6 text-[#667085] text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div>}
            {items && shown.length === 0 && <div className="p-10 text-center text-[13px] text-[#667085]">Nothing here yet. Order updates, portfolio health and account events will show up as they happen.</div>}
            {Object.entries(groups).map(([g, list]) => (
              <div key={g}>
                <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#667085] px-4 pt-3 pb-1 bg-[#FBFAFD]">{g}</div>
                {list.map((n) => { const [Icon, cls] = styleOf(n.type); const cta = ctaFor(n.link); return (
                  <button key={n.id} type="button" onClick={() => openItem(n)} className={`w-full text-left flex gap-3 px-4 py-3 border-t border-[#F5F2FA] relative hover:bg-[#FBFAFD] ${n.read ? '' : 'bg-[#FBFAFF]'}`} data-testid="notif-item">
                    {!n.read && <span className="absolute left-1.5 top-5 h-1.5 w-1.5 rounded-full bg-[#6C2BD9]" />}
                    <span className={`h-9 w-9 rounded-[10px] grid place-items-center shrink-0 ${cls}`}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0"><span className="block text-[13.5px] font-semibold text-[#0F1729] leading-snug">{n.title}</span>{n.body && <span className="block text-[12.5px] text-[#526071] mt-0.5 leading-relaxed">{n.body}</span>}<span className="block text-[11px] text-[#667085] mt-1">{whenLabel(n.at)}</span>{cta && <span className="inline-block mt-1 text-[12px] font-bold text-[#5320A8]">{cta} →</span>}</span>
                  </button>
                ); })}
              </div>
            ))}
          </div>
          <aside className="surface p-4 text-[13px]" data-testid="notif-prefs">
            <div className="font-semibold text-[#0F1729] text-[15px]">Where to notify me</div>
            <div className="flex items-center justify-between py-2.5 mt-1"><span>In Omnivest</span><Switch on disabled testid="pref-inapp" /></div>
            <div className="flex items-center justify-between py-2.5 border-t border-[#F5F2FA]"><span>Email {!user?.email ? <Link to="/account" className="ml-1 text-[11px] font-semibold text-[#9A4A05] bg-[#FEF3C7] rounded-full px-2 py-0.5">add your email first</Link> : <span className="ml-1 text-[11px] font-semibold text-[#9A4A05] bg-[#FEF3C7] rounded-full px-2 py-0.5">coming soon</span>}</span><Switch on={!!prefs?.email} disabled={!user?.email} onChange={(v) => savePrefs({ email: v })} testid="pref-email" /></div>
            <div className="flex items-center justify-between py-2.5 border-t border-[#F5F2FA]"><span>WhatsApp <span className="ml-1 text-[11px] font-semibold text-[#9A4A05] bg-[#FEF3C7] rounded-full px-2 py-0.5">coming soon</span></span><Switch on={!!prefs?.whatsapp} onChange={(v) => savePrefs({ whatsapp: v })} testid="pref-whatsapp" /></div>
            <p className="text-[12px] text-[#667085] mt-3 leading-relaxed">In-app is always on. Your email and WhatsApp choices are saved now and start working the day those channels go live; nothing is sent to them yet.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

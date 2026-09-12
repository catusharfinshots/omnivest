import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Bell } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useAuth } from '../context/AuthContext';
import { styleOf, whenLabel, ctaFor } from '../lib/notify';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const TABS = [['', 'All'], ['order', 'Orders'], ['portfolio', 'Portfolios'], ['account', 'Account']];

/** Header bell: unread count, a dropdown on desktop, the full page on phones. Polls every 30 s while the tab is visible. */
export default function NotificationBell({ compact = false }) {
  const { token, isAuthed } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState('');
  const [open, setOpen] = useState(false);
  const h = { headers: { Authorization: `Bearer ${token}` } };

  const load = useCallback(async () => {
    if (!token) return;
    try { const { data } = await axios.get(`${API}/notifications?limit=30`, h); setItems(data.items || []); setUnread(data.unread || 0); } catch { /* keep last */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!isAuthed) return undefined;
    load();
    const tick = () => { if (document.visibilityState === 'visible') load(); };
    const id = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    window.addEventListener('omnivest-notifications', load);        // the full page tells the bell when it marks things read
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); window.removeEventListener('omnivest-notifications', load); };
  }, [isAuthed, load]);

  const markAll = async () => { try { await axios.post(`${API}/notifications/read`, { all: true }, h); } catch { /* ignore */ } setItems((xs) => xs.map((x) => ({ ...x, read: true }))); setUnread(0); };
  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) { setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: true } : x))); setUnread((u) => Math.max(0, u - 1)); try { await axios.post(`${API}/notifications/read`, { ids: [n.id] }, h); } catch { /* ignore */ } }
    if (n.link) navigate(n.link);
  };
  if (!isAuthed) return null;

  const badge = unread > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[#B91C1C] text-white text-[11px] font-bold grid place-items-center px-1" data-testid="notif-count">{unread > 99 ? '99+' : unread}</span>;
  const btnCls = 'relative h-10 w-10 grid place-items-center rounded-full border border-[#E6E8F0] bg-white hover:border-[#6C2BD9] transition-colors';
  if (compact) return <Link to="/notifications" className={btnCls} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} data-testid="notif-bell-mobile"><Bell className="h-4 w-4 text-[#0F1729]" />{badge}</Link>;

  const shown = items.filter((n) => !tab || n.kind === tab);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={btnCls} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} data-testid="notif-bell"><Bell className="h-4 w-4 text-[#0F1729]" />{badge}</button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[420px] max-w-[calc(100vw-24px)] p-0 rounded-2xl border-[#E8E1F0] overflow-hidden" data-testid="notif-panel">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#F1EDF7]"><b className="text-[15px] text-[#0F1729]">Notifications</b>{unread > 0 && <button type="button" onClick={markAll} className="text-[12px] font-semibold text-[#5320A8]">Mark all as read</button>}</div>
        <div className="flex gap-1.5 px-3 pt-2.5">{TABS.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`h-8 px-3 rounded-full text-[12px] font-semibold border ${tab === k ? 'bg-[#1A1030] text-white border-[#1A1030]' : 'bg-white border-[#E8E1F0] text-[#334155]'}`}>{l}</button>)}</div>
        <div className="max-h-[60vh] overflow-y-auto mt-2">
          {shown.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-[#667085]">Nothing here yet. Order updates, portfolio health and account events will show up as they happen.</div>}
          {shown.map((n) => { const [Icon, cls] = styleOf(n.type); const cta = ctaFor(n.link); return (
            <button key={n.id} type="button" onClick={() => openItem(n)} className={`w-full text-left flex gap-3 px-4 py-3 border-t border-[#F5F2FA] relative hover:bg-[#FBFAFD] ${n.read ? '' : 'bg-[#FBFAFF]'}`} data-testid="notif-item">
              {!n.read && <span className="absolute left-1.5 top-5 h-1.5 w-1.5 rounded-full bg-[#6C2BD9]" />}
              <span className={`h-9 w-9 rounded-[10px] grid place-items-center shrink-0 ${cls}`}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block text-[13.5px] font-semibold text-[#0F1729] leading-snug">{n.title}</span>{n.body && <span className="block text-[12.5px] text-[#526071] mt-0.5 leading-relaxed">{n.body}</span>}<span className="block text-[11px] text-[#667085] mt-1">{whenLabel(n.at)}</span>{cta && <span className="inline-block mt-1 text-[12px] font-bold text-[#5320A8]">{cta} →</span>}</span>
            </button>
          ); })}
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#F1EDF7] text-[12px] text-[#667085]"><span>Zerodha order changes reach here within 30 s while Omnivest is open.</span><Link to="/notifications" onClick={() => setOpen(false)} className="font-semibold text-[#5320A8] shrink-0 ml-3">See all</Link></div>
      </PopoverContent>
    </Popover>
  );
}

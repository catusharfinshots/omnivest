import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
let cache = null;   // ids the current session is watching, shared by every button on the page

/** Watch / Watching toggle for a model portfolio. Guests are asked to log in first. */
export default function WatchButton({ portfolioId, watching: initial, compact = false, onChange }) {
  const { token, isAuthed, openAuth } = useAuth();
  const [on, setOn] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (initial != null) setOn(!!initial); }, [initial]);
  useEffect(() => {
    if (!isAuthed || initial != null) return;
    (async () => {
      try {
        if (!cache) { const { data } = await axios.get(`${API}/watchlist`, { headers: { Authorization: `Bearer ${token}` } }); cache = new Set(data.ids || []); }
        setOn(cache.has(portfolioId));
      } catch { /* ignore */ }
    })();
  }, [isAuthed, token, portfolioId, initial]);

  const toggle = async (e) => {
    e?.preventDefault?.(); e?.stopPropagation?.();
    if (!isAuthed) { openAuth?.({ next: window.location.pathname }); return; }
    setBusy(true);
    try {
      const h = { headers: { Authorization: `Bearer ${token}` } };
      if (on) { await axios.delete(`${API}/watchlist/${portfolioId}`, h); cache?.delete(portfolioId); setOn(false); toast('Removed from your watchlist'); onChange?.(false); }
      else { await axios.post(`${API}/watchlist/${portfolioId}`, {}, h); cache?.add(portfolioId); setOn(true); toast.success('Added to your watchlist'); onChange?.(true); }
    } catch { toast.error('Could not update your watchlist'); }
    finally { setBusy(false); }
  };
  const Icon = on ? BookmarkCheck : Bookmark;
  if (compact) return <button type="button" onClick={toggle} disabled={busy} aria-pressed={on} aria-label={on ? 'Watching' : 'Add to watchlist'} className={`h-9 w-9 grid place-items-center rounded-full border ${on ? 'bg-[#F1EDF7] border-[#D8C7F1] text-[#5320A8]' : 'bg-white border-[#E8E1F0] text-[#526071]'}`} data-testid="watch-btn"><Icon className="h-4 w-4" /></button>;
  return <button type="button" onClick={toggle} disabled={busy} aria-pressed={on} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12.5px] font-bold border ${on ? 'bg-[#F1EDF7] border-[#D8C7F1] text-[#5320A8]' : 'bg-white border-[#E8E1F0] text-[#5320A8]'}`} data-testid="watch-btn"><Icon className="h-3.5 w-3.5" /> {on ? 'Watching' : 'Watchlist'}</button>;
}

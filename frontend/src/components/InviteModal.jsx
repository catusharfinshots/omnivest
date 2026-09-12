import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { X, Copy, Check, Mail, Share2, Loader2, Gift } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** Share with friends: personal link, WhatsApp / email / share sheet, QR, counts, credits. Opened from the gift icon,
 * the Dashboard tile and the Account menu via the 'omnivest-invite' window event. */
export default function InviteModal() {
  const { token, isAuthed, openAuth } = useAuth();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const on = () => { if (!isAuthed) { openAuth?.({ next: '/dashboard?invite=1' }); return; } setOpen(true); };
    window.addEventListener('omnivest-invite', on);
    if (new URLSearchParams(window.location.search).get('invite') === '1' && isAuthed) setOpen(true);
    return () => window.removeEventListener('omnivest-invite', on);
  }, [isAuthed, openAuth]);
  useEffect(() => {
    if (!open || !token) return;
    setD(null);
    axios.get(`${API}/referrals/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => setD(r.data)).catch(() => setD({ error: true }));
  }, [open, token]);
  useEffect(() => { if (!open) return undefined; const k = (e) => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);
  if (!open) return null;

  const copy = async () => { try { await navigator.clipboard.writeText(d.link); setCopied(true); toast.success('Link copied'); setTimeout(() => setCopied(false), 1500); } catch { toast(d.link); } };
  const wa = () => window.open(`https://wa.me/?text=${encodeURIComponent(d.share_text)}`, '_blank', 'noopener');
  const mail = () => { window.location.href = `mailto:?subject=${encodeURIComponent('Try Omnivest with me')}&body=${encodeURIComponent(d.share_text)}`; };
  const more = async () => { try { if (navigator.share) await navigator.share({ title: 'Omnivest', text: d.share_text, url: d.link }); else copy(); } catch { /* cancelled */ } };
  const reward = d?.reward;

  return (
    <div className="fixed inset-0 z-[80] bg-[#0F1729]/50 flex items-end sm:items-center justify-center p-0 sm:p-5" onClick={() => setOpen(false)} data-testid="invite-modal">
      <div className="bg-white w-full sm:max-w-[560px] rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[94vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="relative bg-gradient-to-br from-[#4C1D95] via-[#6C2BD9] to-[#9F67FF] text-white px-6 pt-6 pb-5">
          <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 h-9 w-9 rounded-full bg-white/15 grid place-items-center" aria-label="Close"><X className="h-4 w-4" /></button>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80 flex items-center gap-1.5"><Gift className="h-3.5 w-3.5" /> Share with friends</div>
          <h2 className="font-heading font-bold text-[22px] mt-1.5 pr-10">Invite a friend to invest with expert portfolios</h2>
          <p className="text-[13.5px] text-white/85 mt-1.5 max-w-[420px]">Your friend signs up with your link, connects their own broker, and invests in their own account. Omnivest never holds money.</p>
          {reward?.enabled && (reward.referrer_amount > 0 || reward.friend_amount > 0) && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold" data-testid="invite-reward">
              <Gift className="h-3.5 w-3.5" /> You get {INR(reward.referrer_amount)} and your friend gets {INR(reward.friend_amount)} in subscription credit when they place a first order
            </div>
          )}
        </div>
        <div className="px-6 py-5">
          {d === null && <div className="py-8 text-center text-[13px] text-[#667085]"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Getting your link…</div>}
          {d?.error && <div className="py-8 text-center text-[13px] text-[#B91C1C]">Could not load your link. Try again in a moment.</div>}
          {d && !d.error && (
            <>
              <div className="flex items-center gap-2 rounded-2xl border border-[#E8E1F0] bg-[#FBFAFD] px-3.5 py-2.5">
                <code className="flex-1 text-[14px] font-semibold text-[#0F1729] truncate font-sans" data-testid="invite-link">{d.link.replace(/^https?:\/\//, '')}</code>
                <button type="button" onClick={copy} className="btn-outline h-9 px-3.5 text-[13px]" data-testid="invite-copy">{copied ? <Check className="h-4 w-4 text-[#0B7F4A]" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}</button>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button type="button" onClick={wa} className="h-11 rounded-full bg-[#25D366] text-white text-[13.5px] font-semibold inline-flex items-center justify-center gap-2"><Share2 className="h-4 w-4" /> WhatsApp</button>
                <button type="button" onClick={mail} className="btn-outline h-11 text-[13.5px]"><Mail className="h-4 w-4" /> Email</button>
                <button type="button" onClick={more} className="btn-outline h-11 text-[13.5px]"><Share2 className="h-4 w-4" /> More ways</button>
              </div>
              {d.qr_svg && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-4 items-center rounded-2xl border border-[#E8E1F0] p-4 text-center sm:text-left">
                  <div className="h-[120px] w-[120px] mx-auto [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: d.qr_svg }} aria-label="QR code for your invite link" />
                  <div><div className="font-semibold text-[14px] text-[#0F1729]">Or let them scan this</div><div className="text-[12.5px] text-[#526071] mt-0.5">Opens your link on their phone. Handy when you are sitting together.</div></div>
                </div>
              )}
              <div className="mt-4 grid grid-cols-3 gap-2" data-testid="invite-counts">
                {[['Invited', d.counts.invited], ['Joined', d.counts.joined], ['Invested', d.counts.invested]].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-[#F7F4FB] px-3 py-2.5"><div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#667085]">{k}</div><div className="font-heading text-[20px] font-extrabold text-[#0F1729] num">{v}</div></div>
                ))}
              </div>
              {d.credits?.balance > 0 && <div className="mt-3 rounded-xl bg-[#E3F4EB] text-[#096B3E] px-3.5 py-2.5 text-[13px] flex items-center gap-2" data-testid="invite-credits"><Gift className="h-4 w-4" /> You have <b>{INR(d.credits.balance)}</b> in subscription credit. It applies at checkout.</div>}
              <p className="text-[11.5px] text-[#667085] mt-3 leading-relaxed">Counts update as friends sign up with your link and place their first order. {reward?.note}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

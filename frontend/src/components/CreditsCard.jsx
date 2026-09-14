import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Gift, CreditCard, Loader2, Clock } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const INR = (n) => `₹${Math.abs(Number(n || 0)).toLocaleString('en-IN')}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');

/** Account → Subscription credits: balance, what is still waiting, where each credit came from and where it went. */
export default function CreditsCard({ token }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true;
    axios.get(`${API}/referrals/credits`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => alive && setD(r.data)).catch(() => alive && setD({ balance: 0, welcome: 0, entries: [] }));
    return () => { alive = false; };
  }, [token]);
  const reward = d?.reward;
  const empty = d && d.balance === 0 && d.welcome === 0 && d.entries.length === 0;

  return (
    <section className="surface p-5" data-testid="account-credits">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-[#0F1729] text-[15px] flex items-center gap-2"><Gift className="h-4 w-4 text-[#6C2BD9]" /> Subscription credits</div>
          <div className="text-[12.5px] text-[#526071] mt-0.5">Applied by themselves at checkout. Never cash, never withdrawn.</div>
        </div>
        {d && !empty && !(d.balance === 0 && d.welcome > 0) && (
          <div className="text-right shrink-0">
            <div className="font-heading font-bold text-[26px] leading-none text-[#0F1729] num" data-testid="credits-balance">{INR(d.balance)}</div>
            {d.expires_at && d.balance > 0 && <div className="text-[11.5px] text-[#667085] mt-1 inline-flex items-center gap-1"><Clock className="h-3 w-3" /> valid till {day(d.expires_at)}</div>}
          </div>
        )}
      </div>

      {!d && <div className="mt-4 text-[13px] text-[#667085] flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}

      {d?.welcome > 0 && (
        <div className="mt-4 rounded-xl bg-[#E3F4EB] text-[#096B3E] px-3.5 py-3 text-[13px] flex items-start gap-2.5" data-testid="credits-welcome">
          <Gift className="h-4 w-4 mt-0.5 shrink-0" />
          <span><b>{INR(d.welcome)} waiting.</b> {d.referrer_name ? `You joined through ${d.referrer_name}'s link. ` : ''}It unlocks on your first paid subscription or your first order, and comes off that first checkout by itself.</span>
        </div>
      )}

      {empty && (
        <div className="mt-4 rounded-xl border border-dashed border-[#E8E1F0] px-4 py-5 text-center" data-testid="credits-empty">
          <div className="text-[14px] font-semibold text-[#0F1729]">No credits yet</div>
          {reward?.enabled && reward.friend_amount > 0
            ? <div className="text-[12.5px] text-[#526071] mt-1">Invite a friend: you get {INR(reward.referrer_amount)} and they get {INR(reward.friend_amount)} when they subscribe or place a first order.</div>
            : <div className="text-[12.5px] text-[#526071] mt-1">Credits arrive from Share with friends and apply to your subscriptions.</div>}
          {reward?.enabled && reward.referrer_amount > 0 && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('omnivest-invite'))} className="mt-3 text-[13px] font-semibold text-[#6C2BD9] hover:underline inline-flex items-center gap-1.5 h-10 px-2">Share your link →</button>}
        </div>
      )}

      {d && d.entries.length > 0 && (
        <ul className="mt-4 divide-y divide-[#F1EDF7]" data-testid="credits-history">
          {d.entries.map((e, i) => (
            <li key={i} className="py-3 flex items-center gap-3">
              <span className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${e.kind === 'used' ? 'bg-[#F1EDF7] text-[#5320A8]' : 'bg-[#E3F4EB] text-[#096B3E]'}`}>{e.kind === 'used' ? <CreditCard className="h-4 w-4" /> : <Gift className="h-4 w-4" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-[#0F1729] truncate">{e.title}</span>
                <span className="block text-[12px] text-[#667085] leading-snug">{[e.sub, day(e.at)].filter(Boolean).join(' · ')}</span>
              </span>
              <span className={`num text-[14px] font-bold shrink-0 ${e.kind === 'used' ? 'text-[#0F1729]' : e.expired ? 'text-[#667085] line-through' : 'text-[#0B7F4A]'}`}>{e.kind === 'used' ? '−' : '+'}{INR(e.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

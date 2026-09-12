import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Gift, Loader2, Save } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—');

/** Admin: who is bringing whom, the reward switch and amounts, credits issued. */
export default function ReferralsAdmin({ token }) {
  const h = { headers: { Authorization: `Bearer ${token}` } };
  const [data, setData] = useState(null);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { try { const { data: d } = await axios.get(`${API}/admin/referrals`, h); setData(d); setS(d.settings); } catch { toast.error('Could not load referrals'); setData({ rows: [] }); } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);
  const save = async () => { setBusy(true); try { const { data: d } = await axios.put(`${API}/admin/referrals/settings`, s, h); setS(d); toast.success('Referral settings saved'); } catch { toast.error('Could not save'); } finally { setBusy(false); } };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Gift className="h-5 w-5 text-[#6C2BD9]" /> Share with friends</h2>
        <p className="text-sm text-[#526071] mt-1">Every customer has a personal link. Rewards are subscription credits, never cash; they apply at checkout.</p>
      </div>
      {s && (
        <div className="surface p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end" data-testid="referrals-settings">
          <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={!!s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className="h-5 w-5 accent-[#6C2BD9]" /> Rewards on</label>
          <label className="block text-xs font-semibold text-[#667085]">Referrer gets (₹)<input type="number" min="0" value={s.referrer_amount} onChange={(e) => setS({ ...s, referrer_amount: e.target.value })} className="mt-1 w-full h-10 rounded-lg border border-[#E8E1F0] px-3 text-sm text-[#0F1729]" /></label>
          <label className="block text-xs font-semibold text-[#667085]">Friend gets (₹)<input type="number" min="0" value={s.friend_amount} onChange={(e) => setS({ ...s, friend_amount: e.target.value })} className="mt-1 w-full h-10 rounded-lg border border-[#E8E1F0] px-3 text-sm text-[#0F1729]" /></label>
          <label className="block text-xs font-semibold text-[#667085]">Credit valid for (months)<input type="number" min="1" value={s.credit_months} onChange={(e) => setS({ ...s, credit_months: e.target.value })} className="mt-1 w-full h-10 rounded-lg border border-[#E8E1F0] px-3 text-sm text-[#0F1729]" /></label>
          <label className="block text-xs font-semibold text-[#667085] sm:col-span-2 lg:col-span-3">Fine print shown in the invite window<input value={s.note || ''} onChange={(e) => setS({ ...s, note: e.target.value })} className="mt-1 w-full h-10 rounded-lg border border-[#E8E1F0] px-3 text-sm text-[#0F1729]" /></label>
          <button type="button" onClick={save} disabled={busy} className="btn-primary h-10 disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
        </div>
      )}
      {data && (
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="surface p-4"><div className="text-xs font-bold uppercase tracking-wider text-[#667085]">Referrers</div><div className="text-2xl font-extrabold mt-1">{data.rows.length}</div></div>
          <div className="surface p-4"><div className="text-xs font-bold uppercase tracking-wider text-[#667085]">Friends joined · invested</div><div className="text-2xl font-extrabold mt-1">{data.rows.reduce((a, r) => a + r.joined, 0)} · {data.rows.reduce((a, r) => a + r.invested, 0)}</div></div>
          <div className="surface p-4"><div className="text-xs font-bold uppercase tracking-wider text-[#667085]">Credits issued · redeemed</div><div className="text-2xl font-extrabold mt-1">₹{Number(data.credits?.issued || 0).toLocaleString('en-IN')} · ₹{Number(data.credits?.redeemed || 0).toLocaleString('en-IN')}</div></div>
        </div>
      )}
      <div className="surface overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead><tr className="text-[11px] uppercase tracking-wider text-[#667085] bg-[#FBFAFD]"><th className="text-left px-4 py-2">Referrer</th><th className="text-left px-3 py-2">Code</th><th className="text-right px-3 py-2">Invited</th><th className="text-right px-3 py-2">Joined</th><th className="text-right px-3 py-2">Invested</th><th className="text-left px-4 py-2">Friends</th></tr></thead>
          <tbody>
            {!data && <tr><td colSpan={6} className="px-4 py-6 text-[#667085]"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</td></tr>}
            {data && data.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-[#667085]">No one has opened their invite link yet.</td></tr>}
            {data?.rows.map((r) => (
              <tr key={r.referrer.id} className="border-t border-[#F1EDF7] align-top">
                <td className="px-4 py-2.5"><div className="font-semibold text-[#0F1729]">{r.referrer.name || '—'}</div><div className="text-xs text-[#667085]">{r.referrer.phone || r.referrer.email}{r.referrer.role === 'analyst' ? ' · partner' : ''}</div></td>
                <td className="px-3 py-2.5 font-mono text-xs">{r.referrer.code}</td>
                <td className="px-3 py-2.5 text-right num">{r.invited}</td><td className="px-3 py-2.5 text-right num">{r.joined}</td><td className="px-3 py-2.5 text-right num font-semibold">{r.invested}</td>
                <td className="px-4 py-2.5 text-xs text-[#526071]">{r.friends.length === 0 ? '—' : r.friends.map((f, i) => <div key={i}>{f.name} · joined {day(f.joined_at)}{f.invested_at ? ` · invested ${day(f.invested_at)}` : ''}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

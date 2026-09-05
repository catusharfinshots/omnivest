import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Lock, Plus, RefreshCw, Search, UserCheck, XCircle, CalendarPlus, Inbox } from 'lucide-react';
import { Badge } from '../Tone';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const nice = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const PLANS = [1, 3, 6, 12];

/**
 * Admin: who has access to which paid listing. Until online payment exists, access is granted here
 * (by phone or email), extended, or revoked. Every action is written to the audit log.
 */
export default function SubscriptionsAdmin({ token }) {
  const h = { headers: { Authorization: `Bearer ${token}` } };
  const [rows, setRows] = useState([]);
  const [interest, setInterest] = useState([]);
  const [counts, setCounts] = useState({ active: 0, total: 0, interest: 0 });
  const [listings, setListings] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ user: '', portfolio_id: '', plan_months: 3, price: '', note: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data }, { data: l }] = await Promise.all([
        axios.get(`${API}/admin/subscriptions`, { ...h, params: q ? { q } : {} }),
        axios.get(`${API}/admin/portfolios`, { ...h, params: { status: 'approved' } }),
      ]);
      setRows(data.subscriptions || []); setInterest(data.interest || []); setCounts(data.counts || {});
      setListings((l.portfolios || []).filter((p) => p.subscription === 'Paid'));
    } catch { toast.error('Could not load subscriptions'); }
    finally { setLoading(false); }
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const grant = async (e) => {
    e.preventDefault();
    if (!form.user.trim() || !form.portfolio_id) { toast.error('Enter the investor and pick a listing'); return; }
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/admin/subscriptions`, { ...form, plan_months: Number(form.plan_months), price: form.price === '' ? null : Number(form.price) }, h);
      toast.success(`Granted: ${data.subscription.user?.name || form.user} · ${data.subscription.plan_months} month(s) until ${nice(data.subscription.expires_at)}`);
      setForm((f) => ({ ...f, user: '', note: '', price: '' }));
      await load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Could not grant'); }
    finally { setBusy(false); }
  };
  const revoke = async (s) => {
    const note = window.prompt(`Revoke ${s.user?.name || 'this subscriber'}'s access to ${s.listing?.name}? Add a reason (kept in the audit log):`);
    if (note === null) return;
    try { await axios.post(`${API}/admin/subscriptions/${s.id}/revoke`, { note }, h); toast.success('Revoked'); await load(); }
    catch { toast.error('Could not revoke'); }
  };
  const extend = async (s) => {
    const months = Number(window.prompt('Extend by how many months?', '1'));
    if (!months) return;
    try { const { data } = await axios.post(`${API}/admin/subscriptions/${s.id}/extend`, { months }, h); toast.success(`Now valid until ${nice(data.expires_at)}`); await load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Could not extend'); }
  };
  const grantFromInterest = (i) => { setForm({ user: i.phone || i.email || '', portfolio_id: i.portfolio_id, plan_months: i.plan_months || 3, price: '', note: 'from interest list' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="space-y-6" data-testid="subscriptions-admin">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1A1030] flex items-center gap-2"><Lock className="h-4 w-4 text-[#6C2BD9]" /> Subscriptions</h2>
          <p className="text-sm text-[#526071] mt-0.5 max-w-2xl">Who can see the stocks, weights, factsheet and subscriber-only updates of a paid listing. Until online payment is live, grant access here after the investor has paid you or the partner. Every grant, extension and revoke is logged.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <div className="rounded-xl border border-[#E8E1F0] px-3 py-2"><div className="text-[12px] text-[#667085]">Active</div><div className="num font-bold text-[#0B7F4A]">{counts.active || 0}</div></div>
          <div className="rounded-xl border border-[#E8E1F0] px-3 py-2"><div className="text-[12px] text-[#667085]">All time</div><div className="num font-bold">{counts.total || 0}</div></div>
          <div className="rounded-xl border border-[#E8E1F0] px-3 py-2"><div className="text-[12px] text-[#667085]">Waiting</div><div className="num font-bold text-[#9A4A05]">{counts.interest || 0}</div></div>
        </div>
      </div>

      <form onSubmit={grant} className="surface p-4 grid gap-3 sm:grid-cols-[1.2fr_1.4fr_auto_auto_1fr_auto] items-end" data-testid="grant-form">
        <label className="text-xs text-[#526071]">Investor (mobile or email)
          <input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} placeholder="+91 98… or name@mail.com" className="mt-1 w-full h-10 rounded-lg border border-[#E8E1F0] px-3 text-sm" data-testid="grant-user" />
        </label>
        <label className="text-xs text-[#526071]">Paid listing
          <select value={form.portfolio_id} onChange={(e) => setForm({ ...form, portfolio_id: e.target.value })} className="mt-1 w-full h-10 rounded-lg border border-[#E8E1F0] px-2 text-sm bg-white" data-testid="grant-listing">
            <option value="">Choose…</option>
            {listings.map((p) => <option key={p.id} value={p.id}>{p.name} · by {p.owner_name}</option>)}
          </select>
        </label>
        <label className="text-xs text-[#526071]">Plan
          <select value={form.plan_months} onChange={(e) => setForm({ ...form, plan_months: e.target.value })} className="mt-1 h-10 rounded-lg border border-[#E8E1F0] px-2 text-sm bg-white" data-testid="grant-plan">
            {PLANS.map((m) => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
          </select>
        </label>
        <label className="text-xs text-[#526071]">Amount paid (₹)
          <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="plan price" className="mt-1 w-28 h-10 rounded-lg border border-[#E8E1F0] px-3 text-sm num" />
        </label>
        <label className="text-xs text-[#526071]">Note
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. paid by UPI 5 Sep" className="mt-1 w-full h-10 rounded-lg border border-[#E8E1F0] px-3 text-sm" />
        </label>
        <button type="submit" disabled={busy} className="btn-primary h-10 disabled:opacity-50" data-testid="grant-btn"><Plus className="h-4 w-4" /> Grant</button>
      </form>

      {interest.length > 0 && (
        <div className="surface p-4" data-testid="interest-list">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1A1030]"><Inbox className="h-4 w-4 text-[#9A4A05]" /> Waiting to subscribe <Badge tone="warn">{interest.length}</Badge></div>
          <div className="mt-2 divide-y divide-[#EEF1F6]">
            {interest.map((i) => (
              <div key={i.id} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-medium text-[#1A1030]">{i.name || 'Investor'}</span>
                <span className="text-[#526071]">{i.phone || i.email}</span>
                <span className="text-[#526071]">wants <b>{i.portfolio_name}</b>{i.plan_months ? ` · ${i.plan_months} month plan${i.price ? ` (₹${i.price})` : ''}` : ''}</span>
                <span className="text-[12px] text-[#667085]">{nice(i.created_at)}</span>
                <button type="button" onClick={() => grantFromInterest(i)} className="ml-auto text-xs font-semibold text-[#5320A8] hover:underline"><UserCheck className="inline h-3.5 w-3.5" /> Grant this</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#667085]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone, email or listing" className="w-full h-10 rounded-lg border border-[#E8E1F0] pl-9 pr-3 text-sm" />
        </div>
        <button type="button" onClick={load} className="btn-ghost text-xs"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>

      <div className="surface overflow-x-auto">
        <table className="w-full text-sm" data-testid="subscriptions-table">
          <thead className="bg-[#F5F7FB] text-[#526071]"><tr className="text-left">
            <th className="px-4 py-3 font-medium">Investor</th><th className="px-4 py-3 font-medium">Listing</th><th className="px-4 py-3 font-medium">Plan</th>
            <th className="px-4 py-3 font-medium">Valid</th><th className="px-4 py-3 font-medium">Source</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-[#EEF1F6]">
                <td className="px-4 py-3"><div className="font-medium text-[#1A1030]">{s.user?.name || '—'}</div><div className="text-xs text-[#667085]">{s.user?.phone}{s.user?.email ? ` · ${s.user.email}` : ''}</div></td>
                <td className="px-4 py-3"><div className="text-[#1A1030]">{s.listing?.name}</div><div className="text-xs text-[#667085]">by {s.listing?.owner_name}</div></td>
                <td className="px-4 py-3 num">{s.plan_months} mo · ₹{Number(s.price || 0).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-xs text-[#526071]">{nice(s.started_at)} → <b className="text-[#1A1030]">{nice(s.expires_at)}</b>{s.note ? <div className="text-[#667085]">{s.note}</div> : null}</td>
                <td className="px-4 py-3 text-xs text-[#526071]">{s.source}{s.created_by ? <div className="text-[#667085]">{s.created_by}</div> : null}</td>
                <td className="px-4 py-3">{s.active ? <Badge tone="pos">Active</Badge> : s.status === 'cancelled' ? <Badge tone="neg">Revoked</Badge> : <Badge tone="neutral">Expired</Badge>}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {s.status !== 'cancelled' && <button type="button" onClick={() => extend(s)} className="text-xs font-semibold text-[#5320A8] hover:underline mr-3"><CalendarPlus className="inline h-3.5 w-3.5" /> Extend</button>}
                  {s.active && <button type="button" onClick={() => revoke(s)} className="text-xs font-semibold text-[#B91C1C] hover:underline" data-testid="revoke-btn"><XCircle className="inline h-3.5 w-3.5" /> Revoke</button>}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#6B6480]">No subscriptions yet. Grant the first one above once an investor has paid.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

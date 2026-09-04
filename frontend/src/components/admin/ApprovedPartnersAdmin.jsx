import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Save, BadgeCheck, UserPlus, ExternalLink } from 'lucide-react';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Feature 4 — the Managers directory is driven by approved partner applications.
// This admin view reads the DB-backed list (NOT mock data) so an approved partner
// (e.g. Tushar) appears here immediately, with fields carried over from their form.
export default function ApprovedPartnersAdmin({ token }) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const [rows, setRows] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const load = () => {
    axios.get(`${API}/admin/managers`, auth)
      .then(({ data }) => setRows(data.managers || []))
      .catch(() => toast.error('Could not load approved partners'));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (id, field, value) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const save = async (r) => {
    setSavingId(r.id);
    try {
      const { data } = await axios.put(`${API}/admin/managers/${r.id}`, {
        firm: r.firm || '',
        sebi_reg: r.sebiReg || '',
        philosophy: r.philosophy || '',
        description: r.description || '',
        logo: r.logo || '',
        active: r.active,
      }, auth);
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...data } : x)));
      toast.success('Saved');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not save');
    } finally {
      setSavingId(null);
    }
  };

  if (rows === null) return <div className="text-sm text-[#6B6480]">Loading approved partners…</div>;

  if (rows.length === 0) {
    return (
      <section className="surface p-10 text-center" data-testid="approved-partners-empty">
        <div className="h-12 w-12 mx-auto rounded-xl bg-[#F1E7FE] text-[#6C2BD9] grid place-items-center"><UserPlus className="h-6 w-6" /></div>
        <h2 className="mt-4 text-lg font-semibold text-[#1A1030]">No approved partners yet</h2>
        <p className="mt-1 text-sm text-[#6B6480] max-w-md mx-auto">
          Partners appear here automatically once you approve their application in the
          <span className="font-semibold text-[#5320A8]"> Partner applications</span> tab.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-testid="approved-partners-admin">
      <p className="text-xs text-[#6B6480]">
        Every approved partner is listed here with details carried over from their application.
        Approving a partner adds them instantly; rejecting one hides them. Edit the public-facing details below.
      </p>
      {rows.map((r) => (
        <div key={r.id} data-testid={`partner-row-${r.id}`} className={`surface p-5 ${r.active ? '' : 'opacity-70'}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl grad-card text-white grid place-items-center text-sm font-bold">{r.logo}</div>
              <div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-[#1A1030]">
                  {r.name} <BadgeCheck className="h-4 w-4 text-[#0B7F4A]" />
                  {r.applicantType && <span className="text-[12px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[#EDE9FE] text-[#5320A8]">{r.applicantType}</span>}
                </div>
                <div className="text-xs text-[#6B6480]">{r.baskets} live {r.baskets === 1 ? 'basket' : 'baskets'}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a href={`/manager/${r.id}`} target="_blank" rel="noreferrer" className="text-xs text-[#6C2BD9] inline-flex items-center gap-1 hover:underline">View public page <ExternalLink className="h-3.5 w-3.5" /></a>
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" data-testid={`partner-active-${r.id}`} className="h-4 w-4 accent-[#6C2BD9]" checked={!!r.active} onChange={(e) => patch(r.id, 'active', e.target.checked)} />
                {r.active ? <span className="chip-brand">Active</span> : <span className="chip">Hidden</span>}
              </label>
            </div>
          </div>

          <div className="mt-4 grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] uppercase tracking-wider text-[#667085] font-semibold">Firm / entity</label>
              <Input value={r.firm || ''} onChange={(e) => patch(r.id, 'firm', e.target.value)} className="h-9 mt-1" placeholder="Firm name" />
            </div>
            <div>
              <label className="text-[12px] uppercase tracking-wider text-[#667085] font-semibold">SEBI Reg. no.</label>
              <Input value={r.sebiReg || ''} onChange={(e) => patch(r.id, 'sebiReg', e.target.value)} className="h-9 mt-1" placeholder="INA000000000" />
            </div>
            <div>
              <label className="text-[12px] uppercase tracking-wider text-[#667085] font-semibold">Logo initials</label>
              <Input value={r.logo || ''} onChange={(e) => patch(r.id, 'logo', e.target.value.slice(0, 3).toUpperCase())} className="h-9 mt-1" placeholder="AB" />
            </div>
            <div>
              <label className="text-[12px] uppercase tracking-wider text-[#667085] font-semibold">Philosophy (short)</label>
              <Input value={r.philosophy || ''} onChange={(e) => patch(r.id, 'philosophy', e.target.value)} className="h-9 mt-1" placeholder="e.g. Long-term compounding with quality" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[12px] uppercase tracking-wider text-[#667085] font-semibold">Description / strategy</label>
              <Textarea value={r.description || ''} onChange={(e) => patch(r.id, 'description', e.target.value)} className="mt-1 min-h-[64px]" placeholder="Describe the partner's approach" />
            </div>
          </div>

          <div className="mt-3">
            <button onClick={() => save(r)} disabled={savingId === r.id} data-testid={`partner-save-${r.id}`} className="btn-primary">
              <Save className="h-4 w-4" /> {savingId === r.id ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

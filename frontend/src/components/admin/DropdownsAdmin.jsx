import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';
import { Input } from '../ui/input';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LABELS = {
  strategy: 'Category (strategy)',
  tags: 'Style tags (partners pick up to N)',
  rebalanceFreq: 'Rebalance frequency',
  subscription: 'Subscription types',
  constituentType: 'Constituent type',
  risk: 'Risk labels (legacy — volatility is computed now)',
};
const ORDER = ['strategy', 'tags', 'rebalanceFreq', 'subscription', 'constituentType', 'risk'];

export default function DropdownsAdmin({ token }) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const [opts, setOpts] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/listing-options`).then(({ data }) => setOpts(data.options)).catch(() => toast.error('Could not load options'));
  }, []);

  const setVal = (field, i, val) => setOpts((o) => { const a = [...o[field]]; a[i] = val; return { ...o, [field]: a }; });
  const addVal = (field) => setOpts((o) => ({ ...o, [field]: [...o[field], ''] }));
  const removeVal = (field, i) => setOpts((o) => ({ ...o, [field]: o[field].filter((_, j) => j !== i) }));

  const save = async () => {
    const cleaned = {};
    for (const f of ORDER) {
      const vals = (opts[f] || []).map((v) => v.trim()).filter(Boolean);
      if (!vals.length) { toast.error(`${LABELS[f]} needs at least one option`); return; }
      cleaned[f] = vals;
    }
    setBusy(true);
    try {
      const { data } = await axios.put(`${API}/admin/listing-options`, cleaned, auth);
      setOpts(data.options);
      toast.success('Dropdown options saved');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not save'); }
    finally { setBusy(false); }
  };

  if (!opts) return <div className="text-sm text-[#6B6480]">Loading options…</div>;

  return (
    <section className="surface p-6 space-y-6" data-testid="dropdowns-admin">
      <p className="text-xs text-[#6B6480]">These options appear in the partner's listing form (category, style tags, rebalance frequency…). Changes apply to new selections immediately after saving.</p>
      <div className="grid md:grid-cols-2 gap-6">
        {ORDER.map((field) => (
          <div key={field} className="rounded-xl border border-[#E8E1F0] bg-white p-4" data-testid={`option-group-${field}`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{LABELS[field]}</div>
              <button onClick={() => addVal(field)} data-testid={`add-option-${field}`} className="btn-ghost text-xs"><Plus className="h-3.5 w-3.5" /> Add</button>
            </div>
            <div className="mt-3 space-y-2">
              {opts[field].map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={v} onChange={(e) => setVal(field, i, e.target.value)} className="h-9" placeholder="Option label" />
                  <button onClick={() => removeVal(field, i)} disabled={opts[field].length <= 1} className={`h-8 w-8 grid place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2] ${opts[field].length <= 1 ? 'opacity-40 cursor-not-allowed' : ''}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button onClick={save} disabled={busy} data-testid="save-dropdowns-btn" className="btn-primary"><Save className="h-4 w-4" /> Save dropdown options</button>
    </section>
  );
}

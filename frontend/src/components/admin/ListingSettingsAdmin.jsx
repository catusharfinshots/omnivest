import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Save, Loader2, RefreshCw, Upload, Database, ShieldCheck, IndianRupee, Sparkles } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import DropdownsAdmin from './DropdownsAdmin';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const nice = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const LIST_KINDS = [['nifty100', 'NIFTY 100 → Large cap'], ['midcap150', 'NIFTY Midcap 150 → Mid cap'], ['smallcap250', 'NIFTY Smallcap 250 → Small cap'], ['microcap250', 'NIFTY Microcap 250 → Micro cap'], ['nifty500', 'NIFTY 500 (industry only)']];

function Num({ label, value, onChange, hint, suffix, min = 0, max }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 flex items-center gap-2">
        <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} className="h-10" />
        {suffix && <span className="text-xs text-[#6B6480] whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <div className="mt-1 text-[11px] text-[#94A3B8]">{hint}</div>}
    </div>
  );
}

// Admin: everything that shapes a partner's listing — dropdown options, submit rules,
// commercial terms, and the NSE classification data behind cap/sector splits.
export default function ListingSettingsAdmin({ token }) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const [rules, setRules] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cls, setCls] = useState(null);
  const [clsBusy, setClsBusy] = useState(false);
  const [uploadKind, setUploadKind] = useState('nifty100');

  const loadCls = async () => { try { const { data } = await axios.get(`${API}/admin/classification/status`, auth); setCls(data); } catch { setCls(null); } };
  useEffect(() => {
    axios.get(`${API}/listing-rules`).then(({ data }) => setRules(data)).catch(() => toast.error('Could not load rules'));
    loadCls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const saveRules = async () => {
    setBusy(true);
    try {
      const payload = { ...rules, plan_durations: String(rules.plan_durations).split(',').map((x) => Number(x)).filter((x) => x > 0) };
      const { data } = await axios.put(`${API}/admin/listing-rules`, payload, auth);
      setRules(data);
      toast.success('Listing rules saved — they apply to the next submit');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not save rules'); }
    finally { setBusy(false); }
  };
  const refreshCls = async () => {
    setClsBusy(true);
    try {
      const { data } = await axios.post(`${API}/admin/classification/refresh`, {}, auth);
      toast.success(`Fetched ${Object.values(data.fetched || {}).reduce((a, b) => a + b, 0)} rows from NSE${data.errors?.length ? ` (${data.errors.length} list(s) failed)` : ''}`);
      await loadCls();
    } catch (e) { toast.error(e?.response?.data?.detail || 'NSE fetch failed — upload the CSVs instead'); }
    finally { setClsBusy(false); }
  };
  const uploadCls = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setClsBusy(true);
    try {
      const fd = new FormData(); fd.append('kind', uploadKind); fd.append('file', file);
      const { data } = await axios.post(`${API}/admin/classification/upload`, fd, auth);
      toast.success(`${data.rows} symbols loaded for ${uploadKind}`);
      await loadCls();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Upload failed'); }
    finally { setClsBusy(false); }
  };

  const set = (k, v) => setRules((r) => ({ ...r, [k]: v }));

  return (
    <div className="space-y-6" data-testid="listing-settings">
      {/* Rules */}
      <section className="surface p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#6C2BD9]" /> Listing rules</div>
            <div className="text-xs text-[#6B6480] mt-0.5">Enforced when a partner submits. Existing live listings are not affected until they are edited.</div>
          </div>
          <button onClick={saveRules} disabled={busy || !rules} className="btn-primary text-xs" data-testid="rules-save">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save rules</button>
        </div>
        {!rules ? <div className="mt-4 text-sm text-[#6B6480]">Loading…</div> : (
          <div className="mt-5 grid md:grid-cols-3 gap-4">
            <Num label="Minimum constituents" value={rules.min_constituents} onChange={(v) => set('min_constituents', v)} min={1} />
            <Num label="Maximum constituents" value={rules.max_constituents} onChange={(v) => set('max_constituents', v)} min={1} />
            <Num label="Max weight per stock" value={rules.max_weight_pct} onChange={(v) => set('max_weight_pct', v)} suffix="%" min={1} max={100} hint="Concentration cap. smallcase-style baskets typically stay under 50%." />
            <Num label="Max style tags" value={rules.max_tags} onChange={(v) => set('max_tags', v)} min={1} max={10} />
            <Num label="Pitch length" value={rules.max_subtitle_words} onChange={(v) => set('max_subtitle_words', v)} suffix="words" min={5} max={60} />
            <div>
              <Label>Requirements</Label>
              <div className="mt-2 space-y-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="h-4 w-4 accent-[#6C2BD9]" checked={!!rules.factsheet_pdf_required} onChange={(e) => set('factsheet_pdf_required', e.target.checked)} /> Factsheet PDF mandatory</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="h-4 w-4 accent-[#6C2BD9]" checked={rules.allow_video !== false} onChange={(e) => set('allow_video', e.target.checked)} /> Allow intro video links</label>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Commercial terms */}
      {rules && (
        <section className="surface p-6">
          <div className="text-sm font-semibold flex items-center gap-2"><IndianRupee className="h-4 w-4 text-[#6C2BD9]" /> Subscription & partner economics</div>
          <div className="text-xs text-[#6B6480] mt-0.5">Shown to partners on the pricing step. Until the payments engine exists, “Subscribe” collects investor interest only.</div>
          <div className="mt-5 grid md:grid-cols-3 gap-4">
            <div>
              <Label>Plan durations offered</Label>
              <Input value={Array.isArray(rules.plan_durations) ? rules.plan_durations.join(', ') : rules.plan_durations} onChange={(e) => set('plan_durations', e.target.value)} className="mt-1.5 h-10" placeholder="1, 3, 6, 12" />
              <div className="mt-1 text-[11px] text-[#94A3B8]">Months, comma-separated.</div>
            </div>
            <Num label="Minimum plan price" value={rules.min_plan_price} onChange={(v) => set('min_plan_price', v)} suffix="₹" min={0} />
            <Num label="Omnivest platform share" value={rules.platform_fee_pct} onChange={(v) => set('platform_fee_pct', v)} suffix="% of subscription revenue" min={0} max={100} hint="0% = Founding Partner offer (partners keep 100%)." />
            <div>
              <Label>Founding-partner window ends</Label>
              <Input type="date" value={rules.founding_partner_until || ''} onChange={(e) => set('founding_partner_until', e.target.value)} className="mt-1.5 h-10" />
              <div className="mt-1 text-[11px] text-[#94A3B8]">Leave blank for open-ended. Shown as a badge to partners.</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7] p-3 text-xs text-[#166534] flex gap-2"><Sparkles className="h-4 w-4 shrink-0 mt-0.5" /> Partners currently see: “Omnivest's platform share is {rules.platform_fee_pct}% — you keep {100 - Number(rules.platform_fee_pct || 0)}% of subscription revenue{rules.founding_partner_until ? ` for listings launched before ${rules.founding_partner_until}` : ''}.”</div>
        </section>
      )}

      {/* Classification data */}
      <section className="surface p-6" data-testid="classification-admin">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2"><Database className="h-4 w-4 text-[#6C2BD9]" /> Market-cap & sector data</div>
            <div className="text-xs text-[#6B6480] mt-0.5">NSE index constituent lists power the holdings distribution on every listing. Refresh after each index reshuffle (NSE rebalances in March and September).</div>
          </div>
          <button onClick={refreshCls} disabled={clsBusy} className="btn-outline text-xs" data-testid="classification-refresh">{clsBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Fetch from NSE</button>
        </div>
        <div className="mt-4 grid sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-[#F8FAFC] p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Status</div><div className={`mt-1 text-lg font-bold ${cls?.loaded ? 'text-[#0E9F5E]' : 'text-[#DC2626]'}`}>{cls?.loaded ? 'Loaded' : 'Not loaded'}</div><div className="text-[11px] text-[#94A3B8]">{cls?.loaded ? `${cls.symbols} symbols · ${cls.source === 'nse' ? 'fetched from NSE' : 'uploaded CSVs'}` : 'Listings show "Other" until loaded'}</div></div>
          <div className="rounded-xl bg-[#F8FAFC] p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Last updated</div><div className="mt-1 text-lg font-bold text-[#1A1030]">{nice(cls?.fetched_at)}</div></div>
          <div className="rounded-xl bg-[#F8FAFC] p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Lists</div><div className="mt-1 text-[11px] text-[#4B4560] space-y-0.5">{LIST_KINDS.map(([k, l]) => <div key={k} className="flex justify-between"><span>{l.split(' →')[0]}</span><b>{cls?.lists?.[k] ?? '—'}</b></div>)}</div></div>
        </div>
        <div className="mt-4 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-[#6B6480]">If NSE blocks the server, upload the CSV from nseindia.com → Indices → constituent lists:</span>
          <select value={uploadKind} onChange={(e) => setUploadKind(e.target.value)} className="h-8 rounded-lg border border-[#E8E1F0] px-2 text-xs bg-white">{LIST_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <label className="btn-ghost text-xs cursor-pointer inline-flex items-center gap-1"><Upload className="h-3.5 w-3.5" /> Upload CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={uploadCls} disabled={clsBusy} /></label>
        </div>
      </section>

      {/* Dropdown options */}
      <div>
        <div className="text-sm font-semibold mb-2">Form dropdown options</div>
        <DropdownsAdmin token={token} />
      </div>
    </div>
  );
}

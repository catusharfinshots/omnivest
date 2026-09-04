import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Admin controls for what partners see on their dashboard (Overview tab of
// the analyst console): tiles, nudges + thresholds, and an announcement.
export default function PartnerDashboardAdmin({ token }) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/partner-dashboard/settings`).then(({ data }) => setS(data.settings)).catch(() => toast.error('Could not load dashboard settings'));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await axios.put(`${API}/admin/partner-dashboard/settings`, s, auth);
      setS(data.settings);
      toast.success('Partner dashboard settings saved');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not save'); }
    finally { setBusy(false); }
  };

  if (!s) return <div className="text-sm text-[#6B6480]">Loading dashboard settings…</div>;

  const Toggle = ({ label, desc, checked, onChange, testid }) => (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-[#F1E7FE] last:border-0">
      <div>
        <div className="text-sm font-medium text-[#1A1030]">{label}</div>
        {desc && <div className="text-xs text-[#6B6480]">{desc}</div>}
      </div>
      <Switch data-testid={testid} checked={!!checked} onCheckedChange={onChange} />
    </div>
  );

  return (
    <section className="surface p-6 space-y-6" data-testid="partner-dashboard-admin">
      <div>
        <div className="text-sm font-semibold">Partner dashboard controls</div>
        <div className="text-xs text-[#6B6480] mt-0.5">What every partner sees on the Overview tab of their console. Saved separately from page content.</div>
      </div>

      <div>
        <Toggle testid="pd-enabled" label="Dashboard enabled" desc="Turn the Overview tab on or off for all partners." checked={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} />
        <div className="mt-3">
          <Label>Default window</Label>
          <select value={s.defaultWindowDays} onChange={(e) => setS({ ...s, defaultWindowDays: Number(e.target.value) })}
            className="mt-1.5 h-10 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm" data-testid="pd-window">
            {[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </div>
      </div>

      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-[#667085] mb-1">Metric tiles</div>
        <Toggle label="Portfolio views" checked={s.tiles.views} onChange={(v) => setS({ ...s, tiles: { ...s.tiles, views: v } })} />
        <Toggle label="Listing impressions" checked={s.tiles.impressions} onChange={(v) => setS({ ...s, tiles: { ...s.tiles, impressions: v } })} />
        <Toggle label="Invest clicks" checked={s.tiles.investClicks} onChange={(v) => setS({ ...s, tiles: { ...s.tiles, investClicks: v } })} />
        <Toggle label="View → invest conversion" checked={s.tiles.conversion} onChange={(v) => setS({ ...s, tiles: { ...s.tiles, conversion: v } })} />
      </div>

      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-[#667085] mb-1">Growth nudges</div>
        <Toggle testid="pd-nudges" label="Show nudges" desc="Actionable suggestions computed from each partner's listings." checked={s.nudges.enabled} onChange={(v) => setS({ ...s, nudges: { ...s.nudges, enabled: v } })} />
        <div className="grid sm:grid-cols-2 gap-4 mt-3">
          <div>
            <Label>“Stale listing” after (days)</Label>
            <Input type="number" min={1} max={365} value={s.nudges.staleDays} onChange={(e) => setS({ ...s, nudges: { ...s.nudges, staleDays: Number(e.target.value) } })} className="h-10 mt-1.5" data-testid="pd-stale-days" />
          </div>
          <div>
            <Label>“Unsubmitted draft” after (days)</Label>
            <Input type="number" min={1} max={365} value={s.nudges.draftDays} onChange={(e) => setS({ ...s, nudges: { ...s.nudges, draftDays: Number(e.target.value) } })} className="h-10 mt-1.5" data-testid="pd-draft-days" />
          </div>
        </div>
      </div>

      <div>
        <Label>Announcement to all partners <span className="font-normal text-[#667085]">(optional — shown at the top of their dashboard)</span></Label>
        <Textarea rows={2} value={s.announcement || ''} onChange={(e) => setS({ ...s, announcement: e.target.value })} className="mt-1.5" placeholder="e.g. Rebalance window closes Friday — update your listings by then." data-testid="pd-announcement" />
      </div>

      <button onClick={save} disabled={busy} className="btn-primary" data-testid="pd-save"><Save className="h-4 w-4" /> {busy ? 'Saving…' : 'Save dashboard settings'}</button>
    </section>
  );
}

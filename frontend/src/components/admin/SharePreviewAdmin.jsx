import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Share2, CheckCircle2, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Admin: run the share-preview contract for every public URL (what WhatsApp / LinkedIn / X will
// show). Same check the post-deploy test runs — so a blank tile is found here, not by a partner.
export default function SharePreviewAdmin({ token }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await axios.get(`${API}/admin/share-check`, { headers: { Authorization: `Bearer ${token}` }, timeout: 180000 });
      setRes(data);
      if (data.failing === 0) toast.success(`All ${data.checked} share previews are healthy`);
      else toast.error(`${data.failing} of ${data.checked} previews need attention`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Check failed to run'); }
    finally { setBusy(false); }
  };
  return (
    <section className="surface p-6" data-testid="share-preview-admin">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2"><Share2 className="h-4 w-4 text-[#6C2BD9]" /> Share previews</div>
          <div className="text-xs text-[#6B6480] mt-0.5">Checks every public page, live listing and manager the way WhatsApp does: title, description, link and a working image on omnivest.in. Run it after any change to pages or listings.</div>
        </div>
        <button onClick={run} disabled={busy} className="btn-primary text-xs" data-testid="share-check-run">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />} {busy ? 'Checking…' : 'Run check'}</button>
      </div>
      {res && (
        <div className="mt-4">
          <div className={`rounded-lg px-3 py-2 text-xs font-semibold inline-flex items-center gap-2 ${res.failing === 0 ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}`}>
            {res.failing === 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {res.failing === 0 ? `All ${res.checked} previews healthy` : `${res.failing} of ${res.checked} need attention`} · origin {res.origin}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs" data-testid="share-check-table">
              <thead><tr className="text-left text-[12px] uppercase tracking-wider text-[#667085] border-b border-[#E8E1F0]"><th className="py-2 pr-3">Page</th><th className="py-2 pr-3">Preview title</th><th className="py-2 pr-3">Status</th><th className="py-2"></th></tr></thead>
              <tbody>
                {res.results.map((r, i) => (
                  <tr key={i} className="border-b border-[#F1EBF9]">
                    <td className="py-2 pr-3"><div className="font-semibold text-[#1A1030]">{r.label}</div><div className="text-[#667085]">{r.route}{r.direct ? ' (address-bar URL)' : ''}</div></td>
                    <td className="py-2 pr-3 text-[#4B4560] max-w-[280px] truncate">{r.title || '—'}</td>
                    <td className={`py-2 pr-3 ${r.ok ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'}`}>{r.ok ? 'OK' : r.issues.join('; ')}</td>
                    <td className="py-2 text-right">{r.image && <a href={r.image} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#6C2BD9] hover:underline"><ExternalLink className="h-3 w-3" /> image</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

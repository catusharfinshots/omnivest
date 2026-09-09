import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Scale, Save, RotateCcw, ExternalLink, AlertTriangle, Loader2, Building2 } from 'lucide-react';
import RichTextEditor from '../partner/RichTextEditor';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const DOCS = [['legalTerms', 'terms', 'Terms of Service'], ['legalPrivacy', 'privacy', 'Privacy Policy'], ['legalRefunds', 'refunds', 'Refund Policy']];
const FIELDS = [
  ['legalName', 'Legal name', 'Tushar Sukhija (sole proprietor)'], ['brand', 'Brand', 'Omnivest'],
  ['entityType', 'Entity type', 'sole proprietorship'], ['registrationNo', 'Registration no. (GSTIN / Udyam, optional)', ''],
  ['registeredAddress', 'Registered / business address', 'Flat, street, city, state, PIN'],
  ['supportEmail', 'Support email', 'support@omnivest.in'], ['supportPhone', 'Support phone (optional)', '+91 …'],
  ['supportHours', 'Support hours (optional)', 'Mon–Fri, 10:00–18:00 IST'],
  ['grievanceOfficer', 'Grievance officer', 'Tushar Sukhija'], ['grievanceEmail', 'Grievance officer email', 'tushar@omnivest.in'],
  ['sebiRegistration', 'SEBI Research Analyst registration no. (INH...)', 'INH000000000'], ['raasbNo', 'RAASB / BSE enlistment no. (optional)', ''],
];
const TOKENS = ['{{legalName}}', '{{brand}}', '{{registeredAddress}}', '{{supportEmail}}', '{{supportPhone}}', '{{grievanceOfficer}}', '{{grievanceEmail}}'];

/**
 * Legal & company: the facts that fill every legal page and the checkout merchant block, plus the three
 * documents themselves. Documents left empty use Omnivest's built-in text; {{tokens}} are filled at render.
 */
export default function LegalAdmin({ token }) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const [details, setDetails] = useState(null);
  const [docs, setDocs] = useState({ legalTerms: '', legalPrivacy: '', legalRefunds: '' });
  const [updated, setUpdated] = useState('');
  const [missing, setMissing] = useState([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  const load = async () => {
    const [{ data: c }, { data: l }] = await Promise.all([axios.get(`${API}/content`), axios.get(`${API}/legal`)]);
    setDetails({ ...l.details, ...(c.platformDetails || {}), registrationNo: (c.platformDetails || {}).registrationNo || (c.platformDetails || {}).cin || '' });
    setDocs({ legalTerms: c.legalTerms || '', legalPrivacy: c.legalPrivacy || '', legalRefunds: c.legalRefunds || '' });
    setUpdated(c.legalUpdated || l.updated || '');
    setMissing(l.missing || []);
  };
  useEffect(() => { load().catch(() => toast.error('Could not load legal settings')); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const save = async (stamp = true) => {
    setBusy(true);
    try {
      const legalUpdated = stamp ? new Date().toISOString().slice(0, 10) : updated;
      await axios.put(`${API}/content`, { platformDetails: details, ...docs, legalUpdated }, auth);
      await load();
      toast.success('Legal pages saved. They are live now: Terms, Privacy, Refunds and Contact all read from these details.');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not save'); }
    finally { setBusy(false); }
  };

  if (!details) return <div className="surface p-6 text-sm text-[#667085]"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading legal settings…</div>;

  return (
    <section className="surface p-6 mt-4 space-y-6" data-testid="legal-admin">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2"><Scale className="h-4 w-4 text-[#6C2BD9]" /> Legal pages & company details</div>
          <div className="text-xs text-[#6B6480] mt-0.5">One set of facts fills Terms, Privacy, Refunds, Contact and the "merchant of record" block investors sign at checkout. Last updated {updated || '—'}.</div>
        </div>
        <div className="flex gap-2">
          {DOCS.map(([, slug, label]) => <a key={slug} href={`/${slug}`} target="_blank" rel="noreferrer" className="btn-ghost text-xs"><ExternalLink className="h-3.5 w-3.5" /> {label.split(' ')[0]}</a>)}
          <a href="/contact" target="_blank" rel="noreferrer" className="btn-ghost text-xs"><ExternalLink className="h-3.5 w-3.5" /> Contact</a>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="rounded-xl bg-[#FEF3C7] text-[#9A4A05] text-xs px-3 py-2 flex items-start gap-2" data-testid="legal-missing"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Still missing: <b>{missing.map((m) => (FIELDS.find(([k]) => k === m) || [m, m])[1]).join(', ')}</b>. The pages skip the sentence that needs it, but Razorpay's live-activation review and Indian law expect a business address on the Privacy page.</span></div>
      )}

      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-[#667085] flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Company details</div>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {FIELDS.map(([k, label, ph]) => (
            <label key={k} className={`block text-[12px] text-[#526071] ${k === 'registeredAddress' ? 'sm:col-span-2' : ''}`}>{label}
              <input value={details[k] || ''} onChange={(e) => setDetails({ ...details, [k]: e.target.value })} placeholder={ph} className="mt-1 w-full h-10 rounded-lg border border-[#E8E1F0] px-3 text-[14px] bg-white" data-testid={`legal-${k}`} />
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-[#667085]">Documents</div>
        <p className="text-xs text-[#6B6480] mt-1">Each document uses Omnivest's built-in text until you edit it here. You can paste your lawyer's version; these placeholders are filled automatically: <code className="text-[11px]">{TOKENS.join(' ')}</code>.</p>
        <div className="mt-3 space-y-3">
          {DOCS.map(([key, slug, label]) => (
            <div key={key} className="rounded-xl border border-[#E8E1F0] bg-white">
              <button type="button" onClick={() => setOpen(open === key ? null : key)} className="w-full flex items-center justify-between px-4 h-12 text-left text-sm font-semibold" data-testid={`legal-doc-${slug}`}>
                <span>{label} <span className={`ml-2 text-[11px] font-semibold rounded-full px-2 py-0.5 ${docs[key] ? 'bg-[#EFF6FF] text-[#1D4ED8]' : 'bg-[#F1F5F9] text-[#526071]'}`}>{docs[key] ? 'Custom text' : 'Omnivest default'}</span></span>
                <span className="text-xs text-[#667085]">{open === key ? 'Hide' : 'Edit'}</span>
              </button>
              {open === key && (
                <div className="px-4 pb-4 space-y-2">
                  <RichTextEditor value={docs[key]} onChange={(v) => setDocs({ ...docs, [key]: v })} placeholder="Leave empty to use the built-in text. Paste or write the full document here to replace it." minHeight={260} testId={`legal-editor-${slug}`} />
                  {docs[key] && <button type="button" onClick={() => setDocs({ ...docs, [key]: '' })} className="btn-ghost text-xs"><RotateCcw className="h-3.5 w-3.5" /> Back to Omnivest default</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={() => save(true)} disabled={busy} className="btn-primary text-sm disabled:opacity-60" data-testid="legal-save">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save & stamp today's date</button>
        <button type="button" onClick={() => save(false)} disabled={busy} className="btn-outline text-sm disabled:opacity-60" data-testid="legal-save-nodate">Save without changing the date</button>
        <span className="text-xs text-[#667085]">Saves go live immediately (no Publish step). Investors who already signed a portfolio's terms keep the version they signed.</span>
      </div>
    </section>
  );
}

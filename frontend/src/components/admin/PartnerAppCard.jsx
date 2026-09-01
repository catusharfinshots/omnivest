import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Download, ExternalLink, ShieldAlert, ShieldCheck } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
// SEBI's public register of research analysts (intermediary type 14)
const SEBI_RA_REGISTER = 'https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=14';

const DOC_LABELS = { sebi_cert: 'SEBI certificate', nism_cert: 'NISM certificate', pan_card: 'PAN card' };

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">{label}</div>
      <div className="text-xs text-[#1A1030] break-words">{value}</div>
    </div>
  );
}

export default function PartnerAppCard({ app: a, token, onReview }) {
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && docs === null) {
      try {
        const { data } = await axios.get(`${API}/admin/partners/${a.id}/documents`, { headers: { Authorization: `Bearer ${token}` } });
        setDocs(data.documents || []);
      } catch { setDocs([]); }
    }
  };

  const download = async (doc) => {
    try {
      const res = await axios.get(`${API}/admin/partners/${a.id}/documents/${doc.id}`, {
        headers: { Authorization: `Bearer ${token}` }, responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { toast.error('Could not open the document'); }
  };

  const officer = (o) => o ? `${o.name} · ${o.email} · ${o.phone}` : '';

  return (
    <div data-testid="partner-app-row" className="rounded-xl border border-[#E8E1F0] bg-white p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#1A1030]">{a.name}</span>
            {a.applicant_type && <span data-testid="partner-applicant-type" className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#EDE9FE] text-[#5320A8]">{a.applicant_type}</span>}
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${a.status === 'pending' ? 'bg-[#FEF3C7] text-[#B45309]' : a.status === 'approved' ? 'bg-[#DCFCE7] text-[#0E9F5E]' : 'bg-[#FEE2E2] text-[#DC2626]'}`}>{a.status}</span>
            {a.disciplinary_history === true
              ? <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#DC2626]"><ShieldAlert className="h-3 w-3" /> disciplinary: yes</span>
              : a.disciplinary_history === false
                ? <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B]"><ShieldCheck className="h-3 w-3" /> disciplinary: no</span>
                : null}
          </div>
          <div className="mt-1 text-xs text-[#64748B]">{a.phone}{a.email ? ` · ${a.email}` : ''}{a.firm ? ` · ${a.firm}` : ''}{a.sebi_reg ? ` · SEBI ${a.sebi_reg}` : ''}</div>
          {a.note && <div className="mt-1.5 text-xs text-[#475569] max-w-2xl">{a.note}</div>}
          <div className="mt-1 text-[11px] text-[#94A3B8]">Applied {new Date(a.created_at).toLocaleDateString('en-IN')}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {a.status === 'pending' && (
            <>
              <button type="button" data-testid={`approve-partner-${a.id}`} onClick={() => onReview(a.id, 'approve')} className="rounded-lg bg-[#12B76A] text-white text-xs font-semibold px-3 py-2 hover:bg-[#0E9F5E]">Approve</button>
              <button type="button" data-testid={`reject-partner-${a.id}`} onClick={() => onReview(a.id, 'reject')} className="rounded-lg border border-[#FECACA] text-[#DC2626] text-xs font-semibold px-3 py-2 hover:bg-[#FEF2F2]">Reject</button>
            </>
          )}
          <button type="button" data-testid={`expand-partner-${a.id}`} onClick={toggle} className="rounded-lg border border-[#E2E8F0] text-[#475569] text-xs font-semibold px-3 py-2 hover:bg-[#F8FAFC] inline-flex items-center gap-1">
            Details {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 border-t border-[#F1EBF9] pt-4" data-testid={`partner-details-${a.id}`}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
            <Field label="Registered name" value={a.registered_name} />
            <Field label="SEBI reg. date" value={a.sebi_reg_date} />
            <Field label="RAASB/BSE enlistment" value={a.raasb_no} />
            <Field label="NISM cert. no." value={a.nism_cert_no} />
            <Field label="NISM valid till" value={a.nism_valid_till} />
            <Field label="PAN" value={a.pan} />
            <Field label="Registered address" value={a.registered_address} />
            <Field label="Principal officer" value={officer(a.principal_officer)} />
            <Field label="Compliance officer" value={officer(a.compliance_officer)} />
            <Field label="Other registrations" value={a.other_registrations} />
            <Field label="Website" value={a.website} />
            <Field label="LinkedIn" value={a.linkedin} />
            <Field label="Experience" value={a.experience_years && `${a.experience_years} yrs`} />
            <Field label="Specializations" value={a.specializations} />
            <Field label="RAASB deposit declared" value={a.raasb_deposit_confirmed ? 'Yes' : 'No'} />
            <Field label="Model-portfolio compliance declared" value={a.model_portfolio_compliance ? 'Yes' : 'No'} />
            {a.disciplinary_history === true && <Field label="Disciplinary details" value={a.disciplinary_details} />}
          </div>

          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {docs === null ? (
              <span className="text-xs text-[#94A3B8]">Loading documents…</span>
            ) : docs.length === 0 ? (
              <span className="text-xs text-[#B45309] bg-[#FEF3C7] rounded-full px-2.5 py-1 font-semibold">No documents uploaded</span>
            ) : docs.map((d) => (
              <button key={d.id} type="button" data-testid={`download-doc-${d.kind}`} onClick={() => download(d)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] text-[#475569] text-xs font-semibold px-3 py-1.5 hover:bg-[#F8FAFC]">
                <Download className="h-3.5 w-3.5" /> {DOC_LABELS[d.kind] || d.kind} <span className="text-[#94A3B8] font-normal">({Math.round(d.size / 1024)} KB)</span>
              </button>
            ))}
            <a href={SEBI_RA_REGISTER} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#F1E7FE] text-[#5320A8] text-xs font-semibold px-3 py-1.5 hover:bg-[#E9DDFB]">
              <ExternalLink className="h-3.5 w-3.5" /> Verify on SEBI register
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

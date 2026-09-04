import React, { useState, useEffect, useRef } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import PhoneField from '../components/PhoneField';
import PartnerHeader from '../components/PartnerHeader';
import PartnerFooter from '../components/PartnerFooter';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Loader2, CheckCircle2, Upload, FileCheck2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SEBI_RE = /^IN[A-Z][0-9]{9}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APPLICANT_TYPES = ['Individual', 'LLP', 'Company'];
const DOC_MAX = 5 * 1024 * 1024;
const DOC_LABELS = {
  sebi_cert: 'SEBI registration certificate',
  nism_cert: 'NISM Series-XV certificate',
  pan_card: 'PAN card',
};

const EMPTY_FORM = {
  name: '', phone: '', email: '',
  registered_name: '', firm: '', sebi_reg: '', sebi_reg_date: '', raasb_no: '',
  nism_cert_no: '', nism_valid_till: '', pan: '', registered_address: '', applicant_type: '',
  po_name: '', po_email: '', po_phone: '',
  co_name: '', co_email: '', co_phone: '',
  disciplinary_history: null, disciplinary_details: '',
  raasb_deposit_confirmed: false, other_registrations: '', model_portfolio_compliance: false,
  website: '', linkedin: '', experience_years: '', specializations: '',
  note: '', accepted_terms: false,
};

function SectionTitle({ children }) {
  return <div className="pt-2 text-[12px] font-bold uppercase tracking-wider text-[#6C2BD9]">{children}</div>;
}

function DocPicker({ kind, file, onPick }) {
  const ref = useRef(null);
  return (
    <div>
      <Label>{DOC_LABELS[kind]} * <span className="font-normal text-[#667085]">(PDF/JPG/PNG, max 5 MB)</span></Label>
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden"
        data-testid={`doc-input-${kind}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > DOC_MAX) { toast.error(`${DOC_LABELS[kind]}: file must be 5 MB or smaller.`); e.target.value = ''; return; }
          onPick(f);
        }} />
      <button type="button" data-testid={`doc-pick-${kind}`} onClick={() => ref.current?.click()}
        className={`mt-1.5 w-full h-11 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 px-3 transition-colors ${file ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#0B7F4A]' : 'border-dashed border-[#CBD5E1] bg-white text-[#526071] hover:border-[#A78BFA]'}`}>
        {file ? <FileCheck2 className="h-4 w-4 shrink-0" /> : <Upload className="h-4 w-4 shrink-0" />}
        <span className="truncate">{file ? file.name : 'Choose file'}</span>
      </button>
    </div>
  );
}

function OfficerFields({ prefix, label, form, set, setPhone }) {
  return (
    <div className="rounded-xl border border-[#EDE9FE] bg-[#FBFAFE] p-4 space-y-3">
      <div className="text-sm font-semibold text-[#1A1030]">{label} *</div>
      <div>
        <Label>Name *</Label>
        <Input data-testid={`${prefix}-name`} value={form[`${prefix}_name`]} onChange={set(`${prefix}_name`)} className="h-10 mt-1 bg-white" placeholder="Full name" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label>Email *</Label>
          <Input data-testid={`${prefix}-email`} type="email" value={form[`${prefix}_email`]} onChange={set(`${prefix}_email`)} className="h-10 mt-1 bg-white" placeholder="email@firm.com" />
        </div>
        <div>
          <Label>Mobile *</Label>
          <PhoneField testid={`${prefix}-phone`} value={form[`${prefix}_phone`]} onChange={setPhone(`${prefix}_phone`)} />
        </div>
      </div>
    </div>
  );
}

export default function PartnerApply() {
  const { user, isAuthed, loading: authLoading, token } = useAuth();
  // Pending applicants get redirected to their status view on /partner.
  const [myApp, setMyApp] = useState(undefined); // undefined=checking, null=none
  useEffect(() => {
    if (!isAuthed || !token || user?.role === 'analyst') { setMyApp(null); return; }
    axios.get(`${API}/partners/my-application`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => setMyApp(data))
      .catch(() => setMyApp(null));
  }, [isAuthed, token, user]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState({ sebi_cert: null, nism_cert: null, pan_card: null });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [terms, setTerms] = useState(null);
  // survives a partially-failed submit so document uploads can be retried
  const [appId, setAppId] = useState(null);
  const [refNo, setRefNo] = useState('');
  const [uploadedKinds, setUploadedKinds] = useState([]);

  useEffect(() => {
    axios.get(`${API}/content`).then(({ data }) => setTerms(data?.partnerTerms || null)).catch(() => setTerms(null));
  }, []);

  const resetFlow = () => {
    setForm(EMPTY_FORM);
    setFiles({ sebi_cert: null, nism_cert: null, pan_card: null });
    setDone(false); setAppId(null); setRefNo(''); setUploadedKinds([]);
    window.scrollTo({ top: 0 });
  };

  // Re-clicking any "Become a partner" link while already here pushes a new
  // history entry (same path, new key) — treat that as "start a fresh form".
  const location = useLocation();
  const locKey = useRef(location.key);
  useEffect(() => {
    if (location.key !== locKey.current) {
      locKey.current = location.key;
      if (done) resetFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setPhone = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const isFirmType = form.applicant_type === 'LLP' || form.applicant_type === 'Company';
  const emailOk = EMAIL_RE.test(form.email);
  const phoneOk = !!form.phone && isValidPhoneNumber(form.phone);
  const sebiOk = SEBI_RE.test(form.sebi_reg.trim());
  const panOk = PAN_RE.test(form.pan.trim());
  const nismExpired = form.nism_valid_till && form.nism_valid_till <= new Date().toISOString().slice(0, 10);
  const officersOk = !isFirmType || (
    form.po_name.trim() && EMAIL_RE.test(form.po_email) && form.po_phone && isValidPhoneNumber(form.po_phone) &&
    form.co_name.trim() && EMAIL_RE.test(form.co_email) && form.co_phone && isValidPhoneNumber(form.co_phone)
  );

  const addressOk = form.registered_address.trim().length >= 10;

  // Single source of truth: every unmet requirement in plain words. The submit
  // button is enabled exactly when this list is empty, and the list itself is
  // shown to the applicant so a disabled button is never a mystery.
  const missing = [
    !form.name.trim() && 'Enter your full name',
    !phoneOk && 'Enter a valid mobile number',
    !emailOk && 'Enter a valid email address',
    !form.registered_name.trim() && 'Enter your registered name (as on the SEBI certificate)',
    !sebiOk && 'Enter your SEBI reg. no. (format INH000012345)',
    !form.sebi_reg_date && 'Pick your SEBI registration date',
    !form.raasb_no.trim() && 'Enter your RAASB/BSE enlistment number',
    !form.nism_cert_no.trim() && 'Enter your NISM Series-XV certificate number',
    !form.nism_valid_till && 'Pick your NISM validity date',
    nismExpired && 'Your NISM certificate date is in the past — a valid certificate is required',
    !panOk && 'Enter a valid PAN (format ABCDE1234F)',
    !addressOk && 'Enter your complete registered office address (street, city, PIN)',
    !form.firm.trim() && 'Enter your firm / experience',
    !APPLICANT_TYPES.includes(form.applicant_type) && 'Choose what you are applying as (Individual / LLP / Company)',
    isFirmType && !officersOk && 'Complete the Principal & Compliance Officer details (name, valid email and mobile for each)',
    !files.sebi_cert && 'Upload your SEBI registration certificate',
    !files.nism_cert && 'Upload your NISM Series-XV certificate',
    !files.pan_card && 'Upload your PAN card',
    form.disciplinary_history === null && 'Answer the disciplinary-action question (Yes/No)',
    form.disciplinary_history === true && !form.disciplinary_details.trim() && 'Describe the disciplinary action you declared',
    !form.raasb_deposit_confirmed && 'Confirm the RAASB deposit declaration',
    !form.model_portfolio_compliance && 'Confirm the model-portfolio compliance declaration',
    !form.note.trim() && 'Tell us about your strategy',
    !form.accepted_terms && 'Accept the Partner Terms & Conditions',
  ].filter(Boolean);

  const valid = missing.length === 0;

  const uploadDocs = async (id, already = []) => {
    for (const kind of Object.keys(files)) {
      if (already.includes(kind)) continue;
      const fd = new FormData();
      fd.append('file', files[kind]);
      await axios.post(`${API}/partners/apply/${id}/document?kind=${kind}`, fd);
      setUploadedKinds((u) => [...u, kind]);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      let id = appId;
      if (!id) {
        const officer = (p) => ({ name: form[`${p}_name`].trim(), email: form[`${p}_email`].trim(), phone: form[`${p}_phone`] });
        const { data } = await axios.post(`${API}/partners/apply`, {
          name: form.name.trim(), phone: form.phone, email: form.email.trim(),
          registered_name: form.registered_name.trim(), firm: form.firm.trim(),
          sebi_reg: form.sebi_reg.trim().toUpperCase(), sebi_reg_date: form.sebi_reg_date,
          raasb_no: form.raasb_no.trim(), nism_cert_no: form.nism_cert_no.trim(), nism_valid_till: form.nism_valid_till,
          pan: form.pan.trim().toUpperCase(), registered_address: form.registered_address.trim(),
          applicant_type: form.applicant_type,
          principal_officer: isFirmType ? officer('po') : null,
          compliance_officer: isFirmType ? officer('co') : null,
          disciplinary_history: form.disciplinary_history === true,
          disciplinary_details: form.disciplinary_details.trim(),
          raasb_deposit_confirmed: form.raasb_deposit_confirmed,
          other_registrations: form.other_registrations.trim(),
          model_portfolio_compliance: form.model_portfolio_compliance,
          website: form.website.trim(), linkedin: form.linkedin.trim(),
          experience_years: form.experience_years.trim(), specializations: form.specializations.trim(),
          note: form.note.trim(), accepted_terms: true,
        });
        id = data.application.id;
        setAppId(id);
        setRefNo(data.application.ref_no || '');
      }
      await uploadDocs(id, uploadedKinds);
      setDone(true);
    } catch (err) {
      const msg = err?.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : (appId ? 'Document upload failed — please press Submit again to retry.' : 'Could not submit your application'));
    } finally { setBusy(false); }
  };

  if (authLoading) {
    return <div className="min-h-screen grid place-items-center text-[#6B6480]">Loading…</div>;
  }
  if (isAuthed && user?.role === 'analyst') {
    return <Navigate to="/partner" replace />;
  }

  // Pending applicants belong on /partner (their status view lives there).
  if (isAuthed && myApp && myApp.status === 'pending' && !done) {
    return <Navigate to="/partner" replace />;
  }

  const inner = done ? (
    <div className="min-h-[70vh] grid place-items-center bg-[#F7F4FB] p-6">
      <div className="surface p-10 text-center max-w-lg" data-testid="partner-success">
        <span className="h-14 w-14 mx-auto rounded-2xl bg-[#DCFCE7] text-[#0B7F4A] grid place-items-center"><CheckCircle2 className="h-7 w-7" /></span>
        <h1 className="mt-5 text-2xl font-bold">Application received</h1>
        {refNo && (
          <div className="mt-4 inline-block rounded-xl bg-[#F1E7FE] px-5 py-3" data-testid="partner-ref-no">
            <div className="text-[12px] font-bold uppercase tracking-wider text-[#7C5CAE]">Your reference number</div>
            <div className="text-xl font-bold text-[#5320A8] tracking-wide">{refNo}</div>
          </div>
        )}
        <p className="mt-4 text-sm text-[#526071]">Please save this number — quote it in any correspondence about your application.</p>
        <div className="mt-6 text-left rounded-xl border border-[#E8E1F0] bg-white p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-[#667085]">What happens next</div>
          <ol className="mt-2 space-y-1.5 text-sm text-[#475569] list-decimal list-inside">
            <li>We verify your SEBI registration, RAASB enlistment and documents.</li>
            <li>You'll hear from us — typically within <b>2–3 working days</b>.</li>
            <li>Once approved, return to <b>omnivest.in/partner</b> and choose <b>“Partner login”</b> (with this mobile number) to open your analyst console.</li>
          </ol>
        </div>
        <p className="mt-5 text-xs text-[#667085]">Questions? Write to <a className="font-semibold text-[#6C2BD9]" href={`mailto:support@omnivest.in?subject=Partner application ${refNo}`}>support@omnivest.in</a> with your reference number.</p>
        <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
          <Link to="/" className="btn-primary px-5 py-2.5 text-sm" data-testid="success-go-home">Back to homepage</Link>
          <button type="button" data-testid="success-new-application" onClick={resetFlow} className="btn-outline px-5 py-2.5 text-sm">Submit another application</button>
        </div>
      </div>
    </div>
  ) : (
    <div className="bg-[#F7F4FB]">
      <div className="container-x py-10 max-w-3xl">
        <Link to="/partner" data-testid="apply-back-link" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6C2BD9] hover:underline"><ArrowLeft className="h-4 w-4" /> Back to partner page</Link>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold leading-tight">Apply as a research analyst</h1>
        <p className="mt-2 text-sm text-[#526071] max-w-xl">Takes about ten minutes. Keep your SEBI, RAASB and NISM details plus three documents handy — <Link to="/partner#requirements" className="text-[#6C2BD9] font-medium">see the full checklist</Link>.</p>
        <div className="mt-8">
          <form onSubmit={submit} className="surface p-6 sm:p-8" data-testid="partner-form">
            <div className="space-y-4">
              <SectionTitle>Contact</SectionTitle>
              <div className="rounded-lg bg-[#FFF7ED] border border-[#FED7AA] px-3 py-2 text-xs text-[#9A3412]" data-testid="separate-number-note">
                Partner accounts use their own mobile number — a number already registered as a customer account on Omnivest can't be used here. Please use your business/professional number.
              </div>
              <div>
                <Label>Full name *</Label>
                <Input data-testid="partner-name" required value={form.name} onChange={set('name')} className="h-11 mt-1.5" placeholder="Your name" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Mobile number *</Label>
                  <PhoneField testid="partner-phone" value={form.phone} onChange={setPhone('phone')} />
                  {form.phone && !phoneOk && <p className="mt-1 text-xs text-[#B91C1C]">Enter a valid mobile number.</p>}
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input data-testid="partner-email" type="email" required value={form.email} onChange={set('email')} className="h-11 mt-1.5" placeholder="you@firm.com" />
                </div>
              </div>

              <SectionTitle>SEBI registration</SectionTitle>
              <div>
                <Label>Registered name (as on SEBI certificate) *</Label>
                <Input data-testid="partner-registered-name" required value={form.registered_name} onChange={set('registered_name')} className="h-11 mt-1.5" placeholder="e.g. XYZ Research Services LLP" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>SEBI reg. no. *</Label>
                  <Input data-testid="partner-sebi" required value={form.sebi_reg} onChange={(e) => setForm((f) => ({ ...f, sebi_reg: e.target.value.toUpperCase() }))} className="h-11 mt-1.5" placeholder="INH000012345" />
                  {form.sebi_reg && !sebiOk && <p className="mt-1 text-xs text-[#B91C1C]">Format: IN, a letter, then 9 digits (e.g. INH000012345).</p>}
                </div>
                <div>
                  <Label>Registration date *</Label>
                  <Input data-testid="partner-sebi-date" aria-label="SEBI registration date" type="date" required value={form.sebi_reg_date} onChange={set('sebi_reg_date')} className="h-11 mt-1.5" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>RAASB/BSE enlistment no. *</Label>
                  <Input data-testid="partner-raasb" required value={form.raasb_no} onChange={set('raasb_no')} className="h-11 mt-1.5" placeholder="As per BSE RAASB portal" />
                </div>
                <div>
                  <Label>PAN *</Label>
                  <Input data-testid="partner-pan" required value={form.pan} onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value.toUpperCase() }))} className="h-11 mt-1.5" placeholder="ABCDE1234F" />
                  {form.pan && !panOk && <p className="mt-1 text-xs text-[#B91C1C]">Format: 5 letters, 4 digits, 1 letter.</p>}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>NISM Series-XV cert. no. *</Label>
                  <Input data-testid="partner-nism" required value={form.nism_cert_no} onChange={set('nism_cert_no')} className="h-11 mt-1.5" placeholder="Certificate number" />
                </div>
                <div>
                  <Label>NISM valid till *</Label>
                  <Input data-testid="partner-nism-valid" aria-label="NISM certificate valid till" type="date" required value={form.nism_valid_till} onChange={set('nism_valid_till')} className="h-11 mt-1.5" />
                  {nismExpired && <p className="mt-1 text-xs text-[#B91C1C]">This certification appears expired — a valid NISM-XV is required.</p>}
                </div>
              </div>
              <div>
                <Label>Registered office address (as per SEBI records) *</Label>
                <Textarea data-testid="partner-address" required value={form.registered_address} onChange={set('registered_address')} rows={2} className="mt-1.5" placeholder="Street, area, city, state, PIN" />
                {form.registered_address.trim() && !addressOk && (
                  <p className="mt-1 text-xs text-[#B91C1C]">Please enter your complete registered address — street, city and PIN (as per SEBI records).</p>
                )}
              </div>
              <div>
                <Label>Firm / experience *</Label>
                <Input data-testid="partner-firm" required value={form.firm} onChange={set('firm')} className="h-11 mt-1.5" placeholder="e.g. 8 yrs, XYZ Capital" />
              </div>
              <div>
                <Label>Applying as *</Label>
                <div className="mt-2 grid grid-cols-3 gap-2" data-testid="partner-applicant-type" role="radiogroup">
                  {APPLICANT_TYPES.map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={form.applicant_type === t}
                      data-testid={`applicant-type-${t.toLowerCase()}`}
                      onClick={() => setForm((f) => ({ ...f, applicant_type: t }))}
                      className={`h-10 rounded-xl border text-sm font-semibold transition-colors ${form.applicant_type === t ? 'border-[#6C2BD9] bg-[#F1E7FE] text-[#5320A8]' : 'border-[#E2E8F0] bg-white text-[#475569] hover:border-[#D8C7F1]'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {isFirmType && (
                <>
                  <SectionTitle>Officers (required for {form.applicant_type})</SectionTitle>
                  <OfficerFields prefix="po" label="Principal Officer" form={form} set={set} setPhone={setPhone} />
                  <OfficerFields prefix="co" label="Compliance Officer" form={form} set={set} setPhone={setPhone} />
                </>
              )}

              <SectionTitle>Documents</SectionTitle>
              <div className="space-y-3">
                {Object.keys(DOC_LABELS).map((kind) => (
                  <DocPicker key={kind} kind={kind} file={files[kind]} onPick={(f) => setFiles((x) => ({ ...x, [kind]: f }))} />
                ))}
              </div>

              <SectionTitle>Declarations</SectionTitle>
              <div>
                <Label>Any past or pending disciplinary action by SEBI / an exchange / RAASB? *</Label>
                <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" data-testid="partner-disciplinary">
                  {[{ v: false, l: 'No' }, { v: true, l: 'Yes' }].map(({ v, l }) => (
                    <button key={l} type="button" role="radio" aria-checked={form.disciplinary_history === v}
                      data-testid={`disciplinary-${l.toLowerCase()}`}
                      onClick={() => setForm((f) => ({ ...f, disciplinary_history: v }))}
                      className={`h-10 rounded-xl border text-sm font-semibold transition-colors ${form.disciplinary_history === v ? 'border-[#6C2BD9] bg-[#F1E7FE] text-[#5320A8]' : 'border-[#E2E8F0] bg-white text-[#475569] hover:border-[#D8C7F1]'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {form.disciplinary_history === true && (
                  <Textarea data-testid="partner-disciplinary-details" value={form.disciplinary_details} onChange={set('disciplinary_details')} rows={2} className="mt-2" placeholder="Please describe the action(s), year and current status" />
                )}
              </div>
              <div>
                <Label>Other SEBI registrations held <span className="font-normal text-[#667085]">(optional — IA / PMS / broker, with numbers)</span></Label>
                <Input data-testid="partner-other-reg" value={form.other_registrations} onChange={set('other_registrations')} className="h-11 mt-1.5" placeholder="e.g. INA000001234 (Investment Adviser)" />
              </div>
              <label className="flex items-start gap-2.5 text-sm cursor-pointer" data-testid="partner-deposit-consent">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#6C2BD9]" checked={form.raasb_deposit_confirmed} onChange={(e) => setForm((f) => ({ ...f, raasb_deposit_confirmed: e.target.checked }))} />
                <span className="text-[#475569]">I confirm I maintain the deposit with a scheduled bank, lien-marked to RAASB, as required under the SEBI (Research Analysts) Regulations. *</span>
              </label>
              <label className="flex items-start gap-2.5 text-sm cursor-pointer" data-testid="partner-mp-consent">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#6C2BD9]" checked={form.model_portfolio_compliance} onChange={(e) => setForm((f) => ({ ...f, model_portfolio_compliance: e.target.checked }))} />
                <span className="text-[#475569]">I confirm my published model portfolios will comply with SEBI's guidelines for research analysts (research report, methodology, benchmarking and disclosures). *</span>
              </label>

              <SectionTitle>Profile (optional)</SectionTitle>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Website</Label>
                  <Input data-testid="partner-website" value={form.website} onChange={set('website')} className="h-11 mt-1.5" placeholder="https://…" />
                </div>
                <div>
                  <Label>LinkedIn</Label>
                  <Input data-testid="partner-linkedin" value={form.linkedin} onChange={set('linkedin')} className="h-11 mt-1.5" placeholder="https://linkedin.com/in/…" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Years of experience</Label>
                  <Input data-testid="partner-exp" value={form.experience_years} onChange={set('experience_years')} className="h-11 mt-1.5" placeholder="e.g. 8" />
                </div>
                <div>
                  <Label>Specializations</Label>
                  <Input data-testid="partner-specializations" value={form.specializations} onChange={set('specializations')} className="h-11 mt-1.5" placeholder="e.g. Midcaps, momentum, ETFs" />
                </div>
              </div>

              <SectionTitle>Your strategy</SectionTitle>
              <div>
                <Label>Tell us about your strategy *</Label>
                <Textarea data-testid="partner-note" required value={form.note} onChange={set('note')} rows={4} className="mt-1.5" placeholder="What kind of portfolios do you want to publish?" />
              </div>
              <label className="flex items-start gap-2.5 text-sm cursor-pointer" data-testid="partner-terms-consent">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#6C2BD9]" checked={form.accepted_terms} onChange={(e) => setForm((f) => ({ ...f, accepted_terms: e.target.checked }))} />
                <span className="text-[#475569]">I agree to the{' '}
                  <button type="button" data-testid="open-partner-terms" onClick={() => setTermsOpen(true)} className="font-semibold text-[#6C2BD9] underline">Partner Terms &amp; Conditions</button>
                </span>
              </label>
              {!valid && (
                <div data-testid="missing-checklist" className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
                  <div className="text-xs font-bold text-[#92400E]">Almost there — {missing.length} item{missing.length > 1 ? 's' : ''} left before you can submit:</div>
                  <ul className="mt-1.5 space-y-1 text-xs text-[#92400E] list-disc list-inside">
                    {missing.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </div>
              )}
              <button data-testid="partner-submit" disabled={busy || !valid} className="btn-primary w-full py-3 disabled:opacity-60 disabled:cursor-not-allowed">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {busy ? 'Submitting…' : 'Submit application'}
              </button>
              <p className="text-xs text-center text-[#667085]">We'll verify your registration details and get back to you. Approval unlocks your analyst console.</p>
            </div>
          </form>
        </div>

      </div>

      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="sm:max-w-[560px]" data-testid="partner-terms-modal">
          <DialogHeader>
            <DialogTitle>{terms?.title || 'Partner Terms & Conditions'}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm text-[#475569] leading-relaxed">
            {terms?.body || 'Terms & Conditions will be published here soon. By applying you agree to be contacted for review of your partner application.'}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Seo title="Partner Application" description="Apply as a SEBI-registered research analyst partner on Omnivest." />
      <PartnerHeader minimal />
      <main className="flex-1 fade-in">{inner}</main>
      <PartnerFooter />
    </div>
  );
}

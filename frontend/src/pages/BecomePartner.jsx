import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import PhoneField from '../components/PhoneField';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import MobileBottomNav from '../components/MobileBottomNav';
import Seo from '../components/Seo';
import AnalystConsole from '../components/AnalystConsole';
import { useAuth } from '../context/AuthContext';
import { Loader2, LineChart, CheckCircle2, ShieldCheck, Users, TrendingUp, LogIn, Upload, FileCheck2, SearchCheck, Clock3, XCircle } from 'lucide-react';

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
  return <div className="pt-2 text-[11px] font-bold uppercase tracking-wider text-[#6C2BD9]">{children}</div>;
}

function TrackApplication() {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const check = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setResult(null);
    try {
      const { data } = await axios.post(`${API}/partners/status`, { ref_no: ref.trim().toUpperCase(), phone });
      setResult(data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not check the status right now.');
    } finally { setBusy(false); }
  };

  const STATUS_UI = {
    pending: { icon: Clock3, cls: 'bg-[#FEF3C7] text-[#B45309]', label: 'Under review', copy: 'We are verifying your details and documents — typically 2–3 working days.' },
    approved: { icon: CheckCircle2, cls: 'bg-[#DCFCE7] text-[#0E9F5E]', label: 'Approved 🎉', copy: 'Use “Already approved? Log in” above with your registered mobile to open your analyst console.' },
    rejected: { icon: XCircle, cls: 'bg-[#FEE2E2] text-[#DC2626]', label: 'Not approved', copy: 'You can correct the issue below and submit a fresh application any time.' },
  };
  const ui = result ? STATUS_UI[result.status] : null;

  return (
    <div className="mb-8 surface p-4 sm:p-5" data-testid="track-application">
      <button type="button" data-testid="track-toggle" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 text-left">
        <div>
          <div className="text-sm font-semibold text-[#1A1030] flex items-center gap-2"><SearchCheck className="h-4 w-4 text-[#6C2BD9]" /> Track an existing application</div>
          <div className="text-xs text-[#64748B]">Check your status with your reference number (OMN-RA-…) and registered mobile.</div>
        </div>
        <span className="text-xs font-semibold text-[#6C2BD9]">{open ? 'Hide' : 'Check status'}</span>
      </button>
      {open && (
        <form onSubmit={check} className="mt-4 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <Label>Reference number</Label>
            <Input data-testid="track-ref" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} className="h-11 mt-1.5" placeholder="OMN-RA-2026-0001" />
          </div>
          <div>
            <Label>Registered mobile</Label>
            <PhoneField testid="track-phone" value={phone} onChange={setPhone} />
          </div>
          <button data-testid="track-submit" disabled={busy || !ref.trim() || !phone} className="btn-primary h-11 px-5 disabled:opacity-60 disabled:cursor-not-allowed">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
          </button>
        </form>
      )}
      {open && error && <p data-testid="track-error" className="mt-3 text-sm text-[#DC2626]">{error}</p>}
      {open && result && ui && (
        <div data-testid="track-result" className="mt-4 rounded-xl border border-[#E8E1F0] bg-white p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${ui.cls}`}><ui.icon className="h-3.5 w-3.5" /> {ui.label}</span>
            <span className="text-xs text-[#94A3B8]">{result.ref_no} · applied {new Date(result.created_at).toLocaleDateString('en-IN')}</span>
          </div>
          {result.review_note && (
            <div data-testid="track-review-note" className="mt-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-sm text-[#475569]">
              <b className="text-[#1A1030]">Message from our review team:</b> {result.review_note}
            </div>
          )}
          <p className="mt-2 text-xs text-[#64748B]">{ui.copy}</p>
        </div>
      )}
    </div>
  );
}

function DocPicker({ kind, file, onPick }) {
  const ref = useRef(null);
  return (
    <div>
      <Label>{DOC_LABELS[kind]} * <span className="font-normal text-[#94A3B8]">(PDF/JPG/PNG, max 5 MB)</span></Label>
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden"
        data-testid={`doc-input-${kind}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > DOC_MAX) { toast.error(`${DOC_LABELS[kind]}: file must be 5 MB or smaller.`); e.target.value = ''; return; }
          onPick(f);
        }} />
      <button type="button" data-testid={`doc-pick-${kind}`} onClick={() => ref.current?.click()}
        className={`mt-1.5 w-full h-11 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 px-3 transition-colors ${file ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#0E9F5E]' : 'border-dashed border-[#CBD5E1] bg-white text-[#64748B] hover:border-[#A78BFA]'}`}>
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

export default function BecomePartner() {
  const { user, isAuthed, loading: authLoading, openAuth } = useAuth();
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
  const disciplinaryOk = form.disciplinary_history === false || (form.disciplinary_history === true && form.disciplinary_details.trim());
  const filesOk = files.sebi_cert && files.nism_cert && files.pan_card;

  const valid = form.name.trim() && phoneOk && emailOk
    && form.registered_name.trim() && form.firm.trim() && sebiOk && form.sebi_reg_date
    && form.raasb_no.trim() && form.nism_cert_no.trim() && form.nism_valid_till && !nismExpired
    && panOk && form.registered_address.trim().length >= 10
    && APPLICANT_TYPES.includes(form.applicant_type) && officersOk
    && disciplinaryOk && form.raasb_deposit_confirmed && form.model_portfolio_compliance
    && filesOk && form.note.trim() && form.accepted_terms;

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
    return <AnalystConsole />;
  }

  const inner = done ? (
    <div className="min-h-[70vh] grid place-items-center bg-[#F7F4FB] p-6">
      <div className="surface p-10 text-center max-w-lg" data-testid="partner-success">
        <span className="h-14 w-14 mx-auto rounded-2xl bg-[#DCFCE7] text-[#0E9F5E] grid place-items-center"><CheckCircle2 className="h-7 w-7" /></span>
        <h1 className="mt-5 text-2xl font-bold">Application received</h1>
        {refNo && (
          <div className="mt-4 inline-block rounded-xl bg-[#F1E7FE] px-5 py-3" data-testid="partner-ref-no">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#7C5CAE]">Your reference number</div>
            <div className="text-xl font-bold text-[#5320A8] tracking-wide">{refNo}</div>
          </div>
        )}
        <p className="mt-4 text-sm text-[#64748B]">Please save this number — quote it in any correspondence about your application.</p>
        <div className="mt-6 text-left rounded-xl border border-[#E8E1F0] bg-white p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">What happens next</div>
          <ol className="mt-2 space-y-1.5 text-sm text-[#475569] list-decimal list-inside">
            <li>We verify your SEBI registration, RAASB enlistment and documents.</li>
            <li>You'll hear from us — typically within <b>2–3 working days</b>.</li>
            <li>Once approved, return to <b>omnivest.in/partner</b> and choose <b>“Already approved? Log in”</b> (with this mobile number) to open your analyst console.</li>
          </ol>
        </div>
        <p className="mt-5 text-xs text-[#94A3B8]">Questions? Write to <a className="font-semibold text-[#6C2BD9]" href={`mailto:support@omnivest.in?subject=Partner application ${refNo}`}>support@omnivest.in</a> with your reference number.</p>
      </div>
    </div>
  ) : (
    <div className="bg-[#F7F4FB]">
      <div className="container-x py-14">
        {!isAuthed && (
          <div data-testid="partner-login-cta" className="mb-8 surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[#1A1030]">Already an approved partner?</div>
              <div className="text-xs text-[#64748B]">Log in with your registered mobile number to open your analyst console.</div>
            </div>
            <button data-testid="partner-login-btn" onClick={() => openAuth({ next: '/partner' })} className="btn-outline shrink-0"><LogIn className="h-4 w-4" /> Already approved? Log in</button>
          </div>
        )}
        <TrackApplication />
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          <div className="lg:sticky lg:top-24">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#EDE9FE] text-[#5320A8] text-xs font-semibold px-3 py-1.5"><LineChart className="h-3.5 w-3.5" /> For research analysts</span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-bold leading-tight">Become a partner</h1>
            <p className="mt-4 text-base text-[#475569] max-w-lg">List your model portfolios on Omnivest and reach investors across India. Apply below — once our team verifies your SEBI registration and approves you, you'll get your own analyst console to build and publish baskets.</p>
            <div className="mt-8 space-y-4 max-w-md">
              {[
                { icon: TrendingUp, t: 'Publish model portfolios', d: 'Design baskets with stocks, weights, methodology, rebalancing and a factsheet.' },
                { icon: Users, t: 'Reach real investors', d: 'Approved baskets appear live on the Model Portfolios page.' },
                { icon: ShieldCheck, t: 'SEBI-first onboarding', d: 'We verify registration, RAASB enlistment and NISM certification before listing.' },
              ].map((b, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-[#6C2BD9] grid place-items-center border border-[#E8E1F0]"><b.icon className="h-4 w-4" /></span>
                  <div><div className="text-sm font-semibold text-[#1A1030]">{b.t}</div><div className="text-xs text-[#64748B]">{b.d}</div></div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={submit} className="surface p-6 sm:p-8" data-testid="partner-form">
            <h2 className="text-lg font-semibold">Apply as a research analyst</h2>
            <div className="mt-5 space-y-4">
              <SectionTitle>Contact</SectionTitle>
              <div>
                <Label>Full name *</Label>
                <Input data-testid="partner-name" required value={form.name} onChange={set('name')} className="h-11 mt-1.5" placeholder="Your name" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Mobile number *</Label>
                  <PhoneField testid="partner-phone" value={form.phone} onChange={setPhone('phone')} />
                  {form.phone && !phoneOk && <p className="mt-1 text-xs text-[#DC2626]">Enter a valid mobile number.</p>}
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
                  {form.sebi_reg && !sebiOk && <p className="mt-1 text-xs text-[#DC2626]">Format: IN, a letter, then 9 digits (e.g. INH000012345).</p>}
                </div>
                <div>
                  <Label>Registration date *</Label>
                  <Input data-testid="partner-sebi-date" type="date" required value={form.sebi_reg_date} onChange={set('sebi_reg_date')} className="h-11 mt-1.5" />
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
                  {form.pan && !panOk && <p className="mt-1 text-xs text-[#DC2626]">Format: 5 letters, 4 digits, 1 letter.</p>}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>NISM Series-XV cert. no. *</Label>
                  <Input data-testid="partner-nism" required value={form.nism_cert_no} onChange={set('nism_cert_no')} className="h-11 mt-1.5" placeholder="Certificate number" />
                </div>
                <div>
                  <Label>NISM valid till *</Label>
                  <Input data-testid="partner-nism-valid" type="date" required value={form.nism_valid_till} onChange={set('nism_valid_till')} className="h-11 mt-1.5" />
                  {nismExpired && <p className="mt-1 text-xs text-[#DC2626]">This certification appears expired — a valid NISM-XV is required.</p>}
                </div>
              </div>
              <div>
                <Label>Registered office address (as per SEBI records) *</Label>
                <Textarea data-testid="partner-address" required value={form.registered_address} onChange={set('registered_address')} rows={2} className="mt-1.5" placeholder="Full registered address" />
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
                <Label>Other SEBI registrations held <span className="font-normal text-[#94A3B8]">(optional — IA / PMS / broker, with numbers)</span></Label>
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
              <button data-testid="partner-submit" disabled={busy || !valid} className="btn-primary w-full py-3 disabled:opacity-60 disabled:cursor-not-allowed">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {busy ? 'Submitting…' : 'Submit application'}
              </button>
              <p className="text-xs text-center text-[#94A3B8]">We'll verify your registration details and get back to you. Approval unlocks your analyst console.</p>
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
    <div className="min-h-screen flex flex-col pb-16 lg:pb-0">
      <Seo title="Become a Partner" description="Partner with Omnivest as a SEBI-registered research analyst." />
      <Navbar />
      <main className="flex-1 fade-in">{inner}</main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
}

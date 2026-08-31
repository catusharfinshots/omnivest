import React, { useState, useEffect } from 'react';
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
import { Loader2, LineChart, CheckCircle2, ShieldCheck, Users, TrendingUp, LogIn } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SEBI_RE = /^IN[A-Z][0-9]{9}$/;
const APPLICANT_TYPES = ['Individual', 'LLP', 'Company'];

export default function BecomePartner() {
  const { user, isAuthed, loading: authLoading, openAuth } = useAuth();
  const [form, setForm] = useState({ name: '', phone: '', email: '', firm: '', sebi_reg: '', applicant_type: '', note: '', accepted_terms: false });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [terms, setTerms] = useState(null);

  useEffect(() => {
    axios.get(`${API}/content`).then(({ data }) => setTerms(data?.partnerTerms || null)).catch(() => setTerms(null));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const phoneOk = !!form.phone && isValidPhoneNumber(form.phone);
  const sebiOk = SEBI_RE.test(form.sebi_reg.trim());
  const valid = form.name.trim() && phoneOk && emailOk && form.firm.trim() && sebiOk
    && APPLICANT_TYPES.includes(form.applicant_type) && form.note.trim() && form.accepted_terms;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await axios.post(`${API}/partners/apply`, {
        name: form.name.trim(),
        phone: form.phone,
        email: form.email.trim(),
        firm: form.firm.trim(),
        sebi_reg: form.sebi_reg.trim().toUpperCase(),
        applicant_type: form.applicant_type,
        note: form.note.trim(),
        accepted_terms: true,
      });
      setDone(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not submit your application');
    } finally { setBusy(false); }
  };

  // Everything partner-related lives at /partner.
  if (authLoading) {
    return <div className="min-h-screen grid place-items-center text-[#6B6480]">Loading…</div>;
  }
  // Approved analysts get their console rendered right here at /partner.
  if (isAuthed && user?.role === 'analyst') {
    return <AnalystConsole />;
  }

  const inner = done ? (
    <div className="min-h-[70vh] grid place-items-center bg-[#F7F4FB] p-6">
      <div className="surface p-10 text-center max-w-md" data-testid="partner-success">
        <span className="h-14 w-14 mx-auto rounded-2xl bg-[#DCFCE7] text-[#0E9F5E] grid place-items-center"><CheckCircle2 className="h-7 w-7" /></span>
        <h1 className="mt-5 text-2xl font-bold">Application received</h1>
        <p className="mt-2 text-sm text-[#64748B]">Thanks for applying to become a research analyst on Omnivest. Our team will review your application. Once you're approved, come back to <b>omnivest.in/partner</b> and choose <b>“Already approved? Log in”</b> to open your analyst console.</p>
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
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-[#EDE9FE] text-[#5320A8] text-xs font-semibold px-3 py-1.5"><LineChart className="h-3.5 w-3.5" /> For research analysts</span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-bold leading-tight">Become a partner</h1>
            <p className="mt-4 text-base text-[#475569] max-w-lg">List your model portfolios on Omnivest and reach investors across India. Apply below — once our team approves you, you'll get your own analyst console to build and publish baskets.</p>
            <div className="mt-8 space-y-4 max-w-md">
              {[
                { icon: TrendingUp, t: 'Publish model portfolios', d: 'Design baskets with stocks, weights, methodology, rebalancing and a factsheet.' },
                { icon: Users, t: 'Reach real investors', d: 'Approved baskets appear live on the Model Portfolios page.' },
                { icon: ShieldCheck, t: 'Admin-reviewed & trusted', d: 'Every listing is reviewed before it goes live.' },
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
              <div>
                <Label>Full name *</Label>
                <Input data-testid="partner-name" required value={form.name} onChange={set('name')} className="h-11 mt-1.5" placeholder="Your name" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Mobile number *</Label>
                  <PhoneField testid="partner-phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
                  {form.phone && !phoneOk && <p className="mt-1 text-xs text-[#DC2626]">Enter a valid mobile number.</p>}
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input data-testid="partner-email" type="email" required value={form.email} onChange={set('email')} className="h-11 mt-1.5" placeholder="you@firm.com" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Firm / experience *</Label>
                  <Input data-testid="partner-firm" required value={form.firm} onChange={set('firm')} className="h-11 mt-1.5" placeholder="e.g. 8 yrs, XYZ Capital" />
                </div>
                <div>
                  <Label>SEBI reg. no. *</Label>
                  <Input data-testid="partner-sebi" required value={form.sebi_reg} onChange={(e) => setForm((f) => ({ ...f, sebi_reg: e.target.value.toUpperCase() }))} className="h-11 mt-1.5" placeholder="INH000012345" />
                  {form.sebi_reg && !sebiOk && <p className="mt-1 text-xs text-[#DC2626]">Format: IN, a letter, then 9 digits (e.g. INH000012345).</p>}
                </div>
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
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit application
              </button>
              <p className="text-xs text-center text-[#94A3B8]">We'll review and get back to you. Approval unlocks your analyst console.</p>
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

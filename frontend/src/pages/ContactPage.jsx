import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Mail, Phone, MapPin, Clock, UserCheck, Send, CheckCircle2, Loader2, LifeBuoy } from 'lucide-react';
import { LegalTabs } from './LegalPage';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function Card({ icon: Icon, label, children, testid }) {
  return (
    <div className="surface p-4 sm:p-5 flex items-start gap-3" data-testid={testid}>
      <span className="shrink-0 h-10 w-10 rounded-xl bg-[#F1E7FE] text-[#5320A8] grid place-items-center"><Icon className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0">
        <div className="text-[12px] text-[#667085]">{label}</div>
        <div className="mt-0.5 text-[15px] font-semibold text-[#0F1729] break-words">{children}</div>
      </div>
    </div>
  );
}

/**
 * Contact: the company details behind every legal page (from /api/legal), the three-step grievance ladder
 * that SEBI expects, and a short form that lands in admin Leads (type "contact").
 */
export default function ContactPage() {
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = 'Contact | Omnivest';
    window.scrollTo({ top: 0 });
    axios.get(`${API}/legal`).then(({ data }) => setInfo(data)).catch(() => setInfo({ details: { supportEmail: 'support@omnivest.in', grievanceOfficer: 'Omnivest', grievanceEmail: 'support@omnivest.in', brand: 'Omnivest' }, grievance_html: '' }));
  }, []);

  const d = info?.details || {};
  const submit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.message.trim()) return;
    setBusy(true);
    try {
      await axios.post(`${API}/leads`, { type: 'contact', email: form.email, name: form.name, message: form.message });
      setSent(true);
    } catch (err) { toast.error(err?.response?.data?.detail || 'Could not send. Please email us instead.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-[#F7F4FB] min-h-screen">
      <div className="bg-white border-b border-[#E8E1F0]">
        <div className="container-x pt-8 pb-6 sm:pt-12 sm:pb-8">
          <LegalTabs active="contact" />
          <div className="mt-6 flex items-start gap-3">
            <span className="shrink-0 h-11 w-11 rounded-2xl bg-[#F1E7FE] text-[#5320A8] grid place-items-center"><LifeBuoy className="h-5 w-5" /></span>
            <div>
              <h1 className="text-[26px] sm:text-4xl font-bold text-[#0F1729] leading-tight" data-testid="legal-title">Contact us</h1>
              <p className="mt-1.5 text-[14px] sm:text-[15px] text-[#526071] max-w-2xl">Questions about your account, a payment or the platform come to us. Questions about a model portfolio's research go to the partner who publishes it.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container-x py-8 sm:py-10 grid lg:grid-cols-[1fr_400px] gap-8 items-start">
        <div className="space-y-6 min-w-0">
          <div className="grid sm:grid-cols-2 gap-3">
            <Card icon={Mail} label="Support" testid="contact-support">{d.supportEmail ? <a href={`mailto:${d.supportEmail}`} className="text-[#5320A8]">{d.supportEmail}</a> : <span className="skeleton inline-block h-4 w-40 rounded" />}</Card>
            {d.supportPhone && <Card icon={Phone} label="Phone" testid="contact-phone"><a href={`tel:${d.supportPhone}`} className="text-[#5320A8]">{d.supportPhone}</a></Card>}
            {d.supportHours && <Card icon={Clock} label="Hours" testid="contact-hours">{d.supportHours}</Card>}
            <Card icon={UserCheck} label="Grievance officer" testid="contact-grievance">{d.grievanceOfficer || <span className="skeleton inline-block h-4 w-32 rounded" />}{d.grievanceEmail && <div className="text-[13px] font-normal"><a href={`mailto:${d.grievanceEmail}`} className="text-[#5320A8]">{d.grievanceEmail}</a></div>}</Card>
            {d.registeredAddress && <Card icon={MapPin} label={`${d.legalName || 'Omnivest'}`} testid="contact-address">{d.registeredAddress}</Card>}
          </div>

          <section className="surface p-5 sm:p-6">
            <h2 className="text-[17px] font-bold text-[#0F1729]">How a complaint is handled</h2>
            <p className="mt-1 text-[13px] text-[#526071]">The same three steps SEBI lays down for research services, so you always know where to go next.</p>
            <div className="legal-doc mt-3" data-testid="contact-grievance-ladder" dangerouslySetInnerHTML={{ __html: info?.grievance_html || '' }} />
            <div className="mt-3 text-[13px] text-[#526071]">Full details are in the <Link to="/terms#grievance" className="font-semibold text-[#5320A8]">Terms of Service</Link>.</div>
          </section>
        </div>

        <section className="surface p-5 sm:p-6 lg:sticky lg:top-24" data-testid="contact-form">
          <h2 className="text-[17px] font-bold text-[#0F1729]">Send us a message</h2>
          <p className="mt-1 text-[13px] text-[#526071]">We reply from {d.supportEmail || 'support@omnivest.in'} within 2 working days.</p>
          {sent ? (
            <div className="mt-5 rounded-xl bg-[#E3F4EB] text-[#096B3E] p-4 flex items-start gap-2 text-[14px]" data-testid="contact-sent"><CheckCircle2 className="h-5 w-5 shrink-0" /> Thanks, your message is with us. Keep an eye on {form.email}.</div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <label className="block text-[13px] text-[#526071]">Your name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full h-11 rounded-lg border border-[#E8E1F0] px-3 text-[15px] bg-white" data-testid="contact-name" autoComplete="name" />
              </label>
              <label className="block text-[13px] text-[#526071]">Email
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full h-11 rounded-lg border border-[#E8E1F0] px-3 text-[15px] bg-white" data-testid="contact-email" autoComplete="email" inputMode="email" />
              </label>
              <label className="block text-[13px] text-[#526071]">Message
                <textarea required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={5} maxLength={1000} className="mt-1 w-full rounded-lg border border-[#E8E1F0] px-3 py-2 text-[15px] bg-white" data-testid="contact-message" placeholder="Include the portfolio name or payment reference if it is about a subscription." />
              </label>
              <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60" data-testid="contact-send">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send message</button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

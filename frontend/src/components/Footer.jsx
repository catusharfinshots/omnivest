import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Twitter, Linkedin, Instagram, Youtube, Facebook, Mail, Send, CheckCircle2 } from 'lucide-react';
import omniMark from '../assets/omnivest-mark-white.svg';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const cols = [
  { title: 'Company', links: [{ name: 'About', to: '/about' }, { name: 'Careers', to: '/about' }, { name: 'Press', to: '/about' }, { name: 'Become a partner', to: '/partner' }] },
  { title: 'Resources', links: [{ name: 'Learn', to: '/learn' }, { name: 'Blog', to: '/learn' }, { name: 'Calculators', to: '/calculators' }, { name: 'FAQs', to: '/faq' }] },
  { title: 'Offerings', links: [{ name: 'Model Portfolios', to: '/model-portfolios' }, { name: 'AIF', to: '/aif' }, { name: 'Advisory', to: '/advisory' }, { name: 'Mutual funds', to: '/mutual-funds' }, { name: 'Fixed deposits', to: '/fixed-deposits' }] },
  { title: 'Fine Print', links: [{ name: 'Terms', to: '/business' }, { name: 'Privacy', to: '/business' }, { name: 'Disclosures', to: '/business' }, { name: 'FAQs', to: '/faq' }] },
];

const SOCIALS = [
  { key: 'facebook', label: 'Facebook', Icon: Facebook },
  { key: 'x', label: 'X', Icon: Twitter },
  { key: 'youtube', label: 'YouTube', Icon: Youtube },
  { key: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
];

export default function Footer() {
  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const [footer, setFooter] = useState({ contactEmail: 'support@omnivest.in', subscribeHeading: 'Get market insights & product updates in your inbox', socials: {} });
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    axios.get(`${API}/content`).then(({ data }) => { if (data?.footer) setFooter((f) => ({ ...f, ...data.footer, socials: data.footer.socials || {} })); }).catch(() => {});
  }, []);

  const subscribe = async (e) => {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    try {
      await axios.post(`${API}/leads`, { type: 'subscribe', email });
      setSubscribed(true);
      setEmail('');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not subscribe, please try again');
    } finally { setBusy(false); }
  };

  return (
    <footer className="mt-24 border-t border-[#E6E8F0] bg-[#F5F7FB]">
      <div className="container-x py-14">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <Link to="/" onClick={scrollTop} data-testid="footer-logo-home" className="flex items-center gap-2 w-fit">
              <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg grad-card text-white">
                <img src={omniMark} alt="" className="h-5 w-5" />
              </span>
              <span className="font-[Inter] text-lg font-bold">Omnivest</span>
            </Link>
            <p className="mt-4 text-sm text-[#64748B] max-w-xs">
              Money at work — expert-managed model portfolios, AIFs and advisory, invested from your own broker account.
            </p>

            <div className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0F1729]">Find us on</div>
              <div className="mt-3 flex items-center gap-2">
                {SOCIALS.map(({ key, label, Icon }) => {
                  const url = footer.socials?.[key];
                  return (
                    <a key={key} href={url || '#'} target={url ? '_blank' : undefined} rel="noreferrer"
                      aria-label={label} data-testid={`social-${key}`}
                      className="h-9 w-9 grid place-items-center rounded-lg bg-white border border-[#E6E8F0] text-[#64748B] hover:text-[#6C2BD9] hover:border-[#D8C7F1] transition-colors">
                      <Icon className="h-4 w-4" />
                    </a>
                  );
                })}
              </div>
              <a href={`mailto:${footer.contactEmail}`} data-testid="footer-contact-email" className="mt-3 inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#6C2BD9]">
                <Mail className="h-4 w-4" /> Contact us on <span className="font-semibold text-[#0F1729]">{footer.contactEmail}</span>
              </a>
            </div>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0F1729] mb-3">{col.title}</div>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.name}><Link to={l.to} onClick={scrollTop} className="text-sm text-[#64748B] hover:text-[#0F1729]">{l.name}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-white border border-[#E6E8F0] p-6 grid md:grid-cols-2 gap-4 items-center">
          <div>
            <div className="text-base font-semibold text-[#0F1729]">Subscribe to Omnivest</div>
            <p className="text-sm text-[#64748B]">{footer.subscribeHeading}</p>
          </div>
          {subscribed ? (
            <div data-testid="subscribe-success" className="flex items-center gap-2 text-sm font-semibold text-[#0E9F5E] md:justify-end">
              <CheckCircle2 className="h-5 w-5" /> You're subscribed — thanks!
            </div>
          ) : (
            <form onSubmit={subscribe} className="flex flex-col sm:flex-row gap-2 md:justify-end w-full">
              <input data-testid="subscribe-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="h-11 w-full sm:flex-1 min-w-0 md:max-w-xs rounded-lg border border-[#E6E8F0] px-3 text-sm focus:outline-none focus:border-[#6C2BD9]" />
              <button data-testid="subscribe-btn" disabled={busy} className="btn-primary w-full sm:w-auto justify-center disabled:opacity-60"><Send className="h-4 w-4" /> Subscribe</button>
            </form>
          )}
        </div>

        <div className="mt-8 pt-8 border-t border-[#E6E8F0] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="text-xs text-[#64748B] max-w-3xl">
            Investments in securities are subject to market risks. Read all scheme related documents carefully before investing. Past performance is not indicative of future returns.
          </p>
          <Link to="/partner" onClick={scrollTop} data-testid="become-partner-link" className="text-xs font-semibold text-[#6C2BD9] hover:text-[#5320A8] shrink-0">Become a partner →</Link>
        </div>
      </div>
    </footer>
  );
}

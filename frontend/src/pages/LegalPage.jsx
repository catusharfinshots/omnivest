import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { FileText, ShieldCheck, ReceiptIndianRupee, Mail, ChevronRight } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ICON = { terms: FileText, privacy: ShieldCheck, refunds: ReceiptIndianRupee };
const TABS = [['terms', 'Terms'], ['privacy', 'Privacy'], ['refunds', 'Refunds'], ['contact', 'Contact']];
const nice = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/** Sub-nav shared by the four fine-print pages: pill tabs on phones, same row on desktop. */
export function LegalTabs({ active }) {
  return (
    <nav className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" aria-label="Fine print" data-testid="legal-tabs">
      {TABS.map(([slug, label]) => (
        <Link key={slug} to={`/${slug}`} className={`shrink-0 rounded-full px-3.5 h-9 inline-flex items-center text-[13px] font-semibold transition-colors ${active === slug ? 'bg-[#1A1030] text-white' : 'bg-white border border-[#E8E1F0] text-[#526071] hover:text-[#1A1030]'}`}
          aria-current={active === slug ? 'page' : undefined}>{label}</Link>
      ))}
    </nav>
  );
}

/**
 * Terms / Privacy / Refunds: one document each, served by GET /api/legal/{slug} with company details already
 * filled in. Desktop gets a sticky "On this page" rail built from the document's h2 anchors.
 */
export default function LegalPage({ slug }) {
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState(false);
  const { hash } = useLocation();
  const Icon = ICON[slug] || FileText;

  useEffect(() => {
    let alive = true;
    setDoc(null); setErr(false);
    axios.get(`${API}/legal/${slug}`).then(({ data }) => { if (alive) setDoc(data); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    if (doc) document.title = `${doc.title} | Omnivest`;
    if (doc && hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) el.scrollIntoView({ block: 'start' });
    } else if (doc) window.scrollTo({ top: 0 });
  }, [doc, hash]);

  return (
    <div className="bg-[#F7F4FB] min-h-screen">
      <div className="bg-white border-b border-[#E8E1F0]">
        <div className="container-x pt-8 pb-6 sm:pt-12 sm:pb-8">
          <LegalTabs active={slug} />
          <div className="mt-6 flex items-start gap-3">
            <span className="shrink-0 h-11 w-11 rounded-2xl bg-[#F1E7FE] text-[#5320A8] grid place-items-center"><Icon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h1 className="text-[26px] sm:text-4xl font-bold text-[#0F1729] leading-tight" data-testid="legal-title">{doc?.title || (err ? 'Could not load this page' : ' ')}</h1>
              <p className="mt-1.5 text-[14px] sm:text-[15px] text-[#526071] max-w-2xl">{doc?.description || ''}</p>
              {doc && <div className="mt-2 text-[12px] text-[#667085]" data-testid="legal-updated">Last updated {nice(doc.updated)} · {doc.details.legalName}, trading as {doc.details.brand}</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="container-x py-8 sm:py-10 grid lg:grid-cols-[220px_1fr] gap-8 items-start">
        {doc && doc.toc.length > 1 && (
          <aside className="hidden lg:block sticky top-24">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#667085] mb-2">On this page</div>
            <ol className="space-y-1">
              {doc.toc.map((t) => (
                <li key={t.id}><a href={`#${t.id}`} className="flex items-start gap-1.5 text-[13px] text-[#526071] hover:text-[#5320A8] leading-5"><ChevronRight className="h-3.5 w-3.5 mt-[3px] shrink-0 text-[#C9BEE0]" />{t.title}</a></li>
              ))}
            </ol>
            <Link to="/contact" className="mt-6 inline-flex items-center gap-2 text-[13px] font-semibold text-[#5320A8]"><Mail className="h-4 w-4" /> Need help? Contact us</Link>
          </aside>
        )}
        <article className="surface p-5 sm:p-8 min-w-0">
          {!doc && !err && <div className="space-y-3">{[...Array(8)].map((_, i) => <div key={i} className="skeleton h-4 rounded" style={{ width: `${90 - (i % 4) * 12}%` }} />)}</div>}
          {err && <p className="text-[#B91C1C]">This page could not be loaded. Please try again in a moment or write to support@omnivest.in.</p>}
          {doc && <div className="legal-doc" data-testid="legal-doc" dangerouslySetInnerHTML={{ __html: doc.html }} />}
          {doc && (
            <div className="mt-8 pt-5 border-t border-[#EEF1F6] flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[#526071]">
              <span>Questions about this page?</span>
              <a href={`mailto:${doc.details.supportEmail}`} className="font-semibold text-[#5320A8]">{doc.details.supportEmail}</a>
              <Link to="/contact" className="font-semibold text-[#5320A8]">All contact options</Link>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

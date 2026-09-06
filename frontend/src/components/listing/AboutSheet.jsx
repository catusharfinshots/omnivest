import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FlaskConical, FileText, Lock, BookOpen, ArrowLeft, Download } from 'lucide-react';

// One sheet frame for all three (About, Methodology, Factsheet): bottom sheet on phones, centred on larger screens,
// slides up on open, portaled to <body>. Defined at module level — never inside a render.
function Sheet({ title, onClose, onBack, children, testid }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#0F1729]/55 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title} data-testid={testid} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet-in w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 bg-white/95 backdrop-blur px-4 h-14 flex items-center gap-2 border-b border-[#EEF1F6] z-10">
          {onBack && <button type="button" onClick={onBack} aria-label="Back" className="h-10 w-10 -ml-2 grid place-items-center rounded-full hover:bg-[#F5F6FA] text-[#526071]"><ArrowLeft className="h-5 w-5" /></button>}
          <div className="text-[18px] font-bold text-[#0F1729] flex-1 truncate">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-10 w-10 grid place-items-center rounded-full hover:bg-[#F5F6FA] text-[#526071]"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, children, testid }) {
  return (
    <section className="mt-5 first:mt-0" data-testid={testid}>
      <h3 className="text-[15px] font-bold text-[#0F1729]">{title}</h3>
      <div className="mt-1.5 text-[15px] leading-relaxed text-[#475569]">{children}</div>
    </section>
  );
}

function Chip({ icon, label, onClick, href, testid }) {
  const cls = 'inline-flex shrink-0 items-center gap-2 h-10 pl-1.5 pr-3.5 rounded-full border border-[#E6E8F0] bg-white text-[14px] font-semibold text-[#1D4ED8] hover:border-[#C7DBFE] whitespace-nowrap';
  const inner = <><span className="h-7 w-7 shrink-0 rounded-full bg-[#EFF6FF] grid place-items-center">{icon}</span>{label}</>;
  return href ? <a href={href} target="_blank" rel="noreferrer" className={cls} data-testid={testid}>{inner}</a> : <button type="button" onClick={onClick} className={cls} data-testid={testid}>{inner}</button>;
}

/**
 * "About this portfolio" — what Read more opens (the smallcase pattern):
 *   chips Blog · Methodology · Factsheet, then Overview and Investment rationale only.
 * Methodology and Factsheet are their own sheets, opened from the chips.
 */
export default function AboutSheet({ open, onClose, basket, onFactsheet, blogHref, onBlog }) {
  const [sub, setSub] = useState(null);   // null | 'methodology' | 'factsheet'
  useEffect(() => {
    if (!open) { setSub(null); return undefined; }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') (sub ? setSub(null) : onClose()); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, sub, onClose]);
  if (!open || typeof document === 'undefined') return null;

  const rationale = basket.rationale || '';
  const methodology = basket.methodology ? (basket.rationale ? basket.methodology : `<p>${basket.methodology}</p>`) : '';
  const fs = basket.factsheet || {};
  const locked = !!basket.factsheet_pdf?.locked;
  const hasPdf = !!basket.factsheet_pdf;
  const hasFactsheet = hasPdf || fs.objective || fs.whoShouldInvest || fs.riskFactors;

  if (sub === 'methodology') {
    return (
      <Sheet title="Methodology" onClose={onClose} onBack={() => setSub(null)} testid="methodology-sheet">
        <div className="px-4 py-4">
          {methodology ? <div className="rich-text text-[15px] leading-relaxed text-[#475569]" dangerouslySetInnerHTML={{ __html: methodology }} /> : <p className="text-[15px] text-[#667085]">The manager hasn't described the methodology yet.</p>}
        </div>
      </Sheet>
    );
  }
  if (sub === 'factsheet') {
    return (
      <Sheet title="Factsheet" onClose={onClose} onBack={() => setSub(null)} testid="factsheet-sheet">
        <div className="px-4 py-4">
          {hasPdf && (locked
            ? <button type="button" onClick={onFactsheet} className="btn-primary w-full mb-4" data-testid="factsheet-sheet-locked"><Lock className="h-4 w-4" /> Subscribe to download the PDF factsheet</button>
            : <a href={onFactsheet} target="_blank" rel="noreferrer" className="btn-outline w-full mb-4" data-testid="factsheet-sheet-download"><Download className="h-4 w-4" /> Download the PDF factsheet</a>)}
          {fs.objective && <Section title="Objective"><p>{fs.objective}</p></Section>}
          {fs.whoShouldInvest && <Section title="Who should invest"><p>{fs.whoShouldInvest}</p></Section>}
          {fs.riskFactors && <Section title="Key risks"><p className="whitespace-pre-line">{fs.riskFactors}</p></Section>}
          {!hasFactsheet && <p className="text-[15px] text-[#667085]">No factsheet details yet.</p>}
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title="About this portfolio" onClose={onClose} testid="about-sheet">
      <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto no-scrollbar">
        {blogHref ? <Chip icon={<BookOpen className="h-4 w-4" />} label="Blog" href={blogHref} testid="about-blog-chip" /> : <Chip icon={<BookOpen className="h-4 w-4" />} label="Blog" onClick={onBlog} testid="about-blog-chip" />}
        <Chip icon={<FlaskConical className="h-4 w-4" />} label="Methodology" onClick={() => setSub('methodology')} testid="about-methodology-chip" />
        <Chip icon={locked ? <Lock className="h-4 w-4" /> : <FileText className="h-4 w-4" />} label="Factsheet" onClick={() => setSub('factsheet')} testid="about-factsheet-chip" />
      </div>
      <div className="px-4 pb-6 pt-3">
        {basket.subtitle && <Section title="Overview" testid="about-overview"><p>{basket.subtitle}</p></Section>}
        {rationale && <Section title="Investment rationale" testid="about-rationale"><div className="rich-text" dangerouslySetInnerHTML={{ __html: rationale }} /></Section>}
      </div>
    </Sheet>
  );
}

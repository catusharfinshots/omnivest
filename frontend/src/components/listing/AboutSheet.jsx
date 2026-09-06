import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FlaskConical, FileText, Lock, UserRound } from 'lucide-react';

/**
 * "About this portfolio" — what smallcase opens from Read more: quick links across the top, then every long
 * text in one scrollable sheet (overview, rationale, methodology, who should invest, key risks).
 * Bottom sheet on phones, centred dialog on larger screens. Portaled to <body>.
 */
export default function AboutSheet({ open, onClose, basket, manager, onFactsheet, onManager }) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;

  const rationale = basket.rationale || '';
  const methodology = basket.methodology ? (basket.rationale ? basket.methodology : `<p>${basket.methodology}</p>`) : '';
  const fs = basket.factsheet || {};
  const locked = !!basket.factsheet_pdf?.locked;
  const hasPdf = !!basket.factsheet_pdf;
  const Section = ({ title, children, testid }) => (
    <section className="mt-5 first:mt-0" data-testid={testid}>
      <h3 className="text-[15px] font-bold text-[#0F1729]">{title}</h3>
      <div className="mt-1.5 text-[15px] leading-relaxed text-[#475569]">{children}</div>
    </section>
  );
  const Chip = ({ icon, label, onClick, href, testid }) => {
    const cls = 'inline-flex shrink-0 items-center gap-2 h-10 pl-1.5 pr-3.5 rounded-full border border-[#E6E8F0] bg-white text-[14px] font-semibold text-[#1D4ED8] hover:border-[#C7DBFE] whitespace-nowrap';
    const inner = <><span className="h-7 w-7 shrink-0 rounded-full bg-[#EFF6FF] grid place-items-center">{icon}</span>{label}</>;
    return href ? <a href={href} target="_blank" rel="noreferrer" className={cls} data-testid={testid}>{inner}</a> : <button type="button" onClick={onClick} className={cls} data-testid={testid}>{inner}</button>;
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#0F1729]/55 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`About ${basket.name}`} data-testid="about-sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 bg-white/95 backdrop-blur px-4 h-14 flex items-center justify-between border-b border-[#EEF1F6] z-10">
          <div className="text-[18px] font-bold text-[#0F1729]">About this portfolio</div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-10 w-10 grid place-items-center rounded-full hover:bg-[#F5F6FA] text-[#526071]"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto no-scrollbar">
          {methodology && <Chip icon={<FlaskConical className="h-4 w-4" />} label="Methodology" onClick={() => document.getElementById('about-methodology')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} testid="about-methodology-chip" />}
          {hasPdf && (locked
            ? <Chip icon={<Lock className="h-4 w-4" />} label="Factsheet" onClick={onFactsheet} testid="about-factsheet-chip" />
            : <Chip icon={<FileText className="h-4 w-4" />} label="Factsheet" href={onFactsheet} testid="about-factsheet-chip" />)}
          {manager?.name && <Chip icon={<UserRound className="h-4 w-4" />} label={`By ${manager.name}`} onClick={onManager} testid="about-manager-chip" />}
        </div>
        <div className="px-4 pb-6 pt-3">
          {basket.subtitle && <Section title="Overview" testid="about-overview"><p>{basket.subtitle}</p></Section>}
          {rationale && <Section title="Investment rationale" testid="about-rationale"><div className="rich-text" dangerouslySetInnerHTML={{ __html: rationale }} /></Section>}
          {methodology && <div id="about-methodology"><Section title="Methodology" testid="about-methodology"><div className="rich-text" dangerouslySetInnerHTML={{ __html: methodology }} /></Section></div>}
          {fs.objective && <Section title="Objective"><p>{fs.objective}</p></Section>}
          {fs.whoShouldInvest && <Section title="Who should invest"><p>{fs.whoShouldInvest}</p></Section>}
          {fs.riskFactors && <Section title="Key risks"><p className="whitespace-pre-line">{fs.riskFactors}</p></Section>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

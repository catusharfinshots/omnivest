import React from 'react';
import { Globe, Search, Filter, Scale, Repeat, Shield, List, CalendarCheck } from 'lucide-react';

const ICONS = { globe: Globe, search: Search, filter: Filter, scale: Scale, repeat: Repeat, shield: Shield, list: List };
const nice = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/**
 * The investor's Methodology: titled sections with icons in the admin-defined order (the smallcase pattern).
 * `sections` = [{key, title, body(html)}]; `defs` = rule definitions (for icons); `legacyHtml` = old free-text fallback.
 */
export default function MethodologyView({ sections = [], defs = [], legacyHtml = '', updatedAt, compact = false, testid = 'methodology-view' }) {
  const iconFor = (key) => ICONS[(defs.find((d) => d.key === key) || {}).icon] || List;
  const rows = sections.length ? sections : (legacyHtml ? [{ key: 'approach', title: 'Approach', body: legacyHtml }] : []);
  if (!rows.length) return <p className="text-[15px] text-[#667085]" data-testid={testid}>The manager hasn't described the methodology yet.</p>;
  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'} data-testid={testid}>
      {rows.map((s, i) => {
        const Icon = iconFor(s.key);
        return (
          <div key={s.key || i} className="flex gap-3.5" data-testid={`methodology-${s.key}`}>
            <span className="shrink-0 h-10 w-10 rounded-full bg-[#EFF6FF] text-[#1D4ED8] grid place-items-center"><Icon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h4 className="text-[15px] font-bold text-[#0F1729] leading-tight">{s.title}</h4>
              <div className="rich-text mt-1 text-[14px] leading-relaxed text-[#475569]" dangerouslySetInnerHTML={{ __html: s.body }} />
            </div>
          </div>
        );
      })}
      {updatedAt && (
        <div className="flex items-center gap-1.5 text-[12px] text-[#667085] pt-1" data-testid="methodology-updated">
          <CalendarCheck className="h-3.5 w-3.5" /> Methodology last reviewed {nice(updatedAt)}
        </div>
      )}
    </div>
  );
}

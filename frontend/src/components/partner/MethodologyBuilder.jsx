import React, { useState } from 'react';
import { Plus, Trash2, Lightbulb } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import MethodologyView from '../listing/MethodologyView';

const plain = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const toHtml = (text) => (text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
const toText = (html) => (html || '').replace(/<\/p>\s*<p>/g, '\n\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]*>/g, '').trim();

/**
 * Partner-side methodology: one plain-text box per admin-defined section (universe, research, screening, weighting,
 * rebalance, risk), helper + example under each, an optional custom section, and a live preview of the investor's sheet.
 * value = [{key, title, body(html)}]
 */
export default function MethodologyBuilder({ value = [], onChange, defs = [], rebalanceFreq, testId = 'methodology-builder' }) {
  const [showExample, setShowExample] = useState({});
  const byKey = Object.fromEntries((value || []).map((s) => [s.key, s]));
  const custom = (value || []).filter((s) => !defs.some((d) => d.key === s.key));
  const setBody = (def, text) => {
    const next = defs.map((d) => ({ key: d.key, title: d.title, body: d.key === def.key ? toHtml(text) : (byKey[d.key]?.body || '') }))
      .concat(custom)
      .filter((s) => plain(s.body) || s.key === def.key || custom.some((c) => c.key === s.key));
    onChange(next);
  };
  const setCustom = (idx, patch) => {
    const nextCustom = custom.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange(defs.map((d) => ({ key: d.key, title: d.title, body: byKey[d.key]?.body || '' })).concat(nextCustom));
  };
  const addCustom = () => onChange(defs.map((d) => ({ key: d.key, title: d.title, body: byKey[d.key]?.body || '' })).concat(custom, [{ key: `custom${custom.length + 1}`, title: '', body: '' }]));
  const removeCustom = (idx) => onChange(defs.map((d) => ({ key: d.key, title: d.title, body: byKey[d.key]?.body || '' })).concat(custom.filter((_, i) => i !== idx)));
  const filled = defs.filter((d) => plain(byKey[d.key]?.body)).length;
  const preview = (value || []).filter((s) => plain(s.body) && s.title);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5" data-testid={testId}>
      <div className="space-y-4">
        <div className="text-[13px] text-[#526071]">Investors see these as six titled cards, the way smallcase shows a methodology. Plain words, two to four sentences each. <b className="text-[#1A1030]">{filled}/{defs.length} sections filled.</b></div>
        {defs.map((d) => (
          <div key={d.key} className="rounded-xl border border-[#E8E1F0] p-3.5" data-testid={`method-${d.key}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-[#1A1030]">{d.title}{d.required ? <span className="text-[#B91C1C]"> *</span> : null}</div>
              {d.example && <button type="button" onClick={() => setShowExample((x) => ({ ...x, [d.key]: !x[d.key] }))} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#5320A8]"><Lightbulb className="h-3.5 w-3.5" /> {showExample[d.key] ? 'Hide example' : 'Example'}</button>}
            </div>
            {d.helper && <div className="text-[12px] text-[#667085] mt-0.5">{d.helper}</div>}
            {showExample[d.key] && d.example && <div className="mt-2 rounded-lg bg-[#FAFAFE] border border-[#EEF1F6] px-3 py-2 text-[13px] text-[#475569] italic">{d.example}</div>}
            <Textarea value={toText(byKey[d.key]?.body)} onChange={(e) => setBody(d, e.target.value)} className="mt-2 min-h-[84px] text-[14px]" placeholder={d.key === 'rebalance' && rebalanceFreq ? `Reviewed ${String(rebalanceFreq).toLowerCase()}. Between reviews we change a stock only when…` : 'In plain words…'} data-testid={`method-${d.key}-input`} />
          </div>
        ))}
        {custom.map((c, i) => (
          <div key={c.key} className="rounded-xl border border-dashed border-[#D8C7F1] p-3.5" data-testid="method-custom">
            <div className="flex items-center gap-2">
              <input value={c.title} onChange={(e) => setCustom(i, { title: e.target.value.slice(0, 60) })} placeholder="Section title (e.g. Exit rules)" className="flex-1 h-9 rounded-lg border border-[#E8E1F0] px-3 text-sm" />
              <button type="button" onClick={() => removeCustom(i)} aria-label="Remove section" className="h-9 w-9 grid place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>
            </div>
            <Textarea value={toText(c.body)} onChange={(e) => setCustom(i, { body: toHtml(e.target.value) })} className="mt-2 min-h-[72px] text-[14px]" placeholder="In plain words…" />
          </div>
        ))}
        {custom.length < 1 && <button type="button" onClick={addCustom} className="btn-ghost text-xs" data-testid="method-add-custom"><Plus className="h-3.5 w-3.5" /> Add a custom section</button>}
      </div>
      <aside className="lg:sticky lg:top-24 self-start rounded-2xl border border-[#E8E1F0] bg-white p-4" data-testid="method-preview">
        <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085] mb-3">What investors see</div>
        <MethodologyView sections={preview} defs={defs} compact testid="method-preview-view" />
      </aside>
    </div>
  );
}

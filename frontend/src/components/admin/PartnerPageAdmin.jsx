import React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Plus, Trash2 } from 'lucide-react';

// Admin editor for everything shown on the public partner landing page
// (/partner). Wired into the global Publish flow via content.partnerPage.

function Card({ title, desc, children }) {
  return (
    <section className="surface p-6">
      <div className="text-sm font-semibold">{title}</div>
      {desc && <div className="text-xs text-[#6B6480] mt-0.5">{desc}</div>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function ListEditor({ items, onChange, fields, addLabel, testid }) {
  const update = (i, key, val) => onChange(items.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)));
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, Object.fromEntries(fields.map((f) => [f.key, '']))]);
  return (
    <div className="space-y-3" data-testid={testid}>
      {items.map((it, i) => (
        <div key={i} className="rounded-xl border border-[#EDE9FE] bg-[#FBFAFE] p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-2">
              {fields.map((f) => (
                <div key={f.key}>
                  <Label className="text-xs">{f.label}</Label>
                  {f.multiline ? (
                    <Textarea rows={2} value={it[f.key] || ''} onChange={(e) => update(i, f.key, e.target.value)} className="mt-1 bg-white" />
                  ) : (
                    <Input value={it[f.key] || ''} onChange={(e) => update(i, f.key, e.target.value)} className="h-9 mt-1 bg-white" />
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => remove(i)} className="shrink-0 h-8 w-8 grid place-items-center rounded-lg text-[#DC2626] hover:bg-[#FEF2F2]" aria-label="Remove">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="btn-outline text-xs"><Plus className="h-3.5 w-3.5" /> {addLabel}</button>
    </div>
  );
}

export default function PartnerPageAdmin({ pp, onChange }) {
  const p = pp || {};
  const set = (patch) => onChange({ ...p, ...patch });
  const setHero = (k) => (e) => set({ hero: { ...(p.hero || {}), [k]: e.target.value } });

  return (
    <div className="space-y-6" data-testid="partnerpage-admin">
      <Card title="Hero" desc="The headline block at the top of /partner.">
        <div>
          <Label>Badge</Label>
          <Input data-testid="pp-hero-badge" value={p.hero?.badge || ''} onChange={setHero('badge')} className="h-10 mt-1.5" />
        </div>
        <div>
          <Label>Headline</Label>
          <Input data-testid="pp-hero-headline" value={p.hero?.headline || ''} onChange={setHero('headline')} className="h-10 mt-1.5" />
        </div>
        <div>
          <Label>Sub-text</Label>
          <Textarea data-testid="pp-hero-sub" rows={2} value={p.hero?.sub || ''} onChange={setHero('sub')} className="mt-1.5" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Primary button label</Label>
            <Input value={p.hero?.primaryCta || ''} onChange={setHero('primaryCta')} className="h-10 mt-1.5" />
          </div>
          <div>
            <Label>Secondary button label</Label>
            <Input value={p.hero?.secondaryCta || ''} onChange={setHero('secondaryCta')} className="h-10 mt-1.5" />
          </div>
        </div>
      </Card>

      <Card title="Benefits" desc="The cards beside the hero (first three get icons).">
        <ListEditor testid="pp-benefits" items={p.benefits || []} onChange={(v) => set({ benefits: v })} addLabel="Add benefit"
          fields={[{ key: 'title', label: 'Title' }, { key: 'text', label: 'Text', multiline: true }]} />
      </Card>

      <Card title="How it works" desc="The numbered steps strip.">
        <ListEditor testid="pp-how" items={p.how || []} onChange={(v) => set({ how: v })} addLabel="Add step"
          fields={[{ key: 'title', label: 'Step title' }, { key: 'text', label: 'Step text', multiline: true }]} />
      </Card>

      <Card title="Requirements" desc="The 'What you need to apply' cards.">
        <ListEditor testid="pp-requirements" items={p.requirements || []} onChange={(v) => set({ requirements: v })} addLabel="Add requirement"
          fields={[{ key: 'title', label: 'Title' }, { key: 'text', label: 'Text', multiline: true }]} />
        <div>
          <Label>Tip line (below the cards)</Label>
          <Input value={p.requirementsTip || ''} onChange={(e) => set({ requirementsTip: e.target.value })} className="h-10 mt-1.5" />
        </div>
      </Card>

      <Card title="Partner FAQ" desc="The expandable questions near the bottom of the page.">
        <ListEditor testid="pp-faqs" items={p.faqs || []} onChange={(v) => set({ faqs: v })} addLabel="Add question"
          fields={[{ key: 'q', label: 'Question' }, { key: 'a', label: 'Answer', multiline: true }]} />
      </Card>
    </div>
  );
}

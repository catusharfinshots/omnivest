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
            <button type="button" onClick={() => remove(i)} className="shrink-0 h-8 w-8 grid place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]" aria-label="Remove">
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

      <Card title="Feature sections" desc="The alternating Create / Manage / Grow blocks with product visuals. Bullets: one per line.">
        <div className="space-y-3" data-testid="pp-features">
          {(p.features || []).map((f, i) => (
            <div key={i} className="rounded-xl border border-[#EDE9FE] bg-[#FBFAFE] p-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-2">
                  <div className="grid sm:grid-cols-[140px_1fr] gap-2">
                    <div>
                      <Label className="text-xs">Eyebrow</Label>
                      <Input value={f.eyebrow || ''} onChange={(e) => set({ features: p.features.map((x, j) => (j === i ? { ...x, eyebrow: e.target.value } : x)) })} className="h-9 mt-1 bg-white" />
                    </div>
                    <div>
                      <Label className="text-xs">Title</Label>
                      <Input value={f.title || ''} onChange={(e) => set({ features: p.features.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} className="h-9 mt-1 bg-white" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Bullets (one per line)</Label>
                    <Textarea rows={3} value={(f.bullets || []).join('\n')} onChange={(e) => set({ features: p.features.map((x, j) => (j === i ? { ...x, bullets: e.target.value.split('\n') } : x)) })} className="mt-1 bg-white" />
                  </div>
                </div>
                <button type="button" onClick={() => set({ features: p.features.filter((_, j) => j !== i) })} className="shrink-0 h-8 w-8 grid place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]" aria-label="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => set({ features: [...(p.features || []), { eyebrow: '', title: '', bullets: [] }] })} className="btn-outline text-xs"><Plus className="h-3.5 w-3.5" /> Add feature section</button>
        </div>
      </Card>

      <Card title="Stats band" desc="The animated numbers under the hero (e.g. 0%, 100%, 10 min).">
        <ListEditor testid="pp-stats" items={p.stats || []} onChange={(v) => set({ stats: v })} addLabel="Add stat"
          fields={[{ key: 'value', label: 'Value (number + unit)' }, { key: 'label', label: 'Label' }]} />
      </Card>

      <Card title="Old way vs Omnivest way" desc="The illustrated comparison diagram. Old-way steps: one per line (max 6 shown).">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Heading</Label>
            <Input value={p.oldNew?.heading || ''} onChange={(e) => set({ oldNew: { ...(p.oldNew || {}), heading: e.target.value } })} className="h-10 mt-1.5" />
          </div>
          <div>
            <Label>Sub-text</Label>
            <Input value={p.oldNew?.sub || ''} onChange={(e) => set({ oldNew: { ...(p.oldNew || {}), sub: e.target.value } })} className="h-10 mt-1.5" />
          </div>
          <div>
            <Label>Left panel title</Label>
            <Input value={p.oldNew?.oldTitle || ''} onChange={(e) => set({ oldNew: { ...(p.oldNew || {}), oldTitle: e.target.value } })} className="h-10 mt-1.5" />
          </div>
          <div>
            <Label>Right panel title</Label>
            <Input value={p.oldNew?.newTitle || ''} onChange={(e) => set({ oldNew: { ...(p.oldNew || {}), newTitle: e.target.value } })} className="h-10 mt-1.5" />
          </div>
        </div>
        <div>
          <Label>Old-way steps (one per line)</Label>
          <Textarea rows={4} value={(p.oldNew?.oldSteps || []).join('\n')} onChange={(e) => set({ oldNew: { ...(p.oldNew || {}), oldSteps: e.target.value.split('\n') } })} className="mt-1.5" />
        </div>
        <div>
          <Label>New-way description</Label>
          <Textarea rows={2} value={p.oldNew?.newText || ''} onChange={(e) => set({ oldNew: { ...(p.oldNew || {}), newText: e.target.value } })} className="mt-1.5" />
        </div>
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

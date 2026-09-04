import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowUp, ArrowDown, Upload, Loader2, ImageIcon } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BACKEND = process.env.REACT_APP_BACKEND_URL;
const mediaUrl = (u) => (!u ? '' : u.startsWith('/api/') ? `${BACKEND}${u}` : u);
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`);
const blankPerson = () => ({ id: uid(), name: '', role: '', photoUrl: '', shortBio: '', fullBio: '', linkedinUrl: '' });

// list helpers
const moveIn = (list, onChange, i, dir) => {
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  const a = [...list];
  [a[i], a[j]] = [a[j], a[i]];
  onChange(a);
};
const patchIn = (list, onChange, i, patch) => { const a = [...list]; a[i] = { ...a[i], ...patch }; onChange(a); };
const removeIn = (list, onChange, i) => onChange(list.filter((_, j) => j !== i));

function Card({ title, desc, children }) {
  return (
    <section className="surface p-6">
      <div className="text-sm font-semibold">{title}</div>
      {desc && <div className="text-xs text-[#6B6480]">{desc}</div>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PhotoUpload({ value, onChange, token, label = 'photo', round = false }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await axios.post(`${API}/about/upload`, fd, { headers: { Authorization: `Bearer ${token}` } });
      onChange(data.url);
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Upload failed');
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };
  return (
    <div className="flex items-center gap-3">
      <div className={`h-14 w-14 shrink-0 overflow-hidden border border-[#E8E1F0] bg-[#F7F4FB] grid place-items-center ${round ? 'rounded-full' : 'rounded-xl'}`}>
        {value ? <img src={mediaUrl(value)} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-[#C4B5DC]" />}
      </div>
      <div className="flex items-center gap-2">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={upload} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-outline text-xs inline-flex items-center gap-1">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload {label}
        </button>
        {value && <button type="button" onClick={() => onChange('')} className="text-xs text-[#B91C1C] hover:underline">Remove</button>}
      </div>
    </div>
  );
}

function ParagraphList({ list, onChange }) {
  return (
    <div className="space-y-2">
      {list.map((para, i) => (
        <div key={i} className="flex items-start gap-2">
          <Textarea value={para} onChange={(e) => { const a = [...list]; a[i] = e.target.value; onChange(a); }} rows={2} />
          <button onClick={() => onChange(list.filter((_, j) => j !== i))} className="h-8 w-8 mt-1 shrink-0 grid place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button onClick={() => onChange([...list, ''])} className="btn-outline inline-flex items-center gap-1"><Plus className="h-4 w-4" /> Add paragraph</button>
    </div>
  );
}

function StatsEditor({ list, onChange }) {
  return (
    <div className="space-y-3">
      {list.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={s.label} onChange={(e) => patchIn(list, onChange, i, { label: e.target.value })} className="h-9" placeholder="Label (e.g. Launched in)" />
          <Input value={s.value} onChange={(e) => patchIn(list, onChange, i, { value: e.target.value })} className="h-9 w-40" placeholder="Value (e.g. 2024)" />
          <button onClick={() => removeIn(list, onChange, i)} className="h-8 w-8 shrink-0 grid place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button onClick={() => onChange([...list, { label: '', value: '' }])} className="btn-outline inline-flex items-center gap-1"><Plus className="h-4 w-4" /> Add stat</button>
    </div>
  );
}

function PersonEditor({ list, onChange, kind, token }) {
  return (
    <div className="space-y-4">
      {list.map((p, i) => (
        <div key={p.id} className="rounded-xl border border-[#E8E1F0] bg-white p-4 space-y-3" data-testid={`about-${kind}-editor-${i}`}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-[#6B6480]">#{i + 1}</div>
            <div className="flex items-center gap-1">
              <button onClick={() => moveIn(list, onChange, i, -1)} disabled={i === 0} className="h-7 w-7 grid place-items-center rounded-lg text-[#6B6480] hover:bg-[#F7F4FB] disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button onClick={() => moveIn(list, onChange, i, 1)} disabled={i === list.length - 1} className="h-7 w-7 grid place-items-center rounded-lg text-[#6B6480] hover:bg-[#F7F4FB] disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button onClick={() => removeIn(list, onChange, i)} className="h-7 w-7 grid place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
          <PhotoUpload value={p.photoUrl} onChange={(url) => patchIn(list, onChange, i, { photoUrl: url })} token={token} />
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Name</Label><Input value={p.name} onChange={(e) => patchIn(list, onChange, i, { name: e.target.value })} className="h-10 mt-1.5" /></div>
            <div><Label>Role</Label><Input value={p.role} onChange={(e) => patchIn(list, onChange, i, { role: e.target.value })} className="h-10 mt-1.5" /></div>
          </div>
          <div><Label>Short bio (card preview)</Label><Input value={p.shortBio} onChange={(e) => patchIn(list, onChange, i, { shortBio: e.target.value })} className="h-10 mt-1.5" /></div>
          <div><Label>Full bio (Read Bio)</Label><Textarea value={p.fullBio} onChange={(e) => patchIn(list, onChange, i, { fullBio: e.target.value })} rows={3} className="mt-1.5" /></div>
          <div><Label>LinkedIn URL</Label><Input value={p.linkedinUrl} onChange={(e) => patchIn(list, onChange, i, { linkedinUrl: e.target.value })} className="h-10 mt-1.5" placeholder="https://linkedin.com/in/…" /></div>
        </div>
      ))}
      <button onClick={() => onChange([...list, blankPerson()])} className="btn-outline inline-flex items-center gap-1"><Plus className="h-4 w-4" /> Add {kind === 'founders' ? 'founder' : 'team member'}</button>
    </div>
  );
}

export default function AboutAdmin({ token }) {
  const [about, setAbout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get(`${API}/about`).then(({ data }) => setAbout(data)).catch(() => toast.error('Could not load About content')).finally(() => setLoading(false));
  }, []);

  const set = (key, value) => setAbout((a) => ({ ...a, [key]: value }));
  const setNested = (key, sub, value) => setAbout((a) => ({ ...a, [key]: { ...a[key], [sub]: value } }));
  const setContacts = (v) => set('contacts', v);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/about`, about, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('About page saved', { description: 'Changes are now live on /about.' });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not save. Are you logged in as admin?');
    } finally { setSaving(false); }
  };

  if (loading || !about) return <div className="text-sm text-[#6B6480]">Loading About content…</div>;

  const hero = about.hero || {};
  const story = about.story || {};
  const teamIntro = about.teamIntro || {};
  const founders = about.founders || [];
  const team = about.team || [];
  const teamStats = about.teamStats || [];
  const investors = about.investors || {};
  const contacts = about.contacts || [];
  const vis = about.visibility || {};

  const SaveBtn = (
    <button onClick={save} disabled={saving} data-testid="about-save" className="btn-primary inline-flex items-center gap-1">
      {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save About page
    </button>
  );

  const toggle = (k, label) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-[#6C2BD9]" checked={vis[k] !== false} onChange={(e) => setNested('visibility', k, e.target.checked)} data-testid={`about-vis-${k}`} /> {label}
    </label>
  );

  return (
    <div className="space-y-6" data-testid="about-admin">
      <div className="flex items-center justify-end gap-2">{SaveBtn}</div>

      <Card title="Section visibility" desc="Show or hide each section of the /about page.">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {toggle('story', 'Our Story')}
          {toggle('teamIntro', 'Meet the Team intro')}
          {toggle('founders', 'Founders')}
          {toggle('team', 'Team')}
          {toggle('investors', 'Investors block')}
          {toggle('contacts', 'Get in touch')}
        </div>
      </Card>

      <Card title="Hero" desc="The top banner of the About page.">
        <div className="space-y-3">
          <div><Label>Headline</Label><Input value={hero.headline || ''} onChange={(e) => setNested('hero', 'headline', e.target.value)} className="h-10 mt-1.5" /></div>
          <div><Label>Body paragraphs</Label><div className="mt-1.5"><ParagraphList list={hero.body || []} onChange={(v) => setNested('hero', 'body', v)} /></div></div>
          <div className="flex items-center gap-3">
            <Label>Background colour</Label>
            <input type="color" value={hero.bgColor || '#6C2BD9'} onChange={(e) => setNested('hero', 'bgColor', e.target.value)} className="h-9 w-14 rounded border border-[#E8E1F0] bg-white" />
            <Input value={hero.bgColor || ''} onChange={(e) => setNested('hero', 'bgColor', e.target.value)} className="h-9 w-32" placeholder="#6C2BD9" />
          </div>
        </div>
      </Card>

      <Card title="Our Story + stats" desc="Heading, intro and the stats strip.">
        <div className="space-y-3">
          <div><Label>Heading</Label><Input value={story.heading || ''} onChange={(e) => setNested('story', 'heading', e.target.value)} className="h-10 mt-1.5" /></div>
          <div><Label>Intro paragraph</Label><Textarea value={story.intro || ''} onChange={(e) => setNested('story', 'intro', e.target.value)} rows={2} className="mt-1.5" /></div>
          <div><Label>Stats</Label><div className="mt-1.5"><StatsEditor list={story.stats || []} onChange={(v) => setNested('story', 'stats', v)} /></div></div>
        </div>
      </Card>

      <Card title="Meet the Team intro" desc="Intro heading and paragraphs above the founders.">
        <div className="space-y-3">
          <div><Label>Heading</Label><Input value={teamIntro.heading || ''} onChange={(e) => setNested('teamIntro', 'heading', e.target.value)} className="h-10 mt-1.5" /></div>
          <div><Label>Paragraphs</Label><div className="mt-1.5"><ParagraphList list={teamIntro.paragraphs || []} onChange={(v) => setNested('teamIntro', 'paragraphs', v)} /></div></div>
        </div>
      </Card>

      <Card title="Founders" desc="Photo, name, role, short + full bio and LinkedIn. Reorder with the arrows.">
        <PersonEditor list={founders} onChange={(v) => set('founders', v)} kind="founders" token={token} />
      </Card>

      <Card title="Team members" desc="Same fields as founders.">
        <PersonEditor list={team} onChange={(v) => set('team', v)} kind="team" token={token} />
      </Card>

      <Card title="Team stats" desc="The stats strip below the team cards.">
        <StatsEditor list={teamStats} onChange={(v) => set('teamStats', v)} />
      </Card>

      <Card title="Investors" desc="Hidden by default. Turn on the Investors toggle above to show this block.">
        <div className="space-y-4">
          <div><Label>Heading</Label><Input value={investors.heading || ''} onChange={(e) => setNested('investors', 'heading', e.target.value)} className="h-10 mt-1.5" /></div>
          <div><Label>Intro</Label><Textarea value={investors.intro || ''} onChange={(e) => setNested('investors', 'intro', e.target.value)} rows={2} className="mt-1.5" /></div>
          <div>
            <Label>Investor logos</Label>
            <div className="mt-1.5 space-y-3">
              {(investors.logos || []).map((l, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-[#E8E1F0] p-3">
                  <PhotoUpload value={l.url || ''} onChange={(url) => patchIn(investors.logos || [], (v) => setNested('investors', 'logos', v), i, { url })} token={token} label="logo" />
                  <Input value={l.name || ''} onChange={(e) => patchIn(investors.logos || [], (v) => setNested('investors', 'logos', v), i, { name: e.target.value })} className="h-9 flex-1" placeholder="Investor name (alt text)" />
                  <button onClick={() => removeIn(investors.logos || [], (v) => setNested('investors', 'logos', v), i)} className="h-8 w-8 shrink-0 grid place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button onClick={() => setNested('investors', 'logos', [...(investors.logos || []), { url: '', name: '' }])} className="btn-outline inline-flex items-center gap-1"><Plus className="h-4 w-4" /> Add logo</button>
            </div>
          </div>
          <div>
            <Label>Notable backers (person)</Label>
            <div className="mt-1.5 space-y-3">
              {(investors.people || []).map((p, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-[#E8E1F0] p-3">
                  <PhotoUpload value={p.photoUrl || ''} onChange={(url) => patchIn(investors.people || [], (v) => setNested('investors', 'people', v), i, { photoUrl: url })} token={token} round />
                  <Input value={p.name || ''} onChange={(e) => patchIn(investors.people || [], (v) => setNested('investors', 'people', v), i, { name: e.target.value })} className="h-9 flex-1" placeholder="Name" />
                  <Input value={p.org || ''} onChange={(e) => patchIn(investors.people || [], (v) => setNested('investors', 'people', v), i, { org: e.target.value })} className="h-9 flex-1" placeholder="Organisation" />
                  <button onClick={() => removeIn(investors.people || [], (v) => setNested('investors', 'people', v), i)} className="h-8 w-8 shrink-0 grid place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button onClick={() => setNested('investors', 'people', [...(investors.people || []), { photoUrl: '', name: '', org: '' }])} className="btn-outline inline-flex items-center gap-1"><Plus className="h-4 w-4" /> Add person</button>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Get in touch" desc="Contact cards (Individuals / Jobs / Press).">
        <div className="space-y-3">
          {contacts.map((c, i) => (
            <div key={c.id || i} className="rounded-xl border border-[#E8E1F0] p-4 grid sm:grid-cols-2 gap-3">
              <div><Label>Title</Label><Input value={c.title || ''} onChange={(e) => patchIn(contacts, setContacts, i, { title: e.target.value })} className="h-9 mt-1.5" /></div>
              <div><Label>Email</Label><Input value={c.email || ''} onChange={(e) => patchIn(contacts, setContacts, i, { email: e.target.value })} className="h-9 mt-1.5" placeholder="name@omnivest.in" /></div>
              <div className="sm:col-span-2"><Label>Text</Label><Textarea value={c.text || ''} onChange={(e) => patchIn(contacts, setContacts, i, { text: e.target.value })} rows={2} className="mt-1.5" /></div>
              <div className="sm:col-span-2 flex items-center justify-between gap-3">
                <Input value={c.link || ''} onChange={(e) => patchIn(contacts, setContacts, i, { link: e.target.value })} className="h-9 flex-1" placeholder="Optional link (used if no email)" />
                <button onClick={() => removeIn(contacts, setContacts, i)} className="h-8 w-8 shrink-0 grid place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          <button onClick={() => setContacts([...contacts, { id: uid(), title: '', text: '', email: '', link: '' }])} className="btn-outline inline-flex items-center gap-1"><Plus className="h-4 w-4" /> Add contact card</button>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">{SaveBtn}</div>
    </div>
  );
}

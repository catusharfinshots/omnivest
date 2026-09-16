import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { BookOpen, Plus, Loader2, Save, Trash2, ExternalLink, Image as ImageIcon, X, Eye, EyeOff, ArrowLeft, FileUp } from 'lucide-react';
import RichTextEditor from '../partner/RichTextEditor';
import { withOrigin } from '../../pages/LearnPage';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—');
const slugify = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const EMPTY = { title: '', slug: '', category: 'Basics', excerpt: '', body: '', related_portfolio_id: '', status: 'draft' };
const Label = ({ children }) => <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[#667085]">{children}</span>;
const Input = (props) => <input {...props} className={`mt-1.5 w-full h-11 rounded-xl border border-[#E8E1F0] px-3.5 text-[14px] text-[#0F1729] focus:border-[#6C2BD9] focus:outline-none focus:ring-2 focus:ring-[#6C2BD9]/15 ${props.className || ''}`} />;

/** Admin → Site content → Learn (blog): list of posts, and an editor with cover upload, related portfolio, draft/publish. */
export default function LearnAdmin({ token }) {
  const h = { headers: { Authorization: `Bearer ${token}` } };
  const [data, setData] = useState(null);
  const [live, setLive] = useState([]);
  const [editing, setEditing] = useState(null);   // null = list; {} = new; {id,...} = existing
  const [busy, setBusy] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const fileRef = useRef(null);
  const inlineRef = useRef(null);
  const mdRef = useRef(null);
  const [importNote, setImportNote] = useState(null);

  const load = async () => {
    try { const { data: d } = await axios.get(`${API}/admin/learn`, h); setData(d); } catch { toast.error('Could not load posts'); setData({ posts: [], categories: [] }); }
    try { const { data: l } = await axios.get(`${API}/portfolios`); setLive(l.portfolios || []); } catch { /* optional */ }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const open = async (p) => {
    if (!p) { setEditing({ ...EMPTY }); setSlugTouched(false); return; }
    try { const { data: d } = await axios.get(`${API}/admin/learn/${p.id}`, h); setEditing({ ...EMPTY, ...d.post, related_portfolio_id: d.post.related_portfolio_id || '' }); setSlugTouched(true); }
    catch { toast.error('Could not open the post'); }
  };
  const set = (k, v) => setEditing((e) => ({ ...e, [k]: v, ...(k === 'title' && !slugTouched ? { slug: slugify(v) } : {}) }));

  const save = async (status) => {
    if (!editing.title.trim() || editing.title.trim().length < 3) { toast.error('Give the post a title'); return; }
    if (status === 'published' && !editing.body.replace(/<[^>]*>/g, '').trim()) { toast.error('Write the body before publishing'); return; }
    setBusy(true);
    const payload = { title: editing.title, slug: editing.slug || slugify(editing.title), category: editing.category, excerpt: editing.excerpt, body: editing.body, related_portfolio_id: editing.related_portfolio_id || null, status: status || editing.status };
    try {
      const { data: d } = editing.id ? await axios.put(`${API}/admin/learn/${editing.id}`, payload, h) : await axios.post(`${API}/admin/learn`, payload, h);
      setEditing({ ...EMPTY, ...d.post, related_portfolio_id: d.post.related_portfolio_id || '' });
      toast.success(status === 'published' ? 'Published. It is live on /learn.' : status === 'draft' && editing.status === 'published' ? 'Unpublished. Hidden from readers.' : 'Saved');
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail?.[0]?.msg || e?.response?.data?.detail || 'Could not save'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!editing.id) { setEditing(null); return; }
    if (!window.confirm(`Delete "${editing.title}"? Readers will get a not-found page for its link.`)) return;
    try { await axios.delete(`${API}/admin/learn/${editing.id}`, h); toast.success('Deleted'); setEditing(null); await load(); } catch { toast.error('Could not delete'); }
  };
  const upload = async (file) => {
    if (!file) return;
    if (!editing.id) { toast.error('Save the draft once, then add the cover'); return; }
    const fd = new FormData(); fd.append('file', file);
    setBusy(true);
    try { const { data: d } = await axios.post(`${API}/admin/learn/${editing.id}/cover`, fd, h); setEditing((e) => ({ ...e, cover_url: d.cover_url, cover_asset: d.cover_asset })); toast.success('Cover added'); await load(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Could not upload'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const insertImages = async (files) => {
    if (!files || !files.length) return;
    if (!editing.id) { toast.error('Save the draft once, then add images'); return; }
    const fd = new FormData(); Array.from(files).forEach((f) => fd.append('files', f));
    setBusy(true);
    try {
      const { data: d } = await axios.post(`${API}/admin/learn/${editing.id}/assets`, fd, h);
      const figs = d.assets.map((a) => `<figure><img src="${a.url}" alt="" loading="lazy" /><figcaption>Figure: Omnivest</figcaption></figure><p></p>`).join('');
      setEditing((e) => ({ ...e, body: (e.body || '') + figs }));
      toast.success(`${d.assets.length} image${d.assets.length === 1 ? '' : 's'} added at the end. Drag the caption text to edit it.`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not upload'); }
    finally { setBusy(false); if (inlineRef.current) inlineRef.current.value = ''; }
  };
  const importMd = async (files) => {
    if (!files || !files.length) return;
    if (!editing.id) { toast.error('Save the draft once, then import'); return; }
    const list = Array.from(files); const md = list.find((f) => /\.(md|markdown|txt)$/i.test(f.name));
    if (!md) { toast.error('Pick the .md file (and its images) together'); return; }
    const fd = new FormData(); fd.append('md', md); list.filter((f) => f !== md).forEach((f) => fd.append('images', f));
    setBusy(true);
    try {
      const { data: d } = await axios.post(`${API}/admin/learn/${editing.id}/import`, fd, h);
      setEditing({ ...EMPTY, ...d.post, related_portfolio_id: d.post.related_portfolio_id || '' }); setSlugTouched(true);
      setImportNote(d.import);
      toast.success(d.import.missing_images.length ? `Imported. ${d.import.missing_images.length} image${d.import.missing_images.length === 1 ? '' : 's'} still to attach.` : 'Imported with every image in place.');
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not import'); }
    finally { setBusy(false); if (mdRef.current) mdRef.current.value = ''; }
  };
  const removeCover = async () => {
    try { await axios.delete(`${API}/admin/learn/${editing.id}/cover`, h); setEditing((e) => ({ ...e, cover_url: null, cover_asset: null })); await load(); } catch { toast.error('Could not remove'); }
  };

  if (editing) {
    const isPub = editing.status === 'published';
    return (
      <div className="space-y-5" data-testid="learn-editor">
        <button type="button" onClick={() => setEditing(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-[#6C2BD9] h-10"><ArrowLeft className="h-4 w-4" /> All posts</button>
        <div className="surface p-5 grid lg:grid-cols-[1fr_300px] gap-6">
          <div className="space-y-4 min-w-0">
            <label className="block"><Label>Title</Label><Input value={editing.title} onChange={(e) => set('title', e.target.value)} maxLength={140} placeholder="What is a model portfolio, really?" data-testid="learn-title" /></label>
            <label className="block"><Label>Link</Label><div className="mt-1.5 flex items-center h-11 rounded-xl border border-[#E8E1F0] overflow-hidden"><span className="px-3 text-[13px] text-[#667085] bg-[#FBFAFD] h-full inline-flex items-center border-r border-[#E8E1F0] whitespace-nowrap">omnivest.in/learn/</span><input value={editing.slug} onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value)); }} className="flex-1 min-w-0 h-full px-3 text-[14px] text-[#0F1729] focus:outline-none" data-testid="learn-slug" /></div></label>
            <label className="block"><Label>One-line summary (shows on the card and in the WhatsApp preview)</Label><Input value={editing.excerpt} onChange={(e) => set('excerpt', e.target.value)} maxLength={240} placeholder="The evidence is more nuanced than most people think." /></label>
            <div>
              <div className="flex items-end justify-between gap-2 flex-wrap"><Label>Body</Label>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => inlineRef.current?.click()} disabled={busy || !editing.id} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#E8E1F0] text-[12.5px] font-semibold text-[#0F1729] hover:bg-[#FBFAFD] disabled:opacity-50" title={editing.id ? 'Add pictures inside the article' : 'Save the draft first'} data-testid="learn-insert-image"><ImageIcon className="h-4 w-4 text-[#6C2BD9]" /> Insert image</button>
                  <button type="button" onClick={() => mdRef.current?.click()} disabled={busy || !editing.id} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#E8E1F0] text-[12.5px] font-semibold text-[#0F1729] hover:bg-[#FBFAFD] disabled:opacity-50" title={editing.id ? 'Pick a .md file together with its images' : 'Save the draft first'} data-testid="learn-import-md"><FileUp className="h-4 w-4 text-[#6C2BD9]" /> Import .md + images</button>
                  <input ref={inlineRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => insertImages(e.target.files)} />
                  <input ref={mdRef} type="file" multiple accept=".md,.markdown,.txt,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => importMd(e.target.files)} />
                </div>
              </div>
              {importNote && (
                <div className={`mt-2 rounded-lg px-3 py-2 text-[12.5px] ${importNote.missing_images.length ? 'bg-[#FEF3C7] text-[#9A4A05]' : 'bg-[#E3F4EB] text-[#096B3E]'}`} data-testid="learn-import-note">
                  {importNote.images_attached} image{importNote.images_attached === 1 ? '' : 's'} attached{importNote.cover_set ? ', first one set as cover' : ''}{importNote.title_set ? ', title taken from the file' : ''}.
                  {importNote.missing_images.length > 0 && <> Still to attach: <b>{importNote.missing_images.join(', ')}</b>. Use Insert image, or import again with those files.</>}
                </div>
              )}
              <div className="mt-1.5"><RichTextEditor value={withOrigin(editing.body)} onChange={(v) => set('body', v)} minHeight={360} placeholder="Write the guide. Headings, bold, lists and links are kept; everything else is stripped." testId="learn-body" /></div></div>
          </div>
          <aside className="space-y-4">
            <div className="rounded-xl border border-[#E8E1F0] p-3.5">
              <div className="text-[13px] font-semibold text-[#0F1729] flex items-center gap-2">{isPub ? <Eye className="h-4 w-4 text-[#0B7F4A]" /> : <EyeOff className="h-4 w-4 text-[#9A4A05]" />} {isPub ? 'Published' : 'Draft'}</div>
              <div className="text-[12px] text-[#667085] mt-0.5">{isPub ? `Live since ${day(editing.published_at)}. Readers, the Dashboard and share previews all see it.` : 'Only you can see it. Publish when the body is ready.'}</div>
              <div className="mt-3 grid gap-2">
                {!isPub && <button type="button" onClick={() => save('published')} disabled={busy} className="btn-primary h-11 w-full disabled:opacity-60" data-testid="learn-publish">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Publish</button>}
                <button type="button" onClick={() => save(editing.status)} disabled={busy} className={`${isPub ? 'btn-primary' : 'btn-outline'} h-11 w-full disabled:opacity-60`} data-testid="learn-save">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {isPub ? 'Save changes' : 'Save draft'}</button>
                {isPub && <button type="button" onClick={() => save('draft')} disabled={busy} className="btn-outline h-11 w-full disabled:opacity-60">Unpublish</button>}
                {isPub && editing.slug && <a href={`/learn/${editing.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 h-10 text-[13px] font-semibold text-[#6C2BD9]"><ExternalLink className="h-4 w-4" /> Open the live page</a>}
              </div>
            </div>
            <label className="block"><Label>Category</Label>
              <select value={editing.category} onChange={(e) => set('category', e.target.value)} className="mt-1.5 w-full h-11 rounded-xl border border-[#E8E1F0] px-3 text-[14px] text-[#0F1729] bg-white">{(data?.categories || ['Basics']).map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <div><Label>Cover image</Label>
              <div className="mt-1.5 rounded-xl border border-dashed border-[#E8E1F0] overflow-hidden">
                {editing.cover_url
                  ? <div className="relative"><img src={`${process.env.REACT_APP_BACKEND_URL || ''}${editing.cover_url}`} alt="" className="w-full h-36 object-cover" /><button type="button" onClick={removeCover} className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/90 grid place-items-center" aria-label="Remove cover"><X className="h-4 w-4" /></button></div>
                  : <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-36 grid place-items-center text-[13px] text-[#667085] hover:bg-[#FBFAFD]"><span className="flex flex-col items-center gap-1.5"><ImageIcon className="h-6 w-6 text-[#6C2BD9]" /> {editing.id ? 'Add a cover (PNG, JPG, WebP, up to 3 MB)' : 'Save the draft first, then add a cover'}</span></button>}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
              </div>
              <div className="text-[11.5px] text-[#667085] mt-1">Without one, the post gets a brand gradient. The WhatsApp card uses whichever you choose.</div>
            </div>
            <label className="block"><Label>Portfolio this guide is about (optional)</Label>
              <select value={editing.related_portfolio_id} onChange={(e) => set('related_portfolio_id', e.target.value)} className="mt-1.5 w-full h-11 rounded-xl border border-[#E8E1F0] px-3 text-[14px] text-[#0F1729] bg-white" data-testid="learn-related">
                <option value="">None</option>
                {live.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <div className="text-[11.5px] text-[#667085] mt-1">Adds an "Invest" card at the end of the post, the way smallcase links a story to its basket.</div>
            </label>
            {editing.id && <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 h-10 text-[13px] font-semibold text-[#B91C1C]"><Trash2 className="h-4 w-4" /> Delete this post</button>}
          </aside>
        </div>
      </div>
    );
  }

  const rows = data?.posts || [];
  const published = rows.filter((p) => p.status === 'published');
  return (
    <div className="space-y-5" data-testid="learn-admin">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><BookOpen className="h-5 w-5 text-[#6C2BD9]" /> Learn (blog)</h2>
          <p className="text-sm text-[#526071] mt-1">{published.length} published · {rows.length - published.length} draft{rows.length - published.length === 1 ? '' : 's'}. The six starter titles are drafts from the old placeholder page; rewrite, publish or delete them.</p>
        </div>
        <button type="button" onClick={() => open(null)} className="btn-primary h-11" data-testid="learn-new"><Plus className="h-4 w-4" /> New post</button>
      </div>
      <div className="surface overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead><tr className="text-[11px] uppercase tracking-wider text-[#667085] bg-[#FBFAFD]"><th className="text-left px-4 py-2">Post</th><th className="text-left px-3 py-2">Category</th><th className="text-left px-3 py-2">Status</th><th className="text-right px-3 py-2">Views</th><th className="text-left px-4 py-2">Updated</th></tr></thead>
          <tbody>
            {!data && <tr><td colSpan={5} className="px-4 py-6 text-[#667085]"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</td></tr>}
            {data && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-[#667085]">No posts yet. Write the first one.</td></tr>}
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-[#F1EDF7] hover:bg-[#FBFAFD] cursor-pointer" onClick={() => open(p)} data-testid="learn-row">
                <td className="px-4 py-2.5"><div className="flex items-center gap-3"><span className="h-10 w-14 rounded-lg bg-gradient-to-br from-[#6C2BD9] to-[#9F67FF] overflow-hidden shrink-0">{p.cover_url && <img src={`${process.env.REACT_APP_BACKEND_URL || ''}${p.cover_url}`} alt="" className="h-full w-full object-cover" />}</span><span className="min-w-0"><span className="block font-semibold text-[#0F1729] truncate max-w-[360px]">{p.title}</span><span className="block text-xs text-[#667085] truncate max-w-[360px]">/learn/{p.slug}</span></span></div></td>
                <td className="px-3 py-2.5 text-[#526071]">{p.category}</td>
                <td className="px-3 py-2.5">{p.status === 'published' ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#096B3E] bg-[#E3F4EB] rounded-full px-2 py-0.5"><Eye className="h-3 w-3" /> Published</span> : <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#9A4A05] bg-[#FEF3C7] rounded-full px-2 py-0.5"><EyeOff className="h-3 w-3" /> Draft</span>}</td>
                <td className="px-3 py-2.5 text-right num">{p.views || 0}</td>
                <td className="px-4 py-2.5 text-[#526071]">{day(p.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

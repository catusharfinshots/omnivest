import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Lock, Globe, Pencil, Trash2, Send, Loader2, MessageSquare } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import RichTextEditor from './RichTextEditor';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const nice = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const BLANK = { title: '', body: '', subscribers_only: true };

// Partner's updates feed for one listing (rebalance notes, company updates, market views).
export default function PostsManager({ token, portfolio, onBack }) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const [posts, setPosts] = useState(null);
  const [draft, setDraft] = useState({ ...BLANK, subscribers_only: portfolio.subscription === 'Paid' });
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const paid = portfolio.subscription === 'Paid';

  const load = async () => {
    try { const { data } = await axios.get(`${API}/analyst/portfolios/${portfolio.id}/posts`, auth); setPosts(data.posts || []); }
    catch { setPosts([]); toast.error('Could not load updates'); }
  };
  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [portfolio.id]);

  const save = async () => {
    if (!draft.title.trim()) { toast.error('Give the update a title'); return; }
    if (!(draft.body || '').replace(/<[^>]*>/g, '').trim()) { toast.error('Write something in the update'); return; }
    setBusy(true);
    try {
      if (editingId) await axios.put(`${API}/analyst/portfolios/${portfolio.id}/posts/${editingId}`, draft, auth);
      else await axios.post(`${API}/analyst/portfolios/${portfolio.id}/posts`, draft, auth);
      toast.success(editingId ? 'Update saved' : 'Update published');
      setDraft({ ...BLANK, subscribers_only: paid }); setEditingId(null);
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not save'); }
    finally { setBusy(false); }
  };
  const remove = async (id) => {
    try { await axios.delete(`${API}/analyst/portfolios/${portfolio.id}/posts/${id}`, auth); toast.success('Removed'); await load(); }
    catch { toast.error('Could not remove'); }
  };

  return (
    <div className="max-w-3xl" data-testid="posts-manager">
      <button onClick={onBack} className="btn-ghost text-xs mb-3"><ArrowLeft className="h-3.5 w-3.5" /> Back to list</button>
      <h1 className="text-2xl font-bold">Updates — {portfolio.name}</h1>
      <p className="text-sm text-[#6B6480] mt-1">
        Keep investors close: rebalance reasoning, company news, market views. {paid ? 'Subscriber-only updates show only a title to non-subscribers — your best retention tool.' : 'This is a free listing, so every update is public.'}
      </p>

      <section className="surface p-6 mt-5">
        <div className="text-sm font-semibold">{editingId ? 'Edit update' : 'New update'}</div>
        <div className="mt-3"><Label>Title</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-1.5 h-10" placeholder="e.g. Why we added Infosys this quarter" data-testid="post-title" /></div>
        <div className="mt-3"><Label>Update</Label><div className="mt-1.5"><RichTextEditor value={draft.body} onChange={(v) => setDraft({ ...draft, body: v })} placeholder="What changed and why…" minHeight={140} testId="post-body" /></div></div>
        {paid && (
          <label className="mt-3 flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-[#6C2BD9]" checked={draft.subscribers_only} onChange={(e) => setDraft({ ...draft, subscribers_only: e.target.checked })} />
            Subscribers only <span className="text-xs text-[#6B6480]">(others see the title and a lock)</span>
          </label>
        )}
        <div className="mt-4 flex items-center gap-2">
          <button onClick={save} disabled={busy} className="btn-primary text-sm" data-testid="post-save">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {editingId ? 'Save changes' : 'Publish update'}</button>
          {editingId && <button onClick={() => { setEditingId(null); setDraft({ ...BLANK, subscribers_only: paid }); }} className="btn-outline text-sm">Cancel</button>}
        </div>
      </section>

      <section className="mt-5 space-y-3">
        {posts === null && <div className="text-sm text-[#6B6480]">Loading…</div>}
        {posts && posts.length === 0 && (
          <div className="surface p-8 text-center text-[#6B6480]"><MessageSquare className="h-6 w-6 mx-auto text-[#C4B5FD]" /><div className="mt-2 text-sm">No updates yet. Investors who see regular updates stay invested longer.</div></div>
        )}
        {(posts || []).map((p) => (
          <div key={p.id} className="surface p-4" data-testid="post-row">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className="font-semibold text-[#1A1030] truncate">{p.title}</span>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${p.subscribers_only && paid ? 'bg-[#EDE9FE] text-[#6C2BD9]' : 'bg-[#F1F1F4] text-[#6B6480]'}`}>{p.subscribers_only && paid ? <><Lock className="h-3 w-3" /> subscribers</> : <><Globe className="h-3 w-3" /> public</>}</span>
                </div>
                <div className="text-xs text-[#94A3B8] mt-0.5">{nice(p.created_at)}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { setEditingId(p.id); setDraft({ title: p.title, body: p.body, subscribers_only: !!p.subscribers_only }); window.scrollTo({ top: 0 }); }} className="btn-ghost text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                <button onClick={() => remove(p.id)} className="h-8 w-8 grid place-items-center rounded-lg text-[#DC2626] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="rich-text mt-2 text-sm text-[#4B4560]" dangerouslySetInnerHTML={{ __html: p.body }} />
          </div>
        ))}
      </section>
    </div>
  );
}

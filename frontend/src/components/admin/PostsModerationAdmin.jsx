import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { MessageSquare, Trash2, Lock, Globe, RefreshCw } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const nice = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const plain = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// Light-touch moderation of partner updates: see the latest posts across listings, remove one with a reason.
export default function PostsModerationAdmin({ token }) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const [posts, setPosts] = useState(null);
  const load = async () => { try { const { data } = await axios.get(`${API}/admin/posts`, auth); setPosts(data.posts || []); } catch { setPosts([]); } };
  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [token]);

  const remove = async (p) => {
    const reason = window.prompt(`Remove “${p.title}”? Give a reason (logged):`);
    if (!reason || reason.trim().length < 3) return;
    try { await axios.delete(`${API}/admin/posts/${p.id}`, { ...auth, data: { reason } }); toast.success('Update removed'); await load(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Could not remove'); }
  };

  return (
    <section className="surface p-6 mt-4" data-testid="posts-moderation">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-[#6C2BD9]" /> Partner updates</div>
          <div className="text-xs text-[#6B6480] mt-0.5">Latest posts across all listings. Remove anything that is not research (promotions, tips, guarantees).</div>
        </div>
        <button onClick={load} className="btn-ghost text-xs"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      {posts === null ? <div className="mt-4 text-sm text-[#6B6480]">Loading…</div> : posts.length === 0 ? <div className="mt-4 text-sm text-[#6B6480]">No updates posted yet.</div> : (
        <div className="mt-4 space-y-2">
          {posts.slice(0, 30).map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-[#EEE8F7] px-3 py-2" data-testid="mod-post">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#1A1030] truncate">{p.title} <span className="text-[#94A3B8] font-normal">· {p.portfolio_name}</span></div>
                <div className="text-[11px] text-[#94A3B8] flex items-center gap-2">{nice(p.created_at)} {p.subscribers_only ? <span className="inline-flex items-center gap-0.5"><Lock className="h-3 w-3" /> subscribers</span> : <span className="inline-flex items-center gap-0.5"><Globe className="h-3 w-3" /> public</span>}</div>
                <div className="text-xs text-[#6B6480] mt-0.5 line-clamp-2">{plain(p.body)}</div>
              </div>
              <button onClick={() => remove(p)} className="h-8 w-8 grid place-items-center rounded-lg text-[#DC2626] hover:bg-[#FEF2F2] shrink-0" title="Remove"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

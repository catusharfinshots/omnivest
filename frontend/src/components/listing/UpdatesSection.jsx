import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Lock, MessageSquare } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const nice = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// Partner updates feed. On paid listings, subscriber-only posts show a title + lock
// to non-subscribers; on free listings everything is open.
export default function UpdatesSection({ basket, token, onSubscribe, managerName }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let active = true;
    axios.get(`${API}/portfolios/${basket.id}/posts`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      .then((r) => { if (active) setData(r.data); }).catch(() => { if (active) setData({ posts: [] }); });
    return () => { active = false; };
  }, [basket.id, token]);

  if (!data) return <div className="text-sm text-[#526071]">Loading updates…</div>;
  const posts = data.posts || [];
  if (posts.length === 0) {
    return (
      <div className="surface p-8 text-center" data-testid="updates-empty">
        <MessageSquare className="h-6 w-6 mx-auto text-[#C4B5FD]" />
        <div className="mt-2 text-sm font-semibold text-[#1A1030]">No updates yet</div>
        <div className="text-xs text-[#526071] mt-1">{managerName || 'The manager'} will post rebalance reasoning and market views here.</div>
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="updates-section">
      {posts.map((p) => (
        <article key={p.id} className="surface p-5">
          <div className="flex items-center gap-2 text-xs text-[#526071]">
            <span className="h-7 w-7 rounded-full grad-accent text-white grid place-items-center text-[12px] font-bold">{(managerName || 'RA').slice(0, 2).toUpperCase()}</span>
            <span className="font-semibold text-[#1A1030]">{managerName}</span> · {nice(p.created_at)}
            {p.subscribers_only && data.paid && <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-bold uppercase rounded-full bg-[#EDE9FE] text-[#6C2BD9] px-2 py-0.5"><Lock className="h-3 w-3" /> Subscribers only</span>}
          </div>
          <h4 className="mt-2 text-base font-semibold text-[#1A1030]">{p.title}</h4>
          {p.locked ? (
            <div className="mt-3 rounded-xl border border-dashed border-[#D8C7F1] bg-[#FBF9FE] p-5 text-center">
              <Lock className="h-5 w-5 mx-auto text-[#6C2BD9]" />
              <div className="mt-1.5 text-sm font-semibold text-[#1A1030]">Subscribe to read this update</div>
              <div className="text-xs text-[#526071] mt-0.5">Access {managerName}'s research and rebalance notes.</div>
              <button type="button" onClick={onSubscribe} className="btn-primary text-xs mt-3">Subscribe now</button>
            </div>
          ) : (
            <div className="rich-text mt-2 text-[15px] text-[#475569]" dangerouslySetInnerHTML={{ __html: p.body }} />
          )}
        </article>
      ))}
    </div>
  );
}

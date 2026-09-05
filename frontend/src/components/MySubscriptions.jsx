import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Lock, ArrowRight } from 'lucide-react';
import CoverArt from './CoverArt';
import { Badge } from './Tone';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const nice = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Investor dashboard: the paid listings this person has access to, and until when. */
export default function MySubscriptions({ token }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/me/subscriptions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => setRows(data.subscriptions || []))
      .catch(() => setRows([]));
  }, [token]);
  if (!rows || rows.length === 0) return null;
  return (
    <div className="mt-10" data-testid="my-subscriptions">
      <h2 className="text-lg font-semibold flex items-center gap-2"><Lock className="h-4 w-4 text-[#0B7F4A]" /> My subscriptions</h2>
      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((s) => (
          <Link key={s.id} to={`/model-portfolios/${s.portfolio_id}`} className="surface lift p-4 flex items-start gap-3">
            {s.listing?.cover ? <CoverArt cover={s.listing.cover} name={s.listing?.name} size={44} radius={12} /> : <span className="h-11 w-11 rounded-xl grad-card" />}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[#0F1729] truncate">{s.listing?.name || 'Listing'}</div>
              <div className="text-xs text-[#526071] mt-0.5">by {s.listing?.owner_name || '—'} · {s.plan_months} month plan</div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                {s.active ? <Badge tone="pos">Active until {nice(s.expires_at)}</Badge> : s.status === 'cancelled' ? <Badge tone="neg">Cancelled</Badge> : <Badge tone="neutral">Expired {nice(s.expires_at)}</Badge>}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-[#98A2B3] mt-1 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

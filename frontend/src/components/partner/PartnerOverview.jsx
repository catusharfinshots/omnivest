import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion, useReducedMotion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Eye, MousePointerClick, Percent, LayoutGrid, Sparkles, ArrowUpRight, ArrowDownRight, Megaphone, FileDown, Share2, Plus } from 'lucide-react';
import CountUpStat from '../CountUpStat';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const RANGES = [7, 30, 90];

function Reveal({ children, delay = 0, className = '' }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay, ease: 'easeOut' }}>
      {children}
    </motion.div>
  );
}

function Delta({ cur, prev, suffix = '' }) {
  if (!prev && !cur) return <span className="text-[11px] text-[#94A3B8]">no prior data</span>;
  if (!prev) return <span className="text-[11px] font-semibold text-[#0E9F5E] inline-flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3" /> new</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  return (
    <span className={`text-[11px] font-semibold inline-flex items-center gap-0.5 ${up ? 'text-[#0E9F5E]' : 'text-[#DC2626]'}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />} {Math.abs(pct)}%{suffix} vs prior
    </span>
  );
}

function Tile({ icon: Icon, label, value, prev, delay, isPct }) {
  return (
    <Reveal delay={delay}>
      <div className="surface p-5 h-full" data-testid={`tile-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">{label}</div>
          <span className="h-8 w-8 rounded-lg bg-[#EDE9FE] text-[#5320A8] grid place-items-center"><Icon className="h-4 w-4" /></span>
        </div>
        <div className="mt-3 text-3xl font-bold text-[#1A1030] tabular-nums"><CountUpStat value={isPct ? `${value}%` : String(value)} /></div>
        <div className="mt-1.5"><Delta cur={value} prev={prev} /></div>
      </div>
    </Reveal>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse" data-testid="overview-skeleton">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-[#EDE9FE]/60" />)}</div>
      <div className="h-64 rounded-2xl bg-[#EDE9FE]/60" />
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4"><div className="h-56 rounded-2xl bg-[#EDE9FE]/60" /><div className="h-56 rounded-2xl bg-[#EDE9FE]/60" /></div>
    </div>
  );
}

const STATUS_CLS = { approved: 'bg-[#DCFCE7] text-[#0E9F5E]', pending: 'bg-[#FEF3C7] text-[#B45309]', rejected: 'bg-[#FEE2E2] text-[#DC2626]', draft: 'bg-[#F1F5F9] text-[#64748B]' };

export default function PartnerOverview({ token, onNew, onEdit, onProfile }) {
  const [days, setDays] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  useEffect(() => {
    if (days !== null) return;
    axios.get(`${API}/partner-dashboard/settings`).then(({ data: d }) => setDays(d.settings?.defaultWindowDays || 30)).catch(() => setDays(30));
  }, [days]);

  useEffect(() => {
    if (days === null) return;
    setData(null); setError('');
    axios.get(`${API}/analyst/stats`, { ...auth, params: { days } })
      .then(({ data: d }) => setData(d))
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load your stats right now.'));
  }, [days, auth]);

  if (error) return <div className="surface p-6 text-sm text-[#DC2626]">{error}</div>;
  if (!data) return <Skeleton />;

  const { totals, previous, series, portfolios, nudges, settings } = data;
  const tiles = settings?.tiles || {};
  const hasAnyTraffic = totals.views + totals.impressions + totals.investClicks > 0;
  const chartData = series.map((s) => ({ ...s, label: s.date.slice(5).replace('-', '/') }));

  return (
    <div className="space-y-5" data-testid="partner-overview">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-lg font-bold text-[#1A1030]">Overview</div>
          <div className="text-xs text-[#6B6480]">How investors are discovering and engaging with your portfolios.</div>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-[#F1F5F9] p-1" data-testid="range-picker">
          {RANGES.map((r) => (
            <button key={r} type="button" onClick={() => setDays(r)}
              className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors ${days === r ? 'bg-white text-[#1A1030] shadow-sm' : 'text-[#64748B] hover:text-[#1A1030]'}`}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      {settings?.announcement && (
        <Reveal>
          <div className="rounded-xl border border-[#D8C7F1] bg-[#F1E7FE] px-4 py-3 text-sm text-[#5320A8] flex items-start gap-2.5" data-testid="partner-announcement">
            <Megaphone className="h-4 w-4 mt-0.5 shrink-0" /> {settings.announcement}
          </div>
        </Reveal>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.views !== false && <Tile icon={Eye} label="Portfolio views" value={totals.views} prev={previous.views} delay={0} />}
        {tiles.impressions !== false && <Tile icon={LayoutGrid} label="Listing impressions" value={totals.impressions} prev={previous.impressions} delay={0.06} />}
        {tiles.investClicks !== false && <Tile icon={MousePointerClick} label="Invest clicks" value={totals.investClicks} prev={previous.investClicks} delay={0.12} />}
        {tiles.conversion !== false && <Tile icon={Percent} label="View to invest" value={totals.conversionPct} prev={previous.conversionPct} delay={0.18} isPct />}
      </div>

      <Reveal delay={0.2}>
        <div className="surface p-5" data-testid="overview-chart">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[#1A1030]">Daily views & invest clicks</div>
            <div className="flex items-center gap-3 text-[11px] text-[#64748B]">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#6C2BD9]" /> Views</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#12B76A]" /> Invest clicks</span>
            </div>
          </div>
          {hasAnyTraffic ? (
            <div className="mt-4 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6C2BD9" stopOpacity={0.35} /><stop offset="100%" stopColor="#6C2BD9" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gClicks" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#12B76A" stopOpacity={0.35} /><stop offset="100%" stopColor="#12B76A" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#F1EBF9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E8E1F0', fontSize: 12 }} />
                  <Area type="monotone" dataKey="views" name="Views" stroke="#6C2BD9" strokeWidth={2} fill="url(#gViews)" dot={{ r: 2.5, fill: '#6C2BD9', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="investClicks" name="Invest clicks" stroke="#12B76A" strokeWidth={2} fill="url(#gClicks)" dot={{ r: 2.5, fill: '#12B76A', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border-2 border-dashed border-[#E8E1F0] p-8 text-center" data-testid="overview-empty">
              <span className="h-12 w-12 mx-auto rounded-2xl bg-[#F1E7FE] text-[#6C2BD9] grid place-items-center"><Sparkles className="h-5 w-5" /></span>
              <div className="mt-3 text-sm font-semibold text-[#1A1030]">{portfolios.length ? 'Your listings are live — traffic will show up here' : 'No traffic yet'}</div>
              <div className="mt-1 text-xs text-[#64748B] max-w-md mx-auto">
                {portfolios.length
                  ? 'Every time an investor sees or opens one of your portfolios, it lands on this chart. Share your listing link to get the first views rolling.'
                  : 'Publish your first model portfolio and this dashboard starts filling with views, opens and invest clicks.'}
              </div>
              {!portfolios.length && <button type="button" onClick={onNew} className="btn-primary mt-4"><Plus className="h-4 w-4" /> Create a portfolio</button>}
            </div>
          )}
        </div>
      </Reveal>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <Reveal delay={0.26}>
          <div className="surface p-5 h-full" data-testid="overview-portfolios">
            <div className="text-sm font-semibold text-[#1A1030]">By portfolio</div>
            {portfolios.length === 0 ? (
              <div className="mt-3 text-xs text-[#94A3B8]">No portfolios yet.</div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-[#94A3B8]">
                      <th className="py-2 pr-2 font-bold">Portfolio</th>
                      <th className="py-2 px-2 font-bold text-right">Impr.</th>
                      <th className="py-2 px-2 font-bold text-right">Views</th>
                      <th className="py-2 px-2 font-bold text-right">Invest</th>
                      <th className="py-2 pl-2 font-bold w-32">Conversion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolios.map((p) => (
                      <tr key={p.id} className="border-t border-[#F1EBF9]">
                        <td className="py-2.5 pr-2">
                          <button type="button" onClick={() => onEdit && onEdit(p.id)} className="font-semibold text-[#1A1030] hover:text-[#6C2BD9] text-left">{p.name}</button>
                          <span className={`ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${STATUS_CLS[p.status] || STATUS_CLS.draft}`}>{p.status}</span>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-[#475569]">{p.impressions}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-[#475569]">{p.views}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-[#475569]">{p.investClicks}</td>
                        <td className="py-2.5 pl-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden"><div className="h-full rounded-full bg-[#6C2BD9]" style={{ width: `${Math.min(100, p.conversionPct)}%` }} /></div>
                            <span className="w-10 text-right tabular-nums text-[#475569]">{p.conversionPct}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex items-center gap-4 text-[11px] text-[#94A3B8]">
                  <span className="inline-flex items-center gap-1"><FileDown className="h-3 w-3" /> {totals.factsheetDownloads} factsheet downloads</span>
                  <span className="inline-flex items-center gap-1"><Share2 className="h-3 w-3" /> {totals.shares} shares</span>
                </div>
              </div>
            )}
          </div>
        </Reveal>

        <Reveal delay={0.32}>
          <div className="surface p-5 h-full" data-testid="overview-nudges">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1A1030]"><Sparkles className="h-4 w-4 text-[#6C2BD9]" /> Ways to grow</div>
            {(!nudges || nudges.length === 0) ? (
              <div className="mt-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] px-3 py-2.5 text-xs text-[#0E9F5E] font-medium">Everything looks great — your listings are complete and fresh. 🎉</div>
            ) : (
              <div className="mt-3 space-y-2.5">
                {nudges.map((n, i) => (
                  <div key={i} className="rounded-xl border border-[#E8E1F0] bg-white p-3" data-testid={`nudge-${n.kind}`}>
                    <div className="text-xs text-[#475569] leading-relaxed">{n.text}</div>
                    <button type="button" className="mt-2 text-[11px] font-semibold text-[#6C2BD9] hover:underline"
                      onClick={() => { if (n.action === 'new') onNew && onNew(); else if (n.action === 'profile') onProfile && onProfile(); else if (n.portfolio_id) onEdit && onEdit(n.portfolio_id); }}>
                      {n.action === 'new' ? 'Create a portfolio →' : n.action === 'profile' ? 'Edit profile →' : 'Open listing →'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </div>
  );
}

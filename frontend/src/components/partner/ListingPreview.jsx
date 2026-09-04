import React from 'react';
import { TrendingUp, Layers, ShieldCheck, IndianRupee, Sparkles, PlayCircle } from 'lucide-react';
import CoverArt from '../CoverArt';
import { Badge, AccessBadge } from '../Tone';

const CAP_COLORS = { Large: '#6C2BD9', Mid: '#A78BFA', Small: '#F59E0B', Micro: '#F97316', Other: '#CBD5E1' };
const plainText = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// What investors will see — rendered live while the partner edits.
export default function ListingPreview({ form, perf, classification, managerName, compact = false }) {
  const cons = (form.constituents || []).filter((c) => (c.symbol || '').trim());
  const total = cons.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const minInv = perf?.min_investment?.amount;
  const dist = perf?.distribution || classification || null;
  const capEntries = dist?.cap ? Object.entries(dist.cap) : [];
  const sectorEntries = dist?.sector ? Object.entries(dist.sector).slice(0, 4) : [];
  const paid = form.subscription === 'Paid';
  const cheapest = paid && (form.plans || []).filter((p) => Number(p.price) > 0).sort((a, b) => a.price / a.months - b.price / b.months)[0];
  const rationale = plainText(form.rationale);

  return (
    <div className="rounded-2xl border border-[#E8E1F0] bg-white overflow-hidden shadow-[0_12px_40px_-28px_rgba(108,43,217,0.45)]" data-testid="listing-preview">
      <div className="grad-hero px-5 pt-5 pb-4 border-b border-[#EEE8F7]">
        <div className="flex items-start gap-3">
          <CoverArt cover={form.cover && form.cover.kind ? form.cover : { kind: 'auto', theme: 'default', palette: 'violet' }} name={form.name} size={52} radius={16} />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-[#1A1030] leading-tight truncate">{form.name || 'Your portfolio name'}</div>
            <div className="text-xs text-[#6B6480] mt-0.5">by {managerName || 'You'}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {form.strategy && <Badge tone="neutral" icon={<Layers className="h-3 w-3" aria-hidden="true" />}>{form.strategy.replace('-', ' ')}</Badge>}
              {(form.tags || []).map((t) => <Badge key={t} tone="info">{t}</Badge>)}
              <AccessBadge paid={paid} perMonth={paid && cheapest ? cheapest.price / (cheapest.months || 1) : null} />
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[12px] text-[#6B6480]">Since launch</div>
            <div className="text-xl font-bold text-[#6C2BD9] flex items-center gap-1 justify-end"><TrendingUp className="h-4 w-4" /> New</div>
          </div>
        </div>
        <p className="mt-3 text-sm text-[#4B4560] line-clamp-2">{form.subtitle || 'Your one-line pitch appears here.'}</p>
      </div>

      <div className="px-5 py-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-[#F8FAFC] py-2.5">
          <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085]">Min. invest</div>
          <div className="text-sm font-bold text-[#1A1030] flex items-center justify-center gap-0.5"><IndianRupee className="h-3 w-3" />{minInv ? minInv.toLocaleString('en-IN') : '—'}</div>
        </div>
        <div className="rounded-xl bg-[#F8FAFC] py-2.5">
          <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085]">Holdings</div>
          <div className="text-sm font-bold text-[#1A1030]">{cons.length}</div>
        </div>
        <div className="rounded-xl bg-[#F8FAFC] py-2.5">
          <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085]">vs {form.benchmark || 'NIFTY 50'}</div>
          <div className="text-sm font-bold text-[#667085]">from launch</div>
        </div>
      </div>

      {!compact && (
        <div className="px-5 pb-5 space-y-4">
          {capEntries.length > 0 && (
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085]">Market-cap mix</div>
              <div className="mt-1.5 h-2.5 rounded-full overflow-hidden flex bg-[#F1F1F4]">
                {capEntries.map(([k, v]) => <div key={k} style={{ width: `${Math.min(100, v)}%`, background: CAP_COLORS[k] || '#CBD5E1' }} title={`${k} ${v}%`} />)}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#6B6480]">
                {capEntries.map(([k, v]) => <span key={k} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: CAP_COLORS[k] }} /> {k} {v}%</span>)}
              </div>
            </div>
          )}
          {sectorEntries.length > 0 && (
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085]">Top sectors</div>
              <div className="mt-1.5 space-y-1">
                {sectorEntries.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-[12px]">
                    <span className="w-28 truncate text-[#4B4560]">{k}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-[#F1F1F4] overflow-hidden"><div className="h-full bg-[#6C2BD9]/70" style={{ width: `${Math.min(100, v)}%` }} /></div>
                    <span className="w-10 text-right text-[#6B6480]">{v}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {cons.length > 0 && (
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085]">Stocks & weights {total !== 100 && <span className="text-[#B91C1C] normal-case font-medium">· total {Math.round(total)}%</span>}</div>
              <div className="mt-1.5 space-y-1">
                {cons.slice(0, 6).map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-[12px]">
                    <span className="truncate text-[#1A1030]">{c.symbol} <span className="text-[#667085]">{c.name}</span></span>
                    <span className="font-semibold text-[#1A1030]">{Number(c.weight) || 0}%</span>
                  </div>
                ))}
                {cons.length > 6 && <div className="text-[12px] text-[#667085]">+{cons.length - 6} more</div>}
              </div>
            </div>
          )}
          {(rationale || form.videoUrl) && (
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider text-[#667085]">Investment rationale</div>
              <p className="mt-1 text-[12px] text-[#4B4560] line-clamp-3">{rationale || 'Your rationale appears here.'}</p>
              {form.videoUrl && <div className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-[#6C2BD9]"><PlayCircle className="h-3.5 w-3.5" /> Intro video</div>}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[12px] text-[#667085]"><ShieldCheck className="h-3 w-3" /> Returns, volatility and minimum are computed by Omnivest after approval.</div>
        </div>
      )}
      {compact && <div className="px-5 pb-4 flex items-center gap-1.5 text-[12px] text-[#667085]"><Sparkles className="h-3 w-3" /> Live preview — updates as you type.</div>}
    </div>
  );
}

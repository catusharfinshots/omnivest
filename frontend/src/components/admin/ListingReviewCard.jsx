import React, { useState } from 'react';
import { Eye, Sparkles, PauseCircle, PlayCircle, MessageSquareWarning, Check, X, Lock, Tag } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import VersionDiff from './VersionDiff';
import CoverArt from '../CoverArt';

const STATUS = { approved: 'bg-[#DCFCE7] text-[#0B7F4A]', pending: 'bg-[#FEF3C7] text-[#9A4A05]', rejected: 'bg-[#FEE2E2] text-[#B91C1C]', paused: 'bg-[#FEE2E2] text-[#B91C1C]' };
const plain = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const nice = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

const PROMPTS = {
  reject: { title: 'Reject listing', hint: 'Tell the partner why. They see this note in their console and can fix and resubmit.', cta: 'Reject with note', ph: 'e.g. Constituents do not match the stated theme; two stocks are illiquid.' },
  request_changes: { title: 'Request changes', hint: 'The listing goes back to the partner as a draft with your note. Most first submissions need one fix — this is the friendly path.', cta: 'Send back with note', ph: 'e.g. Please expand the key risks section and add the methodology for weight selection.' },
  pause: { title: 'Pause live listing', hint: 'Hidden from investors immediately. The track record is kept and resumes unchanged when you un-pause.', cta: 'Pause listing', ph: 'e.g. Compliance query on constituent weights — awaiting partner clarification.' },
};

// One submitted listing in the admin review queue: what it is, what changed, and every action.
export default function ListingReviewCard({ p, onReview, onAction }) {
  const [prompt, setPrompt] = useState(null); // 'reject' | 'request_changes' | 'pause'
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = p.status === 'pending';
  const live = p.status === 'approved';
  const paused = p.status === 'paused';
  const paid = p.subscription === 'Paid';
  const cheapest = paid && (p.plans || []).filter((x) => x.price > 0).sort((a, b) => a.price / a.months - b.price / b.months)[0];

  const submitPrompt = async () => {
    setBusy(true);
    try {
      if (prompt === 'pause') await onAction(p.id, 'pause', { reason: note });
      else await onReview(p.id, prompt, note);
      setPrompt(null); setNote('');
    } finally { setBusy(false); }
  };

  return (
    <div className="border border-[#E8E1F0] rounded-xl p-4" data-testid={`review-card-${p.id}`}>
      <div className="flex items-start justify-between gap-4">
        {p.cover && <CoverArt cover={p.cover} name={p.name} size={56} radius={14} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[#1A1030] truncate">{p.name}</span>
            <span className={`text-[12px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS[p.status] || 'bg-[#F1F1F4] text-[#6B6480]'}`}>{p.status}</span>
            {p.featured && <span className="inline-flex items-center gap-1 text-[12px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#EDE9FE] text-[#6C2BD9]"><Sparkles className="h-3 w-3" /> Featured</span>}
            {p.was_live && pending && <span className="text-[12px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#9A4A05]">Re-submission of a live listing</span>}
            {paid && <span className="inline-flex items-center gap-1 text-[12px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#9A4A05]"><Lock className="h-3 w-3" /> {cheapest ? `from ₹${Math.round(cheapest.price / cheapest.months)}/mo` : 'Paid'}</span>}
          </div>
          <div className="text-xs text-[#6B6480] mt-0.5">by {p.owner_name || '—'} · {p.subtitle || 'No pitch'} · {p.constituents?.length || 0} holdings · {p.benchmark || 'NIFTY 50'} · {p.strategy} · {p.rebalanceFreq || 'Quarterly'}</div>
          {(p.tags || []).length > 0 && <div className="mt-1 flex items-center gap-1 text-[12px] text-[#6B6480]"><Tag className="h-3 w-3" /> {p.tags.join(' · ')}</div>}
          <div className="text-xs text-[#6B6480] mt-1 line-clamp-2"><b className="text-[#1A1030]">Rationale:</b> {plain(p.rationale) || 'none'}</div>
          <div className="text-xs text-[#6B6480] mt-0.5 line-clamp-2"><b className="text-[#1A1030]">Methodology:</b> {plain(p.methodology) || 'none'}</div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-[#667085]">
            <span>{p.factsheet_pdf ? '✓ Factsheet PDF' : '– No factsheet PDF'}</span>
            <span>{p.videoUrl ? '✓ Intro video' : '– No video'}</span>
            <span>{p.factsheet?.riskFactors ? '✓ Key risks' : '– No key risks'}</span>
            {p.cover?.kind === 'upload' && <button type="button" onClick={() => onAction(p.id, 'cover/reset')} className="text-[#B91C1C] hover:underline" data-testid="cover-reset">Uploaded cover — reset to generated</button>}
            {p.reviewed_at && <span>reviewed {nice(p.reviewed_at)}</span>}
          </div>
          {p.review_note && !pending && <div className="mt-2 text-xs rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-1.5 text-[#475569]"><b className="text-[#1A1030]">Your note to the partner:</b> {p.review_note}</div>}
          <VersionDiff p={p} />
        </div>
        <div className="flex flex-col gap-1.5 shrink-0 w-44">
          <a href={`/model-portfolios/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#E8E1F0] text-[#5320A8] text-xs font-semibold px-3 py-2 hover:bg-[#F7F4FB]" data-testid="preview-link"><Eye className="h-3.5 w-3.5" /> Preview as investor</a>
          {pending && (
            <>
              <button type="button" onClick={() => onReview(p.id, 'approve')} className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#0A7D48] text-white text-xs font-semibold px-3 py-2 hover:bg-[#086B3D]" data-testid="approve-btn"><Check className="h-3.5 w-3.5" /> Approve</button>
              <button type="button" onClick={() => { setPrompt('request_changes'); setNote(''); }} className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] text-[#92400E] text-xs font-semibold px-3 py-2 hover:bg-[#FEF3C7]" data-testid="request-changes-btn"><MessageSquareWarning className="h-3.5 w-3.5" /> Request changes</button>
              <button type="button" onClick={() => { setPrompt('reject'); setNote(''); }} className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#E8E1F0] text-[#B91C1C] text-xs font-semibold px-3 py-2 hover:bg-[#FEF2F2]" data-testid="reject-btn"><X className="h-3.5 w-3.5" /> Reject</button>
            </>
          )}
          {live && (
            <>
              <button type="button" onClick={() => onAction(p.id, 'feature', { featured: !p.featured })} className={`inline-flex items-center justify-center gap-1 rounded-lg border text-xs font-semibold px-3 py-2 ${p.featured ? 'border-[#D8C7F1] bg-[#F1E7FE] text-[#5320A8]' : 'border-[#E8E1F0] text-[#5320A8] hover:bg-[#F7F4FB]'}`} data-testid="feature-btn"><Sparkles className="h-3.5 w-3.5" /> {p.featured ? 'Un-feature' : 'Feature on explore'}</button>
              <button type="button" onClick={() => { setPrompt('pause'); setNote(''); }} className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#E8E1F0] text-[#B91C1C] text-xs font-semibold px-3 py-2 hover:bg-[#FEF2F2]" data-testid="pause-btn"><PauseCircle className="h-3.5 w-3.5" /> Pause listing</button>
            </>
          )}
          {paused && <button type="button" onClick={() => onAction(p.id, 'resume')} className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#0A7D48] text-white text-xs font-semibold px-3 py-2 hover:bg-[#086B3D]" data-testid="resume-btn"><PlayCircle className="h-3.5 w-3.5" /> Resume listing</button>}
        </div>
      </div>

      <Dialog open={!!prompt} onOpenChange={(o) => { if (!o) setPrompt(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{prompt ? PROMPTS[prompt].title : ''} — {p.name}</DialogTitle></DialogHeader>
          {prompt && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-[#6B6480]">{PROMPTS[prompt].hint}</p>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[90px]" placeholder={PROMPTS[prompt].ph} data-testid="note-input" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setPrompt(null)} className="btn-outline text-xs">Cancel</button>
                <button type="button" onClick={submitPrompt} disabled={busy || note.trim().length < 5} className={`text-xs font-semibold rounded-lg px-4 py-2 text-white disabled:opacity-50 ${prompt === 'request_changes' ? 'bg-[#B45309] hover:bg-[#92400E]' : 'bg-[#DC2626] hover:bg-[#B91C1C]'}`} data-testid="note-submit">{PROMPTS[prompt].cta}</button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

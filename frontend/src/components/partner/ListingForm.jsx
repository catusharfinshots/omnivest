import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Save, Send, Plus, Trash2, Upload, FileText, Loader2, Check, Info, RefreshCw, IndianRupee, Sparkles, AlertTriangle } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import InstrumentPicker from './InstrumentPicker';
import RichTextEditor from './RichTextEditor';
import ListingPreview from './ListingPreview';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const BLANK = {
  name: '', subtitle: '', strategy: 'thematic', tags: [], benchmark: 'NIFTY 50',
  rationale: '', methodology: '', videoUrl: '', rebalanceFreq: 'Quarterly',
  subscription: 'Free', plans: [],
  factsheet: { objective: '', whoShouldInvest: '', riskFactors: '', pdfName: '' },
  constituents: [{ symbol: '', name: '', exchange: 'NSE', type: 'Stock', weight: 0 }],
  factsheet_pdf: null,
};

const STEPS = [
  { key: 'identity', title: 'Identity', hint: 'Name, pitch, category' },
  { key: 'constituents', title: 'Constituents', hint: 'Stocks & weights' },
  { key: 'story', title: 'The story', hint: 'Why investors should care' },
  { key: 'rebalance', title: 'Rebalance policy', hint: 'How often you review' },
  { key: 'pricing', title: 'Access & pricing', hint: 'Free or subscription' },
  { key: 'documents', title: 'Documents', hint: 'Factsheet PDF (optional)' },
  { key: 'review', title: 'Review & submit', hint: 'Preview and checklist' },
];

const countWords = (s) => ((s || '').trim() ? s.trim().split(/\s+/).length : 0);
const capWords = (s, max) => {
  const parts = (s || '').split(/(\s+)/);
  let words = 0, out = '';
  for (const t of parts) {
    if (/\s+/.test(t)) { out += t; continue; }
    if (t === '') continue;
    if (words >= max) break;
    out += t; words += 1;
  }
  return out;
};
const DURATION_LABEL = { 1: 'Monthly', 3: 'Quarterly', 6: 'Half-yearly', 12: 'Yearly' };

function Field({ label, hint, children, required }) {
  return (
    <div>
      <Label className="flex items-center gap-1">{label}{required && <span className="text-[#DC2626]">*</span>}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="mt-1 text-[11px] text-[#94A3B8]">{hint}</div>}
    </div>
  );
}

// Listing 2.0 partner form: a stepper mirroring the investor page, with a live
// preview. The partner types only what a machine cannot know — returns, risk,
// minimum investment and the cap/sector mix are computed by Omnivest.
export default function ListingForm({ token, initial, options, rules, managerName, onBack, onSaved, onSubmitted }) {
  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const [form, setForm] = useState(() => hydrate(initial));
  const [editingId, setEditingId] = useState(initial?.id || null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [benchmarks, setBenchmarks] = useState([{ key: 'NIFTY 50', label: 'NIFTY 50' }, { key: 'NIFTY 500', label: 'NIFTY 500' }, { key: 'NIFTY MIDCAP 150', label: 'NIFTY Midcap 150' }, { key: 'NIFTY SMLCAP 250', label: 'NIFTY Smallcap 250' }]);
  const [perf, setPerf] = useState(null);
  const [perfBusy, setPerfBusy] = useState(false);
  const [classification, setClassification] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const dirty = useRef(false);

  function hydrate(p) {
    if (!p) return BLANK;
    return {
      ...BLANK, ...p,
      tags: p.tags || [], plans: p.plans || [],
      factsheet: { ...BLANK.factsheet, ...(p.factsheet || {}) },
      constituents: p.constituents?.length ? p.constituents.map((c) => ({ exchange: 'NSE', ...c })) : BLANK.constituents,
    };
  }
  const patch = (k, v) => { dirty.current = true; setForm((f) => ({ ...f, [k]: v })); };
  const setC = (i, key, val) => { dirty.current = true; setForm((f) => { const a = [...f.constituents]; a[i] = { ...a[i], [key]: val }; return { ...f, constituents: a }; }); };

  useEffect(() => { axios.get(`${API}/performance/benchmarks`).then(({ data }) => { if (data?.benchmarks) setBenchmarks(data.benchmarks); }).catch(() => {}); }, []);

  // computed preview: min investment (engine) once saved; cap/sector mix live from classification
  const loadPerf = useCallback(async (id) => {
    if (!id) return;
    setPerfBusy(true);
    try { const { data } = await axios.get(`${API}/analyst/portfolios/${id}/performance`, auth); setPerf(data); }
    catch { setPerf(null); }
    finally { setPerfBusy(false); }
  }, [auth]);
  useEffect(() => { loadPerf(editingId); }, [editingId, loadPerf]);

  const symbols = form.constituents.map((c) => (c.symbol || '').trim().toUpperCase()).filter(Boolean).join(',');
  useEffect(() => {
    if (!symbols) { setClassification(null); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await axios.get(`${API}/instruments/classify`, { params: { symbols } });
        if (!data.loaded) { setClassification(null); return; }
        const cap = {}, sector = {};
        form.constituents.forEach((c) => {
          const s = (c.symbol || '').trim().toUpperCase(); const w = Number(c.weight) || 0;
          if (!s || !w) return;
          const k = data.symbols[s] || { cap: 'Other', industry: 'Other' };
          cap[k.cap] = (cap[k.cap] || 0) + w; sector[k.industry] = (sector[k.industry] || 0) + w;
        });
        const r = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v * 100) / 100]));
        setClassification({ cap: r(cap), sector: r(sector) });
      } catch { setClassification(null); }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, form.constituents.map((c) => c.weight).join(',')]);

  const payload = () => ({
    ...form,
    constituents: form.constituents.filter((c) => (c.symbol || '').trim()).map((c) => ({ ...c, symbol: (c.symbol || '').trim().toUpperCase(), weight: Number(c.weight) || 0 })),
    plans: form.subscription === 'Paid' ? (form.plans || []).map((p) => ({ months: Number(p.months), price: Number(p.price) || 0 })).filter((p) => p.price > 0) : [],
  });

  const save = async (quiet = false) => {
    if (!form.name.trim()) { toast.error('Give the portfolio a name first'); setStep(0); return null; }
    setBusy(true);
    try {
      let saved;
      if (editingId) saved = (await axios.put(`${API}/analyst/portfolios/${editingId}`, payload(), auth)).data.portfolio;
      else { saved = (await axios.post(`${API}/analyst/portfolios`, payload(), auth)).data.portfolio; setEditingId(saved.id); }
      dirty.current = false;
      setForm((f) => ({ ...f, factsheet_pdf: saved.factsheet_pdf || f.factsheet_pdf, rationale: saved.rationale ?? f.rationale, methodology: saved.methodology ?? f.methodology }));
      if (!quiet) toast.success('Saved as draft');
      onSaved && onSaved(saved);
      loadPerf(saved.id);
      return saved;
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not save'); return null; }
    finally { setBusy(false); }
  };

  const loadReadiness = async (id) => {
    try { const { data } = await axios.get(`${API}/analyst/portfolios/${id}/readiness`, auth); setReadiness(data); }
    catch { setReadiness(null); }
  };
  const go = async (next) => {
    if (next > step && form.name.trim()) {
      const saved = await save(true);
      if (!saved) return;
      if (next === STEPS.length - 1) await loadReadiness(saved.id);
    }
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
    window.scrollTo({ top: 0 });
  };

  const submit = async () => {
    const saved = await save(true);
    if (!saved) return;
    try {
      await axios.post(`${API}/analyst/portfolios/${saved.id}/submit`, {}, auth);
      toast.success('Submitted — admin will review it shortly');
      onSubmitted && onSubmitted(saved);
    } catch (e) {
      const d = e?.response?.data?.detail;
      if (d && typeof d === 'object' && Array.isArray(d.errors)) { setReadiness((r) => ({ ...(r || {}), missing: d.errors })); toast.error(d.message || 'Listing is incomplete'); }
      else toast.error(typeof d === 'string' ? d : 'Could not submit');
    }
  };

  const onFactsheetPick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { toast.error('Please choose a PDF file'); return; }
    let id = editingId;
    if (!id) { const saved = await save(true); id = saved?.id; if (!id) return; }
    setUploadingPdf(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await axios.post(`${API}/analyst/portfolios/${id}/factsheet`, fd, auth);
      setForm((f) => ({ ...f, factsheet_pdf: data.factsheet_pdf }));
      toast.success('Factsheet PDF uploaded');
    } catch (err) { toast.error(err?.response?.data?.detail || 'Upload failed'); }
    finally { setUploadingPdf(false); }
  };
  const removeFactsheet = async () => {
    if (!editingId) { patch('factsheet_pdf', null); return; }
    try { await axios.delete(`${API}/analyst/portfolios/${editingId}/factsheet`, auth); patch('factsheet_pdf', null); toast.success('Factsheet removed'); }
    catch { toast.error('Could not remove'); }
  };

  const total = form.constituents.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const filled = form.constituents.filter((c) => (c.symbol || '').trim()).length;
  const maxW = rules?.max_weight_pct ?? 50;
  const toggleTag = (t) => {
    const has = form.tags.includes(t);
    if (!has && form.tags.length >= (rules?.max_tags ?? 3)) { toast.info(`Choose up to ${rules?.max_tags ?? 3} tags`); return; }
    patch('tags', has ? form.tags.filter((x) => x !== t) : [...form.tags, t]);
  };
  const planPrice = (m) => (form.plans || []).find((p) => Number(p.months) === m)?.price ?? '';
  const setPlan = (m, price) => {
    const rest = (form.plans || []).filter((p) => Number(p.months) !== m);
    patch('plans', price === '' ? rest : [...rest, { months: m, price: Number(price) || 0 }].sort((a, b) => a.months - b.months));
  };

  const S = STEPS[step];
  return (
    <div data-testid="listing-form">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <button onClick={onBack} className="btn-ghost text-xs mb-2"><ArrowLeft className="h-3.5 w-3.5" /> Back to list</button>
          <h1 className="text-2xl font-bold">{editingId ? 'Edit listing' : 'New listing'}</h1>
          <p className="text-sm text-[#6B6480] mt-0.5">You describe the idea. Omnivest computes the numbers.</p>
        </div>
        <button onClick={() => save()} disabled={busy} className="btn-outline text-sm" data-testid="save-draft-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft</button>
      </div>

      {/* stepper */}
      <ol className="mt-5 grid grid-cols-7 gap-1" data-testid="listing-steps">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <button type="button" onClick={() => go(i)} className={`w-full text-left rounded-lg px-2 py-2 border transition-colors ${i === step ? 'border-[#6C2BD9] bg-[#F7F4FB]' : i < step ? 'border-[#DCFCE7] bg-[#F0FDF4]' : 'border-[#EEE8F7] bg-white hover:border-[#D8C7F1]'}`}>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                <span className={`h-4 w-4 grid place-items-center rounded-full text-[9px] ${i < step ? 'bg-[#0E9F5E] text-white' : i === step ? 'bg-[#6C2BD9] text-white' : 'bg-[#EEE8F7] text-[#6B6480]'}`}>{i < step ? <Check className="h-2.5 w-2.5" /> : i + 1}</span>
                <span className="hidden lg:inline">Step {i + 1}</span>
              </div>
              <div className={`mt-0.5 text-[12px] font-semibold truncate ${i === step ? 'text-[#5320A8]' : 'text-[#1A1030]'}`}>{s.title}</div>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-5 grid lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div>
          <section className="surface p-6">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#6C2BD9]">Step {step + 1} of {STEPS.length}</div>
            <h2 className="text-lg font-bold mt-0.5">{S.title}</h2>
            <p className="text-xs text-[#6B6480]">{S.hint}</p>

            {S.key === 'identity' && (
              <div className="mt-5 grid md:grid-cols-2 gap-4">
                <Field label="Name" required hint="Short and memorable — investors search by it.">
                  <Input data-testid="form-name" value={form.name} onChange={(e) => patch('name', e.target.value)} className="h-10" placeholder="e.g. India Water Crisis" />
                </Field>
                <Field label="One-line pitch" required hint={`${countWords(form.subtitle)}/${rules?.max_subtitle_words ?? 30} words · the first sentence investors read`}>
                  <Input data-testid="form-subtitle" value={form.subtitle} onChange={(e) => patch('subtitle', capWords(e.target.value, rules?.max_subtitle_words ?? 30))} className="h-10" placeholder="Companies solving India's water problem" />
                </Field>
                <Field label="Category" required>
                  <select value={form.strategy} onChange={(e) => patch('strategy', e.target.value)} className="h-10 w-full rounded-lg border border-[#E8E1F0] px-3 text-sm bg-white">
                    {(options?.strategy || []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Benchmark" required hint="Investors see your returns next to this index.">
                  <select data-testid="form-benchmark" value={form.benchmark} onChange={(e) => patch('benchmark', e.target.value)} className="h-10 w-full rounded-lg border border-[#E8E1F0] px-3 text-sm bg-white">
                    {benchmarks.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label={`Style tags (up to ${rules?.max_tags ?? 3})`} hint="Help investors find you in explore filters.">
                    <div className="flex flex-wrap gap-2" data-testid="form-tags">
                      {(options?.tags || []).map((t) => (
                        <button key={t} type="button" onClick={() => toggleTag(t)} className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${form.tags.includes(t) ? 'bg-[#6C2BD9] border-[#6C2BD9] text-white' : 'border-[#E8E1F0] text-[#4B4560] hover:border-[#D8C7F1]'}`}>{t}</button>
                      ))}
                    </div>
                  </Field>
                </div>
              </div>
            )}

            {S.key === 'constituents' && (
              <div className="mt-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs text-[#6B6480]">{rules?.min_constituents ?? 2}–{rules?.max_constituents ?? 50} constituents · no single stock above {maxW}% · weights must total 100%</div>
                  <div className={`text-xs font-semibold ${Math.round(total) === 100 ? 'text-[#0E9F5E]' : 'text-[#DC2626]'}`} data-testid="weights-total">Total {Math.round(total * 100) / 100}% {Math.round(total) === 100 ? '✓' : '(must be 100%)'}</div>
                </div>
                <div className="mt-3 space-y-2">
                  {form.constituents.map((c, i) => {
                    const over = Number(c.weight) > maxW;
                    return (
                      <div key={i} className="grid grid-cols-[1.2fr_1.4fr_0.6fr_0.6fr_0.6fr_auto] gap-2 items-center" data-testid="constituent-row">
                        <InstrumentPicker token={token} value={c.symbol} onType={(v) => setC(i, 'symbol', v)}
                          onPick={(r) => { setC(i, 'symbol', r.tradingsymbol); setC(i, 'name', r.name || r.tradingsymbol); setC(i, 'exchange', r.exchange || 'NSE'); setC(i, 'type', r.instrument_type === 'ETF' ? 'ETF' : 'Stock'); }} />
                        <Input value={c.name} onChange={(e) => setC(i, 'name', e.target.value)} className="h-9" placeholder="Name" />
                        <select value={c.exchange || 'NSE'} onChange={(e) => setC(i, 'exchange', e.target.value)} className="h-9 rounded-lg border border-[#E8E1F0] px-2 text-sm bg-white"><option>NSE</option><option>BSE</option></select>
                        <select value={c.type} onChange={(e) => setC(i, 'type', e.target.value)} className="h-9 rounded-lg border border-[#E8E1F0] px-2 text-sm bg-white">{(options?.constituentType || ['Stock', 'ETF']).map((t) => <option key={t}>{t}</option>)}</select>
                        <Input type="number" min="0" max="100" step="0.5" value={c.weight} onChange={(e) => setC(i, 'weight', e.target.value)} className={`h-9 ${over ? 'border-[#DC2626]' : ''}`} placeholder="%" title={over ? `Above the ${maxW}% cap` : ''} />
                        <button type="button" onClick={() => { dirty.current = true; setForm((f) => ({ ...f, constituents: f.constituents.filter((_, j) => j !== i) })); }} className="h-9 w-9 grid place-items-center rounded-lg text-[#DC2626] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={() => { dirty.current = true; setForm((f) => ({ ...f, constituents: [...f.constituents, { symbol: '', name: '', exchange: 'NSE', type: 'Stock', weight: 0 }] })); }} className="btn-outline text-xs mt-3" disabled={form.constituents.length >= (rules?.max_constituents ?? 50)}><Plus className="h-3.5 w-3.5" /> Add constituent</button>

                <div className="mt-5 grid sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#F8FAFC] p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Auto minimum investment</div>
                      <button type="button" onClick={async () => { const s = await save(true); if (s) toast.success('Recalculated at today\'s prices'); }} disabled={busy || perfBusy || !filled} className="btn-ghost text-[11px] py-0.5 px-1.5"><RefreshCw className={`h-3 w-3 ${perfBusy ? 'animate-spin' : ''}`} /> Recalculate</button>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-[#1A1030] flex items-center gap-0.5"><IndianRupee className="h-5 w-5" />{perf?.min_investment?.amount ? perf.min_investment.amount.toLocaleString('en-IN') : '—'}</div>
                    <div className="text-[11px] text-[#94A3B8]">{perf?.min_investment ? `1+ share of every constituent · prices ${perf.price_date}` : (filled ? 'Save or click Recalculate to compute' : 'Add constituents first')}</div>
                  </div>
                  <div className="rounded-xl bg-[#F8FAFC] p-4 text-xs text-[#4B4560] flex gap-2">
                    <Info className="h-4 w-4 text-[#6C2BD9] shrink-0 mt-0.5" />
                    <div>Investors never type an amount below this — it is the smallest sum that buys at least one share of every stock at your weights. Market-cap and sector mix (right) come from NSE index membership.</div>
                  </div>
                </div>
              </div>
            )}

            {S.key === 'story' && (
              <div className="mt-5 space-y-5">
                <Field label="Investment rationale" required hint="Why this idea, why now, what you expect to happen. This is the section investors read most — headings and bullets welcome.">
                  <RichTextEditor testId="form-rationale" value={form.rationale} onChange={(v) => patch('rationale', v)} minHeight={220} placeholder="The thesis in your own words…" />
                </Field>
                <Field label="Methodology" required hint="How stocks are selected, weighted and when you rebalance.">
                  <RichTextEditor testId="form-methodology" value={form.methodology} onChange={(v) => patch('methodology', v)} minHeight={140} placeholder="Selection rules, weighting logic, review cadence…" />
                </Field>
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Objective (one line)" required><Input value={form.factsheet.objective} onChange={(e) => patch('factsheet', { ...form.factsheet, objective: e.target.value })} className="h-10" placeholder="Long-term capital growth via…" /></Field>
                  <Field label="Who should invest" required><Textarea value={form.factsheet.whoShouldInvest} onChange={(e) => patch('factsheet', { ...form.factsheet, whoShouldInvest: e.target.value })} className="min-h-[80px]" placeholder="Investors with a 3+ year horizon who…" /></Field>
                  <div className="md:col-span-2"><Field label="Key risks" required hint="Be specific: concentration, sector cycles, liquidity, regulation."><Textarea value={form.factsheet.riskFactors} onChange={(e) => patch('factsheet', { ...form.factsheet, riskFactors: e.target.value })} className="min-h-[80px]" /></Field></div>
                  {rules?.allow_video !== false && (
                    <div className="md:col-span-2"><Field label="Intro video (optional)" hint="A 60–90 second YouTube or Vimeo link explaining the idea lifts conversion noticeably."><Input data-testid="form-video" value={form.videoUrl} onChange={(e) => patch('videoUrl', e.target.value)} className="h-10" placeholder="https://youtu.be/…" /></Field></div>
                  )}
                </div>
              </div>
            )}

            {S.key === 'rebalance' && (
              <div className="mt-5 grid md:grid-cols-2 gap-4">
                <Field label="Review frequency" required hint='Choose "As needed" if you rebalance on triggers rather than a calendar.'>
                  <select data-testid="form-rebalance" value={form.rebalanceFreq} onChange={(e) => patch('rebalanceFreq', e.target.value)} className="h-10 w-full rounded-lg border border-[#E8E1F0] px-3 text-sm bg-white">
                    {(options?.rebalanceFreq || []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <div className="rounded-xl bg-[#FBF9FE] border border-[#E8E1F0] p-4 text-xs text-[#4B4560] flex gap-2">
                  <Sparkles className="h-4 w-4 text-[#6C2BD9] shrink-0 mt-0.5" />
                  <div>After launch, every change to stocks or weights is recorded as a new version. Investors see a rebalance timeline, and your track record continues unbroken — the engine sells and re-buys at that day's close.</div>
                </div>
              </div>
            )}

            {S.key === 'pricing' && (
              <div className="mt-5">
                <div className="grid sm:grid-cols-2 gap-3" data-testid="form-subscription">
                  {[['Free', 'Free access', 'Anyone can invest and read every update. Best for building a track record and an audience fast.'], ['Paid', 'Subscription', 'Investors pay for access to your updates and research. Pick prices per duration below.']].map(([k, t, d]) => (
                    <button key={k} type="button" onClick={() => patch('subscription', k)} className={`text-left rounded-xl border p-4 transition-colors ${form.subscription === k ? 'border-[#6C2BD9] bg-[#F7F4FB]' : 'border-[#E8E1F0] hover:border-[#D8C7F1]'}`}>
                      <div className="font-semibold text-[#1A1030]">{t}</div><div className="text-xs text-[#6B6480] mt-1">{d}</div>
                    </button>
                  ))}
                </div>
                {form.subscription === 'Paid' && (
                  <div className="mt-4">
                    <div className="text-xs text-[#6B6480]">Price per plan (₹, for the whole duration). Leave blank to not offer a duration. Minimum ₹{rules?.min_plan_price ?? 99}.</div>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="form-plans">
                      {(rules?.plan_durations || [1, 3, 6, 12]).map((m) => (
                        <div key={m} className="rounded-xl border border-[#E8E1F0] p-3">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">{DURATION_LABEL[m] || `${m} months`}</div>
                          <div className="mt-1 flex items-center gap-1"><IndianRupee className="h-3.5 w-3.5 text-[#6B6480]" /><Input type="number" min="0" value={planPrice(m)} onChange={(e) => setPlan(m, e.target.value)} className="h-9" placeholder="—" /></div>
                          {planPrice(m) !== '' && Number(planPrice(m)) > 0 && <div className="mt-1 text-[11px] text-[#94A3B8]">≈ ₹{Math.round(Number(planPrice(m)) / m)}/month</div>}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7] p-3 text-xs text-[#166534] flex gap-2">
                      <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                      <div><b>Founding partner:</b> Omnivest's platform share is currently {rules?.platform_fee_pct ?? 0}% — you keep {100 - (rules?.platform_fee_pct ?? 0)}% of subscription revenue{rules?.founding_partner_until ? ` for listings launched before ${rules.founding_partner_until}` : ''}. Until payments go live, "Subscribe" collects investor interest which you can see in your Overview.</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {S.key === 'documents' && (
              <div className="mt-5">
                <Field label={`Factsheet PDF ${rules?.factsheet_pdf_required ? '' : '(optional)'}`} hint="Investors can download it from the listing page. Max 10 MB." required={!!rules?.factsheet_pdf_required}>
                  {form.factsheet_pdf ? (
                    <div className="flex items-center gap-3 rounded-xl border border-[#E8E1F0] bg-[#FAFAFE] px-3 py-2.5 w-fit" data-testid="factsheet-pdf-row">
                      <FileText className="h-5 w-5 text-[#6C2BD9]" />
                      <div className="text-sm"><div className="font-semibold text-[#1A1030]">{form.factsheet_pdf.filename}</div><div className="text-[11px] text-[#94A3B8]">{Math.round((form.factsheet_pdf.size || 0) / 1024)} KB</div></div>
                      <button type="button" onClick={removeFactsheet} className="h-8 w-8 grid place-items-center rounded-lg text-[#DC2626] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <label data-testid="factsheet-pdf-upload" className="flex items-center gap-2 rounded-xl border border-dashed border-[#D8C7F1] bg-[#F7F4FB] px-4 py-4 text-sm text-[#5320A8] cursor-pointer hover:bg-[#F1E7FE] transition-colors w-fit">
                      <Upload className="h-4 w-4" /> {uploadingPdf ? 'Uploading…' : 'Upload factsheet PDF'}
                      <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFactsheetPick} disabled={uploadingPdf} />
                    </label>
                  )}
                </Field>
                <div className="mt-4 rounded-xl bg-[#FBF9FE] border border-[#E8E1F0] p-4 text-xs text-[#4B4560] flex gap-2">
                  <Info className="h-4 w-4 text-[#6C2BD9] shrink-0 mt-0.5" />
                  <div>No PDF yet? That's fine — the listing page already shows your rationale, methodology, holdings and computed performance. You can add one later.</div>
                </div>
              </div>
            )}

            {S.key === 'review' && (
              <div className="mt-5">
                {readiness === null ? <div className="text-sm text-[#6B6480]">Checking…</div> : readiness.missing?.length ? (
                  <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4" data-testid="readiness">
                    <div className="text-sm font-semibold text-[#92400E] flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {readiness.missing.length} thing{readiness.missing.length > 1 ? 's' : ''} to fix before you can submit</div>
                    <ul className="mt-2 space-y-1 text-xs text-[#92400E] list-disc pl-5">{readiness.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#DCFCE7] bg-[#F0FDF4] p-4 text-sm font-semibold text-[#166534] flex items-center gap-2" data-testid="readiness"><Check className="h-4 w-4" /> Everything's in place. Submit when you're happy with the preview.</div>
                )}
                <div className="mt-4 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">How investors will see it</div>
                <div className="mt-2"><ListingPreview form={form} perf={perf} classification={classification} managerName={managerName} /></div>
                <div className="mt-3 text-xs text-[#6B6480]">On approval, your constituents are “bought” at that day's close and the live track record starts. Admin usually reviews within a business day; if something needs a change you'll see a note on your listing.</div>
              </div>
            )}
          </section>

          <div className="sticky bottom-0 bg-[#F7F4FB]/95 backdrop-blur py-4 mt-2 flex items-center justify-between gap-3">
            <button onClick={() => go(step - 1)} disabled={step === 0 || busy} className="btn-outline text-sm disabled:opacity-40"><ArrowLeft className="h-4 w-4" /> Back</button>
            {step < STEPS.length - 1 ? (
              <button onClick={() => go(step + 1)} disabled={busy} className="btn-primary text-sm" data-testid="next-step-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Next: {STEPS[step + 1].title} <ArrowRight className="h-4 w-4" /></button>
            ) : (
              <button onClick={submit} disabled={busy || (readiness?.missing?.length > 0)} className="btn-primary text-sm disabled:opacity-50" data-testid="save-submit-btn"><Send className="h-4 w-4" /> Submit for approval</button>
            )}
          </div>
        </div>

        {S.key !== 'review' && (
          <aside className="hidden lg:block sticky top-24">
            <ListingPreview form={form} perf={perf} classification={classification} managerName={managerName} compact={step < 1} />
          </aside>
        )}
      </div>
    </div>
  );
}

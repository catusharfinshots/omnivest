import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Plus, Trash2, Save, Send, ArrowLeft, Pencil, LogOut, Upload, FileText, Search, Loader2, TrendingUp, LayoutDashboard, ListChecks } from 'lucide-react';
import omniMark from '../assets/omnivest-mark-white.svg';
import PartnerOverview from './partner/PartnerOverview';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BLANK = {
  name: '', subtitle: '', strategy: 'thematic', risk: 'Medium', minAmount: 5000,
  subscription: 'Free', feeAmount: 0, feeCycle: 'monthly', methodology: '', rebalanceFreq: 'Quarterly',
  constituents: [{ symbol: '', name: '', exchange: 'NSE', type: 'Stock', weight: 0 }],
  returns: { cagr: 0, y1: 0, y3: 0, y5: 0 },
  factsheet: { objective: '', whoShouldInvest: '', riskFactors: '', pdfName: '' },
  factsheet_pdf: null,
};

const OPTION_DEFAULTS = {
  strategy: ['asset-allocation', 'sectoral', 'thematic', 'smart-beta', 'model-based'],
  risk: ['Low', 'Medium', 'High'],
  rebalanceFreq: ['Monthly', 'Quarterly', 'Half-yearly', 'Yearly'],
  subscription: ['Free', 'Paid'],
  constituentType: ['Stock', 'ETF'],
};

const STATUS_STYLES = {
  draft: 'bg-[#F1F1F4] text-[#6B6480]',
  pending: 'bg-[#FEF3C7] text-[#B45309]',
  approved: 'bg-[#DCFCE7] text-[#0E9F5E]',
  rejected: 'bg-[#FEE2E2] text-[#DC2626]',
};

function InstrumentPicker({ value, onType, onPick, token }) {
  const [q, setQ] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setQ(value || ''); }, [value]);
  useEffect(() => {
    const term = (q || '').trim();
    if (term.length < 1) { setResults([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const { data } = await axios.get(`${API}/market/instruments/search?q=${encodeURIComponent(term)}`, { headers: { Authorization: `Bearer ${token}` } });
        setResults(data.results || []);
      } catch { setResults([]); }
      finally { setBusy(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, token]);
  return (
    <div className="relative">
      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#9A93AD]" />
        <Input
          data-testid="constituent-symbol-input"
          value={q}
          onChange={(e) => { const v = e.target.value.toUpperCase(); setQ(v); onType(v); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="h-9 pl-7" placeholder="Search symbol" />
        {busy && <Loader2 className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-[#9A93AD] animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <div data-testid="instrument-results" className="absolute z-40 mt-1 w-[280px] max-h-60 overflow-auto rounded-xl border border-[#E8E1F0] bg-white shadow-lg">
          {results.map((r) => (
            <button
              key={`${r.exchange}:${r.tradingsymbol}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(r); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-[#F7F4FB] border-b border-[#F1E7FE] last:border-0">
              <div className="text-sm font-semibold text-[#1A1030]">{r.tradingsymbol} <span className="text-[10px] font-bold text-[#6C2BD9]">{r.exchange}</span></div>
              <div className="text-xs text-[#6B6480] truncate">{r.name || r.instrument_type}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalystConsole() {
  const { user, token, logout } = useAuth();
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const [view, setView] = useState('overview'); // overview | list | form | profile
  const [dashboardOn, setDashboardOn] = useState(true);
  const [portfolios, setPortfolios] = useState([]);
  const [profile, setProfile] = useState({ displayName: user?.name || '', sebiReg: '', philosophy: '', description: '', logo: '' });
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [errors, setErrors] = useState([]);
  const [options, setOptions] = useState(OPTION_DEFAULTS);
  const [prices, setPrices] = useState({});        // symbol -> {ltp, change_pct, available}
  const [pricesBusy, setPricesBusy] = useState(false);
  const [retPeriod, setRetPeriod] = useState('1Y');
  const [retBusy, setRetBusy] = useState(false);
  const [marketNote, setMarketNote] = useState('');

  const countWords = (s) => ((s || '').trim() ? s.trim().split(/\s+/).length : 0);
  const capWords = (s, max) => {
    const parts = (s || '').split(/(\s+)/); // keep whitespace tokens for natural typing
    let words = 0, out = '';
    for (const t of parts) {
      if (/\s+/.test(t)) { out += t; continue; }
      if (t === '') continue;
      if (words >= max) break;
      out += t; words += 1;
    }
    return out;
  };

  const validateForSubmit = (f) => {
    const e = [];
    if (!f.name.trim()) e.push('Portfolio name is required.');
    if (!f.subtitle.trim()) e.push('Subtitle is required.');
    else if (countWords(f.subtitle) > 30) e.push('Subtitle must be 30 words or fewer.');
    if (!(Number(f.minAmount) > 0)) e.push('Minimum investment must be greater than 0.');
    if (f.subscription === 'Paid' && !(Number(f.feeAmount) > 0)) e.push('Fee amount is required for paid subscriptions.');
    if (!f.methodology.trim()) e.push('Methodology is required.');
    [['objective', 'objective'], ['whoShouldInvest', 'who should invest'], ['riskFactors', 'risk factors']].forEach(([k, label]) => {
      if (!(f.factsheet?.[k] || '').trim()) e.push(`Factsheet ${label} is required.`);
    });
    ['cagr', 'y1', 'y3', 'y5'].forEach((k) => {
      const v = f.returns?.[k];
      if (v === '' || v === null || v === undefined || isNaN(Number(v))) e.push(`Returns: ${k === 'cagr' ? 'CAGR' : k.toUpperCase()} is required.`);
    });
    if (!f.factsheet_pdf) e.push('Factsheet PDF is required.');
    if (!f.constituents.length) e.push('Add at least one constituent.');
    f.constituents.forEach((c, i) => {
      if (!(c.symbol || '').trim() || !(c.name || '').trim()) e.push(`Constituent ${i + 1}: symbol and name are required.`);
      if (!(Number(c.weight) > 0)) e.push(`Constituent ${i + 1}: weight must be greater than 0.`);
    });
    const total = Math.round(f.constituents.reduce((s, c) => s + (Number(c.weight) || 0), 0));
    if (f.constituents.length && total !== 100) e.push(`Total allocation must equal exactly 100% (currently ${total}%).`);
    return e;
  };

  const load = useCallback(async () => {
    try {
      const [p, pr] = await Promise.all([
        axios.get(`${API}/analyst/portfolios`, auth),
        axios.get(`${API}/analyst/profile`, auth),
      ]);
      setPortfolios(p.data.portfolios || []);
      if (pr.data.profile) setProfile(pr.data.profile);
    } catch {
      toast.error('Could not load your listings');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  // Admin can switch the partner dashboard off; then the console opens on listings.
  useEffect(() => {
    axios.get(`${API}/partner-dashboard/settings`).then(({ data }) => {
      const on = data?.settings?.enabled !== false;
      setDashboardOn(on);
      if (!on) setView((v) => (v === 'overview' ? 'list' : v));
    }).catch(() => {});
  }, []);
  useEffect(() => {
    axios.get(`${API}/listing-options`).then(({ data }) => {
      if (data?.options) setOptions({ ...OPTION_DEFAULTS, ...data.options });
    }).catch(() => {});
  }, []);

  const saveProfile = async () => {
    setBusy(true);
    try {
      await axios.put(`${API}/analyst/profile`, profile, auth);
      toast.success('Profile saved');
      setView('list');
    } catch { toast.error('Could not save profile'); } finally { setBusy(false); }
  };

  const startNew = () => { setForm(BLANK); setEditingId(null); setErrors([]); setPrices({}); setMarketNote(''); setView('form'); };
  const startEdit = (p) => {
    setForm({ ...BLANK, ...p, returns: { ...BLANK.returns, ...(p.returns || {}) }, factsheet: { ...BLANK.factsheet, ...(p.factsheet || {}) }, constituents: p.constituents?.length ? p.constituents.map((c) => ({ exchange: 'NSE', ...c })) : BLANK.constituents });
    setEditingId(p.id);
    setErrors([]); setPrices({}); setMarketNote('');
    setView('form');
  };

  const saveForm = async () => {
    if (!form.name.trim()) { toast.error('Please give the portfolio a name'); return; }
    setBusy(true);
    const payload = { ...form, minAmount: Number(form.minAmount) || 0, feeAmount: Number(form.feeAmount) || 0,
      returns: { cagr: Number(form.returns.cagr) || 0, y1: Number(form.returns.y1) || 0, y3: Number(form.returns.y3) || 0, y5: Number(form.returns.y5) || 0 },
      constituents: form.constituents.map((c) => ({ ...c, weight: Number(c.weight) || 0 })) };
    try {
      let saved;
      if (editingId) {
        const { data } = await axios.put(`${API}/analyst/portfolios/${editingId}`, payload, auth);
        saved = data.portfolio;
      } else {
        const { data } = await axios.post(`${API}/analyst/portfolios`, payload, auth);
        saved = data.portfolio;
        setEditingId(saved.id);
      }
      toast.success('Saved as draft');
      await load();
      return saved;
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not save'); }
    finally { setBusy(false); }
  };

  const submitForReview = async (id) => {
    try {
      await axios.post(`${API}/analyst/portfolios/${id}/submit`, {}, auth);
      toast.success('Submitted for admin approval');
      await load();
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (detail && typeof detail === 'object' && Array.isArray(detail.errors)) {
        toast.error(detail.message || 'Portfolio is incomplete');
        setErrors(detail.errors);
      } else {
        toast.error(typeof detail === 'string' ? detail : 'Could not submit');
      }
    }
  };

  const saveAndSubmit = async () => {
    const errs = validateForSubmit(form);
    setErrors(errs);
    if (errs.length) {
      toast.error(`Please fix ${errs.length} issue${errs.length > 1 ? 's' : ''} before submitting`);
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      return;
    }
    const saved = await saveForm();
    const id = editingId || saved?.id;
    if (id) { await submitForReview(id); setView('list'); }
  };

  const remove = async (id) => {
    try { await axios.delete(`${API}/analyst/portfolios/${id}`, auth); toast.success('Deleted'); await load(); }
    catch { toast.error('Could not delete'); }
  };

  const onFactsheetPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please choose a PDF file'); return;
    }
    let id = editingId;
    if (!id) { const saved = await saveForm(); id = saved?.id; if (!id) return; }
    setUploadingPdf(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await axios.post(`${API}/analyst/portfolios/${id}/factsheet`, fd, auth);
      setForm((f) => ({ ...f, factsheet_pdf: data.factsheet_pdf }));
      toast.success('Factsheet PDF uploaded');
      await load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Upload failed'); }
    finally { setUploadingPdf(false); }
  };

  const removeFactsheet = async () => {
    if (!editingId) { setForm((f) => ({ ...f, factsheet_pdf: null })); return; }
    try {
      await axios.delete(`${API}/analyst/portfolios/${editingId}/factsheet`, auth);
      setForm((f) => ({ ...f, factsheet_pdf: null }));
      toast.success('Factsheet removed');
      await load();
    } catch { toast.error('Could not remove'); }
  };

  const setC = (i, key, val) => setForm((f) => { const a = [...f.constituents]; a[i] = { ...a[i], [key]: val }; return { ...f, constituents: a }; });
  const totalWeight = form.constituents.reduce((s, c) => s + (Number(c.weight) || 0), 0);

  const sym = (c) => `${(c.exchange || 'NSE')}:${(c.symbol || '').trim().toUpperCase()}`;

  const fetchLivePrices = async () => {
    const list = form.constituents.filter((c) => (c.symbol || '').trim());
    if (!list.length) { toast.error('Add at least one symbol first'); return; }
    setPricesBusy(true); setMarketNote('');
    try {
      const { data } = await axios.post(`${API}/market/quote`, { symbols: list.map(sym) }, auth);
      const map = {};
      (data.quotes || []).forEach((q) => { map[q.symbol] = q; });
      setPrices(map);
      const missing = (data.quotes || []).filter((q) => !q.available).length;
      if (missing) toast.info(`${missing} symbol(s) had no live data`);
      else toast.success('Live prices updated');
    } catch (e) {
      const d = e?.response?.data?.detail;
      if (e?.response?.status === 503) setMarketNote(d || 'Market data not connected. Ask an admin to connect Kite.');
      toast.error(typeof d === 'string' ? d : 'Could not fetch live prices');
    } finally { setPricesBusy(false); }
  };

  const computeLiveReturns = async () => {
    const list = form.constituents.filter((c) => (c.symbol || '').trim() && Number(c.weight) > 0);
    if (!list.length) { toast.error('Add symbols with weights first'); return; }
    setRetBusy(true); setMarketNote('');
    try {
      const results = await Promise.all(list.map(async (c) => {
        try {
          const { data } = await axios.post(`${API}/market/period-return`, { symbol: sym(c), period: retPeriod }, auth);
          return { weight: Number(c.weight) || 0, ...data };
        } catch (e) {
          if (e?.response?.status === 503) throw e;
          return null;
        }
      }));
      const ok = results.filter(Boolean);
      if (!ok.length) { toast.error('No return data available for these symbols'); return; }
      const wsum = ok.reduce((s, r) => s + r.weight, 0) || 1;
      const wRet = ok.reduce((s, r) => s + r.weight * (r.return_pct || 0), 0) / wsum;
      const wCagr = ok.reduce((s, r) => s + r.weight * (r.cagr_pct || 0), 0) / wsum;
      const field = { '1Y': 'y1', '3Y': 'y3', '5Y': 'y5' }[retPeriod];
      setForm((f) => ({ ...f, returns: { ...f.returns, cagr: Number(wCagr.toFixed(2)), ...(field ? { [field]: Number(wRet.toFixed(2)) } : {}) } }));
      toast.success(`Filled returns from live data (${ok.length}/${list.length} holdings)`);
    } catch (e) {
      const d = e?.response?.data?.detail;
      if (e?.response?.status === 503) setMarketNote(d || 'Market data not connected. Ask an admin to connect Kite.');
      toast.error(typeof d === 'string' ? d : 'Could not compute returns');
    } finally { setRetBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#F7F4FB]">
      <header className="sticky top-0 z-30 bg-white border-b border-[#E8E1F0]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg grad-card text-white grid place-items-center"><img src={omniMark} alt="" className="h-5 w-5" /></span>
            <div><div className="font-[Inter] font-bold leading-none">Omnivest</div><div className="text-[10px] uppercase tracking-widest text-[#6B6480]">Analyst console</div></div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 text-sm">
            <span className="text-[#6B6480] hidden md:inline mr-2">{user?.name}</span>
            {dashboardOn && (
              <button onClick={() => setView('overview')} data-testid="console-nav-overview" className={`btn-ghost text-xs ${view === 'overview' ? 'bg-[#F1E7FE] text-[#5320A8]' : ''}`}><LayoutDashboard className="h-3.5 w-3.5" /> Overview</button>
            )}
            <button onClick={() => setView('list')} data-testid="console-nav-listings" className={`btn-ghost text-xs ${view === 'list' || view === 'form' ? 'bg-[#F1E7FE] text-[#5320A8]' : ''}`}><ListChecks className="h-3.5 w-3.5" /> My listings</button>
            <button onClick={() => setView('profile')} className={`btn-ghost text-xs ${view === 'profile' ? 'bg-[#F1E7FE] text-[#5320A8]' : ''}`}>My profile</button>
            <button onClick={logout} className="btn-ghost text-xs"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* OVERVIEW (partner dashboard) */}
        {view === 'overview' && dashboardOn && (
          <PartnerOverview
            token={token}
            onNew={startNew}
            onEdit={(id) => { const p = portfolios.find((x) => x.id === id); if (p) startEdit(p); else setView('list'); }}
            onProfile={() => setView('profile')}
          />
        )}

        {/* PROFILE */}
        {view === 'profile' && (
          <div className="surface p-6 max-w-2xl">
            <button onClick={() => setView('list')} className="btn-ghost text-xs mb-3"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
            <h2 className="text-lg font-semibold">My profile</h2>
            <p className="text-xs text-[#6B6480]">This is shown as the manager on your portfolio pages.</p>
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <div><Label>Display name</Label><Input value={profile.displayName} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} className="mt-1.5 h-10" /></div>
              <div><Label>SEBI Reg. no.</Label><Input value={profile.sebiReg} onChange={(e) => setProfile({ ...profile, sebiReg: e.target.value })} className="mt-1.5 h-10" placeholder="INH000000000" /></div>
              <div><Label>Logo initials</Label><Input value={profile.logo} onChange={(e) => setProfile({ ...profile, logo: e.target.value.slice(0, 3) })} className="mt-1.5 h-10" placeholder="AB" /></div>
              <div><Label>Philosophy (one line)</Label><Input value={profile.philosophy} onChange={(e) => setProfile({ ...profile, philosophy: e.target.value })} className="mt-1.5 h-10" /></div>
              <div className="md:col-span-2"><Label>About you</Label><Textarea value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} className="mt-1.5" /></div>
            </div>
            <button onClick={saveProfile} disabled={busy} className="btn-primary mt-5"><Save className="h-4 w-4" /> Save profile</button>
          </div>
        )}

        {/* LIST */}
        {view === 'list' && (
          <>
            <div className="flex items-center justify-between">
              <div><h1 className="text-2xl font-bold">My model portfolios</h1><p className="text-sm text-[#6B6480]">Create listings, then submit them for admin approval to go live.</p></div>
              <button onClick={startNew} className="btn-primary"><Plus className="h-4 w-4" /> New portfolio</button>
            </div>
            <div className="mt-6 space-y-3">
              {portfolios.length === 0 && <div className="surface p-10 text-center text-[#6B6480]">No portfolios yet. Click “New portfolio” to create your first listing.</div>}
              {portfolios.map((p) => {
                const missing = (p.status === 'draft' || p.status === 'rejected') ? validateForSubmit({ ...BLANK, ...p, returns: { ...BLANK.returns, ...(p.returns || {}) }, factsheet: { ...BLANK.factsheet, ...(p.factsheet || {}) } }) : [];
                return (
                <div key={p.id} data-testid="portfolio-row" className="surface p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1A1030] truncate">{p.name}</span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLES[p.status] || STATUS_STYLES.draft}`}>{p.status}</span>
                      </div>
                      <div className="text-xs text-[#6B6480] truncate">{p.subtitle || '—'} · {p.constituents?.length || 0} holdings · min ₹{Number(p.minAmount).toLocaleString('en-IN')}</div>
                      {p.status === 'rejected' && p.review_note && <div className="text-xs text-[#DC2626] mt-1">Admin note: {p.review_note}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(p.status === 'draft' || p.status === 'rejected') && <button onClick={() => submitForReview(p.id)} className="btn-outline text-xs"><Send className="h-3.5 w-3.5" /> Submit</button>}
                      <button onClick={() => startEdit(p)} className="btn-ghost text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      <button onClick={() => remove(p.id)} className="h-8 w-8 grid place-items-center rounded-lg text-[#DC2626] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  {(p.status === 'draft' || p.status === 'rejected') && (
                    <div data-testid="draft-checklist" className="mt-3 rounded-lg border border-[#E8E1F0] bg-[#FAFAFE] px-3 py-2.5">
                      {missing.length === 0 ? (
                        <div className="text-xs font-medium text-[#0E9F5E]">✓ Ready to submit — all fields complete.</div>
                      ) : (
                        <details>
                          <summary className="cursor-pointer text-xs font-semibold text-[#B45309] list-none flex items-center gap-1">
                            <span className="inline-grid place-items-center h-4 w-4 rounded-full bg-[#B45309] text-white text-[9px]">{missing.length}</span>
                            {missing.length} item{missing.length > 1 ? 's' : ''} left before you can submit
                          </summary>
                          <ul className="mt-2 space-y-1 text-[11px] text-[#6B6480] list-disc pl-5">
                            {missing.map((m, i) => <li key={i}>{m}</li>)}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </>
        )}

        {/* FORM */}
        {view === 'form' && (
          <div className="max-w-3xl">
            <button onClick={() => setView('list')} className="btn-ghost text-xs mb-3"><ArrowLeft className="h-3.5 w-3.5" /> Back to list</button>
            <h1 className="text-2xl font-bold">{editingId ? 'Edit portfolio' : 'New portfolio'}</h1>

            <section className="surface p-6 mt-5">
              <div className="text-sm font-semibold mb-3">Basics</div>
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 h-10" /></div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label>One-line subtitle</Label>
                    <span data-testid="subtitle-word-count" className={`text-[11px] font-medium ${countWords(form.subtitle) > 30 ? 'text-[#DC2626]' : 'text-[#6B6480]'}`}>{countWords(form.subtitle)}/30 words</span>
                  </div>
                  <Input data-testid="portfolio-subtitle-input" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: capWords(e.target.value, 30) })} className="mt-1.5 h-10" placeholder="Max 30 words" />
                </div>
                <div><Label>Strategy</Label>
                  <select value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[#E8E1F0] px-3 text-sm">
                    {options.strategy.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div><Label>Risk / volatility</Label>
                  <select value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[#E8E1F0] px-3 text-sm">
                    {options.risk.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div><Label>Min. investment (₹)</Label><Input type="number" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} className="mt-1.5 h-10" /></div>
                <div><Label>Rebalance frequency</Label>
                  <select value={form.rebalanceFreq} onChange={(e) => setForm({ ...form, rebalanceFreq: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[#E8E1F0] px-3 text-sm">
                    {options.rebalanceFreq.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div><Label>Subscription</Label>
                  <select value={form.subscription} onChange={(e) => setForm({ ...form, subscription: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[#E8E1F0] px-3 text-sm">
                    {options.subscription.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {form.subscription === 'Paid' && <div><Label>Fee (₹ / {form.feeCycle})</Label><Input type="number" value={form.feeAmount} onChange={(e) => setForm({ ...form, feeAmount: e.target.value })} className="mt-1.5 h-10" /></div>}
              </div>
            </section>

            <section className="surface p-6 mt-4">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <div className="text-sm font-semibold">Constituents & weights</div>
                <div className="flex items-center gap-3">
                  <button type="button" data-testid="fetch-prices-btn" onClick={fetchLivePrices} disabled={pricesBusy} className="btn-outline text-xs">
                    {pricesBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />} Fetch live prices
                  </button>
                  <span data-testid="weight-total" className={`text-xs font-semibold ${Math.round(totalWeight) === 100 ? 'text-[#0E9F5E]' : 'text-[#B45309]'}`}>Total: {totalWeight}% {Math.round(totalWeight) === 100 ? '✓' : '(must be 100%)'}</span>
                </div>
              </div>
              {marketNote && <div data-testid="market-note" className="text-xs text-[#B45309] bg-[#FFFAEB] border border-[#FDE68A] rounded-lg px-3 py-1.5 mb-2">{marketNote}</div>}
              <div className="space-y-2 mt-2">
                {form.constituents.map((c, i) => {
                  const pk = `${(c.exchange || 'NSE')}:${(c.symbol || '').trim().toUpperCase()}`;
                  const price = prices[pk];
                  return (
                  <div key={i} className="grid grid-cols-2 md:grid-cols-[1.1fr_1.3fr_0.7fr_0.8fr_0.6fr_auto] gap-2 items-center">
                    <InstrumentPicker
                      value={c.symbol}
                      token={token}
                      onType={(v) => setC(i, 'symbol', v)}
                      onPick={(r) => setForm((f) => { const a = [...f.constituents]; a[i] = { ...a[i], symbol: r.tradingsymbol, name: r.name || a[i].name, exchange: r.exchange }; return { ...f, constituents: a }; })}
                    />
                    <Input value={c.name} onChange={(e) => setC(i, 'name', e.target.value)} className="h-9" placeholder="Name" />
                    <select value={c.exchange || 'NSE'} onChange={(e) => setC(i, 'exchange', e.target.value)} className="h-9 rounded-lg border border-[#E8E1F0] px-2 text-sm"><option>NSE</option><option>BSE</option></select>
                    <select value={c.type} onChange={(e) => setC(i, 'type', e.target.value)} className="h-9 rounded-lg border border-[#E8E1F0] px-2 text-sm">{options.constituentType.map((t) => <option key={t}>{t}</option>)}</select>
                    <Input type="number" value={c.weight} onChange={(e) => setC(i, 'weight', e.target.value)} className="h-9" placeholder="Wt%" />
                    <button onClick={() => setForm({ ...form, constituents: form.constituents.filter((_, j) => j !== i) })} className="h-8 w-8 grid place-items-center rounded-lg text-[#DC2626] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>
                    {price && (
                      <div data-testid="constituent-price" className="col-span-2 md:col-span-6 -mt-1 text-[11px] text-[#6B6480]">
                        {price.available
                          ? <span>LTP <span className="font-semibold text-[#1A1030]">₹{Number(price.ltp).toLocaleString('en-IN')}</span> {price.change_pct != null && <span className={price.change_pct >= 0 ? 'text-[#0E9F5E]' : 'text-[#DC2626]'}>({price.change_pct >= 0 ? '+' : ''}{price.change_pct.toFixed(2)}%)</span>}</span>
                          : <span className="text-[#B45309]">No live data for {pk}</span>}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
              <button onClick={() => setForm({ ...form, constituents: [...form.constituents, { symbol: '', name: '', exchange: 'NSE', type: 'Stock', weight: 0 }] })} className="btn-outline text-xs mt-3"><Plus className="h-3.5 w-3.5" /> Add constituent</button>
            </section>

            <section className="surface p-6 mt-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="text-sm font-semibold">Returns (%)</div>
                <div className="flex items-center gap-2">
                  <select data-testid="return-period" value={retPeriod} onChange={(e) => setRetPeriod(e.target.value)} className="h-9 rounded-lg border border-[#E8E1F0] px-2 text-sm">
                    {['1Y', '3Y', '5Y'].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button type="button" data-testid="compute-returns-btn" onClick={computeLiveReturns} disabled={retBusy} className="btn-outline text-xs">
                    {retBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />} Auto-fill from live data
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['cagr', 'y1', 'y3', 'y5'].map((k) => (
                  <div key={k}><Label>{k === 'cagr' ? 'CAGR' : k.toUpperCase()}</Label><Input type="number" value={form.returns[k]} onChange={(e) => setForm({ ...form, returns: { ...form.returns, [k]: e.target.value } })} className="mt-1.5 h-10" /></div>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-[#6B6480]">“Auto-fill” computes a weight-weighted return across your holdings over the selected period using live Kite market data, then fills CAGR and the matching year column.</div>
            </section>

            <section className="surface p-6 mt-4">
              <div className="text-sm font-semibold mb-3">Methodology & factsheet</div>
              <div className="space-y-4">
                <div><Label>Methodology</Label><Textarea value={form.methodology} onChange={(e) => setForm({ ...form, methodology: e.target.value })} className="mt-1.5" placeholder="How is this portfolio built and rebalanced?" /></div>
                <div><Label>Factsheet — objective</Label><Textarea value={form.factsheet.objective} onChange={(e) => setForm({ ...form, factsheet: { ...form.factsheet, objective: e.target.value } })} className="mt-1.5" /></div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div><Label>Who should invest</Label><Textarea value={form.factsheet.whoShouldInvest} onChange={(e) => setForm({ ...form, factsheet: { ...form.factsheet, whoShouldInvest: e.target.value } })} className="mt-1.5" /></div>
                  <div><Label>Risk factors</Label><Textarea value={form.factsheet.riskFactors} onChange={(e) => setForm({ ...form, factsheet: { ...form.factsheet, riskFactors: e.target.value } })} className="mt-1.5" /></div>
                </div>
                <div>
                  <Label>Factsheet PDF</Label>
                  {form.factsheet_pdf ? (
                    <div data-testid="factsheet-pdf-row" className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-[#E8E1F0] bg-white px-3 py-2.5">
                      <a data-testid="factsheet-pdf-link" href={`${API}/portfolios/${editingId}/factsheet?auth=${token}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-medium text-[#5320A8] hover:underline min-w-0">
                        <FileText className="h-4 w-4 shrink-0" /> <span className="truncate">{form.factsheet_pdf.filename}</span>
                      </a>
                      <button type="button" data-testid="factsheet-pdf-remove" onClick={removeFactsheet} className="h-8 w-8 grid place-items-center rounded-lg text-[#DC2626] hover:bg-[#FEF2F2] shrink-0"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <label data-testid="factsheet-pdf-upload" className="mt-1.5 flex items-center gap-2 rounded-xl border border-dashed border-[#D8C7F1] bg-[#F7F4FB] px-3 py-3 text-sm text-[#5320A8] cursor-pointer hover:bg-[#F1E7FE] transition-colors w-fit">
                      <Upload className="h-4 w-4" /> {uploadingPdf ? 'Uploading…' : 'Upload factsheet PDF'}
                      <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFactsheetPick} disabled={uploadingPdf} />
                    </label>
                  )}
                  <div className="mt-1.5 text-xs text-[#6B6480]">Investors can download this PDF from your live portfolio page. Max 10 MB.</div>
                </div>
              </div>
            </section>

            {errors.length > 0 && (
              <div data-testid="submit-errors" className="surface p-4 mt-4 border border-[#FECACA] bg-[#FEF2F2]">
                <div className="text-sm font-semibold text-[#DC2626]">Please fix the following before submitting:</div>
                <ul className="mt-2 space-y-1 text-xs text-[#B91C1C] list-disc pl-5">
                  {errors.map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
              </div>
            )}

            <div className="sticky bottom-0 bg-[#F7F4FB] py-4 mt-2 flex items-center gap-3">
              <button data-testid="save-draft-btn" onClick={saveForm} disabled={busy} className="btn-outline"><Save className="h-4 w-4" /> Save draft</button>
              <button data-testid="save-submit-btn" onClick={saveAndSubmit} disabled={busy} className="btn-primary"><Send className="h-4 w-4" /> Save & submit for approval</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

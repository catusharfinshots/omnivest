import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Plus, Trash2, Save, Send, ArrowLeft, Pencil, LogOut, LayoutDashboard, ListChecks, MessageSquare, AlertCircle, PauseCircle, CalendarCheck, Eye } from 'lucide-react';
import omniMark from '../assets/omnivest-mark-white.svg';
import PartnerOverview from './partner/PartnerOverview';
import ListingForm from './partner/ListingForm';
import PostsManager from './partner/PostsManager';
import ComputedPerformance from './partner/ComputedPerformance';
import CoverArt from './CoverArt';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const OPTION_DEFAULTS = {
  strategy: ['asset-allocation', 'sectoral', 'thematic', 'smart-beta', 'model-based'],
  tags: ['Growth', 'Value', 'Dividend', 'Momentum', 'Quality', 'Low volatility'],
  rebalanceFreq: ['Monthly', 'Quarterly', 'Half-yearly', 'Yearly', 'As needed'],
  subscription: ['Free', 'Paid'],
  constituentType: ['Stock', 'ETF'],
};
const STATUS_STYLES = {
  draft: 'bg-[#F1F1F4] text-[#6B6480]',
  pending: 'bg-[#FEF3C7] text-[#9A4A05]',
  approved: 'bg-[#DCFCE7] text-[#0B7F4A]',
  rejected: 'bg-[#FEE2E2] text-[#B91C1C]',
  paused: 'bg-[#FEE2E2] text-[#B91C1C]',
};
const STATUS_LABEL = { draft: 'Draft', pending: 'Awaiting approval', approved: 'Live', rejected: 'Rejected', paused: 'Paused by admin' };
const nice = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function AnalystConsole() {
  const { user, token, logout } = useAuth();
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const [view, setView] = useState('overview'); // overview | list | form | profile | posts
  const [dashboardOn, setDashboardOn] = useState(true);
  const [portfolios, setPortfolios] = useState([]);
  const [readiness, setReadiness] = useState({}); // id -> missing[]
  const [profile, setProfile] = useState({ displayName: user?.name || '', sebiReg: '', philosophy: '', description: '', logo: '' });
  const [editing, setEditing] = useState(null);   // portfolio doc being edited (null = new)
  const [postsFor, setPostsFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState(OPTION_DEFAULTS);
  const [rules, setRules] = useState(null);
  const [perfOpen, setPerfOpen] = useState(null);  // listing id with the performance panel expanded

  const load = useCallback(async () => {
    try {
      const [p, pr] = await Promise.all([axios.get(`${API}/analyst/portfolios`, auth), axios.get(`${API}/analyst/profile`, auth)]);
      const list = p.data.portfolios || [];
      setPortfolios(list);
      if (pr.data.profile) setProfile(pr.data.profile);
      // readiness (same rules as the submit gate) for anything the partner can still submit
      const need = list.filter((x) => x.status === 'draft' || x.status === 'rejected' || (x.has_revision && x.revision_status === 'draft'));
      const pairs = await Promise.all(need.map(async (x) => {
        try { const { data } = await axios.get(`${API}/analyst/portfolios/${x.id}/readiness`, auth); return [x.id, data.missing || []]; }
        catch { return [x.id, null]; }
      }));
      setReadiness(Object.fromEntries(pairs));
    } catch { toast.error('Could not load your listings'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    axios.get(`${API}/partner-dashboard/settings`).then(({ data }) => {
      const on = data?.settings?.enabled !== false;
      setDashboardOn(on);
      if (!on) setView((v) => (v === 'overview' ? 'list' : v));
    }).catch(() => {});
    axios.get(`${API}/listing-options`).then(({ data }) => { if (data) setOptions({ ...OPTION_DEFAULTS, ...(data.options || data) }); }).catch(() => {});
    axios.get(`${API}/listing-rules`).then(({ data }) => setRules(data)).catch(() => {});
  }, []);

  const saveProfile = async () => {
    setBusy(true);
    try { await axios.put(`${API}/analyst/profile`, profile, auth); toast.success('Profile saved'); setView('list'); }
    catch { toast.error('Could not save profile'); } finally { setBusy(false); }
  };
  const startNew = () => { setEditing(null); setView('form'); };
  const startEdit = (p) => { setEditing(p); setView('form'); };
  const remove = async (id) => {
    if (!window.confirm('Delete this listing? This cannot be undone.')) return;
    try { await axios.delete(`${API}/analyst/portfolios/${id}`, auth); toast.success('Deleted'); await load(); }
    catch { toast.error('Could not delete'); }
  };
  const discardChanges = async (id) => {
    if (!window.confirm('Discard your unpublished changes? The live listing stays exactly as investors see it now.')) return;
    try { await axios.delete(`${API}/analyst/portfolios/${id}/revision`, auth); toast.success('Changes discarded'); await load(); }
    catch { toast.error('Could not discard'); }
  };
  const submitForReview = async (id) => {
    try { const { data } = await axios.post(`${API}/analyst/portfolios/${id}/submit`, {}, auth); toast.success(data?.revision_status ? 'Changes sent for admin approval — your listing stays live meanwhile' : 'Submitted for admin approval'); await load(); }
    catch (e) {
      const d = e?.response?.data?.detail;
      if (d && typeof d === 'object' && Array.isArray(d.errors)) { toast.error(d.message || 'Listing is incomplete'); setReadiness((r) => ({ ...r, [id]: d.errors })); }
      else toast.error(typeof d === 'string' ? d : 'Could not submit');
    }
  };

  const managerName = profile.displayName || user?.name;

  return (
    <div className="min-h-screen bg-[#F7F4FB]">
      <header className="sticky top-0 z-30 bg-white border-b border-[#E8E1F0]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <span className="h-8 w-8 rounded-lg grad-card text-white grid place-items-center"><img src={omniMark} alt="" className="h-5 w-5" /></span>
            <div className="hidden sm:block"><div className="font-[Inter] font-bold leading-none">Omnivest</div><div className="text-[12px] uppercase tracking-widest text-[#6B6480]">Analyst console</div></div>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-2 text-sm whitespace-nowrap overflow-x-auto">
            <span className="text-[#6B6480] hidden md:inline mr-2">{user?.name}</span>
            {dashboardOn && <button onClick={() => setView('overview')} data-testid="console-nav-overview" className={`btn-ghost text-xs ${view === 'overview' ? 'bg-[#F1E7FE] text-[#5320A8]' : ''}`}><LayoutDashboard className="h-3.5 w-3.5" /> Overview</button>}
            <button onClick={() => setView('list')} data-testid="console-nav-listings" className={`btn-ghost text-xs ${['list', 'form', 'posts'].includes(view) ? 'bg-[#F1E7FE] text-[#5320A8]' : ''}`}><ListChecks className="h-3.5 w-3.5" /> My listings</button>
            <button onClick={() => setView('profile')} className={`btn-ghost text-xs ${view === 'profile' ? 'bg-[#F1E7FE] text-[#5320A8]' : ''}`}>My profile</button>
            <button onClick={logout} className="btn-ghost text-xs"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {view === 'overview' && dashboardOn && (
          <PartnerOverview token={token} onNew={startNew}
            onEdit={(id) => { const p = portfolios.find((x) => x.id === id); if (p) startEdit(p); else setView('list'); }}
            onProfile={() => setView('profile')} />
        )}

        {view === 'profile' && (
          <div className="surface p-6 max-w-2xl">
            <button onClick={() => setView('list')} className="btn-ghost text-xs mb-3"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
            <h2 className="text-lg font-semibold">My profile</h2>
            <p className="text-xs text-[#6B6480]">Shown as the manager on your listing pages — investors read it before subscribing.</p>
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

        {view === 'list' && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div><h1 className="text-2xl font-bold">My model portfolios</h1><p className="text-sm text-[#6B6480]">Build a listing, submit it, and the live track record starts on approval.</p></div>
              <button onClick={startNew} className="btn-primary" data-testid="new-listing-btn"><Plus className="h-4 w-4" /> New listing</button>
            </div>
            <div className="mt-6 space-y-3">
              {portfolios.length === 0 && <div className="surface p-10 text-center text-[#6B6480]">No listings yet. Click “New listing” to build your first one — it takes about 15 minutes.</div>}
              {portfolios.map((p) => {
                const revDraft = p.has_revision && p.revision_status === 'draft';
                const revPending = p.has_revision && p.revision_status === 'pending';
                const canSubmit = p.status === 'draft' || p.status === 'rejected' || revDraft;
                const missing = readiness[p.id];
                const live = p.status === 'approved' || p.status === 'paused';
                return (
                  <div key={p.id} data-testid="portfolio-row" className="surface p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                      <div className="min-w-0 flex items-start gap-3">
                        {p.cover && <CoverArt cover={p.cover} name={p.name} size={44} radius={12} className="mt-0.5" />}
                        <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[#1A1030] truncate">{p.name}</span>
                          <span className={`text-[12px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLES[p.status] || STATUS_STYLES.draft}`}>{STATUS_LABEL[p.status] || p.status}</span>
                          {revPending && <span className="text-[12px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#9A4A05]" data-testid="revision-pending">Changes awaiting approval</span>}
                          {revDraft && <span className="text-[12px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8]" data-testid="revision-draft">Unpublished changes</span>}
                          {p.featured && <span className="text-[12px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#EDE9FE] text-[#6C2BD9]">Featured</span>}
                          {p.subscription === 'Paid' && <span className="text-[12px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#9A4A05]">Paid</span>}
                        </div>
                        <div className="text-xs text-[#6B6480] mt-0.5 truncate">{p.subtitle || 'No pitch yet'} · {(p.constituents || []).length} holdings · {p.benchmark || 'NIFTY 50'}{(p.tags || []).length ? ` · ${p.tags.join(', ')}` : ''}</div>
                        {p.launch_date && <div className="text-[12px] text-[#6B6480] mt-1 inline-flex items-center gap-1"><CalendarCheck className="h-3 w-3 text-[#6C2BD9]" /> Live since {nice(p.launch_date)}{(p.versions || []).length > 1 ? ` · ${p.versions.length} versions` : ''}</div>}
                        {p.has_revision && <div className="text-[12px] text-[#526071] mt-1">Investors keep seeing the approved version until an admin approves your changes.</div>}
                        {p.revision_changes_requested && p.revision_note && (
                          <div className="mt-2 flex items-start gap-1.5 text-xs rounded-lg bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-1.5 text-[#92400E]" data-testid="revision-changes-requested"><AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span><b>Admin asked for changes to your update:</b> {p.revision_note} — edit and resubmit. The live listing is unchanged.</span></div>
                        )}
                        {p.revision_rejected_at && p.review_note && p.status === 'approved' && (
                          <div className="mt-2 flex items-start gap-1.5 text-xs rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-2.5 py-1.5 text-[#991B1B]" data-testid="revision-rejected"><AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span><b>Your proposed changes were declined:</b> {p.review_note}. The live listing is unchanged.</span></div>
                        )}
                        {p.changes_requested && p.review_note && !p.has_revision && (
                          <div className="mt-2 flex items-start gap-1.5 text-xs rounded-lg bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-1.5 text-[#92400E]" data-testid="changes-requested"><AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span><b>Admin asked for changes:</b> {p.review_note} — edit and resubmit.</span></div>
                        )}
                        {p.status === 'rejected' && p.review_note && <div className="mt-2 flex items-start gap-1.5 text-xs rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-2.5 py-1.5 text-[#991B1B]"><AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span><b>Rejected:</b> {p.review_note}</span></div>}
                        {p.status === 'paused' && p.review_note && <div className="mt-2 flex items-start gap-1.5 text-xs rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-2.5 py-1.5 text-[#991B1B]"><PauseCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span><b>Paused by admin:</b> {p.review_note} — fix and resubmit, or contact support.</span></div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:justify-end">
                        {canSubmit && <button onClick={() => submitForReview(p.id)} disabled={missing && missing.length > 0} className="btn-outline text-xs disabled:opacity-50" title={missing?.length ? 'Complete the checklist first' : ''} data-testid="submit-btn"><Send className="h-3.5 w-3.5" /> {revDraft ? 'Submit changes' : 'Submit'}</button>}
                        {revDraft && <button onClick={() => discardChanges(p.id)} className="btn-ghost text-xs text-[#B91C1C]" data-testid="discard-revision">Discard changes</button>}
                        {p.status === 'approved' && <a href={`/model-portfolios/${p.id}`} target="_blank" rel="noreferrer" className="btn-ghost text-xs"><Eye className="h-3.5 w-3.5" /> View live</a>}
                        {live && <button onClick={() => { setPostsFor(p); setView('posts'); }} className="btn-ghost text-xs" data-testid="posts-btn"><MessageSquare className="h-3.5 w-3.5" /> Updates</button>}
                        {live && <button onClick={() => setPerfOpen(perfOpen === p.id ? null : p.id)} className="btn-ghost text-xs">Performance</button>}
                        <button onClick={() => startEdit(p)} className="btn-ghost text-xs"><Pencil className="h-3.5 w-3.5" /> {live ? 'Rebalance / edit' : 'Edit'}</button>
                        {!live && <button onClick={() => remove(p.id)} className="h-8 w-8 grid place-items-center rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>}
                      </div>
                    </div>
                    {canSubmit && missing && (
                      <div data-testid="draft-checklist" className="mt-3 rounded-lg border border-[#E8E1F0] bg-[#FAFAFE] px-3 py-2.5">
                        {missing.length === 0 ? <div className="text-xs font-medium text-[#0B7F4A]">✓ Ready to submit — everything's in place.</div> : (
                          <details>
                            <summary className="cursor-pointer text-xs font-semibold text-[#9A4A05] list-none flex items-center gap-1">
                              <span className="inline-grid place-items-center h-4 w-4 rounded-full bg-[#B45309] text-white text-[12px]">{missing.length}</span>
                              {missing.length} item{missing.length > 1 ? 's' : ''} left before you can submit
                            </summary>
                            <ul className="mt-2 space-y-1 text-[12px] text-[#6B6480] list-disc pl-5">{missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
                          </details>
                        )}
                      </div>
                    )}
                    {perfOpen === p.id && <div className="mt-3"><ComputedPerformance pid={p.id} token={token} /></div>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === 'form' && (
          <ListingForm token={token} initial={editing} options={options} rules={rules} managerName={managerName}
            onBack={() => { setView('list'); load(); }}
            onSaved={() => load()}
            onSubmitted={() => { setView('list'); load(); }} />
        )}

        {view === 'posts' && postsFor && <PostsManager token={token} portfolio={postsFor} onBack={() => setView('list')} />}
      </main>
    </div>
  );
}

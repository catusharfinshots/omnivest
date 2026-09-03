import React, { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { baskets as seedBaskets, collections as seedCollections, mutualFunds as seedMF, testimonials as seedT, faqs as seedFaqs } from '../mock';
import { Activity, LayoutGrid, Users, Package, LineChart, Landmark, MessageSquare, HelpCircle, Settings, Plus, Trash2, ExternalLink, LogOut, Inbox, ClipboardCheck, UserPlus, Copy, Database, ChevronLeft, ChevronRight, ChevronDown, Download, Pencil, TrendingUp, SlidersHorizontal } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from '../components/ui/alert-dialog';
import AboutAdmin from '../components/admin/AboutAdmin';
import MarketDataAdmin from '../components/admin/MarketDataAdmin';
import ListingSettingsAdmin from '../components/admin/ListingSettingsAdmin';
import ListingReviewCard from '../components/admin/ListingReviewCard';
import PostsModerationAdmin from '../components/admin/PostsModerationAdmin';
import ApprovedPartnersAdmin from '../components/admin/ApprovedPartnersAdmin';
import PartnerAppCard from '../components/admin/PartnerAppCard';
import PartnerPageAdmin from '../components/admin/PartnerPageAdmin';
import PartnerDashboardAdmin from '../components/admin/PartnerDashboardAdmin';
import PerformanceEngineAdmin from '../components/admin/PerformanceEngineAdmin';
import omniMark from '../assets/omnivest-mark-white.svg';
import { toast } from 'sonner';

const NAV = [
  { key: 'home', label: 'Home content', icon: LayoutGrid },
  { key: 'about', label: 'About Us', icon: Users },
  { key: 'managers', label: 'Approved Partners', icon: Users },
  { key: 'collections', label: 'Collections', icon: LineChart },
  { key: 'mutual-funds', label: 'Mutual funds', icon: LineChart },
  { key: 'fds', label: 'Fixed deposits', icon: Landmark },
  { key: 'testimonials', label: 'Testimonials', icon: MessageSquare },
  { key: 'faqs', label: 'FAQ', icon: HelpCircle },
  { key: 'leads', label: 'Leads', icon: Inbox },
  { key: 'listings', label: 'Listings (approve)', icon: ClipboardCheck },
  { key: 'engine', label: 'Performance engine', icon: Activity },
  { key: 'partners', label: 'Partner applications', icon: UserPlus },
  { key: 'partnerpage', label: 'Partner page', icon: LayoutGrid },
  { key: 'market', label: 'Market data (Kite)', icon: TrendingUp },
  { key: 'dropdowns', label: 'Listing settings', icon: SlidersHorizontal },
  { key: 'database', label: 'Database', icon: Database },
  { key: 'settings', label: 'Site settings', icon: Settings },
];

const NAV_BY_KEY = NAV.reduce((m, n) => { m[n.key] = n; return m; }, {});

// Sidebar groups (exact order + membership per spec).
const NAV_GROUPS = [
  { label: 'Partners & Listings', keys: ['partners', 'managers', 'partnerpage', 'listings', 'engine', 'dropdowns'] },
  { label: 'Site content', keys: ['home', 'about', 'testimonials', 'faqs'] },
  { label: 'Investment catalog', keys: ['collections', 'mutual-funds', 'fds'] },
  { label: 'Operations', keys: ['leads', 'market'] },
  { label: 'System', keys: ['database', 'settings'] },
];
const NAV_STATE_KEY = 'omni-admin-nav-groups-v1';

const LEADS_API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CONTENT_TABS = ['home', 'baskets', 'collections', 'mutual-funds', 'fds', 'testimonials', 'faqs', 'settings', 'partnerpage', 'engine'];
const HEADER = {
  home: { title: 'Content manager', desc: 'Edit what investors see on the homepage, then hit Publish changes to push it live.' },
  about: { title: 'About Us page', desc: 'Manage every section of the public /about page. Changes go live when you click Save About page.' },
  baskets: { title: 'Baskets', desc: 'Manage the baskets shown across the site.' },
  managers: { title: 'Approved Partners', desc: 'SEBI-registered partners appear here automatically once you approve their application.' },
  collections: { title: 'Collections', desc: 'Manage the themed collection tiles.' },
  'mutual-funds': { title: 'Mutual funds', desc: 'Manage the mutual funds catalogue.' },
  fds: { title: 'Fixed deposits', desc: 'Manage fixed-deposit providers and rates.' },
  testimonials: { title: 'Testimonials', desc: 'Manage investor testimonials.' },
  faqs: { title: 'FAQ', desc: 'Manage frequently asked questions.' },
  leads: { title: 'Leads', desc: 'People who registered interest via the AIF & Advisory pages.' },
  listings: { title: 'Research-analyst listings', desc: 'Approve or reject analyst submissions to publish them live.' },
  dropdowns: { title: 'Listing settings', desc: 'Rules every partner listing must meet, subscription economics, NSE market-cap data, and the form dropdown options.' },
  engine: { title: 'Performance engine', desc: 'Monitor the computed track records (market data, freshness, failed symbols), recompute, correct launch dates, and edit the investor disclaimer.' },
  invites: { title: 'Analyst invites', desc: 'Invite research analysts to onboard themselves.' },
  partners: { title: 'Partner applications', desc: 'Review research-analyst applications submitted from the website and approve them.' },
  partnerpage: { title: 'Partner page', desc: 'Everything shown on the public partner landing page (/partner) — hero, benefits, steps, requirements and FAQ. Publish to go live.' },
  market: { title: 'Market data (Kite)', desc: 'Connect Zerodha Kite once each trading day to power analyst instrument search, live prices and returns.' },
  database: { title: 'Database', desc: 'Read-only view of your live data. Sensitive fields (passwords, tokens) are redacted.' },
  settings: { title: 'Site settings', desc: 'Legal disclaimer and contact details.' },
};

const DB_GROUPS = [
  { label: 'People', keys: ['users', 'partner_applications', 'managers'] },
  { label: 'Analyst', keys: ['analyst_portfolios', 'analyst_invites'] },
  { label: 'Broker & market', keys: ['broker_connections', 'broker_orders', 'kite_sessions', 'instruments'] },
  { label: 'Site content', keys: ['site_content', 'faqs', 'leads'] },
  { label: 'Settings & system', keys: ['app_settings', 'status_checks'] },
];
const DB_CLEAR_BLOCKED = ['broker_orders'];            // never clearable from the UI
const DB_CLEAR_CONFIRM = ['users', 'partner_applications', 'managers', 'analyst_portfolios']; // require typed confirm
const DB_SEARCH_FIRST = ['instruments'];               // large — don't auto-list, search first

const CONTENT_DEFAULTS = {
  hero: { headline: 'Challenging', highlight: 'volatility', sub: 'Money at work — expert-managed model portfolios, alternative investment funds and SEBI-registered advisory, all in one place.', primaryCta: 'Get started', secondaryCta: 'Explore portfolios' },
  stats: { rating: '4.6/5', investors: '1 lakh+', managed: '₹100 Cr+' },
  trust: [
    { title: 'No new accounts', text: 'Hold your stocks & ETFs in your existing demat account — no separate account needed.' },
    { title: 'Invest without lock-ins', text: 'Exit your investments whenever you like.' },
    { title: 'Secure by design', text: 'Financial-grade security with encryption in transit and at rest.' },
    { title: 'Regulated products only', text: 'Products & services regulated by SEBI & RBI.' },
  ],
  testimonials: [
    { name: 'Saurabh', tag: 'Reviewed on Play Store', quote: 'One of the best finance products in recent times.' },
    { name: 'Nithin', tag: 'Posted on X', quote: 'The best investment-tech experience I’ve used in India today.' },
    { name: 'Asma', tag: 'Reviewed on Play Store', quote: 'Best app for investing with multiple choices of portfolios.' },
    { name: 'Tanmay', tag: 'Posted on X', quote: 'Fallen in love with Omnivest — such a smooth product.' },
    { name: 'Ravi', tag: 'Reviewed on Play Store', quote: 'A smart app blending tech and finance.' },
    { name: 'Jonathan', tag: 'Reviewed on App Store', quote: 'Excellent platform for beginners.' },
  ],
  footer: {
    contactEmail: 'support@omnivest.in',
    subscribeHeading: 'Get market insights & product updates in your inbox',
    socials: { facebook: '', x: '', youtube: '', linkedin: '', instagram: '' },
  },
  partnerTerms: {
    title: 'Partner Terms & Conditions',
    body: '',
  },
  partnerPage: { hero: {}, benefits: [], features: [], how: [], requirements: [], requirementsTip: '', faqs: [] },
  performanceDisclaimer: '',
};

function Row({ children }) {
  return <div className="flex items-center gap-3 py-3 border-b border-[#F1E7FE] last:border-0">{children}</div>;
}

function EmptyState({ title, desc, onAdd }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[#E8E1F0] p-10 text-center">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-[#F1E7FE] text-[#6C2BD9] grid place-items-center"><Plus className="h-5 w-5" /></div>
      <div className="mt-4 font-semibold">{title}</div>
      <div className="text-sm text-[#6B6480]">{desc}</div>
      <button onClick={onAdd} className="btn-primary mt-4">Add entry</button>
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState('home');
  const [dirty, setDirty] = useState(false);
  const [pendingPartners, setPendingPartners] = useState(0);
  const [pendingListings, setPendingListings] = useState(0);
  const [openGroups, setOpenGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem(NAV_STATE_KEY) || 'null') || {}; } catch { return {}; }
  });
  const toggleGroup = (label) => setOpenGroups((s) => {
    const currentlyOpen = s[label] !== undefined ? s[label] : true;
    const next = { ...s, [label]: !currentlyOpen };
    try { localStorage.setItem(NAV_STATE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  // A group is expanded if it holds the active item (forced) or per saved/default state.
  const isGroupOpen = (g) => g.keys.includes(tab) || (openGroups[g.label] !== undefined ? openGroups[g.label] : true);

  const { user, token, isAuthed, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const [content, setContent] = useState(CONTENT_DEFAULTS);
  const [baskets, setBaskets] = useState(seedBaskets);
  const [collections, setCollections] = useState(seedCollections);
  const [funds, setFunds] = useState(seedMF);
  const [testimonials, setTestimonials] = useState(seedT);
  const [faqs, setFaqs] = useState(seedFaqs);

  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const fetchLeads = async () => {
    setLeadsLoading(true);
    try {
      const { data } = await axios.get(`${LEADS_API}/leads`);
      setLeads(data.leads || []);
    } catch {
      toast.error('Could not load leads');
    } finally {
      setLeadsLoading(false);
    }
  };
  useEffect(() => {
    if (tab === 'leads') fetchLeads();
  }, [tab]);

  const refreshCounts = async () => {
    if (!token) return;
    const h = { headers: { Authorization: `Bearer ${token}` } };
    try { const { data } = await axios.get(`${LEADS_API}/admin/partners`, h); setPendingPartners((data.applications || []).filter((a) => a.status === 'pending').length); } catch { /* ignore */ }
    try { const { data } = await axios.get(`${LEADS_API}/admin/portfolios`, h); setPendingListings(data.counts?.pending ?? (data.portfolios || []).filter((p) => p.status === 'pending').length); } catch { /* ignore */ }
    try { const { data } = await axios.get(`${LEADS_API}/admin/performance/alerts`, h); setEngineAlerts(data.total || 0); } catch { /* ignore */ }
  };
  useEffect(() => { refreshCounts(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [token]);

  const [engineAlerts, setEngineAlerts] = useState(0);
  const [listings, setListings] = useState([]);
  const [listingCounts, setListingCounts] = useState({ pending: 0, approved: 0, paused: 0, rejected: 0 });
  const [listingFilter, setListingFilter] = useState('pending'); // drafts never reach admin
  const [listingsLoading, setListingsLoading] = useState(false);
  const fetchListings = async () => {
    setListingsLoading(true);
    try {
      const { data } = await axios.get(`${LEADS_API}/admin/portfolios`, { headers: { Authorization: `Bearer ${token}` } });
      setListings(data.portfolios || []);
      setListingCounts({ pending: 0, approved: 0, paused: 0, rejected: 0, ...(data.counts || {}) });
      setPendingListings(data.counts?.pending || 0);
    } catch { toast.error('Could not load listings'); }
    finally { setListingsLoading(false); }
  };
  useEffect(() => {
    if (tab === 'listings') fetchListings();
  }, [tab]);
  const reviewListing = async (id, action, note = '') => {
    try {
      await axios.post(`${LEADS_API}/admin/portfolios/${id}/review`, { action, note }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(action === 'approve' ? 'Approved — live now; the track record starts at today\'s close' : action === 'reject' ? 'Rejected — the partner sees your note' : 'Sent back to the partner with your note');
      fetchListings();
      refreshCounts();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not update'); }
  };
  const listingAction = async (id, kind, body = {}) => {
    try {
      await axios.post(`${LEADS_API}/admin/portfolios/${id}/${kind}`, body, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(kind === 'feature' ? (body.featured ? 'Pinned to the top of explore' : 'Removed from featured') : kind === 'pause' ? 'Listing paused — hidden from investors' : 'Listing is live again');
      fetchListings();
      refreshCounts();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not update'); }
  };

  const [invites, setInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [newInvite, setNewInvite] = useState(null);
  const fetchInvites = async () => {
    setInvitesLoading(true);
    try {
      const { data } = await axios.get(`${LEADS_API}/admin/invites`, { headers: { Authorization: `Bearer ${token}` } });
      setInvites(data.invites || []);
    } catch { toast.error('Could not load invites'); }
    finally { setInvitesLoading(false); }
  };
  useEffect(() => {
    if (tab === 'invites') fetchInvites();
  }, [tab]);
  const inviteLink = (code) => `${window.location.origin}/signup?invite=${code}`;
  const createInvite = async () => {
    try {
      const { data } = await axios.post(`${LEADS_API}/admin/invites`, { email_note: '' }, { headers: { Authorization: `Bearer ${token}` } });
      const link = inviteLink(data.code);
      setNewInvite({ ...data.invite, code: data.code, link });
      try { await navigator.clipboard.writeText(link); toast.success('Invite created — link copied to clipboard'); }
      catch { toast.success('Invite created'); }
      fetchInvites();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not create invite'); }
  };
  const revokeInvite = async (id) => {
    try {
      await axios.post(`${LEADS_API}/admin/invites/${id}/revoke`, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Invite revoked');
      fetchInvites();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not revoke'); }
  };

  const [partnerApps, setPartnerApps] = useState([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnerQ, setPartnerQ] = useState('');
  const [partnerStatus, setPartnerStatus] = useState('pending');
  const fetchPartners = async () => {
    setPartnersLoading(true);
    try {
      const { data } = await axios.get(`${LEADS_API}/admin/partners`, { headers: { Authorization: `Bearer ${token}` } });
      setPartnerApps(data.applications || []);
    } catch { toast.error('Could not load applications'); }
    finally { setPartnersLoading(false); }
  };
  useEffect(() => {
    if (tab === 'partners') fetchPartners();
  }, [tab]);
  const reviewPartner = async (id, action, note = '') => {
    try {
      await axios.post(`${LEADS_API}/admin/partners/${id}/review`, { action, note }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(action === 'approve' ? 'Approved — analyst can now log in via their mobile' : 'Rejected — the applicant sees your reason when tracking their application');
      fetchPartners();
      refreshCounts();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not update'); throw e; }
  };

  const DB_LIMIT = 25;
  const [dbCollections, setDbCollections] = useState([]);
  const [dbActive, setDbActive] = useState(null);
  const [dbDocs, setDbDocs] = useState([]);
  const [dbTotal, setDbTotal] = useState(0);
  const [dbSkip, setDbSkip] = useState(0);
  const [dbQuery, setDbQuery] = useState('');
  const [dbLoading, setDbLoading] = useState(false);
  const [dbNeedsSearch, setDbNeedsSearch] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const authHeader = { headers: { Authorization: `Bearer ${token}` } };
  const fetchDbCollections = async () => {
    try {
      const { data } = await axios.get(`${LEADS_API}/admin/db/collections`, authHeader);
      setDbCollections(data.collections || []);
      if (!dbActive && data.collections?.length) selectCollection(data.collections[0].name);
    } catch { toast.error('Could not load collections'); }
  };
  const fetchDbDocs = async (name, skip = 0, q = '') => {
    setDbLoading(true);
    try {
      const { data } = await axios.get(`${LEADS_API}/admin/db/${name}?skip=${skip}&limit=${DB_LIMIT}&q=${encodeURIComponent(q)}`, authHeader);
      setDbDocs(data.documents || []);
      setDbTotal(data.total || 0);
      setDbSkip(skip);
      setDbNeedsSearch(false);
    } catch { toast.error('Could not load records'); }
    finally { setDbLoading(false); }
  };
  const selectCollection = (name) => {
    setDbActive(name); setDbQuery(''); setConfirmDeleteId(null);
    if (DB_SEARCH_FIRST.includes(name)) { setDbNeedsSearch(true); setDbDocs([]); setDbTotal(0); setDbSkip(0); return; }
    setDbNeedsSearch(false);
    fetchDbDocs(name, 0, '');
  };
  useEffect(() => {
    if (tab === 'database') fetchDbCollections();
  }, [tab]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [clearOpen, setClearOpen] = useState(false);
  const exportCsv = async (name) => {
    try {
      const res = await axios.get(`${LEADS_API}/admin/db/${name}/export`, { ...authHeader, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = `${name}.csv`; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${name}.csv`);
    } catch { toast.error('Export failed'); }
  };
  const deleteRecord = async (name, id) => {
    try {
      await axios.delete(`${LEADS_API}/admin/db/${name}/${id}`, authHeader);
      toast.success('Record deleted');
      setConfirmDeleteId(null);
      fetchDbDocs(name, dbSkip, dbQuery);
      fetchDbCollections();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not delete'); }
  };
  const clearCollection = async (name) => {
    try {
      const body = DB_CLEAR_CONFIRM.includes(name) ? { confirm: name } : {};
      const { data } = await axios.post(`${LEADS_API}/admin/db/${name}/clear`, body, authHeader);
      toast.success(`Cleared ${data.deleted} record${data.deleted !== 1 ? 's' : ''}${name === 'users' ? ' (admins kept)' : ''}`);
      setClearOpen(false);
      setClearConfirmText('');
      fetchDbDocs(name, 0, '');
      fetchDbCollections();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not clear'); }
  };

  useEffect(() => {
    axios.get(`${LEADS_API}/content`).then(({ data }) => {
      if (data) setContent({ ...CONTENT_DEFAULTS, ...data });
    }).catch(() => {});
  }, []);

  const H = { headers: { Authorization: `Bearer ${token}` } };
  const [faqList, setFaqList] = useState([]);
  const [faqLoading, setFaqLoading] = useState(false);
  const [faqEdit, setFaqEdit] = useState(null);
  const blankFaq = { question: '', answer: '', category: 'General', isTop: false, order: 0, published: true };
  const fetchFaqs = async () => {
    setFaqLoading(true);
    try { const { data } = await axios.get(`${LEADS_API}/faqs/admin/all`, H); setFaqList(data.faqs || []); }
    catch { toast.error('Could not load FAQs'); }
    finally { setFaqLoading(false); }
  };
  useEffect(() => { if (tab === 'faqs') fetchFaqs(); }, [tab]);
  const saveFaq = async () => {
    if (!faqEdit.question.trim() || !faqEdit.answer.trim()) { toast.error('Question and answer are required'); return; }
    try {
      const p = { ...faqEdit, order: Number(faqEdit.order) || 0 };
      if (p.id) await axios.put(`${LEADS_API}/faqs/${p.id}`, p, H);
      else await axios.post(`${LEADS_API}/faqs`, p, H);
      toast.success('FAQ saved'); setFaqEdit(null); fetchFaqs();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not save FAQ'); }
  };
  const deleteFaq = async (id) => {
    try { await axios.delete(`${LEADS_API}/faqs/${id}`, H); toast.success('FAQ deleted'); fetchFaqs(); }
    catch { toast.error('Could not delete'); }
  };

  const markDirty = () => setDirty(true);
  const patchContent = (section, value) => { setContent((c) => ({ ...c, [section]: value })); markDirty(); };

  const publish = async () => {
    try {
      const payload = { hero: content.hero, stats: content.stats, trust: content.trust, testimonials: content.testimonials, footer: content.footer, partnerTerms: content.partnerTerms, partnerPage: content.partnerPage, performanceDisclaimer: content.performanceDisclaimer };
      await axios.put(`${LEADS_API}/content`, payload, { headers: { Authorization: `Bearer ${token}` } });
      try { localStorage.setItem('bk_home_content_v1', JSON.stringify(payload)); } catch (e) {}
      toast.success('Published', { description: 'Home page content is now live on the site.' });
      setDirty(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not publish. Are you logged in as an admin?');
    }
  };
  const discard = async () => {
    try {
      const { data } = await axios.get(`${LEADS_API}/content`);
      setContent({ ...CONTENT_DEFAULTS, ...data });
    } catch { /* noop */ }
    toast.info('Changes discarded');
    setDirty(false);
  };

  if (authLoading) {
    return <div className="min-h-screen grid place-items-center text-[#6B6480]">Loading console…</div>;
  }
  if (!isAuthed) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#F7F4FB] p-6">
        <div className="surface p-8 text-center max-w-sm">
          <span className="h-12 w-12 mx-auto rounded-xl grad-card text-white grid place-items-center"><img src={omniMark} alt="" className="h-7 w-7" /></span>
          <h1 className="mt-4 text-xl font-bold">Owner console</h1>
          <p className="mt-2 text-sm text-[#6B6480]">Please log in with an admin account to manage the site.</p>
          <button onClick={() => navigate('/login?next=/admin')} className="btn-primary mt-5 w-full">Log in</button>
        </div>
      </div>
    );
  }
  if (!isAdmin) {
    if (user.role === 'analyst') {
      return <Navigate to="/analyst" replace />;
    }
    return (
      <div className="min-h-screen grid place-items-center bg-[#F7F4FB] p-6">
        <div className="surface p-8 text-center max-w-sm">
          <h1 className="text-xl font-bold">No console access</h1>
          <p className="mt-2 text-sm text-[#6B6480]">Hi {user.name}. This area is for platform admins only.</p>
          <button onClick={() => { logout(); navigate('/'); }} className="btn-outline mt-5 w-full">Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F4FB]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#E8E1F0]">
        <div className="px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-lg grad-card text-white grid place-items-center"><img src={omniMark} alt="" className="h-5 w-5" /></span>
            <div>
              <div className="font-[Inter] text-sm font-bold">Omnivest</div>
              <div className="text-[10px] uppercase tracking-widest text-[#6C2BD9] font-bold">Owner console</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="btn-ghost inline-flex items-center gap-1 text-xs"><ExternalLink className="h-3.5 w-3.5" /> View site</Link>
            <button onClick={() => { logout(); navigate('/'); }} className="btn-ghost inline-flex items-center gap-1 text-xs"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] min-h-[calc(100vh-3.5rem)]">
        <aside className="bg-white border-b lg:border-b-0 lg:border-r border-[#E8E1F0] p-3 lg:p-4">
          <nav className="flex flex-col gap-1">
            {NAV_GROUPS.map((g) => {
              const open = isGroupOpen(g);
              const isSystem = g.label === 'System';
              return (
                <div key={g.label} className={isSystem ? 'mt-3 pt-3 border-t border-[#E8E1F0]' : ''}>
                  <button data-testid={`admin-group-${g.label}`} onClick={() => toggleGroup(g.label)}
                    className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] hover:text-[#5320A8] transition-colors">
                    <span>{g.label}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
                  </button>
                  {open && (
                    <div className="flex flex-col gap-1 mt-0.5">
                      {g.keys.map((key) => {
                        const n = NAV_BY_KEY[key];
                        if (!n) return null;
                        const badge = key === 'partners' ? pendingPartners : key === 'listings' ? pendingListings : key === 'engine' ? engineAlerts : 0;
                        return (
                          <button key={key} data-testid={`admin-nav-${key}`} onClick={() => setTab(key)}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${tab === key ? 'bg-[#F1E7FE] text-[#5320A8]' : 'text-[#1A1030] hover:bg-[#F7F4FB]'}`}>
                            <n.icon className="h-4 w-4" /> <span className="flex-1 text-left">{n.label}</span>
                            {badge > 0 && (
                              <span data-testid={`admin-badge-${key}`} className="ml-auto min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-[#DC2626] text-white text-[10px] font-bold leading-none">{badge}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="p-4 sm:p-6 lg:p-8">
          <div className="max-w-5xl">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold">{HEADER[tab]?.title || 'Content manager'}</h1>
                <p className="text-sm text-[#6B6480]">{HEADER[tab]?.desc || 'Manage your site content.'}</p>
              </div>
              {CONTENT_TABS.includes(tab) && (
                <div className="flex items-center gap-2">
                  <button onClick={discard} disabled={!dirty} className={`btn-outline ${!dirty ? 'opacity-50 cursor-not-allowed' : ''}`}>Discard</button>
                  <button onClick={publish} className="btn-primary">Publish changes</button>
                </div>
              )}
            </div>
            {CONTENT_TABS.includes(tab) && dirty && <div className="mt-3 text-xs text-[#B45309] bg-[#FFFAEB] border border-[#FDE68A] rounded-lg px-3 py-1.5 inline-block">You have unpublished changes.</div>}

            <div className="mt-8 space-y-6">
              {tab === 'home' && (
                <div className="space-y-6">
                  <section className="surface p-6">
                    <div className="text-sm font-semibold">Hero</div>
                    <div className="text-xs text-[#6B6480]">The top of the homepage.</div>
                    <div className="mt-4 grid md:grid-cols-2 gap-4">
                      <div><Label>Headline</Label><Input value={content.hero.headline} onChange={(e)=>patchContent('hero',{...content.hero, headline:e.target.value})} className="mt-1.5 h-10" /></div>
                      <div><Label>Highlighted word</Label><Input value={content.hero.highlight} onChange={(e)=>patchContent('hero',{...content.hero, highlight:e.target.value})} className="mt-1.5 h-10" /></div>
                      <div className="md:col-span-2"><Label>Sub-headline</Label><Textarea value={content.hero.sub} onChange={(e)=>patchContent('hero',{...content.hero, sub:e.target.value})} className="mt-1.5" /></div>
                      <div><Label>Primary button</Label><Input value={content.hero.primaryCta} onChange={(e)=>patchContent('hero',{...content.hero, primaryCta:e.target.value})} className="mt-1.5 h-10" /></div>
                      <div><Label>Secondary button</Label><Input value={content.hero.secondaryCta} onChange={(e)=>patchContent('hero',{...content.hero, secondaryCta:e.target.value})} className="mt-1.5 h-10" /></div>
                    </div>
                  </section>

                  <section className="surface p-6">
                    <div className="text-sm font-semibold">Rating stats</div>
                    <div className="text-xs text-[#6B6480]">Shown just under the hero buttons.</div>
                    <div className="mt-4 grid md:grid-cols-3 gap-4">
                      <div><Label>Rating</Label><Input value={content.stats.rating} onChange={(e)=>patchContent('stats',{...content.stats, rating:e.target.value})} className="mt-1.5 h-10" /></div>
                      <div><Label>Investors</Label><Input value={content.stats.investors} onChange={(e)=>patchContent('stats',{...content.stats, investors:e.target.value})} className="mt-1.5 h-10" /></div>
                      <div><Label>Managed</Label><Input value={content.stats.managed} onChange={(e)=>patchContent('stats',{...content.stats, managed:e.target.value})} className="mt-1.5 h-10" /></div>
                    </div>
                  </section>

                  <section className="surface p-6">
                    <div className="text-sm font-semibold">Trust points</div>
                    <div className="text-xs text-[#6B6480]">The four cards in the dark “Trust” section.</div>
                    <div className="mt-4 space-y-3">
                      {content.trust.map((t, i) => (
                        <div key={i} className="grid md:grid-cols-[1fr_2fr] gap-3">
                          <Input value={t.title} onChange={(e)=>{const a=[...content.trust]; a[i]={...a[i], title:e.target.value}; patchContent('trust', a);}} className="h-10" placeholder="Title" />
                          <Input value={t.text} onChange={(e)=>{const a=[...content.trust]; a[i]={...a[i], text:e.target.value}; patchContent('trust', a);}} className="h-10" placeholder="Description" />
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="surface p-6">
                    <div className="flex items-center justify-between">
                      <div><div className="text-sm font-semibold">Testimonials</div><div className="text-xs text-[#6B6480]">The “Loved by investors” cards.</div></div>
                      <button onClick={()=>patchContent('testimonials',[...content.testimonials,{name:'New reviewer', tag:'', quote:''}])} className="btn-outline"><Plus className="h-4 w-4" /> Add</button>
                    </div>
                    <div className="mt-4 space-y-3">
                      {content.testimonials.map((t, i) => (
                        <div key={i} className="flex items-start gap-3 border-b border-[#F1E7FE] pb-3 last:border-0">
                          <div className="flex-1 grid md:grid-cols-2 gap-3">
                            <Input value={t.name} onChange={(e)=>{const a=[...content.testimonials]; a[i]={...a[i], name:e.target.value}; patchContent('testimonials', a);}} className="h-9" placeholder="Name" />
                            <Input value={t.tag} onChange={(e)=>{const a=[...content.testimonials]; a[i]={...a[i], tag:e.target.value}; patchContent('testimonials', a);}} className="h-9" placeholder="Source (e.g. Posted on X)" />
                            <Textarea value={t.quote} onChange={(e)=>{const a=[...content.testimonials]; a[i]={...a[i], quote:e.target.value}; patchContent('testimonials', a);}} className="md:col-span-2" placeholder="Quote" />
                          </div>
                          <button onClick={()=>patchContent('testimonials', content.testimonials.filter((_,j)=>j!==i))} className="h-8 w-8 grid place-items-center rounded-lg text-[#F04438] hover:bg-[#FEF3F2]"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {tab === 'about' && <AboutAdmin token={token} />}

              {tab === 'market' && <MarketDataAdmin token={token} />}
              {tab === 'engine' && <PerformanceEngineAdmin token={token} disclaimer={content.performanceDisclaimer} onDisclaimerChange={(v) => patchContent('performanceDisclaimer', v)} onAlerts={setEngineAlerts} />}

              {tab === 'dropdowns' && <ListingSettingsAdmin token={token} />}

              {tab === 'leads' && (
                <section className="surface p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Leads</div>
                      <div className="text-xs text-[#6B6480]">People who registered interest via the AIF &amp; Advisory pages.</div>
                    </div>
                    <button onClick={fetchLeads} className="btn-outline">Refresh</button>
                  </div>
                  {leadsLoading ? (
                    <div className="mt-6 text-sm text-[#6B6480]">Loading leads…</div>
                  ) : leads.length === 0 ? (
                    <div className="mt-6 text-sm text-[#6B6480]">No leads yet. Submit the form on the AIF or Advisory page to see it here.</div>
                  ) : (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-[#E8E1F0]">
                      <table className="w-full text-sm">
                        <thead className="bg-[#F7F4FB] text-[#6B6480]"><tr className="text-left">
                          <th className="px-4 py-3 font-medium">Type</th>
                          <th className="px-4 py-3 font-medium">Email</th>
                          <th className="px-4 py-3 font-medium">Plan</th>
                          <th className="px-4 py-3 font-medium">Received</th>
                        </tr></thead>
                        <tbody>
                          {leads.map((l) => (
                            <tr key={l.id} className="border-t border-[#F1E7FE]">
                              <td className="px-4 py-3"><span className={l.type === 'aif' ? 'chip-brand' : 'chip-accent'}>{l.type.toUpperCase()}</span></td>
                              <td className="px-4 py-3 font-medium text-[#1A1030]">{l.email}</td>
                              <td className="px-4 py-3 text-[#6B6480]">{l.plan || '—'}</td>
                              <td className="px-4 py-3 text-[#6B6480]">{new Date(l.created_at).toLocaleString('en-IN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {tab === 'listings' && (<>
                <section className="surface p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Research-analyst listings</div>
                      <div className="text-xs text-[#6B6480]">Approve submissions to publish them on the public Model Portfolio pages.</div>
                    </div>
                    <button onClick={fetchListings} className="btn-outline">Refresh</button>
                  </div>
                  <div className="mt-4 flex items-center gap-2 flex-wrap" data-testid="listing-filters">
                    {[['pending', 'Awaiting approval'], ['approved', 'Live'], ['paused', 'Paused'], ['rejected', 'Rejected']].map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setListingFilter(k)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${listingFilter === k ? 'bg-[#F1E7FE] border-[#D8C7F1] text-[#5320A8]' : 'border-[#E8E1F0] text-[#6B6480] hover:border-[#D8C7F1]'}`}>
                        {label} <span className={`min-w-[18px] px-1 rounded-full text-[10px] text-center ${k === 'pending' && listingCounts.pending ? 'bg-[#DC2626] text-white' : 'bg-[#F1F1F4] text-[#6B6480]'}`}>{listingCounts[k] || 0}</span>
                      </button>
                    ))}
                    <span className="text-[11px] text-[#94A3B8] ml-auto">Partners' drafts stay private until they submit — only submitted listings appear here.</span>
                  </div>
                  {listingsLoading ? (
                    <div className="mt-6 text-sm text-[#6B6480]">Loading…</div>
                  ) : listings.filter((p) => p.status === listingFilter).length === 0 ? (
                    <div className="mt-6 text-sm text-[#6B6480]" data-testid="listings-empty">
                      {listingFilter === 'pending' ? 'Nothing awaiting approval. Partners submit from their console once a listing is complete.' : listingFilter === 'approved' ? 'No live listings yet.' : listingFilter === 'paused' ? 'No paused listings.' : 'No rejected listings.'}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {listings.filter((p) => p.status === listingFilter).map((p) => (
                        <ListingReviewCard key={p.id} p={p} onReview={reviewListing} onAction={listingAction} />
                      ))}
                    </div>
                  )}
                </section>
                <PostsModerationAdmin token={token} />
              </>)}

              {tab === 'partners' && (
                <section className="surface p-6" data-testid="partners-panel">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-semibold">Partner applications</div>
                      <div className="text-xs text-[#6B6480]">Research analysts apply from the website's “Become a partner” page. Approve to unlock their analyst console (they log in with their mobile).</div>
                    </div>
                    <button onClick={fetchPartners} className="btn-outline text-xs">Refresh</button>
                  </div>

                  <div className="mt-4 flex items-center gap-2 flex-wrap" data-testid="partner-filters">
                    <Input data-testid="partner-search" value={partnerQ} onChange={(e) => setPartnerQ(e.target.value)}
                      placeholder="Search name, email, phone, SEBI no. or reference…" className="h-9 max-w-sm" />
                    {['pending', 'approved', 'rejected', 'all'].map((s) => {
                      const count = s === 'all' ? partnerApps.length : partnerApps.filter((a) => a.status === s).length;
                      return (
                        <button key={s} type="button" data-testid={`partner-filter-${s}`} onClick={() => setPartnerStatus(s)}
                          className={`h-9 rounded-lg px-3 text-xs font-semibold capitalize transition-colors ${partnerStatus === s ? 'bg-[#1A1030] text-white' : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'}`}>
                          {s} <span className="opacity-60">({count})</span>
                        </button>
                      );
                    })}
                  </div>

                  {partnersLoading ? (
                    <div className="mt-6 text-sm text-[#6B6480]">Loading…</div>
                  ) : partnerApps.length === 0 ? (
                    <div className="mt-6 text-sm text-[#6B6480]">No applications yet. They'll appear here when someone applies via “Become a partner”.</div>
                  ) : (() => {
                    const q = partnerQ.trim().toLowerCase();
                    const shown = partnerApps
                      .filter((a) => partnerStatus === 'all' || a.status === partnerStatus)
                      .filter((a) => !q || [a.name, a.email, a.phone, a.sebi_reg, a.ref_no, a.registered_name, a.firm]
                        .some((v) => (v || '').toLowerCase().includes(q)));
                    return shown.length === 0 ? (
                      <div className="mt-6 text-sm text-[#6B6480]">No {partnerStatus === 'all' ? '' : partnerStatus + ' '}applications{q ? ` matching “${partnerQ}”` : ''}.</div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {shown.map((a) => (
                          <PartnerAppCard key={a.id} app={a} token={token} onReview={reviewPartner} />
                        ))}
                      </div>
                    );
                  })()}
                </section>
              )}

              {tab === 'database' && (
                <section className="surface p-6" data-testid="db-viewer">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex flex-col gap-3 flex-1 min-w-0">
                      {(() => {
                        const sections = DB_GROUPS.map((g) => ({ label: g.label, cols: dbCollections.filter((c) => g.keys.includes(c.name)) }));
                        const others = dbCollections.filter((c) => !DB_GROUPS.some((g) => g.keys.includes(c.name)));
                        if (others.length) sections.push({ label: 'Other', cols: others });
                        return sections.filter((s) => s.cols.length).map((s) => (
                          <div key={s.label} data-testid={`db-group-${s.label}`}>
                            <div className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-semibold mb-1.5">{s.label}</div>
                            <div className="flex flex-wrap gap-2">
                              {s.cols.map((col) => (
                                <button key={col.name} data-testid={`db-col-${col.name}`} onClick={() => selectCollection(col.name)}
                                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${dbActive === col.name ? 'bg-[#6C2BD9] text-white' : 'bg-[#F7F4FB] text-[#1A1030] hover:bg-[#F1E7FE]'}`}>
                                  {col.name}<span className={`rounded-full px-1.5 ${dbActive === col.name ? 'bg-white/20' : 'bg-[#E8E1F0]'}`}>{col.count}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                    <button onClick={() => dbActive && !DB_SEARCH_FIRST.includes(dbActive) && fetchDbDocs(dbActive, dbSkip, dbQuery)} className="btn-outline text-xs">Refresh</button>
                  </div>

                  {dbActive && (
                    <div className="mt-4 flex items-center gap-2 flex-wrap">
                      <Input data-testid="db-search" value={dbQuery} onChange={(e) => setDbQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') fetchDbDocs(dbActive, 0, dbQuery); }}
                        placeholder="Search (email, name, status, id…) then press Enter" className="h-9 max-w-md" />
                      <button onClick={() => fetchDbDocs(dbActive, 0, dbQuery)} className="btn-outline text-xs">Search</button>
                      <div className="flex-1" />
                      <button data-testid="db-export-btn" onClick={() => exportCsv(dbActive)} className="btn-outline text-xs inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" /> Export CSV</button>
                      {!DB_CLEAR_BLOCKED.includes(dbActive) && (
                        <button data-testid="db-clear-btn" onClick={() => { setClearConfirmText(''); setClearOpen(true); }} disabled={dbTotal === 0} className={`inline-flex items-center gap-1 rounded-lg border border-[#FECACA] text-[#DC2626] text-xs font-semibold px-3 py-2 hover:bg-[#FEF2F2] ${dbTotal === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}><Trash2 className="h-3.5 w-3.5" /> Clear collection</button>
                      )}
                    </div>
                  )}

                  {dbActive && dbNeedsSearch ? (
                    <div className="mt-6 text-sm text-[#6B6480]" data-testid="db-search-first">This is a large collection. Search by symbol or name above, then press Enter to view records.</div>
                  ) : dbLoading ? (
                    <div className="mt-6 text-sm text-[#6B6480]">Loading records…</div>
                  ) : dbDocs.length === 0 ? (
                    <div className="mt-6 text-sm text-[#6B6480]">No records in this collection.</div>
                  ) : (
                    <>
                      <div className="mt-4 text-xs text-[#6B6480]">Showing {dbSkip + 1}–{Math.min(dbSkip + DB_LIMIT, dbTotal)} of {dbTotal}</div>
                      <div className="mt-3 space-y-2">
                        {dbDocs.map((doc, i) => (
                          <details key={doc.id || i} data-testid="db-record" className="rounded-xl border border-[#E8E1F0] bg-white overflow-hidden group">
                            <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#F7F4FB]">
                              <span className="text-sm font-medium text-[#1A1030] truncate">{doc.email || doc.name || doc.type || doc.id || 'record'}</span>
                              <span className="flex items-center gap-3 shrink-0">
                                <span className="text-xs text-[#6B6480]">{doc.role || doc.status || (doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-IN') : '')}</span>
                                {doc.id && (dbActive !== 'users' || doc.role !== 'admin') && (
                                  confirmDeleteId === doc.id ? (
                                    <span className="flex items-center gap-1" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                                      <button data-testid="db-record-confirm-delete" onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteRecord(dbActive, doc.id); }} className="rounded-md bg-[#DC2626] text-white text-[11px] font-semibold px-2 py-1">Delete</button>
                                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(null); }} className="rounded-md border border-[#E8E1F0] text-[11px] font-semibold px-2 py-1">Cancel</button>
                                    </span>
                                  ) : (
                                    <button data-testid="db-record-delete" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(doc.id); }} className="h-7 w-7 grid place-items-center rounded-lg text-[#DC2626] hover:bg-[#FEF2F2]"><Trash2 className="h-3.5 w-3.5" /></button>
                                  )
                                )}
                              </span>
                            </summary>
                            <pre className="px-4 py-3 border-t border-[#F1E7FE] bg-[#FAFAFE] text-xs text-[#334155] overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(doc, null, 2)}</pre>
                          </details>
                        ))}
                      </div>
                      {dbTotal > DB_LIMIT && (
                        <div className="mt-4 flex items-center justify-between">
                          <button disabled={dbSkip === 0} onClick={() => fetchDbDocs(dbActive, Math.max(0, dbSkip - DB_LIMIT), dbQuery)} className={`btn-outline text-xs ${dbSkip === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
                          <span className="text-xs text-[#6B6480]">Page {Math.floor(dbSkip / DB_LIMIT) + 1} of {Math.max(1, Math.ceil(dbTotal / DB_LIMIT))}</span>
                          <button disabled={dbSkip + DB_LIMIT >= dbTotal} onClick={() => fetchDbDocs(dbActive, dbSkip + DB_LIMIT, dbQuery)} className={`btn-outline text-xs ${dbSkip + DB_LIMIT >= dbTotal ? 'opacity-40 cursor-not-allowed' : ''}`}>Next <ChevronRight className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </>
                  )}

                  <AlertDialog open={clearOpen} onOpenChange={(o) => { setClearOpen(o); if (!o) setClearConfirmText(''); }}>
                    <AlertDialogContent data-testid="db-clear-dialog">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear “{dbActive}” collection?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently deletes {dbActive === 'users' ? 'all customer & analyst accounts (your admin accounts are kept)' : `all ${dbTotal} record${dbTotal !== 1 ? 's' : ''} in this collection`}. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      {DB_CLEAR_CONFIRM.includes(dbActive) && (
                        <div className="py-1">
                          <label className="text-xs text-[#6B6480]">Type <span className="font-semibold text-[#1A1030]">{dbActive}</span> to confirm:</label>
                          <Input data-testid="db-clear-confirm-input" value={clearConfirmText} onChange={(e) => setClearConfirmText(e.target.value)} className="h-9 mt-1.5" placeholder={dbActive} />
                        </div>
                      )}
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction data-testid="db-clear-confirm"
                          disabled={DB_CLEAR_CONFIRM.includes(dbActive) && clearConfirmText !== dbActive}
                          onClick={() => clearCollection(dbActive)}
                          className={`bg-[#DC2626] hover:bg-[#B91C1C] ${DB_CLEAR_CONFIRM.includes(dbActive) && clearConfirmText !== dbActive ? 'opacity-40 cursor-not-allowed' : ''}`}>Yes, clear it</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </section>
              )}

              {tab === 'baskets' && (
                <section className="surface p-6">
                  <div className="text-sm font-semibold">Baskets are managed by research analysts</div>
                  <div className="mt-1 text-xs text-[#6B6480]">Model portfolios (baskets) are created by research analysts in their console — with full stocks &amp; weights, methodology, rebalancing and factsheet. Review and publish them from the <span className="font-semibold text-[#5320A8]">Listings (approve)</span> tab.</div>
                  <button onClick={()=>setTab('listings')} className="btn-primary mt-4">Go to Listings (approve)</button>
                </section>
              )}

              {tab === 'managers' && <ApprovedPartnersAdmin token={token} />}

              {tab === 'partnerpage' && (
                <div className="space-y-6">
                  <PartnerPageAdmin pp={content.partnerPage} onChange={(next) => patchContent('partnerPage', next)} />
                  <PartnerDashboardAdmin token={token} />
                </div>
              )}

              {tab === 'collections' && (
                <section className="surface p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Collections</div>
                      <div className="text-xs text-[#6B6480]">Emoji + label tiles.</div>
                    </div>
                    <button onClick={()=>{setCollections([{id:`c_${Date.now()}`, slug:'new-collection', title:'New collection', type:'stock', description:'', icon:'Sparkles'}, ...collections]); markDirty();}} className="btn-outline"><Plus className="h-4 w-4" /> Add collection</button>
                  </div>
                  <div className="mt-4">
                    {collections.map((c, i) => (
                      <Row key={c.id}>
                        <div className="h-9 w-9 rounded-lg bg-[#F1E7FE] text-[#6C2BD9] grid place-items-center text-xs font-bold">{c.title.slice(0,2).toUpperCase()}</div>
                        <div className="flex-1 grid md:grid-cols-3 gap-3">
                          <Input value={c.title} onChange={(e)=>{const x=[...collections]; x[i]={...x[i], title: e.target.value}; setCollections(x); markDirty();}} className="h-9" />
                          <Input value={c.description} onChange={(e)=>{const x=[...collections]; x[i]={...x[i], description: e.target.value}; setCollections(x); markDirty();}} className="h-9" placeholder="Description" />
                          <Input value={c.type} onChange={(e)=>{const x=[...collections]; x[i]={...x[i], type: e.target.value}; setCollections(x); markDirty();}} className="h-9" placeholder="stock or mf" />
                        </div>
                        <button onClick={()=>{setCollections(collections.filter((_,j)=>j!==i)); markDirty();}} className="h-8 w-8 grid place-items-center rounded-lg text-[#F04438] hover:bg-[#FEF3F2]"><Trash2 className="h-4 w-4" /></button>
                      </Row>
                    ))}
                  </div>
                </section>
              )}

              {tab === 'mutual-funds' && (
                <section className="surface p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Mutual funds</div>
                      <div className="text-xs text-[#6B6480]">Shown on the Mutual Funds page.</div>
                    </div>
                    <button onClick={()=>{setFunds([{id:`f_${Date.now()}`, name:'New fund', category:'equity', amc:'', nav:0, returns:{y1:0,y3:0,y5:0}, expenseRatio:0}, ...funds]); markDirty();}} className="btn-outline"><Plus className="h-4 w-4" /> Add fund</button>
                  </div>
                  <div className="mt-4">
                    {funds.map((f, i) => (
                      <Row key={f.id}>
                        <div className="flex-1 grid md:grid-cols-3 gap-3">
                          <Input value={f.name} onChange={(e)=>{const x=[...funds]; x[i]={...x[i], name: e.target.value}; setFunds(x); markDirty();}} className="h-9" />
                          <Input value={f.amc} onChange={(e)=>{const x=[...funds]; x[i]={...x[i], amc: e.target.value}; setFunds(x); markDirty();}} className="h-9" placeholder="AMC" />
                          <div className="grid grid-cols-2 gap-2">
                            <Input value={f.nav} onChange={(e)=>{const x=[...funds]; x[i]={...x[i], nav: Number(e.target.value)}; setFunds(x); markDirty();}} className="h-9 num" placeholder="NAV" />
                            <Input value={f.expenseRatio} onChange={(e)=>{const x=[...funds]; x[i]={...x[i], expenseRatio: Number(e.target.value)}; setFunds(x); markDirty();}} className="h-9 num" placeholder="Expense" />
                          </div>
                        </div>
                        <button onClick={()=>{setFunds(funds.filter((_,j)=>j!==i)); markDirty();}} className="h-8 w-8 grid place-items-center rounded-lg text-[#F04438] hover:bg-[#FEF3F2]"><Trash2 className="h-4 w-4" /></button>
                      </Row>
                    ))}
                  </div>
                </section>
              )}

              {tab === 'testimonials' && (
                <section className="surface p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Testimonials</div>
                    </div>
                    <button onClick={()=>{setTestimonials([{name:'New', initial:'N', tag:'Investor', quote:''}, ...testimonials]); markDirty();}} className="btn-outline"><Plus className="h-4 w-4" /> Add testimonial</button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {testimonials.map((t, i) => (
                      <div key={i} className="grid md:grid-cols-3 gap-3 items-start pb-3 border-b border-[#F1E7FE] last:border-0">
                        <Input value={t.name} onChange={(e)=>{const x=[...testimonials]; x[i]={...x[i], name: e.target.value, initial: e.target.value.charAt(0)}; setTestimonials(x); markDirty();}} className="h-9" placeholder="Name" />
                        <Input value={t.tag} onChange={(e)=>{const x=[...testimonials]; x[i]={...x[i], tag: e.target.value}; setTestimonials(x); markDirty();}} className="h-9" placeholder="Tag" />
                        <div className="flex gap-2">
                          <Textarea value={t.quote} onChange={(e)=>{const x=[...testimonials]; x[i]={...x[i], quote: e.target.value}; setTestimonials(x); markDirty();}} className="min-h-[36px]" placeholder="Quote" />
                          <button onClick={()=>{setTestimonials(testimonials.filter((_,j)=>j!==i)); markDirty();}} className="h-8 w-8 grid place-items-center rounded-lg text-[#F04438] hover:bg-[#FEF3F2] shrink-0"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {tab === 'faqs' && (
                <section className="surface p-6" data-testid="faq-admin">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-semibold">FAQ</div>
                      <div className="text-xs text-[#6B6480]">Manage questions for the home FAQ section and the /faq page. “Top” FAQs show on the homepage.</div>
                    </div>
                    <button data-testid="faq-add-btn" onClick={() => setFaqEdit({ ...blankFaq, order: faqList.length })} className="btn-primary inline-flex items-center gap-1"><Plus className="h-4 w-4" /> Add FAQ</button>
                  </div>

                  {faqEdit && (
                    <div className="mt-4 rounded-xl border border-[#D8C7F1] bg-[#F7F4FB] p-4 space-y-3" data-testid="faq-editor">
                      <div><Label>Question</Label><Input data-testid="faq-q" value={faqEdit.question} onChange={(e) => setFaqEdit({ ...faqEdit, question: e.target.value })} className="h-10 mt-1.5" /></div>
                      <div><Label>Answer</Label><Textarea data-testid="faq-a" value={faqEdit.answer} onChange={(e) => setFaqEdit({ ...faqEdit, answer: e.target.value })} rows={3} className="mt-1.5" /></div>
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div><Label>Category</Label><Input value={faqEdit.category} onChange={(e) => setFaqEdit({ ...faqEdit, category: e.target.value })} className="h-10 mt-1.5" placeholder="e.g. Fees" /></div>
                        <div><Label>Order</Label><Input type="number" value={faqEdit.order} onChange={(e) => setFaqEdit({ ...faqEdit, order: e.target.value })} className="h-10 mt-1.5" /></div>
                        <div className="flex items-end gap-4 pb-1">
                          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#6C2BD9]" checked={faqEdit.isTop} onChange={(e) => setFaqEdit({ ...faqEdit, isTop: e.target.checked })} /> Show on home</label>
                          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#6C2BD9]" checked={faqEdit.published} onChange={(e) => setFaqEdit({ ...faqEdit, published: e.target.checked })} /> Published</label>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button data-testid="faq-save" onClick={saveFaq} className="btn-primary">Save FAQ</button>
                        <button onClick={() => setFaqEdit(null)} className="btn-outline">Cancel</button>
                      </div>
                    </div>
                  )}

                  {faqLoading ? (
                    <div className="mt-6 text-sm text-[#6B6480]">Loading…</div>
                  ) : faqList.length === 0 ? (
                    <div className="mt-6 text-sm text-[#6B6480]">No FAQs yet. Click “Add FAQ”.</div>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {faqList.map((f) => (
                        <div key={f.id} data-testid="faq-admin-row" className="flex items-start justify-between gap-3 rounded-xl border border-[#E8E1F0] bg-white p-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-[#1A1030]">{f.question}</span>
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[#EEE9F6] text-[#5320A8]">{f.category}</span>
                              {f.isTop && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[#DCFCE7] text-[#0E9F5E]">Home</span>}
                              {!f.published && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[#FEE2E2] text-[#DC2626]">Hidden</span>}
                            </div>
                            <div className="mt-1 text-xs text-[#64748B] line-clamp-2">{f.answer}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button data-testid={`faq-edit-${f.id}`} onClick={() => setFaqEdit(f)} className="h-8 w-8 grid place-items-center rounded-lg text-[#6C2BD9] hover:bg-[#F1E7FE]"><Pencil className="h-4 w-4" /></button>
                            <button data-testid={`faq-del-${f.id}`} onClick={() => deleteFaq(f.id)} className="h-8 w-8 grid place-items-center rounded-lg text-[#DC2626] hover:bg-[#FEF2F2]"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {tab === 'fds' && <EmptyState title="Manage fixed deposits" desc="Add providers, rates, and tenures shown on the FD page." onAdd={()=>{toast.success('New FD row added (mock)'); markDirty();}} />}
              {tab === 'settings' && (
                <section className="surface p-6 space-y-5" data-testid="settings-panel">
                  <div className="text-sm font-semibold">Footer & contact</div>
                  <div>
                    <Label>Contact email (shown in footer)</Label>
                    <Input data-testid="settings-contact-email" value={content.footer?.contactEmail || ''} onChange={(e) => patchContent('footer', { ...content.footer, contactEmail: e.target.value })} className="mt-1.5 h-10" placeholder="support@omnivest.in" />
                  </div>
                  <div>
                    <Label>Subscribe box heading</Label>
                    <Input value={content.footer?.subscribeHeading || ''} onChange={(e) => patchContent('footer', { ...content.footer, subscribeHeading: e.target.value })} className="mt-1.5 h-10" />
                  </div>
                  <div>
                    <Label>Social media links</Label>
                    <div className="mt-1.5 grid sm:grid-cols-2 gap-3">
                      {['facebook', 'x', 'youtube', 'linkedin', 'instagram'].map((k) => (
                        <div key={k} className="flex items-center gap-2">
                          <span className="w-20 text-xs capitalize text-[#64748B]">{k}</span>
                          <Input data-testid={`settings-social-${k}`} value={content.footer?.socials?.[k] || ''} onChange={(e) => patchContent('footer', { ...content.footer, socials: { ...(content.footer?.socials || {}), [k]: e.target.value } })} className="h-9 flex-1" placeholder={`https://${k}.com/...`} />
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-[#94A3B8]">Leave blank to keep an icon as a placeholder. Click “Publish changes” to go live.</p>
                  </div>
                  <div className="pt-4 border-t border-[#EEE8F6]">
                    <Label>Partner Terms &amp; Conditions</Label>
                    <p className="text-xs text-[#94A3B8] mt-0.5">Shown to research analysts in a modal when they apply on the “Become a partner” page.</p>
                    <Input data-testid="settings-terms-title" value={content.partnerTerms?.title || ''} onChange={(e) => patchContent('partnerTerms', { ...content.partnerTerms, title: e.target.value })} className="mt-2 h-10" placeholder="Partner Terms & Conditions" />
                    <Textarea data-testid="settings-terms-body" value={content.partnerTerms?.body || ''} onChange={(e) => patchContent('partnerTerms', { ...content.partnerTerms, body: e.target.value })} className="mt-2 min-h-[160px]" placeholder="Write the partner terms & conditions here…" />
                  </div>
                </section>
              )}
            </div>

            <div className="mt-8 text-xs text-[#6B6480]">Changes are staged until you publish.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

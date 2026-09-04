import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw, CalendarClock, Database, Plug, Info, History, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const pct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`);
const nice = (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleString('en-IN', iso.length === 10 ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const STATUS_CLS = { approved: 'bg-[#DCFCE7] text-[#0B7F4A]', pending: 'bg-[#FEF3C7] text-[#9A4A05]', draft: 'bg-[#F1F1F4] text-[#6B6480]' };

function Tile({ icon: Icon, label, value, sub, tone = 'ok' }) {
  const tones = { ok: 'border-[#DCFCE7] bg-[#F0FDF4]', warn: 'border-[#FDE68A] bg-[#FFFBEB]', bad: 'border-[#FECACA] bg-[#FEF2F2]', neutral: 'border-[#E8E1F0] bg-white' };
  const iconTone = { ok: 'text-[#0B7F4A]', warn: 'text-[#9A4A05]', bad: 'text-[#B91C1C]', neutral: 'text-[#6C2BD9]' };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-[#6B6480]"><Icon className={`h-3.5 w-3.5 ${iconTone[tone]}`} /> {label}</div>
      <div className="mt-1 text-xl font-bold text-[#1A1030]">{value}</div>
      {sub && <div className="text-[12px] text-[#6B6480] mt-0.5">{sub}</div>}
    </div>
  );
}

// Admin: monitor + control the computed-performance engine.
// `disclaimer`/`onDisclaimerChange` are staged through the console's global Publish flow.
export default function PerformanceEngineAdmin({ token, disclaimer, onDisclaimerChange, onAlerts }) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const [ov, setOv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  const [fix, setFix] = useState(null); // { row, launch_date, launch_price_date, reason }
  const [showPolicy, setShowPolicy] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await axios.get(`${API}/admin/performance/overview`, auth);
      setOv(data);
      if (onAlerts) onAlerts(data.behind.length + data.failed_symbols.length + data.benchmarks_missing.length + (data.kite.connected || !data.listings.some((r) => r.status === 'approved') ? 0 : 1));
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not load engine overview'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [token]);

  const recomputeOne = async (id) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const { data } = await axios.post(`${API}/admin/performance/recompute/${id}`, {}, auth);
      toast.success(data.market_data === 'live' ? 'Recomputed from live market data' : 'Recomputed from cached prices (Kite not connected)');
      await load(true);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Recompute failed'); }
    finally { setBusy((b) => ({ ...b, [id]: false })); }
  };
  const recomputeAll = async () => {
    setBusy((b) => ({ ...b, all: true }));
    try {
      const { data } = await axios.post(`${API}/admin/performance/recompute`, {}, auth);
      toast.success(`Recomputed ${data.computed} listing${data.computed === 1 ? '' : 's'}${data.failed?.length ? `, ${data.failed.length} failed` : ''} · ${data.market_data} market data`);
      await load(true);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Recompute failed'); }
    finally { setBusy((b) => ({ ...b, all: false })); }
  };
  const saveFix = async () => {
    if (!fix) return;
    setBusy((b) => ({ ...b, fix: true }));
    try {
      await axios.put(`${API}/admin/portfolios/${fix.row.id}/launch`, { launch_date: fix.launch_date, launch_price_date: fix.launch_price_date || null, reason: fix.reason }, auth);
      toast.success('Launch date corrected and track record recomputed');
      setFix(null);
      await load(true);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not update launch date'); }
    finally { setBusy((b) => ({ ...b, fix: false })); }
  };

  if (loading || !ov) return <section className="surface p-6 text-sm text-[#6B6480]">Loading engine status…</section>;
  const approved = ov.listings.filter((r) => r.status === 'approved');
  const kiteTone = ov.kite.connected ? 'ok' : approved.length ? 'bad' : 'warn';
  const alerts = [];
  if (!ov.kite.connected && approved.length) alerts.push({ tone: 'bad', text: `Kite market-data session is ${ov.kite.needs_reconnect ? 'expired' : 'not connected'} — live listings will freeze on ${ov.expected_close_date === approved[0]?.price_date ? 'today’s' : 'their last'} figures. Reconnect in Market data (Kite).` });
  if (ov.behind.length) alerts.push({ tone: 'warn', text: `${ov.behind.length} live listing${ov.behind.length === 1 ? ' is' : 's are'} behind the ${nice(ov.expected_close_date)} close. Recompute after reconnecting Kite.` });
  if (ov.failed_symbols.length) alerts.push({ tone: 'bad', text: `No price history for: ${ov.failed_symbols.join(', ')}. Check the symbol/exchange on the listing, then recompute.` });
  if (ov.benchmarks_missing.length) alerts.push({ tone: 'bad', text: `Benchmark history missing: ${ov.benchmarks_missing.join(', ')} — connect Kite and recompute any listing to fetch it.` });

  return (
    <div className="space-y-4" data-testid="engine-admin">
      {/* 1. Health strip */}
      <section className="surface p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-[#6C2BD9]" /> Engine health</div>
            <div className="text-xs text-[#6B6480] mt-0.5">Are the numbers on the site right today? Checked {nice(ov.now_ist)} IST.</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPolicy((v) => !v)} className="btn-ghost text-xs inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Rules (read-only)</button>
            <button onClick={() => load()} className="btn-outline text-xs"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile icon={Plug} label="Kite market data" tone={kiteTone} value={ov.kite.connected ? 'Connected' : ov.kite.needs_reconnect ? 'Expired' : 'Not connected'} sub={ov.kite.connected ? `${ov.kite.user_name || 'session'} · since ${nice(ov.kite.connected_at)}` : 'Reconnect each trading morning'} />
          <Tile icon={CalendarClock} label="Latest close expected" tone="neutral" value={nice(ov.expected_close_date)} sub="listings should carry prices as of this date" />
          <Tile icon={Database} label="Symbols cached" tone={ov.failed_symbols.length || ov.benchmarks_missing.length ? 'bad' : 'ok'} value={ov.symbols_cached} sub={ov.failed_symbols.length ? `${ov.failed_symbols.length} missing` : 'incl. 4 benchmark indices'} />
          <Tile icon={ov.behind.length ? AlertTriangle : CheckCircle2} label="Live listings" tone={ov.behind.length ? 'warn' : 'ok'} value={`${approved.length - ov.behind.length} / ${approved.length}`} sub={ov.behind.length ? `${ov.behind.length} behind the latest close` : 'all up to date'} />
        </div>
        {alerts.length > 0 && (
          <div className="mt-4 space-y-2" data-testid="engine-alerts">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${a.tone === 'bad' ? 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]' : 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]'}`}>
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span>{a.text}</span>
              </div>
            ))}
          </div>
        )}
        {showPolicy && (
          <div className="mt-4 rounded-xl border border-[#E8E1F0] bg-[#FBF9FE] p-4 text-xs text-[#4B4560] grid sm:grid-cols-2 gap-x-6 gap-y-1.5" data-testid="engine-policy">
            <div><b>Purchase price:</b> {ov.policy.purchase_price}</div>
            <div><b>CAGR shown after:</b> {ov.policy.cagr_after_days} days live (return since launch before that)</div>
            <div><b>Volatility label after:</b> {ov.policy.volatility_after_trading_days} trading days · Low {ov.policy.volatility_bands.Low}, Medium {ov.policy.volatility_bands.Medium}, High {ov.policy.volatility_bands.High}</div>
            <div><b>Windows:</b> {Object.keys(ov.policy.windows).join(', ')} — unlock as the listing ages</div>
            <div><b>Returns basis:</b> {ov.policy.returns_basis}</div>
            <div><b>Refresh:</b> {ov.policy.refresh}</div>
            <div className="sm:col-span-2 text-[#667085]">These are policy, kept in code so every listing stays comparable. Engine v{ov.policy.engine_version}.</div>
          </div>
        )}
      </section>

      {/* 2. Listings table */}
      <section className="surface p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Listings</div>
            <div className="text-xs text-[#6B6480] mt-0.5">Per-listing engine state. Recompute one or all; correct a launch date when an approval happened at the wrong moment (logged).</div>
          </div>
          <button onClick={recomputeAll} disabled={busy.all} className="btn-primary text-xs" data-testid="engine-recompute-all">
            {busy.all ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Recompute all
          </button>
        </div>
        {ov.listings.length === 0 ? (
          <div className="mt-4 text-sm text-[#6B6480]">No listings yet.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs" data-testid="engine-table">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-wider text-[#667085] border-b border-[#E8E1F0]">
                  <th className="py-2 pr-3">Listing</th><th className="py-2 pr-3">Launch</th><th className="py-2 pr-3">Bought at</th><th className="py-2 pr-3">Prices as of</th>
                  <th className="py-2 pr-3">Live</th><th className="py-2 pr-3">Perf.</th><th className="py-2 pr-3">vs bench</th><th className="py-2 pr-3">Vol.</th><th className="py-2 pr-3">Min ₹</th><th className="py-2 pr-3">Ver.</th><th className="py-2 pr-3">State</th><th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {ov.listings.map((r) => {
                  const head = r.cagr_pct !== null && r.cagr_pct !== undefined ? `${pct(r.cagr_pct)} CAGR` : r.return_pct !== null && r.return_pct !== undefined ? `${pct(r.return_pct)} since launch` : (r.launch_date ? 'New' : '—');
                  const state = r.status !== 'approved' ? { t: r.status === 'pending' ? 'awaiting approval' : 'draft', c: 'text-[#6B6480]' }
                    : r.perf_status !== 'ok' ? { t: r.perf_status === 'unavailable' ? 'market data unavailable' : 'not computed yet', c: 'text-[#B91C1C]' }
                      : r.behind ? { t: 'behind latest close', c: 'text-[#9A4A05]' } : { t: 'up to date', c: 'text-[#0B7F4A]' };
                  return (
                    <tr key={r.id} className="border-b border-[#F1EBF9] align-top" data-testid={`engine-row-${r.id}`}>
                      <td className="py-2.5 pr-3 min-w-[160px]">
                        <div className="font-semibold text-[#1A1030]">{r.name}</div>
                        <div className="text-[#667085]">by {r.owner_name || '—'} · <span className={`inline-block px-1.5 rounded-full text-[12px] font-bold uppercase ${STATUS_CLS[r.status] || ''}`}>{r.status}</span></div>
                        {r.errors?.length > 0 && <div className="text-[#B91C1C] mt-0.5">{r.errors[0]}</div>}
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">{r.launch_date ? nice(r.launch_date) : <span className="text-[#667085]">on approval</span>}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">{r.launch_price_date ? `${nice(r.launch_price_date)} close` : '—'}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">{r.price_date ? nice(r.price_date) : '—'}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">{r.launch_date ? `${r.days} d` : '—'}</td>
                      <td className={`py-2.5 pr-3 whitespace-nowrap font-semibold ${(r.cagr_pct ?? r.return_pct ?? 0) < 0 ? 'text-[#B91C1C]' : 'text-[#0B7F4A]'}`}>{r.perf_status === 'ok' ? head : '—'}</td>
                      <td className={`py-2.5 pr-3 whitespace-nowrap ${(r.alpha_pct ?? 0) < 0 ? 'text-[#B91C1C]' : 'text-[#0B7F4A]'}`}>{r.perf_status === 'ok' && r.alpha_pct !== null ? pct(r.alpha_pct) : '—'}<div className="text-[#667085] font-normal">{r.benchmark}</div></td>
                      <td className="py-2.5 pr-3">{r.volatility_label || '—'}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">{r.min_investment ? r.min_investment.toLocaleString('en-IN') : '—'}</td>
                      <td className="py-2.5 pr-3">{r.versions || '—'}</td>
                      <td className={`py-2.5 pr-3 whitespace-nowrap ${state.c}`}>{state.t}<div className="text-[#667085]">{r.as_of ? `computed ${nice(r.as_of)}` : ''}</div></td>
                      <td className="py-2.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-end">
                          <button onClick={() => recomputeOne(r.id)} disabled={busy[r.id]} className="btn-outline text-[12px] py-1 px-2" data-testid={`engine-recompute-${r.id}`}>
                            {busy[r.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Recompute
                          </button>
                          {r.status === 'approved' && (
                            <button onClick={() => setFix({ row: r, launch_date: r.launch_date || '', launch_price_date: r.launch_price_date || '', reason: '' })} className="btn-ghost text-[12px] py-1 px-2 inline-flex items-center gap-1" data-testid={`engine-fix-${r.id}`}>
                              <CalendarClock className="h-3 w-3" /> Correct launch date
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Investor disclaimer (staged via global Publish) */}
      <section className="surface p-6">
        <div className="text-sm font-semibold flex items-center gap-2"><Info className="h-4 w-4 text-[#6C2BD9]" /> Investor disclaimer</div>
        <div className="text-xs text-[#6B6480] mt-0.5">Shown under the performance figures on every public listing page. SEBI-facing wording — edit here, then click <b>Publish changes</b>.</div>
        <Textarea data-testid="engine-disclaimer" value={disclaimer || ''} onChange={(e) => onDisclaimerChange(e.target.value)} className="mt-3 min-h-[110px] text-sm" placeholder="Performance is computed by Omnivest from NSE closing prices…" />
      </section>

      {/* Audit log */}
      <section className="surface p-6">
        <div className="text-sm font-semibold flex items-center gap-2"><History className="h-4 w-4 text-[#6C2BD9]" /> Launch date corrections</div>
        {ov.audit.length === 0 ? (
          <div className="text-xs text-[#6B6480] mt-2">None yet. Every correction is recorded here with who, when and why.</div>
        ) : (
          <div className="mt-3 space-y-2" data-testid="engine-audit">
            {ov.audit.map((a) => (
              <div key={a.id} className="rounded-lg border border-[#E8E1F0] px-3 py-2 text-xs">
                <div><b className="text-[#1A1030]">{a.portfolio_name}</b> · {a.before?.launch_date || '—'} → <b>{a.after?.launch_date}</b> (bought at {a.after?.launch_price_date} close)</div>
                <div className="text-[#6B6480] mt-0.5">“{a.reason}” — {a.admin}, {nice(a.at)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Launch date correction dialog */}
      <Dialog open={!!fix} onOpenChange={(o) => { if (!o) setFix(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Correct launch date — {fix?.row?.name}</DialogTitle></DialogHeader>
          {fix && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-[#6B6480]">The track record is rebuilt from the new purchase close. Use this only when an approval happened at the wrong moment (holiday, mistake, partner dispute). The change is logged with your name.</p>
              <div>
                <Label>Launch date</Label>
                <Input type="date" value={fix.launch_date} onChange={(e) => setFix({ ...fix, launch_date: e.target.value })} className="mt-1 h-10" data-testid="fix-launch-date" />
              </div>
              <div>
                <Label>Purchase (price) date <span className="text-[#667085] font-normal">— leave blank to use the last close on/before the launch date</span></Label>
                <Input type="date" value={fix.launch_price_date} onChange={(e) => setFix({ ...fix, launch_price_date: e.target.value })} className="mt-1 h-10" data-testid="fix-price-date" />
              </div>
              <div>
                <Label>Reason (required, logged)</Label>
                <Textarea value={fix.reason} onChange={(e) => setFix({ ...fix, reason: e.target.value })} className="mt-1 min-h-[70px]" placeholder="e.g. Approved on Diwali holiday; partner agreed to Monday's close" data-testid="fix-reason" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setFix(null)} className="btn-outline text-xs">Cancel</button>
                <button onClick={saveFix} disabled={busy.fix || !fix.launch_date || fix.reason.trim().length < 5} className="btn-primary text-xs" data-testid="fix-save">
                  {busy.fix ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save & recompute
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

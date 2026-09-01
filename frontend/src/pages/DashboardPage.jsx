import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePortfolio } from '../context/PortfolioContext';
import { useBroker } from '../context/BrokerContext';
import { useAuth } from '../context/AuthContext';
import { baskets, getBasket } from '../mock';
import { TrendingUp, TrendingDown, CalendarClock, ShoppingBag, Heart, Link2, RefreshCw, CheckCircle2, Loader2, ExternalLink, LineChart, ClipboardList, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import OrderTicket from '../components/OrderTicket';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function DashboardPage() {
  const { investments, sips, watchlist } = usePortfolio();
  const { connections, userId, getKiteHoldings, getKiteMargins, refreshKite } = useBroker();
  const { isAuthed, loading: authLoading, user, openAuth } = useAuth();
  const navigate = useNavigate();
  const kite = connections.kite;

  const [kiteHoldings, setKiteHoldings] = useState([]);
  const [kiteMargins, setKiteMargins] = useState(null);
  const [kiteOrders, setKiteOrders] = useState([]);
  const [loadingKite, setLoadingKite] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketSymbol, setTicketSymbol] = useState('');
  const [ticketTxn, setTicketTxn] = useState('BUY');

  // One role per account: partners live in the analyst console, not the investor dashboard.
  const isAnalyst = !authLoading && user?.role === 'analyst';
  useEffect(() => {
    if (isAnalyst) navigate('/partner', { replace: true });
  }, [isAnalyst, navigate]);

  const openTicket = (symbol = '', txn = 'BUY') => {
    setTicketSymbol(symbol);
    setTicketTxn(txn);
    setTicketOpen(true);
  };

  const loadKite = async () => {
    if (!kite) return;
    setLoadingKite(true);
    try {
      const [h, m, o] = await Promise.all([
        getKiteHoldings(),
        getKiteMargins(),
        axios.get(`${API}/broker/kite/orders`, { params: { user_id: userId } }).then(r => r.data.orders || []).catch(() => []),
      ]);
      setKiteHoldings(h || []);
      setKiteMargins(m || null);
      setKiteOrders(o || []);
    } catch (e) {
      toast.error('Failed to load Kite data', { description: e?.response?.data?.detail || e.message });
    } finally {
      setLoadingKite(false);
    }
  };

  const cancelOrder = async (order) => {
    try {
      await axios.post(`${API}/broker/kite/order/cancel`, { user_id: userId, order_id: order.order_id, variety: order.variety || 'regular' });
      toast.success('Cancel request sent');
      loadKite();
    } catch (e) {
      toast.error('Cancel failed', { description: e?.response?.data?.detail || e.message });
    }
  };

  useEffect(() => {
    if (kite) loadKite();
    else { setKiteHoldings([]); setKiteMargins(null); setKiteOrders([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kite?.connected_at]);

  const enriched = useMemo(() => investments.map(inv => {
    const b = getBasket(inv.basketId);
    // simulate current value by applying monthly return since createdAt
    const cagr = b ? b.returns.cagr/100 : 0.12;
    const monthly = Math.pow(1+cagr, 1/12) - 1;
    const days = (Date.now() - new Date(inv.createdAt).getTime()) / (1000*3600*24);
    const months = Math.max(0.1, days/30);
    const current = inv.amount * Math.pow(1 + monthly, months);
    return { ...inv, currentValue: current, gain: current - inv.amount, gainPct: ((current - inv.amount)/inv.amount)*100 };
  }), [investments]);

  const totals = enriched.reduce((acc, i) => {
    acc.invested += i.amount; acc.current += i.currentValue; return acc;
  }, { invested: 0, current: 0 });
  const returns = totals.current - totals.invested;
  const returnPct = totals.invested ? (returns/totals.invested)*100 : 0;

  useEffect(() => {
    if (!authLoading && !isAuthed) openAuth({ next: '/dashboard' });
  }, [authLoading, isAuthed, openAuth]);

  if (authLoading) {
    return <div className="container-x py-24 text-center text-[#64748B]">Loading your dashboard…</div>;
  }
  if (!isAuthed) {
    return (
      <div className="container-x py-24 text-center">
        <h1 className="text-2xl font-bold">Please log in</h1>
        <p className="mt-2 text-[#64748B]">You need an account to view your dashboard.</p>
        <button onClick={() => openAuth({ next: '/dashboard' })} className="btn-primary mt-6 inline-flex">Get started</button>
      </div>
    );
  }

  return (
    <div className="container-x py-10 lg:py-14">
      <div className="eyebrow">Portfolio</div>
      <h1 className="mt-2 text-4xl md:text-5xl font-bold">Hi {user?.name?.split(' ')[0] || 'there'}</h1>
      <p className="mt-3 text-[#64748B]">Your simulated portfolio — invest in any model portfolio to see it here.</p>

      <div className="mt-8 grid md:grid-cols-4 gap-4">
        <div className="surface p-5">
          <div className="text-xs text-[#6B6480] uppercase tracking-wider font-semibold">Current value</div>
          <div className="num mt-1 text-2xl font-bold">₹{Math.round(totals.current).toLocaleString('en-IN')}</div>
        </div>
        <div className="surface p-5">
          <div className="text-xs text-[#6B6480] uppercase tracking-wider font-semibold">Invested</div>
          <div className="num mt-1 text-2xl font-bold">₹{Math.round(totals.invested).toLocaleString('en-IN')}</div>
        </div>
        <div className="surface p-5">
          <div className="text-xs text-[#6B6480] uppercase tracking-wider font-semibold">Returns</div>
          <div className={`num mt-1 text-2xl font-bold flex items-center gap-1 ${returns>=0?'text-[#12B76A]':'text-[#F04438]'}`}>
            {returns>=0?<TrendingUp className="h-5 w-5" />:<TrendingDown className="h-5 w-5" />}
            ₹{Math.round(returns).toLocaleString('en-IN')}
          </div>
          <div className={`text-xs mt-0.5 ${returns>=0?'text-[#12B76A]':'text-[#F04438]'}`}>{returns>=0?'+':''}{returnPct.toFixed(2)}%</div>
        </div>
        <div className="surface p-5">
          <div className="text-xs text-[#6B6480] uppercase tracking-wider font-semibold">Active SIPs</div>
          <div className="num mt-1 text-2xl font-bold">{sips.length}</div>
        </div>
      </div>

      {/* Broker connection banner */}
      {!kite ? (
        <Link to="/brokers/connect" className="mt-6 rounded-2xl grad-band text-white p-5 flex items-center justify-between gap-4 hover:brightness-110 transition-all block">
          <div className="flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-white/15 backdrop-blur grid place-items-center"><Link2 className="h-5 w-5" /></div>
            <div>
              <div className="font-semibold">Connect your broker</div>
              <div className="text-sm text-white/85">Link Zerodha to see live holdings & margins on this dashboard.</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-white text-[#6C2BD9] px-4 py-2 text-sm font-semibold">Connect <ExternalLink className="h-3.5 w-3.5" /></span>
        </Link>
      ) : (
        <div className="mt-6 surface p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#FF9F0A] to-[#F04438] text-white grid place-items-center font-bold">Z</div>
              <div>
                <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-[#12B76A]" /> Zerodha connected</div>
                <div className="text-xs text-[#6B6480]">{kite.profile?.user_name} · Kite ID {kite.profile?.user_id_kite}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => openTicket()} className="inline-flex items-center gap-1.5 rounded-full bg-[#12B76A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#059669] transition-colors">
                <LineChart className="h-4 w-4" /> Place order
              </button>
              <button onClick={loadKite} disabled={loadingKite} className="btn-outline">
                {loadingKite ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
              </button>
              <Link to="/brokers/connect" className="btn-outline">Manage</Link>
            </div>
          </div>
          {kiteMargins?.equity && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl bg-[#F7F4FB] p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#6B6480] font-semibold">Available cash</div>
                <div className="num mt-1 font-bold">₹{Number(kiteMargins.equity?.available?.cash || 0).toLocaleString('en-IN')}</div>
              </div>
              <div className="rounded-xl bg-[#F7F4FB] p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#6B6480] font-semibold">Live margin</div>
                <div className="num mt-1 font-bold">₹{Number(kiteMargins.equity?.available?.live_balance || kiteMargins.equity?.net || 0).toLocaleString('en-IN')}</div>
              </div>
              <div className="rounded-xl bg-[#F7F4FB] p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#6B6480] font-semibold">Used</div>
                <div className="num mt-1 font-bold">₹{Number(kiteMargins.equity?.utilised?.debits || 0).toLocaleString('en-IN')}</div>
              </div>
              <div className="rounded-xl bg-[#F7F4FB] p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#6B6480] font-semibold">Net</div>
                <div className="num mt-1 font-bold">₹{Number(kiteMargins.equity?.net || 0).toLocaleString('en-IN')}</div>
              </div>
            </div>
          )}
          {kiteHoldings && kiteHoldings.length > 0 && (
            <div className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#6B6480] mb-2">Live Kite holdings ({kiteHoldings.length})</div>
              <div className="surface overflow-hidden">
                <div className="grid grid-cols-12 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#6B6480] bg-[#F7F4FB]">
                  <div className="col-span-4">Symbol</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2 text-right">Avg</div>
                  <div className="col-span-2 text-right">LTP</div>
                  <div className="col-span-2 text-right">P&L</div>
                </div>
                <div className="divide-y divide-[#F1E7FE] max-h-80 overflow-auto">
                  {kiteHoldings.map((h, idx) => {
                    const pnl = Number(h.pnl ?? ((Number(h.last_price||0) - Number(h.average_price||0)) * Number(h.quantity||0)));
                    return (
                      <div key={idx} className="grid grid-cols-12 px-4 py-2.5 items-center text-sm">
                        <div className="col-span-4">
                          <div className="font-semibold flex items-center gap-2">{h.tradingsymbol}
                            <span className="hidden md:inline-flex gap-1">
                              <button onClick={() => openTicket(h.tradingsymbol, 'BUY')} className="text-[10px] px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#059669] font-semibold">B</button>
                              <button onClick={() => openTicket(h.tradingsymbol, 'SELL')} className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#DC2626] font-semibold">S</button>
                            </span>
                          </div>
                          <div className="text-[11px] text-[#6B6480]">{h.exchange}</div>
                        </div>
                        <div className="col-span-2 num text-right">{h.quantity}</div>
                        <div className="col-span-2 num text-right">₹{Number(h.average_price||0).toFixed(2)}</div>
                        <div className="col-span-2 num text-right">₹{Number(h.last_price||0).toFixed(2)}</div>
                        <div className={`col-span-2 num text-right font-semibold ${pnl >= 0 ? 'text-[#12B76A]' : 'text-[#F04438]'}`}>
                          {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {kite && kiteHoldings && kiteHoldings.length === 0 && !loadingKite && (
            <div className="mt-4 text-sm text-[#6B6480]">No holdings in your Kite account yet.</div>
          )}

          {/* Orders */}
          {kite && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#6B6480] flex items-center gap-2"><ClipboardList className="h-3.5 w-3.5" /> Orders {kiteOrders.length > 0 && `(${kiteOrders.length})`}</div>
              </div>
              {kiteOrders.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-[#E8E1F0] p-6 text-center text-sm text-[#6B6480]">No orders yet. Click Place order to trade.</div>
              ) : (
                <div className="surface overflow-hidden">
                  <div className="grid grid-cols-12 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#6B6480] bg-[#F7F4FB]">
                    <div className="col-span-1">Side</div>
                    <div className="col-span-3">Symbol</div>
                    <div className="col-span-1 text-right">Qty</div>
                    <div className="col-span-2 text-right">Price</div>
                    <div className="col-span-2">Type</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-1"></div>
                  </div>
                  <div className="divide-y divide-[#F1E7FE] max-h-80 overflow-auto">
                    {kiteOrders.map((o) => {
                      const status = String(o.status || '').toUpperCase();
                      const canCancel = ['OPEN','TRIGGER PENDING','MODIFY_VALIDATION_PENDING','MODIFY_PENDING','VALIDATION PENDING'].some(s => status.includes(s));
                      const isBuy = o.transaction_type === 'BUY';
                      const statusColor = status.includes('COMPLETE') ? 'text-[#12B76A]' : status.includes('REJECT') || status.includes('CANCELLED') ? 'text-[#F04438]' : 'text-[#6B6480]';
                      return (
                        <div key={o.order_id} className="grid grid-cols-12 px-4 py-2.5 items-center text-sm">
                          <div className="col-span-1"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isBuy ? 'bg-[#DCFCE7] text-[#059669]' : 'bg-[#FEE2E2] text-[#DC2626]'}`}>{o.transaction_type}</span></div>
                          <div className="col-span-3">
                            <div className="font-semibold">{o.tradingsymbol}</div>
                            <div className="text-[10px] text-[#6B6480]">{o.exchange} · {o.product}</div>
                          </div>
                          <div className="col-span-1 num text-right">{o.quantity}</div>
                          <div className="col-span-2 num text-right">₹{Number(o.average_price || o.price || 0).toFixed(2)}</div>
                          <div className="col-span-2 text-xs text-[#6B6480]">{o.order_type}</div>
                          <div className={`col-span-2 text-xs font-semibold ${statusColor}`}>{status || '—'}</div>
                          <div className="col-span-1 text-right">
                            {canCancel ? (
                              <button onClick={() => cancelOrder(o)} className="h-6 w-6 grid place-items-center rounded text-[#F04438] hover:bg-[#FEF3F2]" title="Cancel order"><XCircle className="h-4 w-4" /></button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-10 grid lg:grid-cols-2 gap-6">
        <div className="surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-[#6C2BD9]" /> Holdings</h2>
            <Link to="/explore/smallcases" className="text-sm font-semibold text-[#6C2BD9]">Invest more →</Link>
          </div>
          <div className="mt-4 divide-y divide-[#F1E7FE]">
            {enriched.length === 0 && <div className="py-8 text-center text-sm text-[#6B6480]">No holdings yet. <Link to="/explore/smallcases" className="text-[#6C2BD9] font-semibold">Explore baskets</Link></div>}
            {enriched.map(i => (
              <Link key={i.id} to={`/smallcase/${i.basketId}`} className="py-4 flex items-center justify-between text-sm hover:bg-[#FBF8FF] px-2 -mx-2 rounded-lg transition-colors">
                <div>
                  <div className="font-semibold">{i.basketName}</div>
                  <div className="text-xs text-[#6B6480] num">Invested ₹{i.amount.toLocaleString('en-IN')}</div>
                </div>
                <div className="text-right">
                  <div className="num font-semibold">₹{Math.round(i.currentValue).toLocaleString('en-IN')}</div>
                  <div className={`text-xs font-semibold ${i.gain>=0?'text-[#12B76A]':'text-[#F04438]'}`}>{i.gain>=0?'+':''}{i.gainPct.toFixed(2)}%</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="surface p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2"><CalendarClock className="h-4 w-4 text-[#6C2BD9]" /> Active SIPs</h2>
          <div className="mt-4 divide-y divide-[#F1E7FE]">
            {sips.length === 0 && <div className="py-8 text-center text-sm text-[#6B6480]">No active SIPs yet.</div>}
            {sips.map(s => (
              <div key={s.id} className="py-4 flex items-center justify-between text-sm">
                <div>
                  <div className="font-semibold">{s.basketName}</div>
                  <div className="text-xs text-[#6B6480]">{s.frequency} · {s.mode}</div>
                </div>
                <div className="num font-semibold">₹{s.amount.toLocaleString('en-IN')}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {watchlist.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Heart className="h-4 w-4 text-[#E23FA0]" /> Watchlist</h2>
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {watchlist.map(id => {
              const b = baskets.find(x => x.id === id); if (!b) return null;
              return (
                <Link key={id} to={`/smallcase/${id}`} className="surface p-4 hover:border-[#D8C7F1] transition-colors">
                  <div className="font-semibold text-sm">{b.name}</div>
                  <div className="text-xs text-[#6B6480]">{b.risk} risk · {b.strategy.replace('-',' ')}</div>
                  <div className="mt-2 num text-lg font-bold text-[#12B76A]">+{b.returns.y3.toFixed(1)}%</div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
      <OrderTicket open={ticketOpen} onOpenChange={setTicketOpen} initialSymbol={ticketSymbol} initialTxn={ticketTxn} />
    </div>
  );
}

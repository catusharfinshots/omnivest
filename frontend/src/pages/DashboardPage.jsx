import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePortfolio } from '../context/PortfolioContext';
import { useBroker } from '../context/BrokerContext';
import { useAuth } from '../context/AuthContext';
import MySubscriptions from '../components/MySubscriptions';
import { baskets, getBasket } from '../mock';
import { TrendingUp, TrendingDown, CalendarClock, ShoppingBag, Heart, Link2, RefreshCw, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function DashboardPage() {
  const { investments, sips, watchlist } = usePortfolio();
  const { connections, kiteExpired, connectKite, getKiteMargins, refreshKite } = useBroker();
  const { isAuthed, loading: authLoading, user, openAuth, token } = useAuth();
  const navigate = useNavigate();
  const kite = connections.kite;

  const [kiteMargins, setKiteMargins] = useState(null);
  const [loadingKite, setLoadingKite] = useState(false);

  // One role per account: partners live in the analyst console, not the investor dashboard.
  const isAnalyst = !authLoading && user?.role === 'analyst';
  useEffect(() => {
    if (isAnalyst) navigate('/partner', { replace: true });
  }, [isAnalyst, navigate]);

  const loadKite = async () => {
    if (!kite) return;
    setLoadingKite(true);
    try {
      setKiteMargins((await getKiteMargins()) || null);
    } catch (e) {
      toast.error('Could not read your Zerodha balance', { description: e?.response?.data?.detail || e.message });
    } finally {
      setLoadingKite(false);
    }
  };

  useEffect(() => {
    if (kite) loadKite();
    else setKiteMargins(null);
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
    return <div className="container-x py-24 text-center text-[#526071]">Loading your dashboard…</div>;
  }
  if (!isAuthed) {
    return (
      <div className="container-x py-24 text-center">
        <h1 className="text-2xl font-bold">Please log in</h1>
        <p className="mt-2 text-[#526071]">You need an account to view your dashboard.</p>
        <button onClick={() => openAuth({ next: '/dashboard' })} className="btn-primary mt-6 inline-flex">Get started</button>
      </div>
    );
  }

  return (
    <div className="container-x py-10 lg:py-14">
      <div className="eyebrow">Portfolio</div>
      <h1 className="mt-2 text-4xl md:text-5xl font-bold">Hi {user?.name?.split(' ')[0] || 'there'}</h1>
      <p className="mt-3 text-[#526071]">Your simulated portfolio — invest in any model portfolio to see it here.</p>

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
          <div className={`num mt-1 text-2xl font-bold flex items-center gap-1 ${returns>=0?'text-[#0B7F4A]':'text-[#B91C1C]'}`}>
            {returns>=0?<TrendingUp className="h-5 w-5" />:<TrendingDown className="h-5 w-5" />}
            ₹{Math.round(returns).toLocaleString('en-IN')}
          </div>
          <div className={`text-xs mt-0.5 ${returns>=0?'text-[#0B7F4A]':'text-[#B91C1C]'}`}>{returns>=0?'+':''}{returnPct.toFixed(2)}%</div>
        </div>
        <div className="surface p-5">
          <div className="text-xs text-[#6B6480] uppercase tracking-wider font-semibold">Active SIPs</div>
          <div className="num mt-1 text-2xl font-bold">{sips.length}</div>
        </div>
      </div>

      {/* Broker connection banner */}
      {!kite && kiteExpired ? (
        <div className="mt-6 surface p-5 border-[#F1D48A] bg-[#FFFBEB]" data-testid="dash-broker-expired">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#FF9F0A] to-[#F04438] text-white grid place-items-center font-bold">Z</div>
              <div>
                <div className="font-semibold text-[#9A4A05]">Zerodha login expired for today</div>
                <div className="text-xs text-[#6B6480]">{kiteExpired.profile?.user_name} (Kite ID {kiteExpired.profile?.user_id_kite}). Zerodha ends every login at about 6 AM. Connect again to place, cancel or refresh orders.</div>
              </div>
            </div>
            <button type="button" onClick={() => connectKite()} className="btn-primary" data-testid="dash-broker-reconnect"><Link2 className="h-4 w-4" /> Connect Zerodha again</button>
          </div>
        </div>
      ) : !kite ? (
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
        <div className="mt-6 surface p-5" data-testid="dash-broker-card">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#FF9F0A] to-[#F04438] text-white grid place-items-center font-bold">Z</div>
              <div>
                <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-[#0B7F4A]" /> Zerodha connected</div>
                <div className="text-xs text-[#6B6480]">{kite.profile?.user_name} · Kite ID {kite.profile?.user_id_kite}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadKite} disabled={loadingKite} className="btn-outline">
                {loadingKite ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
              </button>
              <Link to="/brokers/connect" className="btn-outline">Manage</Link>
            </div>
          </div>
          {kiteMargins?.equity && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#F7F4FB] p-3">
                <div className="text-[12px] uppercase tracking-wider text-[#6B6480] font-semibold">Available in Zerodha</div>
                <div className="num mt-1 font-bold">₹{Number(kiteMargins.equity?.available?.live_balance ?? kiteMargins.equity?.net ?? 0).toLocaleString('en-IN')}</div>
              </div>
              <div className="rounded-xl bg-[#F7F4FB] p-3">
                <div className="text-[12px] uppercase tracking-wider text-[#6B6480] font-semibold">Orders via Omnivest</div>
                <div className="mt-1 font-bold"><Link to="/orders" className="text-[#5320A8]">See your orders →</Link></div>
              </div>
            </div>
          )}
          <div className="mt-3 text-[12px] text-[#667085]">Only what you place through Omnivest appears here. Your full order book and holdings stay in Kite.</div>
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
                  <div className={`text-xs font-semibold ${i.gain>=0?'text-[#0B7F4A]':'text-[#B91C1C]'}`}>{i.gain>=0?'+':''}{i.gainPct.toFixed(2)}%</div>
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

      <MySubscriptions token={token} />
      <div className="surface p-5 flex items-center justify-between gap-3 mt-6" data-testid="dash-orders-card">
        <div><div className="text-lg font-semibold">Your orders</div><div className="text-sm text-[#526071]">Orders placed through Omnivest in your Zerodha account, with live status.</div></div>
        <Link to="/orders" className="btn-outline shrink-0">See orders</Link>
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
                  <div className="mt-2 num text-lg font-bold text-[#0B7F4A]">+{b.returns.y3.toFixed(1)}%</div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

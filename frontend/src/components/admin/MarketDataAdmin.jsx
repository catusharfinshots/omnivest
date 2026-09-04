import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, PlugZap, RefreshCw, CheckCircle2, AlertTriangle, Link2Off } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function MarketDataAdmin({ token }) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/admin/kite/market/status`, auth);
      setStatus(data);
    } catch { toast.error('Could not load Kite status'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const connect = async () => {
    setConnecting(true);
    try {
      const { data } = await axios.get(`${API}/admin/kite/market/login-url`, auth);
      sessionStorage.setItem('kite_flow', 'market');
      const popup = window.open(data.login_url, 'kite_market_login', 'width=480,height=720');
      const onMsg = async (ev) => {
        if (ev.data?.source !== 'basketly-kite-callback') return;
        window.removeEventListener('message', onMsg);
        setConnecting(false);
        if (ev.data.status === 'success') { toast.success('Kite connected for market data'); loadStatus(); }
        else toast.error(ev.data.detail || 'Kite connection failed');
      };
      window.addEventListener('message', onMsg);
      const timer = setInterval(() => {
        if (popup && popup.closed) { clearInterval(timer); setConnecting(false); window.removeEventListener('message', onMsg); loadStatus(); }
      }, 800);
    } catch (e) {
      setConnecting(false);
      toast.error(e?.response?.data?.detail || 'Could not start Kite login');
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const { data } = await axios.post(`${API}/admin/kite/market/refresh-instruments`, {}, auth);
      toast.success(`Loaded ${data.count.toLocaleString('en-IN')} instruments`);
      loadStatus();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not refresh instruments'); }
    finally { setRefreshing(false); }
  };

  const disconnect = async () => {
    try { await axios.post(`${API}/admin/kite/market/disconnect`, {}, auth); toast.success('Disconnected'); loadStatus(); }
    catch { toast.error('Could not disconnect'); }
  };

  if (loading) return <div className="text-sm text-[#6B6480]">Loading Kite status…</div>;

  const connected = status?.connected && !status?.needs_reconnect;

  return (
    <section className="surface p-6 space-y-5" data-testid="market-admin">
      {!status?.configured && (
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          Kite API key/secret are not configured on the server. Add KITE_API_KEY and KITE_API_SECRET to the backend before connecting.
        </div>
      )}

      <div className="rounded-xl border border-[#E8E1F0] bg-white p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {connected ? <CheckCircle2 className="h-6 w-6 text-[#0B7F4A]" /> : status?.needs_reconnect ? <AlertTriangle className="h-6 w-6 text-[#F79009]" /> : <PlugZap className="h-6 w-6 text-[#6C2BD9]" />}
            <div>
              <div className="text-sm font-semibold" data-testid="market-status-text">
                {connected ? `Connected as ${status.kite_user || 'Kite user'}` : status?.needs_reconnect ? 'Session expired — reconnect needed' : 'Not connected'}
              </div>
              <div className="text-xs text-[#6B6480]">
                {connected && status.login_time ? `Logged in: ${status.login_time}` : 'Connect once each trading day to power analyst instrument search & live prices.'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button data-testid="kite-connect-btn" onClick={connect} disabled={connecting || !status?.configured} className="btn-primary text-sm">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} {connected ? 'Reconnect' : 'Connect Kite'}
            </button>
            {status?.connected && <button onClick={disconnect} className="btn-outline text-sm"><Link2Off className="h-4 w-4" /> Disconnect</button>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#E8E1F0] bg-white p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Instrument list</div>
            <div className="text-xs text-[#6B6480]" data-testid="instruments-count">
              {status?.instruments_count ? `${status.instruments_count.toLocaleString('en-IN')} NSE/BSE instruments cached` : 'No instruments cached yet'}
              {status?.instruments_refreshed_at ? ` · updated ${new Date(status.instruments_refreshed_at).toLocaleString('en-IN')}` : ''}
            </div>
          </div>
          <button data-testid="refresh-instruments-btn" onClick={refresh} disabled={refreshing || !connected} className="btn-outline text-sm">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh instruments
          </button>
        </div>
        <p className="mt-2 text-xs text-[#667085]">Zerodha regenerates the master list once daily. Refresh each morning after connecting so symbol search stays current.</p>
      </div>

      <div className="text-xs text-[#6B6480]">
        <span className="font-semibold text-[#1A1030]">How it works:</span> Zerodha logs everyone out at ~6 AM daily. Connect here each trading morning and one shared session powers every analyst's instrument search, live prices and returns for the day.
      </div>
    </section>
  );
}

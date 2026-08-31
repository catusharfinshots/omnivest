import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const UID_KEY = 'basketly-uid-v1';

function ensureUserId() {
  let uid = localStorage.getItem(UID_KEY);
  if (!uid) {
    uid = 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(UID_KEY, uid);
  }
  return uid;
}

const BrokerContext = createContext(null);

export function BrokerProvider({ children }) {
  const [userId] = useState(() => ensureUserId());
  const [connections, setConnections] = useState({ kite: null });
  const [loading, setLoading] = useState(true);

  const refreshKite = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/broker/kite/status`, { params: { user_id: userId } });
      setConnections((c) => ({ ...c, kite: data.connected ? data : null }));
      return data;
    } catch (e) {
      setConnections((c) => ({ ...c, kite: null }));
      return null;
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    refreshKite().finally(() => setLoading(false));
  }, [refreshKite]);

  // Listen for popup postMessage on connect success
  useEffect(() => {
    const handler = (event) => {
      if (!event.data || event.data.source !== 'basketly-kite-callback') return;
      if (event.data.status === 'success') {
        refreshKite();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [refreshKite]);

  const connectKite = useCallback(async () => {
    const { data } = await axios.get(`${API}/broker/kite/login-url`);
    const w = 480, h = 640;
    const x = window.screenX + (window.outerWidth - w) / 2;
    const y = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(data.login_url, 'kite-connect', `width=${w},height=${h},left=${x},top=${y}`);
    return popup;
  }, []);

  const disconnectKite = useCallback(async () => {
    await axios.post(`${API}/broker/kite/disconnect`, { user_id: userId });
    await refreshKite();
  }, [userId, refreshKite]);

  const getKiteHoldings = useCallback(async () => {
    const { data } = await axios.get(`${API}/broker/kite/holdings`, { params: { user_id: userId } });
    return data.holdings || [];
  }, [userId]);

  const getKiteMargins = useCallback(async () => {
    const { data } = await axios.get(`${API}/broker/kite/margins`, { params: { user_id: userId } });
    return data.margins || {};
  }, [userId]);

  const value = { userId, loading, connections, refreshKite, connectKite, disconnectKite, getKiteHoldings, getKiteMargins };
  return <BrokerContext.Provider value={value}>{children}</BrokerContext.Provider>;
}

export function useBroker() {
  const ctx = useContext(BrokerContext);
  if (!ctx) throw new Error('useBroker must be used within BrokerProvider');
  return ctx;
}

export const getStoredUserId = () => localStorage.getItem(UID_KEY);

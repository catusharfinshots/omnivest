import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = 'basketly-token-v1';
const USER_KEY = 'basketly-user-v1';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  const persist = useCallback((tok, usr) => {
    if (tok) { localStorage.setItem(TOKEN_KEY, tok); setToken(tok); }
    if (usr) { localStorage.setItem(USER_KEY, JSON.stringify(usr)); setUser(usr); }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Validate token on load
  useEffect(() => {
    let active = true;
    async function verify() {
      if (!token) { setLoading(false); return; }
      try {
        const { data } = await axios.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (active && data?.user) { setUser(data.user); localStorage.setItem(USER_KEY, JSON.stringify(data.user)); }
      } catch (e) {
        if (active) { logout(); }
      } finally {
        if (active) setLoading(false);
      }
    }
    verify();
    return () => { active = false; };
  }, []);

  const signup = useCallback(async ({ name, email, password, role, invite_code }) => {
    const { data } = await axios.post(`${API}/auth/signup`, { name, email, password, role, invite_code });
    persist(data.token, data.user);
    return data.user;
  }, [persist]);

  const login = useCallback(async ({ email, password }) => {
    const { data } = await axios.post(`${API}/auth/login`, { email, password });
    persist(data.token, data.user);
    return data.user;
  }, [persist]);

  // ----- Phone + OTP (Twilio Verify) -----
  // flow: 'customer' (Get started) or 'partner' (Already approved? Log in) —
  // the backend enforces a hard wall so a number lives on exactly one side.
  const requestOtp = useCallback(async (phone, flow = 'customer') => {
    const { data } = await axios.post(`${API}/auth/phone/request-otp`, { phone, flow });
    return data;
  }, []);

  const verifyOtp = useCallback(async ({ phone, code, name, invite_code, flow = 'customer' }) => {
    const { data } = await axios.post(`${API}/auth/phone/verify-otp`, { phone, code, name, invite_code, flow });
    persist(data.token, data.user);
    return data.user;
  }, [persist]);

  // Global auth modal state
  const [authOpen, setAuthOpen] = useState(false);
  const [authInvite, setAuthInvite] = useState(null);
  const [authNext, setAuthNext] = useState(null);
  const [authFlow, setAuthFlow] = useState('customer');
  const openAuth = useCallback((opts = {}) => {
    setAuthInvite(opts.invite || null);
    setAuthNext(opts.next || null);
    setAuthFlow(opts.flow || 'customer');
    setAuthOpen(true);
  }, []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const value = {
    user,
    token,
    loading,
    isAuthed: !!user && !!token,
    signup,
    login,
    logout,
    requestOtp,
    verifyOtp,
    authOpen,
    authInvite,
    authNext,
    authFlow,
    openAuth,
    closeAuth,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

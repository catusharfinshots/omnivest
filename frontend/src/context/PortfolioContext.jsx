import React, { createContext, useContext, useEffect, useState } from 'react';

const PortfolioContext = createContext(null);

const LS_KEY = 'basketly-portfolio-v1';
const WL_KEY = 'basketly-watchlist-v1';
const SIP_KEY = 'basketly-sips-v1';

export function PortfolioProvider({ children }) {
  const [investments, setInvestments] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [sips, setSips] = useState([]);

  useEffect(() => {
    try {
      setInvestments(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));
      setWatchlist(JSON.parse(localStorage.getItem(WL_KEY) || '[]'));
      setSips(JSON.parse(localStorage.getItem(SIP_KEY) || '[]'));
    } catch (e) {}
  }, []);

  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(investments)); }, [investments]);
  useEffect(() => { localStorage.setItem(WL_KEY, JSON.stringify(watchlist)); }, [watchlist]);
  useEffect(() => { localStorage.setItem(SIP_KEY, JSON.stringify(sips)); }, [sips]);

  const invest = ({ basketId, basketName, amount }) => {
    const record = {
      id: `inv_${Date.now()}`,
      basketId, basketName, amount,
      createdAt: new Date().toISOString(),
      currentValue: amount, // simulated - will grow with mock CAGR on dashboard
    };
    setInvestments((prev) => [record, ...prev]);
    return record;
  };

  const startSip = ({ basketId, basketName, amount, frequency, mode }) => {
    const record = {
      id: `sip_${Date.now()}`, basketId, basketName, amount, frequency, mode,
      nextDate: new Date(Date.now() + 30*24*3600*1000).toISOString(),
      status: 'active', createdAt: new Date().toISOString(),
    };
    setSips((prev) => [record, ...prev]);
    return record;
  };

  const toggleWatch = (basketId) => {
    setWatchlist((prev) => prev.includes(basketId) ? prev.filter(x => x !== basketId) : [...prev, basketId]);
  };

  const isWatched = (basketId) => watchlist.includes(basketId);

  const value = { investments, sips, watchlist, invest, startSip, toggleWatch, isWatched };
  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider');
  return ctx;
}

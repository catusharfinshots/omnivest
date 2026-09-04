import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '../ui/input';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Symbol search against Kite's instrument master (admin keeps it cached).
export default function InstrumentPicker({ value, onType, onPick, token }) {
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
        <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#6E6787]" />
        <Input
          data-testid="constituent-symbol-input"
          value={q}
          onChange={(e) => { const v = e.target.value.toUpperCase(); setQ(v); onType(v); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="h-9 pl-7" placeholder="Search symbol" />
        {busy && <Loader2 className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-[#6E6787] animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <div data-testid="instrument-results" className="absolute z-40 mt-1 w-[300px] max-h-60 overflow-auto rounded-xl border border-[#E8E1F0] bg-white shadow-lg">
          {results.map((r) => (
            <button
              key={`${r.exchange}:${r.tradingsymbol}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(r); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-[#F7F4FB] border-b border-[#F1E7FE] last:border-0">
              <div className="text-sm font-semibold text-[#1A1030]">{r.tradingsymbol} <span className="text-[12px] font-bold text-[#6C2BD9]">{r.exchange}</span></div>
              <div className="text-xs text-[#6B6480] truncate">{r.name || r.instrument_type}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

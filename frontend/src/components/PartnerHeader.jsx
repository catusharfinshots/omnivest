import React from 'react';
import { Link } from 'react-router-dom';
import { LogIn, SearchCheck } from 'lucide-react';
import omniMark from '../assets/omnivest-mark-white.svg';
import { useAuth } from '../context/AuthContext';

// Dedicated chrome for the partner funnel (/partner): partner links and the
// partner door only — no customer nav, no "Get started".
export default function PartnerHeader({ minimal = false, onTrack }) {
  const { openAuth } = useAuth();
  // Note: behavior:'smooth' is a no-op on this site (the overflow-x:clip guard
  // on html/body breaks Chromium's smooth scrollIntoView) — jump instantly.
  const anchor = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  };
  return (
    <header data-testid="partner-header" className="sticky top-0 z-40 border-b border-[#E6E8F0] bg-white/85 backdrop-blur-md">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" data-testid="partner-header-logo" className="flex items-center gap-2 shrink-0">
            <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg grad-card text-white shadow-sm">
              <img src={omniMark} alt="" className="h-5 w-5" />
            </span>
            <span className="font-[Inter] text-lg font-bold tracking-tight">Omnivest</span>
          </Link>
          <span data-testid="partners-badge" className="rounded-full bg-[#EDE9FE] text-[#5320A8] text-[11px] font-bold px-2.5 py-1 tracking-wide">Partners</span>
          {!minimal && (
            <nav className="hidden md:flex items-center gap-1 ml-2">
              {[['why-partner', 'Why partner'], ['requirements', 'Requirements'], ['partner-faq', 'FAQ']].map(([id, label]) => (
                <a key={id} href={`#${id}`} onClick={anchor(id)} className="px-3 py-2 rounded-lg text-sm font-medium text-[#475569] hover:bg-[#F5F7FB] hover:text-[#1A1030]">{label}</a>
              ))}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!minimal && onTrack && (
            <button type="button" data-testid="partner-header-track" onClick={onTrack} className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-[#475569] hover:bg-[#F5F7FB]">
              <SearchCheck className="h-4 w-4" /> Track application
            </button>
          )}
          <button type="button" data-testid="nav-partner-login" onClick={() => openAuth({ next: '/partner', flow: 'partner' })} className="btn-primary">
            <LogIn className="h-4 w-4" /> Partner login
          </button>
        </div>
      </div>
    </header>
  );
}

import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Link2, CheckCircle2, LayoutDashboard, LogOut, User, ShieldCheck, ClipboardList, BadgeCheck, HelpCircle, MessageCircle, Home, Bell, TrendingUp } from 'lucide-react';
import omniMark from '../assets/omnivest-mark-white.svg';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

const navItems = [
  { label: 'Dashboard', to: '/dashboard', authed: true },
  { label: 'Model Portfolios', to: '/model-portfolios' },
  { label: 'AIF', to: '/aif' },
  { label: 'Advisory', to: '/advisory' },
  { label: 'Learn', to: '/learn' },
  { label: 'About', to: '/about' },
];

function Logo() {
  const { isAuthed, user } = useAuth();
  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  // A logged-in investor's home is their investments (smallcase: the logo stays on the dashboard); guests get the landing page.
  const home = !isAuthed ? '/' : user?.role === 'analyst' ? '/partner' : user?.role === 'admin' ? '/admin' : '/dashboard';
  return (
    <Link to={home} onClick={scrollTop} data-testid="nav-logo-home" className="flex items-center gap-2 shrink-0">
      <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg grad-card text-white shadow-sm">
        <img src={omniMark} alt="" className="h-5 w-5" />
      </span>
      <span className="font-[Inter] text-lg font-bold tracking-tight">Omnivest</span>
    </Link>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthed, user, logout, openAuth } = useAuth();
  // One page, one audience: the partner page's header offers the partner
  // door, not the customer one.
  const onPartnerPage = useLocation().pathname.startsWith('/partner');

  const doLogout = () => { logout(); navigate('/'); };
  const primaryCta = onPartnerPage
    ? { label: 'Partner login', action: () => openAuth({ next: '/partner', flow: 'partner' }), testid: 'nav-partner-login' }
    : { label: 'Log in', action: () => openAuth({ next: '/dashboard' }), testid: 'nav-get-started' };

  return (
    <header className="sticky top-0 z-40 border-b border-[#E6E8F0] bg-white/85 backdrop-blur-md">
      <div className="container-x flex h-16 items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <Logo />
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.filter((item) => !item.authed || (isAuthed && user?.role !== 'analyst' && user?.role !== 'admin')).map((item) => (
              <NavLink key={item.label} to={item.to}
                className={({ isActive }) => `btn-ghost ${isActive ? 'text-[#6C2BD9]' : ''}`}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="hidden lg:flex items-center gap-2">
          {isAuthed && <NotificationBell />}
          {isAuthed ? (
            <Popover>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-2 rounded-full border border-[#E6E8F0] pl-1 pr-3 py-1 hover:border-[#6C2BD9] transition-colors">
                  <span className="h-7 w-7 rounded-full grad-card text-white grid place-items-center text-xs font-bold">
                    {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-xs font-semibold text-[#0F1729] max-w-[90px] truncate">{user?.name?.split(' ')[0] || 'Account'}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2 rounded-xl border-[#E6E8F0]">
                <div className="px-3 py-2">
                  <div className="text-sm font-semibold text-[#0F1729] truncate">{user?.name || <Link to="/account" className="text-[#6C2BD9]">Add your name</Link>}</div>
                  <div className="text-xs text-[#526071] truncate">{user?.email || user?.phone}</div>
                </div>
                <div className="h-px bg-[#E6E8F0] my-1" />
                {user?.role === 'admin' && (
                  <Link to="/admin" data-testid="nav-admin-console" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F7FB]"><ShieldCheck className="h-4 w-4" /> Admin console</Link>
                )}
                {user?.role === 'analyst' && (
                  <Link to="/partner" data-testid="nav-analyst-console" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F7FB]"><LineChart className="h-4 w-4" /> Analyst console</Link>
                )}
                {user?.role !== 'analyst' && (<>
                  <Link to="/dashboard" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F7FB]"><LayoutDashboard className="h-4 w-4" /> Dashboard</Link>
                  <Link to="/investments" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F7FB]"><TrendingUp className="h-4 w-4" /> Investments</Link>
                  <Link to="/orders" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F7FB]" data-testid="nav-orders"><ClipboardList className="h-4 w-4" /> Orders</Link>
                  <Link to="/account#subscriptions" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F7FB]"><BadgeCheck className="h-4 w-4" /> Subscriptions</Link>
                  <Link to="/account" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F7FB]" data-testid="nav-account"><User className="h-4 w-4" /> Profile</Link>
                  <Link to="/notifications" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F7FB]"><Bell className="h-4 w-4" /> Notifications</Link>
                </>)}
                <Link to="/brokers/connect" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F7FB]"><Link2 className="h-4 w-4" /> Connect broker</Link>
                <div className="h-px bg-[#E6E8F0] my-1" />
                <Link to="/faq" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F7FB]"><HelpCircle className="h-4 w-4" /> FAQ</Link>
                <Link to="/contact" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F7FB]"><MessageCircle className="h-4 w-4" /> Contact us</Link>
                <Link to="/" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F7FB] text-[#526071]"><Home className="h-4 w-4" /> Omnivest home</Link>
                <div className="h-px bg-[#E6E8F0] my-1" />
                <button onClick={doLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[#B91C1C] hover:bg-[#FEF2F2]"><LogOut className="h-4 w-4" /> Log out</button>
              </PopoverContent>
            </Popover>
          ) : (
            <button data-testid={primaryCta.testid} onClick={primaryCta.action} className="btn-primary">{primaryCta.label}</button>
          )}
        </div>

        <div className="lg:hidden flex items-center gap-2">
        {isAuthed && <NotificationBell compact />}
        <button className="h-10 w-10 grid place-items-center rounded-lg hover:bg-[#F5F7FB]" onClick={() => setOpen(v => !v)} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-[#E6E8F0] bg-white">
          <div className="container-x py-4 flex flex-col gap-1">
            {navItems.filter((item) => !item.authed || (isAuthed && user?.role !== 'analyst' && user?.role !== 'admin')).map((item) => (
              <Link key={item.label} to={item.to} onClick={() => setOpen(false)} className="py-2 text-sm font-medium">
                {item.label}
              </Link>
            ))}
            {isAuthed ? (
              <div className="pt-3 flex flex-col gap-2">
                {user?.role !== 'analyst' && <Link to="/dashboard" onClick={() => setOpen(false)} className="btn-outline"><LayoutDashboard className="h-4 w-4" /> Dashboard</Link>}
                {user?.role === 'admin' && <Link to="/admin" onClick={() => setOpen(false)} data-testid="nav-admin-console-mobile" className="btn-ghost justify-start"><ShieldCheck className="h-4 w-4" /> Admin console</Link>}
                {user?.role === 'analyst' && <Link to="/partner" onClick={() => setOpen(false)} data-testid="nav-analyst-console-mobile" className="btn-ghost justify-start"><LineChart className="h-4 w-4" /> Analyst console</Link>}
                <Link to="/brokers/connect" onClick={() => setOpen(false)} className="btn-ghost justify-start"><Link2 className="h-4 w-4" /> Connect broker</Link>
                <button onClick={() => { setOpen(false); doLogout(); }} className="btn-ghost justify-start"><LogOut className="h-4 w-4" /> Log out</button>
              </div>
            ) : (
              <div className="pt-3">
                <button onClick={() => { setOpen(false); primaryCta.action(); }} className="btn-primary w-full">{primaryCta.label}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

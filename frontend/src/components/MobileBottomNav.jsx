import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, LayoutDashboard, User, Link2, LogOut, LogIn, Handshake } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

const base = 'flex flex-col items-center justify-center gap-0.5 h-full text-[12px] font-medium transition-colors';
const active = 'text-[#6C2BD9]';
const idle = 'text-[#526071] hover:text-[#1A1030]';

export default function MobileBottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isAuthed, user, logout, openAuth } = useAuth();

  const isHome = pathname === '/';
  const isPort = pathname.startsWith('/model-portfolios');
  // Partners' "home base" is the analyst console, not the investor dashboard.
  const isAnalyst = user?.role === 'analyst';
  const dashTarget = isAnalyst ? '/partner' : '/dashboard';
  const isDash = pathname.startsWith(isAnalyst ? '/partner' : '/dashboard');

  const goDashboard = (e) => {
    if (!isAuthed) { e.preventDefault(); openAuth({ next: '/dashboard' }); }
  };
  const doLogout = () => { logout(); navigate('/'); };

  return (
    <nav
      data-testid="mobile-bottom-nav"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 h-16 border-t border-[#E6E8F0] bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-4 h-16">
        <Link to="/" data-testid="mobtab-home" className={`${base} ${isHome ? active : idle}`}>
          <Home className="h-5 w-5" /> Home
        </Link>

        <Link to="/model-portfolios" data-testid="mobtab-portfolios" className={`${base} ${isPort ? active : idle}`}>
          <LayoutGrid className="h-5 w-5" /> Portfolios
        </Link>

        {isAuthed ? (
          <Link to={dashTarget} onClick={goDashboard} data-testid="mobtab-dashboard" className={`${base} ${isDash ? active : idle}`}>
            <LayoutDashboard className="h-5 w-5" /> {isAnalyst ? 'Console' : 'Dashboard'}
          </Link>
        ) : (
          <Link to="/partner" data-testid="mobtab-partners" className={`${base} ${pathname.startsWith('/partner') ? active : idle}`}>
            <Handshake className="h-5 w-5" /> Partners
          </Link>
        )}

        {!isAuthed ? (
          <button type="button" onClick={() => openAuth(pathname.startsWith('/partner') ? { next: '/partner', flow: 'partner' } : { next: '/dashboard' })} data-testid="mobtab-login" className={`${base} ${idle}`}>
            <LogIn className="h-5 w-5" /> Log in
          </button>
        ) : (
        <Popover>
          <PopoverTrigger asChild>
            <button data-testid="mobtab-account" className={`${base} ${idle}`}>
              {isAuthed ? (
                <span className="h-5 w-5 rounded-full grad-card text-white grid place-items-center text-[12px] font-bold">
                  {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
                </span>
              ) : (
                <User className="h-5 w-5" />
              )}
              Account
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" sideOffset={10} className="w-56 p-2 rounded-xl border-[#E6E8F0] mr-2">
            {isAuthed ? (
              <>
                <div className="px-3 py-2">
                  <div className="text-sm font-semibold text-[#0F1729] truncate">{user?.name}</div>
                  <div className="text-xs text-[#526071] truncate">{user?.email}</div>
                </div>
                <div className="h-px bg-[#E6E8F0] my-1" />
                <Link to="/brokers/connect" data-testid="mobnav-connect-broker" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#F5F7FB]"><Link2 className="h-4 w-4" /> Connect broker</Link>
                <button onClick={doLogout} data-testid="mobnav-logout" className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[#B91C1C] hover:bg-[#FEF2F2]"><LogOut className="h-4 w-4" /> Log out</button>
              </>
            ) : (
              <div className="flex flex-col gap-2 p-1">
                {pathname.startsWith('/partner') ? (
                  <button onClick={() => openAuth({ next: '/partner', flow: 'partner' })} data-testid="mobnav-partner-login" className="btn-primary w-full justify-center"><LogIn className="h-4 w-4" /> Partner login</button>
                ) : (
                  <>
                    <button onClick={() => openAuth({ next: '/dashboard' })} data-testid="mobnav-signin" className="btn-outline w-full justify-center"><LogIn className="h-4 w-4" /> Sign in</button>
                    <button onClick={() => openAuth({ next: '/dashboard' })} className="btn-primary w-full justify-center">Get started</button>
                  </>
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>
        )}
      </div>
    </nav>
  );
}

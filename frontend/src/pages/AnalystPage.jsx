import React from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AnalystConsole from '../components/AnalystConsole';
import omniMark from '../assets/omnivest-mark-white.svg';

export default function AnalystPage() {
  const { user, isAuthed, loading, logout, openAuth } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-[#6B6480]">Loading console…</div>;
  }
  if (!isAuthed) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#F7F4FB] p-6">
        <div className="surface p-8 text-center max-w-sm">
          <span className="h-12 w-12 mx-auto rounded-xl grad-card text-white grid place-items-center"><img src={omniMark} alt="" className="h-7 w-7" /></span>
          <h1 className="mt-4 text-xl font-bold">Analyst console</h1>
          <p className="mt-2 text-sm text-[#6B6480]">Please log in with your research-analyst mobile number to manage your model portfolios.</p>
          <button data-testid="analyst-login-btn" onClick={() => openAuth({ next: '/analyst' })} className="btn-primary mt-5 w-full">Log in</button>
        </div>
      </div>
    );
  }
  if (user.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }
  if (user.role !== 'analyst') {
    return (
      <div className="min-h-screen grid place-items-center bg-[#F7F4FB] p-6">
        <div className="surface p-8 text-center max-w-sm">
          <h1 className="text-xl font-bold">This is the analyst console</h1>
          <p className="mt-2 text-sm text-[#6B6480]">Hi {user.name}. This area is only for research analysts. Head to your dashboard to manage your investments.</p>
          <div className="mt-5 flex gap-2">
            <button onClick={() => navigate('/dashboard')} className="btn-primary flex-1">Go to dashboard</button>
            <button onClick={() => { logout(); navigate('/'); }} className="btn-outline flex-1">Sign out</button>
          </div>
        </div>
      </div>
    );
  }
  return <AnalystConsole />;
}

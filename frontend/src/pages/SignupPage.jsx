import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Phone } from 'lucide-react';

export default function SignupPage() {
  const { openAuth, isAuthed, user } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const invite = params.get('invite') || '';
  const next = invite ? '/analyst' : '/dashboard';

  useEffect(() => {
    if (isAuthed) { nav(user?.role === 'analyst' ? '/analyst' : '/dashboard'); return; }
    openAuth({ invite: invite || undefined, next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[60vh] grid place-items-center bg-[#F7F4FB] p-6">
      <div className="surface p-8 text-center max-w-sm">
        <span className="h-12 w-12 mx-auto rounded-xl grad-card text-white grid place-items-center"><Phone className="h-5 w-5" /></span>
        <h1 className="mt-4 text-xl font-bold">Get started</h1>
        <p className="mt-2 text-sm text-[#6B6480]">{invite ? 'Complete your research-analyst onboarding with your mobile number.' : 'Continue with your mobile number and a one-time code.'}</p>
        <button data-testid="signup-open-auth" onClick={() => openAuth({ invite: invite || undefined, next })} className="btn-primary mt-5 w-full">Continue with mobile</button>
      </div>
    </div>
  );
}

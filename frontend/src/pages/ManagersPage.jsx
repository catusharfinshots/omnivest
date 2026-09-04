import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { BadgeCheck, Users, ArrowRight } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function ManagersPage() {
  const [managers, setManagers] = useState(null);

  useEffect(() => {
    let active = true;
    axios.get(`${API}/managers`).then(({ data }) => { if (active) setManagers(data.managers || []); }).catch(() => { if (active) setManagers([]); });
    return () => { active = false; };
  }, []);

  return (
    <div className="container-x py-10 lg:py-14" data-testid="managers-page">
      <div className="eyebrow">Managers</div>
      <h1 className="mt-2 text-4xl md:text-5xl font-bold">SEBI-registered basket managers</h1>
      <p className="mt-3 text-[#6B6480] max-w-xl">Follow the research houses that design and rebalance baskets on Omnivest.</p>

      {managers === null ? (
        <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => <div key={i} className="surface p-6 h-40 animate-pulse bg-[#F7F4FB]" />)}
        </div>
      ) : managers.length === 0 ? (
        <div className="mt-10 surface p-10 text-center" data-testid="managers-empty">
          <div className="h-12 w-12 mx-auto rounded-xl bg-[#F1E7FE] text-[#6C2BD9] grid place-items-center"><Users className="h-6 w-6" /></div>
          <h2 className="mt-4 text-lg font-semibold text-[#1A1030]">Managers coming soon</h2>
          <p className="mt-1 text-sm text-[#6B6480] max-w-md mx-auto">We're onboarding SEBI-registered research analysts. Want to list your research?</p>
          <Link to="/partner" className="btn-primary mt-5 inline-flex">Become a partner <ArrowRight className="h-4 w-4" /></Link>
        </div>
      ) : (
        <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {managers.map(m => (
            <Link key={m.id} to={`/manager/${m.id}`} data-testid={`manager-card-${m.id}`} className="surface p-6 hover:border-[#D8C7F1] transition-colors">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl grad-card text-white grid place-items-center font-bold">{m.logo}</div>
                <div>
                  <div className="flex items-center gap-1 text-sm font-semibold">{m.name} <BadgeCheck className="h-4 w-4 text-[#0B7F4A]" /></div>
                  <div className="text-xs text-[#6B6480]">{m.sebiReg || 'SEBI-registered'}</div>
                </div>
              </div>
              {m.philosophy && <p className="mt-4 text-sm text-[#6B6480]">{m.philosophy}</p>}
              <div className="mt-4 flex items-center justify-between text-xs">
                {m.firm ? <div className="text-[#6B6480]">{m.firm}</div> : <span />}
                <div className="chip-brand">{m.baskets} {m.baskets === 1 ? 'basket' : 'baskets'}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function ManagerDetail() {
  const { id } = useParams();
  const [m, setM] = useState(undefined); // undefined=loading, null=not found

  useEffect(() => {
    let active = true;
    axios.get(`${API}/managers/${id}`).then(({ data }) => { if (active) setM(data); }).catch(() => { if (active) setM(null); });
    return () => { active = false; };
  }, [id]);

  if (m === undefined) return <div className="container-x py-20"><div className="h-32 rounded-2xl bg-[#F1E7FE] animate-pulse" /></div>;
  if (!m) return <div className="container-x py-20 text-center"><h1 className="text-3xl font-bold">Manager not found</h1><Link to="/managers" className="btn-primary mt-6 inline-flex">All managers</Link></div>;

  const listings = m.portfolios || [];
  return (
    <div data-testid="manager-detail">
      <div className="grad-hero">
        <div className="container-x py-12 flex items-center gap-6">
          <div className="h-20 w-20 rounded-2xl grad-card text-white grid place-items-center text-2xl font-bold">{m.logo}</div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl md:text-4xl font-bold">{m.name}</h1>
              <BadgeCheck className="h-6 w-6 text-[#0B7F4A]" />
            </div>
            <div className="text-sm text-[#6B6480] mt-1">{m.sebiReg ? `SEBI Reg: ${m.sebiReg}` : 'SEBI-registered'}{m.firm ? ` · ${m.firm}` : ''}</div>
            {m.description && <p className="text-[#6B6480] mt-2 max-w-2xl">{m.description}</p>}
          </div>
        </div>
      </div>
      <div className="container-x py-10">
        <h2 className="text-2xl font-bold">Baskets by {m.name}</h2>
        {listings.length === 0 ? (
          <p className="mt-4 text-[#6B6480]">No live baskets yet — check back soon.</p>
        ) : (
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {listings.map(l => (
              <Link key={l.id} to={`/model-portfolios/${l.id}`} className="surface p-5 hover:border-[#D8C7F1] transition-colors">
                <div className="text-base font-semibold text-[#1A1030]">{l.name}</div>
                {l.subtitle && <div className="text-sm text-[#6B6480] mt-1">{l.subtitle}</div>}
                {l.cagr != null && <div className="mt-3 chip-brand">{l.cagr}% CAGR</div>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ManagersPage;

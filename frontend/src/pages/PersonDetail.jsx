import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Linkedin, ArrowLeft } from 'lucide-react';
import Seo from '../components/Seo';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BACKEND = process.env.REACT_APP_BACKEND_URL;

const mediaUrl = (u) => (!u ? '' : u.startsWith('/api/') ? `${BACKEND}${u}` : u);
export const slugify = (name = '') => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const initials = (name = '') => name.split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

export default function PersonDetail({ kind = 'founders' }) {
  const { slug } = useParams();
  const [person, setPerson] = useState(undefined); // undefined=loading, null=not found

  useEffect(() => {
    let active = true;
    axios.get(`${API}/about`).then(({ data }) => {
      if (!active) return;
      const list = data[kind] || [];
      setPerson(list.find((p) => slugify(p.name) === slug) || null);
    }).catch(() => { if (active) setPerson(null); });
    return () => { active = false; };
  }, [slug, kind]);

  if (person === undefined) {
    return (
      <div className="container-x py-20 animate-pulse" data-testid="person-skeleton">
        <div className="h-4 w-24 rounded bg-[#EEE9F6]" />
        <div className="mt-10 grid md:grid-cols-2 gap-12">
          <div className="aspect-square rounded-3xl bg-[#F1E7FE]" />
          <div className="space-y-4">
            <div className="h-10 w-2/3 rounded bg-[#F1E7FE]" />
            <div className="h-4 w-1/3 rounded bg-[#EEE9F6]" />
            <div className="h-40 rounded bg-[#F7F4FB]" />
          </div>
        </div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="container-x py-24 text-center" data-testid="person-not-found">
        <h1 className="text-2xl font-bold text-[#1A1030]">Profile not found</h1>
        <p className="mt-2 text-[#6B6480]">This person may have been removed.</p>
        <Link to="/about" className="btn-primary mt-6 inline-flex"><ArrowLeft className="h-4 w-4" /> Back to About</Link>
      </div>
    );
  }

  const bioParas = (person.fullBio || person.shortBio || '').split(/\n{2,}/).filter(Boolean);

  return (
    <div className="container-x py-12 md:py-16" data-testid="person-detail">
      <Seo title={person.name} description={`${person.name}${person.role ? ', ' + person.role : ''} at Omnivest.`} />
      <Link to="/about" data-testid="person-back" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6C2BD9] hover:text-[#5320A8]">
        <ArrowLeft className="h-4 w-4" /> Back to About
      </Link>

      <div className="mt-8 grid md:grid-cols-[minmax(0,420px)_1fr] gap-10 lg:gap-16 items-start">
        <div className="md:sticky md:top-24">
          {person.photoUrl ? (
            <img src={mediaUrl(person.photoUrl)} alt={person.name}
              className="w-full aspect-square object-cover rounded-3xl border border-[#E8E1F0] shadow-[0_24px_60px_-30px_rgba(108,43,217,0.45)]" />
          ) : (
            <div className="w-full aspect-square rounded-3xl grad-card text-white grid place-items-center text-6xl font-bold shadow-[0_24px_60px_-30px_rgba(108,43,217,0.45)]">
              {initials(person.name)}
            </div>
          )}
        </div>

        <div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-[#1A1030] font-[Inter]">{person.name}</h1>
          <div className="mt-2 text-base md:text-lg font-semibold text-[#6C2BD9]">{person.role}</div>

          <div className="mt-6 space-y-4 text-[15px] md:text-base leading-relaxed text-[#475569]">
            {bioParas.map((p, i) => <p key={i}>{p}</p>)}
          </div>

          {person.linkedinUrl && (
            <a href={person.linkedinUrl} target="_blank" rel="noreferrer" data-testid="person-linkedin"
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#E8E1F0] px-4 py-2.5 text-sm font-semibold text-[#6C2BD9] hover:border-[#D8C7F1] hover:bg-[#F7F4FB] transition-colors">
              <Linkedin className="h-4 w-4" /> Connect on LinkedIn
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

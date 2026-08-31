import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Linkedin, Mail, ArrowRight } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BACKEND = process.env.REACT_APP_BACKEND_URL;

const mediaUrl = (u) => (!u ? '' : u.startsWith('/api/') ? `${BACKEND}${u}` : u);
const slugify = (name = '') => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const initials = (name = '') => name.split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

function Avatar({ src, name, className = '' }) {
  if (src) return <img src={mediaUrl(src)} alt={name} className={`object-cover ${className}`} />;
  return <span className={`grad-card text-white grid place-items-center font-bold ${className}`}>{initials(name)}</span>;
}

function PersonCard({ p, kind, testid }) {
  return (
    <div data-testid={testid} className="rounded-2xl border border-[#E8E1F0] bg-white p-6 flex flex-col transition-shadow hover:shadow-[0_12px_40px_-18px_rgba(108,43,217,0.35)]">
      <Avatar src={p.photoUrl} name={p.name} className="h-20 w-20 rounded-2xl text-xl" />
      <div className="mt-4 text-lg font-semibold text-[#1A1030]">{p.name}</div>
      <div className="text-sm font-medium text-[#6C2BD9]">{p.role}</div>
      {p.shortBio && <p className="mt-2 text-sm text-[#6B6480] line-clamp-4">{p.shortBio}</p>}

      <div className="mt-4 flex items-center gap-3">
        <Link to={`/${kind}/${slugify(p.name)}`} data-testid={`${testid}-readbio`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#6C2BD9] hover:text-[#5320A8]">
          Read Bio <ArrowRight className="h-4 w-4" />
        </Link>
        {p.linkedinUrl && (
          <a href={p.linkedinUrl} target="_blank" rel="noreferrer" aria-label={`${p.name} on LinkedIn`}
            data-testid={`${testid}-linkedin`}
            className="ml-auto h-8 w-8 grid place-items-center rounded-lg border border-[#E8E1F0] text-[#6C2BD9] hover:border-[#D8C7F1] hover:bg-[#F7F4FB]">
            <Linkedin className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}

function StatStrip({ stats, testid }) {
  if (!stats?.length) return null;
  return (
    <div data-testid={testid} className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <div key={i} className="rounded-2xl border border-[#E8E1F0] bg-white px-5 py-6 text-center">
          <div className="text-2xl md:text-3xl font-bold text-[#1A1030] font-[Inter]">{s.value}</div>
          <div className="mt-1 text-xs font-medium uppercase tracking-wide text-[#6B6480]">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse" data-testid="about-skeleton">
      <div className="grad-card h-72" />
      <div className="container-x py-16 space-y-6">
        <div className="h-8 w-56 mx-auto rounded bg-[#EEE9F6]" />
        <div className="h-4 w-2/3 mx-auto rounded bg-[#F1E7FE]" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-[#F1E7FE]" />)}
        </div>
      </div>
    </div>
  );
}

export default function AboutPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    axios.get(`${API}/about`).then(({ data }) => { if (active) setData(data); }).catch(() => { if (active) setData({}); });
    return () => { active = false; };
  }, []);

  if (!data) return <Skeleton />;

  const hero = data.hero || {};
  const story = data.story || {};
  const teamIntro = data.teamIntro || {};
  const founders = data.founders || [];
  const team = data.team || [];
  const teamStats = data.teamStats || [];
  const investors = data.investors || {};
  const contacts = data.contacts || [];
  const vis = data.visibility || {};

  return (
    <div className="bg-white" data-testid="about-page">
      {/* Section 1 — Hero */}
      <section className="relative overflow-hidden text-white" style={{ background: hero.bgColor || '#6C2BD9' }} data-testid="about-hero">
        <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(600px 300px at 85% 20%, rgba(255,255,255,0.5), transparent)' }} />
        <div className="container-x relative py-20 md:py-28 max-w-4xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] font-[Inter]">{hero.headline}</h1>
          <div className="mt-6 space-y-4 max-w-2xl">
            {(hero.body || []).map((para, i) => (
              <p key={i} className="text-base md:text-lg text-white/85 leading-relaxed">{para}</p>
            ))}
          </div>
        </div>
      </section>

      {/* Section 2 — Our Story + stats */}
      {vis.story !== false && (
        <section className="container-x py-16 md:py-24 text-center" data-testid="about-story">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6C2BD9]">About Omnivest</div>
          <h2 className="mt-3 text-3xl md:text-4xl font-bold text-[#1A1030] font-[Inter]">{story.heading || 'Our Story'}</h2>
          {story.intro && <p className="mt-4 max-w-2xl mx-auto text-base text-[#6B6480] leading-relaxed">{story.intro}</p>}
          <div className="mt-10 max-w-4xl mx-auto">
            <StatStrip stats={story.stats} testid="about-story-stats" />
          </div>
        </section>
      )}

      {/* Section 3 — Meet the Team intro */}
      {vis.teamIntro !== false && (teamIntro.heading || (teamIntro.paragraphs || []).length > 0) && (
        <section className="bg-[#F7F4FB] border-y border-[#EEE9F6]" data-testid="about-team-intro">
          <div className="container-x py-16 md:py-20 max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-bold text-[#1A1030] font-[Inter]">{teamIntro.heading}</h2>
            <div className="mt-5 space-y-4">
              {(teamIntro.paragraphs || []).map((p, i) => (
                <p key={i} className="text-base text-[#475569] leading-relaxed">{p}</p>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Section 4 — Founders */}
      {vis.founders !== false && founders.length > 0 && (
        <section className="container-x py-16 md:py-24" data-testid="about-founders">
          <h2 className="text-3xl md:text-4xl font-bold text-[#1A1030] font-[Inter]">Our Founders</h2>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {founders.map((f) => <PersonCard key={f.id} p={f} kind="founders" testid="founder-card" />)}
          </div>
        </section>
      )}

      {/* Section 5 — Team + team stats */}
      {vis.team !== false && (team.length > 0 || teamStats.length > 0) && (
        <section className="bg-[#F7F4FB] border-y border-[#EEE9F6]" data-testid="about-team">
          <div className="container-x py-16 md:py-24">
            <h2 className="text-3xl md:text-4xl font-bold text-[#1A1030] font-[Inter]">Our Team</h2>
            {team.length > 0 && (
              <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {team.map((m) => <PersonCard key={m.id} p={m} kind="team" testid="team-card" />)}
              </div>
            )}
            {teamStats.length > 0 && (
              <div className="mt-12 max-w-2xl mx-auto">
                <StatStrip stats={teamStats} testid="about-team-stats" />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Section 6a — Investors */}
      {vis.investors === true && (
        <section className="container-x py-16 md:py-24 text-center" data-testid="about-investors">
          <h2 className="text-3xl md:text-4xl font-bold text-[#1A1030] font-[Inter]">{investors.heading || 'Our Investors'}</h2>
          {investors.intro && <p className="mt-4 max-w-2xl mx-auto text-base text-[#6B6480]">{investors.intro}</p>}
          {(investors.logos || []).length > 0 && (
            <div className="mt-10 flex flex-wrap items-center justify-center gap-8">
              {investors.logos.map((l, i) => (
                <img key={i} src={mediaUrl(l.url || l)} alt={l.name || 'Investor'} className="h-10 md:h-12 object-contain opacity-80" />
              ))}
            </div>
          )}
          {(investors.people || []).length > 0 && (
            <div className="mt-12 flex flex-wrap items-center justify-center gap-8">
              {investors.people.map((p, i) => (
                <div key={i} className="flex flex-col items-center w-40">
                  <Avatar src={p.photoUrl} name={p.name} className="h-16 w-16 rounded-full text-base" />
                  <div className="mt-3 text-sm font-semibold text-[#1A1030]">{p.name}</div>
                  <div className="text-xs text-[#6B6480]">{p.org}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Section 6b — Get in touch */}
      {vis.contacts !== false && contacts.length > 0 && (
        <section className={`${vis.investors === true ? 'bg-[#F7F4FB] border-t border-[#EEE9F6]' : ''}`} data-testid="about-contacts">
          <div className="container-x py-16 md:py-24">
            <h2 className="text-3xl md:text-4xl font-bold text-[#1A1030] font-[Inter] text-center">Get in touch</h2>
            <div className="mt-10 grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {contacts.map((c) => (
                <div key={c.id} data-testid="contact-card" className="rounded-2xl border border-[#E8E1F0] bg-white p-6">
                  <div className="h-10 w-10 rounded-xl bg-[#F1E7FE] text-[#6C2BD9] grid place-items-center"><Mail className="h-5 w-5" /></div>
                  <div className="mt-4 text-lg font-semibold text-[#1A1030]">{c.title}</div>
                  <p className="mt-1.5 text-sm text-[#6B6480]">{c.text}</p>
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#6C2BD9] hover:text-[#5320A8]">
                      {c.email} <ArrowRight className="h-4 w-4" />
                    </a>
                  )}
                  {!c.email && c.link && (
                    <a href={c.link} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#6C2BD9] hover:text-[#5320A8]">
                      Learn more <ArrowRight className="h-4 w-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-12 text-center">
              <Link to="/model-portfolios" className="btn-primary">Explore portfolios <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

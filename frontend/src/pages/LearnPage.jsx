import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, ArrowRight, BookOpen, Clock, Share2, Check, Lock } from 'lucide-react';
import { toast } from 'sonner';
import CoverArt from '../components/CoverArt';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const GRADS = ['from-[#6C2BD9] to-[#B15CFF]', 'from-[#0EA5E9] to-[#2563EB]', 'from-[#3B1671] to-[#6C2BD9]', 'from-[#10B981] to-[#0A7D48]', 'from-[#F59E0B] to-[#EF4444]', 'from-[#EC4899] to-[#8B5CF6]'];
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');
/** Inline images are stored as /api/learn/asset/… paths; the dev server needs the backend origin in front. */
export const withOrigin = (html) => (html || '').replace(/src="\/api\/learn\/asset\//g, `src="${process.env.REACT_APP_BACKEND_URL || ''}/api/learn/asset/`);
const hash = (s) => Array.from(s || '').reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);

/** Cover: the uploaded image, or a brand gradient keyed to the slug so a post keeps its colour everywhere. */
function Cover({ p, className = '', big = false }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${GRADS[hash(p.slug) % GRADS.length]} ${className}`}>
      {p.cover_url ? <img src={`${process.env.REACT_APP_BACKEND_URL || ''}${p.cover_url}`} alt="" className="absolute inset-0 h-full w-full object-cover" loading={big ? 'eager' : 'lazy'} /> : <BookOpen className={`absolute right-5 bottom-4 text-white/50 ${big ? 'h-14 w-14' : 'h-8 w-8'}`} />}
    </div>
  );
}

/** /learn: the Omnivest blog. One featured post, then the rest as a two-column list (smallcase blog layout). */
export function LearnPage() {
  const [data, setData] = useState(null);
  const [cat, setCat] = useState('');
  useEffect(() => { document.title = 'Learn | Omnivest'; }, []);
  useEffect(() => {
    let alive = true;
    axios.get(`${API}/learn/posts`).then((r) => alive && setData(r.data)).catch(() => alive && setData({ posts: [], categories: [] }));
    return () => { alive = false; };
  }, []);
  const posts = useMemo(() => (data?.posts || []).filter((p) => !cat || p.category === cat), [data, cat]);
  const [lead, ...rest] = posts;

  return (
    <div className="container-x py-8 lg:py-12" data-testid="learn-page">
      <div className="eyebrow">Learn</div>
      <h1 className="mt-2 font-heading text-[30px] sm:text-5xl font-bold text-[#0F1729]">Guides and essays, in plain English</h1>
      <p className="mt-3 text-[#526071] max-w-xl text-[15px]">How model portfolios work, what the numbers mean, and how to invest with a plan. Written by the Omnivest team.</p>

      {data && data.categories.length > 1 && (
        <div className="mt-6 flex gap-1.5 flex-wrap" data-testid="learn-filters">
          {['', ...data.categories].map((c) => <button key={c || 'all'} type="button" onClick={() => setCat(c)} className={`h-10 sm:h-9 px-3.5 rounded-full text-[12.5px] font-semibold border ${cat === c ? 'bg-[#1A1030] text-white border-[#1A1030]' : 'bg-white text-[#526071] border-[#E8E1F0] hover:border-[#D8C7F1]'}`}>{c || 'All'}</button>)}
        </div>
      )}

      {!data && <div className="mt-8 grid lg:grid-cols-[1fr_1fr] gap-6"><div className="surface h-[420px] animate-pulse" /><div className="grid sm:grid-cols-2 gap-5"><div className="surface h-52 animate-pulse" /><div className="surface h-52 animate-pulse" /></div></div>}

      {data && posts.length === 0 && (
        <div className="mt-8 surface p-8 sm:p-12 text-center" data-testid="learn-empty">
          <span className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-[#6C2BD9] to-[#9F67FF] grid place-items-center text-white"><BookOpen className="h-7 w-7" /></span>
          <h2 className="mt-4 font-heading font-bold text-[20px] text-[#0F1729]">{cat ? `Nothing in ${cat} yet` : 'The first guides are being written'}</h2>
          <p className="mt-2 text-[14px] text-[#526071] max-w-md mx-auto">{cat ? 'Try another category.' : 'Until then, the portfolio pages explain each strategy, its holdings and its track record.'}</p>
          {!cat && <Link to="/model-portfolios" className="btn-primary mt-5 inline-flex">Browse model portfolios <ArrowRight className="h-4 w-4" /></Link>}
        </div>
      )}

      {lead && (
        <div className="mt-8 grid lg:grid-cols-2 gap-6 lg:gap-10 items-start">
          <Link to={`/learn/${lead.slug}`} className="group block" data-testid="learn-lead">
            <Cover p={lead} className="h-56 sm:h-[380px] rounded-2xl" big />
            <div className="mt-4 text-[13px] font-semibold text-[#6C2BD9]">{lead.category}</div>
            <h2 className="mt-1.5 font-heading font-bold text-[24px] sm:text-[34px] leading-tight text-[#0F1729] group-hover:text-[#6C2BD9] transition-colors">{lead.title}</h2>
            <p className="mt-2 text-[15px] sm:text-[17px] text-[#526071]">{lead.excerpt}</p>
            <div className="mt-2 text-[12.5px] text-[#667085] flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {lead.read_min} min read · {day(lead.published_at)}</div>
          </Link>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-7" data-testid="learn-list">
            {rest.map((p) => (
              <Link key={p.slug} to={`/learn/${p.slug}`} className="group block border-b border-[#EEE9F5] pb-6 sm:border-0 sm:pb-0">
                <Cover p={p} className="h-40 rounded-xl" />
                <div className="mt-3 text-[12.5px] font-semibold text-[#6C2BD9]">{p.category}</div>
                <h3 className="mt-1 font-heading font-bold text-[17px] leading-snug text-[#0F1729] group-hover:text-[#6C2BD9] transition-colors">{p.title}</h3>
                {p.excerpt && <p className="mt-1 text-[13px] text-[#526071] line-clamp-2">{p.excerpt}</p>}
                <div className="mt-1.5 text-[12px] text-[#667085]">{p.read_min} min read · {day(p.published_at)}</div>
              </Link>
            ))}
            {rest.length === 0 && <div className="sm:col-span-2 text-[13.5px] text-[#667085] self-center">More guides are on the way.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** /learn/:slug: one post. Cover, body, the portfolio it talks about, three more reads. */
export function LearnPost() {
  const { slug } = useParams();
  const [d, setD] = useState(null);
  const [missing, setMissing] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true; setD(null); setMissing(false); window.scrollTo(0, 0);
    axios.get(`${API}/learn/posts/${slug}`).then((r) => { if (alive) { setD(r.data); document.title = `${r.data.post.title} | Omnivest Learn`; } }).catch(() => alive && setMissing(true));
    return () => { alive = false; };
  }, [slug]);
  const share = async () => {
    const url = `${window.location.origin}/learn/${slug}`;
    if (navigator.share) { try { await navigator.share({ title: d.post.title, text: d.post.excerpt, url }); return; } catch { /* dismissed */ } }
    try { await navigator.clipboard.writeText(url); setCopied(true); toast.success('Link copied'); setTimeout(() => setCopied(false), 2000); } catch { toast.error('Could not copy'); }
  };
  if (missing) return <div className="container-x py-20 text-center" data-testid="learn-missing"><h1 className="font-heading text-3xl font-bold">This guide is not here</h1><p className="mt-2 text-[#526071]">It may have been unpublished or the link is wrong.</p><Link to="/learn" className="btn-primary mt-6 inline-flex">All guides</Link></div>;
  if (!d) return <div className="container-x py-12"><div className="h-6 w-24 bg-[#EEE9F5] rounded animate-pulse" /><div className="mt-4 h-10 w-3/4 bg-[#EEE9F5] rounded animate-pulse" /><div className="mt-6 surface h-64 animate-pulse" /></div>;
  const p = d.post;
  return (
    <article data-testid="learn-post">
      <div className="grad-hero">
        <div className="container-x pt-8 pb-8 sm:pt-12 sm:pb-10 max-w-3xl">
          <Link to="/learn" className="inline-flex items-center gap-1 text-sm text-[#6C2BD9] font-semibold min-h-[40px] sm:min-h-0"><ArrowLeft className="h-4 w-4" /> All guides</Link>
          <div className="mt-3 text-[13px] font-semibold text-[#6C2BD9]">{p.category}</div>
          <h1 className="mt-2 font-heading text-[28px] sm:text-[44px] leading-tight font-bold text-[#0F1729]">{p.title}</h1>
          {p.excerpt && <p className="mt-3 text-[16px] sm:text-[19px] text-[#526071]">{p.excerpt}</p>}
          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[13px] text-[#667085] flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {p.read_min} min read · {day(p.published_at)} · Omnivest team</div>
            <button type="button" onClick={share} className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full border border-[#E8E1F0] bg-white text-[13px] font-semibold text-[#0F1729]" data-testid="learn-share">{copied ? <Check className="h-4 w-4 text-[#0B7F4A]" /> : <Share2 className="h-4 w-4" />} {copied ? 'Copied' : 'Share'}</button>
          </div>
        </div>
      </div>
      <div className="container-x max-w-3xl">
        {p.cover_url && <img src={`${process.env.REACT_APP_BACKEND_URL || ''}${p.cover_url}`} alt="" className="w-full rounded-2xl mt-6 max-h-[440px] object-cover" />}
        <div className="rich-text mt-8 text-[16px] sm:text-[17px] text-[#1A1030] leading-8 [&_h2]:text-[22px] [&_h3]:text-[18px] [&_p]:mb-4" dangerouslySetInnerHTML={{ __html: withOrigin(p.body) }} />
        {d.related && (
          <Link to={`/model-portfolios/${d.related.id}`} className="mt-10 surface p-4 sm:p-5 flex items-center gap-4 hover:border-[#D8C7F1] transition-colors" data-testid="learn-related">
            <CoverArt cover={d.related.cover} name={d.related.name} size={56} radius={14} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[#6C2BD9]">The portfolio in this guide</span>
              <span className="block font-heading font-bold text-[17px] text-[#0F1729] truncate">{d.related.name}</span>
              <span className="block text-[12.5px] text-[#526071] truncate">{d.related.subtitle || `by ${d.related.owner_name}`}{d.related.subscription === 'Paid' ? ' · paid' : ' · free'}</span>
            </span>
            <span className="btn-primary h-10 shrink-0 hidden sm:inline-flex">{d.related.subscription === 'Paid' ? <><Lock className="h-4 w-4" /> See plans</> : <>Invest <ArrowRight className="h-4 w-4" /></>}</span>
          </Link>
        )}
        <div className="mt-10 rounded-2xl bg-[#F7F4FB] px-5 py-4 text-[12.5px] text-[#667085]">Educational content, not investment advice. Investments in securities are subject to market risk. Read every document before investing.</div>
        {d.more.length > 0 && (
          <section className="mt-12 mb-14" data-testid="learn-more">
            <h2 className="font-heading font-bold text-[20px] text-[#0F1729]">More guides</h2>
            <div className="mt-4 grid sm:grid-cols-3 gap-5">
              {d.more.map((m) => (
                <Link key={m.slug} to={`/learn/${m.slug}`} className="group block">
                  <Cover p={m} className="h-32 rounded-xl" />
                  <div className="mt-2.5 text-[12px] font-semibold text-[#6C2BD9]">{m.category}</div>
                  <div className="mt-0.5 font-heading font-bold text-[15px] leading-snug text-[#0F1729] group-hover:text-[#6C2BD9]">{m.title}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
        {d.more.length === 0 && <div className="mb-14" />}
      </div>
    </article>
  );
}

export default LearnPage;

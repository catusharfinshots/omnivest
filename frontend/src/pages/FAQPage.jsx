import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Input } from '../components/ui/input';
import { Search, ChevronDown, HelpCircle, Mail } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function FAQPage() {
  const [faqs, setFaqs] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [openId, setOpenId] = useState(null);
  const [contactEmail, setContactEmail] = useState('support@omnivest.in');

  useEffect(() => {
    axios.get(`${API}/faqs`).then(({ data }) => setFaqs(data.faqs || [])).catch(() => {});
    axios.get(`${API}/content`).then(({ data }) => { if (data?.footer?.contactEmail) setContactEmail(data.footer.contactEmail); }).catch(() => {});
  }, []);

  const categories = useMemo(() => {
    const counts = {};
    faqs.forEach((f) => { counts[f.category] = (counts[f.category] || 0) + 1; });
    return [{ name: 'All', count: faqs.length }, ...Object.keys(counts).sort().map((name) => ({ name, count: counts[name] }))];
  }, [faqs]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return faqs.filter((f) => (cat === 'All' || f.category === cat) &&
      (!term || f.question.toLowerCase().includes(term) || f.answer.toLowerCase().includes(term)));
  }, [faqs, q, cat]);

  return (
    <div className="bg-[#F7F4FB] min-h-screen">
      <div className="grad-card text-white">
        <div className="container-x py-14">
          <div className="inline-flex items-center gap-2 text-xs font-semibold bg-white/15 rounded-full px-3 py-1.5"><HelpCircle className="h-3.5 w-3.5" /> Help centre</div>
          <h1 className="mt-4 text-4xl sm:text-5xl font-bold">Frequently asked questions</h1>
          <p className="mt-3 text-white/85 max-w-xl">Everything you need to know about investing in model portfolios on Omnivest.</p>
          <div className="mt-6 max-w-xl relative">
            <Search className="h-4 w-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <Input data-testid="faq-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions…" className="h-12 pl-11 bg-white text-[#1A1030]" />
          </div>
        </div>
      </div>

      <div className="container-x py-12 grid lg:grid-cols-[240px_1fr] gap-8 items-start">
        <aside className="surface p-4 lg:sticky lg:top-24">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8] px-2 mb-2">Categories</div>
          <div className="flex flex-col gap-1">
            {categories.map((ct) => (
              <button key={ct.name} data-testid={`faq-cat-${ct.name}`} onClick={() => setCat(ct.name)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${cat === ct.name ? 'bg-[#6C2BD9] text-white' : 'text-[#334155] hover:bg-[#F1E7FE]'}`}>
                {ct.name}<span className={`text-xs rounded-full px-1.5 ${cat === ct.name ? 'bg-white/20' : 'bg-[#EEE9F6]'}`}>{ct.count}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-xl bg-[#F7F4FB] border border-[#E8E1F0] p-4">
            <div className="text-sm font-semibold text-[#1A1030]">Still need help?</div>
            <p className="mt-1 text-xs text-[#64748B]">Can't find your answer? Reach our team.</p>
            <a href={`mailto:${contactEmail}`} data-testid="faq-contact" className="btn-primary mt-3 w-full text-xs inline-flex justify-center"><Mail className="h-3.5 w-3.5" /> Contact us</a>
          </div>
        </aside>

        <div>
          <div className="text-sm text-[#64748B] mb-3">{filtered.length} question{filtered.length !== 1 ? 's' : ''}{cat !== 'All' ? ` in ${cat}` : ''}</div>
          {filtered.length === 0 ? (
            <div className="surface p-10 text-center text-[#64748B]">No questions match your search.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((f) => (
                <div key={f.id} data-testid="faq-item" className={`surface overflow-hidden transition-all ${openId === f.id ? 'ring-1 ring-[#D8C7F1]' : ''}`}>
                  <button onClick={() => setOpenId(openId === f.id ? null : f.id)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
                    <span className="font-semibold text-[#1A1030]">{f.question}</span>
                    <ChevronDown className={`h-5 w-5 text-[#6C2BD9] shrink-0 transition-transform ${openId === f.id ? 'rotate-180' : ''}`} />
                  </button>
                  {openId === f.id && <div className="px-5 pb-5 -mt-1 text-sm text-[#475569] leading-relaxed">{f.answer}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import CoverArt from '../components/CoverArt';
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import CountUpStat from '../components/CountUpStat';
import './Home.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DEFAULTS = {
  hero: {
    headline: 'Challenging',
    highlight: 'volatility',
    sub: 'Money at work — expert-managed model portfolios, alternative investment funds and SEBI-registered advisory, all in one place.',
    primaryCta: 'Get started',
    secondaryCta: 'Explore portfolios',
  },
  stats: { rating: '4.6/5', investors: '1 lakh+', managed: '₹100 Cr+' },
  trust: [
    { title: 'No new accounts', text: 'Hold your stocks & ETFs in your existing demat account — no separate account needed.' },
    { title: 'Invest without lock-ins', text: 'Exit your investments whenever you like. Model portfolios can be liquidated anytime.' },
    { title: 'Secure by design', text: 'Financial-grade security with encryption in transit and at rest, built for trust.' },
    { title: 'Regulated products only', text: 'Products & services regulated by SEBI & RBI, from licensed providers & platforms.' },
  ],
  testimonials: [
    { name: 'Saurabh', tag: 'Reviewed on Play Store', quote: 'One of the best finance products in recent times. The UI is clean and investing is effortless.' },
    { name: 'Nithin', tag: 'Posted on X', quote: 'The best investment-tech experience I’ve used in India today. Genuinely well built.' },
    { name: 'Asma', tag: 'Reviewed on Play Store', quote: 'Best app for investing with multiple choices of portfolios and clear methodology.' },
    { name: 'Tanmay', tag: 'Posted on X', quote: 'Fallen in love with Omnivest — such a smooth, smooth product from end to end.' },
    { name: 'Ravi', tag: 'Reviewed on Play Store', quote: 'A smart app blending tech and finance — I can track and invest in one place.' },
    { name: 'Jonathan', tag: 'Reviewed on App Store', quote: 'Excellent platform for beginners, especially those who don’t have time to analyse.' },
  ],
};

const TRUST_ICONS = ['✓', '🔓', '🔐', '🏛'];
const AV_COLORS = ['grad', '#7A5AF8', '#2E90FA', '#12B79A', '#F79009', '#EE46BC'];
const CACHE_KEY = 'bk_home_content_v1';
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } };

const bucketOf = (p) => {
  const types = (p.constituents || []).map((x) => (x.type || '').toLowerCase());
  if (types.some((t) => t.includes('mutual') || t === 'mf' || t.includes('fund'))) return 'mf';
  if (types.length && types.every((t) => t.includes('etf'))) return 'etf';
  return 'stock';
};

export default function Home() {
  const cached = readCache();
  const [c, setC] = useState(cached ? { ...DEFAULTS, ...cached } : DEFAULTS);
  const [portfolios, setPortfolios] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [openFaq, setOpenFaq] = useState(0);
  const { openAuth } = useAuth();
  useEffect(() => {
    let active = true;
    axios.get(`${API}/content`).then(({ data }) => {
      if (active && data) { setC({ ...DEFAULTS, ...data }); try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {} }
    }).catch(() => {});
    axios.get(`${API}/portfolios`).then(({ data }) => { if (active) setPortfolios(data.portfolios || []); }).catch(() => {});
    axios.get(`${API}/faqs?top=true`).then(({ data }) => { if (active) setFaqs(data.faqs || []); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Scroll-driven depth: as each stacked card gets covered by the next, gently scale + dim it.
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cards = Array.from(document.querySelectorAll('.bk-home .hiw-card'));
    if (cards.length < 2) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      for (let i = 0; i < cards.length - 1; i++) {
        const cur = cards[i].getBoundingClientRect();
        const next = cards[i + 1].getBoundingClientRect();
        // gap between this card's top and the next card's top; when the next card
        // pins right below (gap ≈ peek) this card is fully covered.
        const peek = cards[i].querySelector('.hiw-strip')?.offsetHeight || 52;
        const gap = next.top - cur.top;
        const range = 360; // px of travel over which the dim ramps in
        const cover = Math.min(1, Math.max(0, 1 - (gap - peek) / range));
        cards[i].style.setProperty('--cover', cover.toFixed(3));
      }
      cards[cards.length - 1].style.setProperty('--cover', '0');
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const byBucket = (b) => portfolios.filter((p) => bucketOf(p) === b).slice(0, 3);
  const PRow = ({ p }) => (
    <Link to={`/model-portfolios/${p.id}`} className="prow">
      {p.cover ? <CoverArt cover={p.cover} name={p.name} size={34} radius={9} /> : <span className="ic grad">{(p.name || '?').slice(0, 1).toUpperCase()}</span>}
      <span><div className="nm">{p.name}</div><div className="sub">{(p.constituents || []).length} {bucketOf(p) === 'etf' ? 'ETFs' : bucketOf(p) === 'mf' ? 'Funds' : 'Stocks'}</div></span>
    </Link>
  );
  const EmptyRow = () => <div className="prow" style={{ opacity: 0.6, cursor: 'default' }}><span className="ic" style={{ background: '#E8E1F0', color: '#6C2BD9' }}>◦</span><span><div className="nm" style={{ fontSize: 13 }}>No portfolios yet</div><div className="sub">Check back soon</div></span></div>;


  const phoneList = [
    { ic: '▤', bg: 'grad', to: 'momentum-movers', nm: 'Momentum Movers', sub: '12 stocks', ret: '+31.2%' },
    { ic: '🌐', bg: '#12B79A', to: 'all-weather', nm: 'All Weather Portfolio', sub: '4 ETFs', ret: '+18.4%' },
    { ic: '◆', bg: '#2E90FA', to: 'banking-leaders', nm: 'Banking Leaders', sub: '8 stocks', ret: '+19.6%' },
    { ic: '☀', bg: '#F79009', to: 'green-energy', nm: 'Green Energy Rising', sub: '9 stocks', ret: '+22.1%' },
    { ic: '◑', bg: '#7A5AF8', to: 'tech-titans', nm: 'Tech Titans', sub: '9 stocks', ret: '+26.7%' },
    { ic: '◈', bg: '#1A1030', to: 'dividend-aristocrats', nm: 'Dividend Aristocrats', sub: '10 stocks', ret: '+14.9%' },
    { ic: '▲', bg: 'grad', to: 'smart-beta-quality', nm: 'Smart Beta Quality', sub: 'Factor tilt', ret: '+21.0%' },
    { ic: '⛰', bg: '#EE46BC', to: 'consumption-story', nm: 'India Consumption', sub: '14 stocks', ret: '+17.3%' },
  ];
  return (
    <div className="bk-home">
      {/* HERO */}
      <section className="hero">
        <div className="container hero-inner">
          <h1>{c.hero.headline} <span className="accent">{c.hero.highlight}</span></h1>
          <p className="lead">{c.hero.sub}</p>
          <div className="hero-cta">
            <button onClick={() => openAuth({ next: '/dashboard' })} className="btn btn-primary">{c.hero.primaryCta} →</button>
            <Link to="/model-portfolios" className="btn btn-outline">▢ {c.hero.secondaryCta}</Link>
          </div>
          <div className="ratings">
            <span>Rated <b><CountUpStat value={c.stats.rating} /></b></span>
            <span><b><CountUpStat value={c.stats.investors} /></b> investors</span>
            <span><b><CountUpStat value={c.stats.managed} /></b> managed</span>
          </div>
          <div className="stage">
            <div className="pedestal l"></div><div className="pedestal r"></div>
            <div className="coin l">₹</div><div className="coin r">₹</div>
            <div className="h-phone"><div className="h-screen">
              <div className="h-top">
                <span className="mp"><span className="lg grad">✦</span> Model portfolios</span>
                <span style={{ fontSize: 9, color: 'var(--muted)' }}>Explore</span>
              </div>
              <div className="h-chips">
                <span className="h-chip">Filters</span>
                <span className="h-chip">Under 5K</span>
                <span className="h-chip">Low volatility</span>
                <span className="h-chip">Free access</span>
              </div>
              <div className="h-list">
                <div className="h-track">
                  {[...phoneList, ...phoneList].map((p, i) => (
                    <div className="h-item" key={i}>
                      <span className={`h-ic ${p.bg === 'grad' ? 'grad' : ''}`} style={p.bg === 'grad' ? undefined : { background: p.bg }}>{p.ic}</span>
                      <span>
                        <div className="h-nm">{p.nm}</div>
                        <div className="h-sub">{p.sub}</div>
                      </span>
                      <span className="h-ret">{p.ret}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div></div>
            <div className="grass"></div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how">
        <div className="hiw-head">
          <div className="e">How it works</div>
          <h2>Multiplying money <span className="accent">made easy</span></h2>
        </div>
        <div className="hiw-stack">

          <div className="hiw-card c0" style={{ '--i': 0 }}>
            <div className="hiw-strip"><span className="n">1</span> Model Portfolio</div>
            <div className="hiw-body">
              <div className="hiw-copy">
                <div className="k">Model Portfolio</div>
                <h3>Curated portfolios that rebalance for you</h3>
                <ul>
                  <li>Ready-made baskets of stocks &amp; ETFs around themes and strategies</li>
                  <li>Professionally managed and rebalanced on a fixed schedule</li>
                  <li>Full methodology, holdings &amp; weights — transparent by design</li>
                </ul>
                <Link to="/model-portfolios" className="hiw-btn">Explore portfolios →</Link>
              </div>
              <div className="hiw-visual"><div className="hiw-phone"><div className="hiw-screen">
                <div className="hiw-stop"><span>Omnivest</span><span>All Weather</span></div>
                <div className="hiw-mini">
                  <div className="t">Model portfolio</div><div className="v">All Weather Portfolio</div>
                  <div className="hiw-row"><span>Nifty BeES</span><b>34%</b></div><div className="hiw-bar"><i style={{ width: '34%', background: 'linear-gradient(90deg,var(--brand),var(--brand-2))' }}></i></div>
                  <div className="hiw-row"><span>Liquid BeES</span><b>28%</b></div><div className="hiw-bar"><i style={{ width: '28%', background: 'linear-gradient(90deg,var(--brand),var(--brand-2))' }}></i></div>
                  <div className="hiw-row"><span>Gold BeES</span><b>22%</b></div><div className="hiw-bar"><i style={{ width: '22%', background: 'linear-gradient(90deg,var(--brand),var(--brand-2))' }}></i></div>
                  <div className="hiw-row"><span>NASDAQ 100 ETF</span><b>16%</b></div><div className="hiw-bar"><i style={{ width: '16%', background: 'linear-gradient(90deg,var(--brand),var(--brand-2))' }}></i></div>
                </div>
                <div className="hiw-mini"><div className="t">3Y CAGR</div><div className="v" style={{ color: 'var(--brand)' }}>+18.4%</div></div>
              </div></div></div>
            </div>
          </div>

          <div className="hiw-card c1" style={{ '--i': 1 }}>
            <div className="hiw-strip"><span className="n">2</span> Alternative Investment Fund</div>
            <div className="hiw-body">
              <div className="hiw-copy">
                <div className="k">Alternative Investment Fund</div>
                <h3>Diversify beyond the listed markets</h3>
                <ul>
                  <li>Professionally managed AIF strategies with clear mandates</li>
                  <li>Access curated alternatives built for scale and diversification</li>
                  <li>Structured, regulated and transparent reporting</li>
                </ul>
                <Link to="/aif" className="hiw-btn">Explore AIF →</Link>
              </div>
              <div className="hiw-visual"><div className="hiw-phone"><div className="hiw-screen">
                <div className="hiw-stop"><span>Omnivest</span><span>AIF</span></div>
                <div className="hiw-mini"><div className="t">AIF strategy</div><div className="v">Long-Short Alpha</div></div>
                <div className="hiw-mini"><div className="t">Target IRR</div><div className="v" style={{ color: 'var(--teal)' }}>14–18%</div></div>
                <div className="hiw-mini"><div className="t">Min. commitment</div><div className="v">₹1 Cr</div></div>
                <div className="hiw-mini"><div className="t">Structure</div><div className="v">Category III</div></div>
              </div></div></div>
            </div>
          </div>

          <div className="hiw-card c2" style={{ '--i': 2 }}>
            <div className="hiw-strip"><span className="n">3</span> Advisory</div>
            <div className="hiw-body">
              <div className="hiw-copy">
                <div className="k">Advisory</div>
                <h3>Buy / Sell / Hold insights in seconds</h3>
                <ul>
                  <li>Clear entry, target &amp; stop-loss on every pick and idea</li>
                  <li>Covers stocks, F&amp;O, commodities &amp; stock baskets</li>
                  <li>SEBI-registered. Analyst-validated. Always.</li>
                </ul>
                <Link to="/advisory" className="hiw-btn">Get advisory →</Link>
              </div>
              <div className="hiw-visual"><div className="hiw-phone"><div className="hiw-screen">
                <div className="hiw-stop"><span>Omnivest</span><span>Advisory</span></div>
                <div className="hiw-mini"><div className="t">Expert verdict · Long term</div>
                  <div className="hiw-verdict" style={{ color: 'var(--green)' }}><span className="hiw-dot" style={{ background: 'var(--green)' }}></span> Maintain a “Buy”</div></div>
                <div className="hiw-mini"><div className="t">Expert verdict · Short term</div>
                  <div className="hiw-verdict" style={{ color: 'var(--amber)' }}><span className="hiw-dot" style={{ background: 'var(--amber)' }}></span> Maintain a “Hold”</div></div>
                <div className="hiw-mini"><div className="t">Entry / Target / SL</div><div className="v" style={{ fontSize: 14 }}>₹310 · ₹360 · ₹295</div></div>
              </div></div></div>
            </div>
          </div>

        </div>
      </section>

      {/* MODEL PORTFOLIO FEATURE */}
      <section className="feat" id="model">
        <div className="container">
          <div className="eyebrow">Model Portfolio</div>
          <h2 style={{ maxWidth: 640 }}>Curated portfolios that rebalance for you</h2>
          <div className="pcards">
            <div className="pcard">
              <h4>Stock Portfolios</h4>
              <div className="d">Curated stock playlists that rebalance for you</div>
              <div className="tags"><span className="tag">Thematic</span><span className="tag">Fundamental</span><span className="tag">Quant</span></div>
              {byBucket('stock').length ? byBucket('stock').map((p) => <PRow key={p.id} p={p} />) : <EmptyRow />}
              <Link to="/model-portfolios" className="seemore">See all →</Link>
            </div>
            <div className="pcard">
              <h4>ETF Portfolios</h4>
              <div className="d">Diversified strategies with low-cost ETFs</div>
              <div className="tags"><span className="tag">Asset Allocation</span><span className="tag">Smart Beta</span><span className="tag">Dividend</span></div>
              {byBucket('etf').length ? byBucket('etf').map((p) => <PRow key={p.id} p={p} />) : <EmptyRow />}
              <Link to="/model-portfolios" className="seemore">See all →</Link>
            </div>
            <div className="pcard">
              <h4>Mutual Fund Portfolios</h4>
              <div className="d">Collections of direct MFs from multiple AMCs</div>
              <div className="tags"><span className="tag">Largecap</span><span className="tag">Midcap</span><span className="tag">Smallcap</span></div>
              {byBucket('mf').length ? byBucket('mf').map((p) => <PRow key={p.id} p={p} />) : <EmptyRow />}
              <Link to="/model-portfolios" className="seemore">See all →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* AIF FEATURE */}
      <section className="feat rev" id="aif">
        <div className="container"><div className="feat-inner">
          <div className="feat-copy">
            <div className="eyebrow">Alternative Investment Fund</div>
            <h2>Investing. Diversifying.<br />All in one place</h2>
            <ul>
              <li>Professionally managed AIF strategies beyond listed equity</li>
              <li>Access to curated alternatives with transparent mandates</li>
              <li>Built for investors seeking diversification and scale</li>
            </ul>
            <Link to="/aif" className="btn btn-primary">Explore AIF →</Link>
          </div>
          <div className="feat-visual"><div className="fphone"><div className="fs">
            <div className="fmini"><div className="t">AIF Strategy</div><div className="v">Long-Short Alpha</div></div>
            <div className="fmini"><div className="t">Target IRR</div><div className="v" style={{ color: 'var(--brand)' }}>14–18%</div></div>
            <div className="fmini"><div className="t">Min. commitment</div><div className="v">₹1 Cr</div></div>
            <div className="fmini"><div className="t">Structure</div><div className="v">Category III</div></div>
          </div></div></div>
        </div></div>
      </section>

      {/* ADVISORY FEATURE */}
      <section className="feat" id="advisory">
        <div className="container"><div className="feat-inner">
          <div className="feat-copy">
            <div className="eyebrow">Advisory</div>
            <h2>Buy / Sell / Hold insights<br />on your portfolio in seconds</h2>
            <ul>
              <li>Clear entry, target &amp; stop-loss on every pick and idea</li>
              <li>Covers stocks, F&amp;O, commodities &amp; stock baskets</li>
              <li>SEBI-registered. Analyst-validated. Always.</li>
            </ul>
            <Link to="/advisory" className="btn btn-primary">Get advisory →</Link>
          </div>
          <div className="feat-visual"><div className="fphone"><div className="fs">
            <div className="fmini"><div className="t">Expert verdict · Long term</div>
              <div className="fverdict" style={{ color: 'var(--green)' }}><span className="fdot" style={{ background: 'var(--green)' }}></span> Experts maintain a “Buy”</div></div>
            <div className="fmini"><div className="t">Expert verdict · Short term</div>
              <div className="fverdict" style={{ color: 'var(--amber)' }}><span className="fdot" style={{ background: 'var(--amber)' }}></span> Experts maintain a “Hold”</div></div>
            <div className="fmini"><div className="t">Entry / Target / SL</div><div className="v" style={{ fontSize: 13 }}>₹310 · ₹360 · ₹295</div></div>
          </div></div></div>
        </div></div>
      </section>

      {/* TRUST */}
      <section className="trust">
        <div className="container">
          <div className="head"><div className="e">Your money deserves the best</div><h2>Trust built at every step</h2></div>
          <div className="shield">🛡</div>
          <div className="trust-grid">
            {c.trust.map((t, i) => (
              <div className="tc" key={i}><h4>{TRUST_ICONS[i] || '✓'} {t.title}</h4><p>{t.text}</p></div>
            ))}
          </div>
        </div>
      </section>

      {/* LOVE / TESTIMONIALS */}
      <section className="love">
        <div className="container">
          <div className="eyebrow">Award-winning customer experience</div>
          <h2>Loved by investors</h2>
          <div className="tscroll">
            {c.testimonials.map((t, i) => {
              const color = AV_COLORS[i % AV_COLORS.length];
              return (
                <div className="tcard" key={i}>
                  <p>“{t.quote}”</p>
                  <div className="who">
                    <span className={`av ${color === 'grad' ? 'grad' : ''}`} style={color === 'grad' ? undefined : { background: color }}>{(t.name || '?').slice(0, 1)}</span>
                    <span><div className="nm">{t.name}</div><div className="rl">{t.tag}</div></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      {faqs.length > 0 && (
        <section className="faq-sec">
          <div className="container">
            <div className="eyebrow">Got any questions?</div>
            <h2>Frequently asked questions</h2>
            <div className="faq-list">
              {faqs.map((f, i) => (
                <div className={`faq-item ${openFaq === i ? 'open' : ''}`} key={f.id} data-testid="home-faq-item">
                  <button className="faq-q" onClick={() => setOpenFaq(openFaq === i ? -1 : i)} aria-expanded={openFaq === i}>
                    <span>{f.question}</span>
                    <span className="faq-chev">⌄</span>
                  </button>
                  <div className="faq-a"><p>{f.answer}</p></div>
                </div>
              ))}
            </div>
            <Link to="/faq" className="faq-viewall" data-testid="view-all-faqs">View all FAQs →</Link>
          </div>
        </section>
      )}
    </div>
  );
}

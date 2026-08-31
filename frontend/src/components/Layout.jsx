import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import MobileBottomNav from './MobileBottomNav';
import Seo from './Seo';

const PAGE_META = {
  '/': { t: null, d: null },
  '/model-portfolios': { t: 'Model Portfolios', d: 'Browse expert-built, SEBI-registered model portfolios and invest from your own broker account.' },
  '/about': { t: 'About Us', d: 'Meet the team building Omnivest — making expert-managed investing simple and accessible for every Indian.' },
  '/aif': { t: 'Alternative Investment Funds', d: 'Explore curated Alternative Investment Funds (AIFs) on Omnivest.' },
  '/advisory': { t: 'Advisory', d: 'Personalised, SEBI-registered investment advisory on Omnivest.' },
  '/faq': { t: 'FAQ', d: 'Answers to common questions about investing with Omnivest.' },
  '/learn': { t: 'Learn', d: 'Guides and insights to help you invest with confidence.' },
  '/managers': { t: 'Basket Managers', d: 'SEBI-registered research analysts and basket managers on Omnivest.' },
  '/mutual-funds': { t: 'Mutual Funds', d: 'Diversified baskets of direct mutual funds, built and rebalanced by SEBI-registered managers.' },
  '/stocks': { t: 'Stocks', d: 'Curated equity baskets on Omnivest.' },
  '/fixed-deposits': { t: 'Fixed Deposits', d: 'Compare and invest in fixed deposits via Omnivest.' },
  '/collections': { t: 'Collections', d: 'Themed investment collections on Omnivest.' },
  '/explore': { t: 'Explore', d: 'Explore model portfolios and investing ideas on Omnivest.' },
  '/calculators': { t: 'Calculators', d: 'SIP and returns calculators to plan your investments.' },
  '/login': { t: 'Sign in', d: 'Sign in to your Omnivest account.' },
  '/signup': { t: 'Get started', d: 'Create your Omnivest account and start investing.' },
  '/partner': { t: 'Become a Partner', d: 'Partner with Omnivest as a SEBI-registered research analyst.' },
  '/dashboard': { t: 'Dashboard', d: 'Your Omnivest portfolio, SIPs and holdings.' },
};

export default function Layout() {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] || {};
  return (
    <div className="min-h-screen flex flex-col pb-16 lg:pb-0">
      <Seo title={meta.t} description={meta.d} />
      <Navbar />
      <main className="flex-1 fade-in">
        <Outlet />
      </main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
}

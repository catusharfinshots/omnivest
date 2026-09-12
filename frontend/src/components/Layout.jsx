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
  '/terms': { t: 'Terms of Service', d: "The rules for using Omnivest: what the platform does, partners' responsibilities, subscriptions, risk and grievance redressal." },
  '/privacy': { t: 'Privacy Policy', d: 'What Omnivest collects, why, who it is shared with, how long it is kept and your rights.' },
  '/refunds': { t: 'Refund Policy', d: 'Omnivest subscription fees are non-refundable once access starts; the narrow exceptions and how to ask.' },
  '/contact': { t: 'Contact', d: 'Reach Omnivest support, our grievance officer, and the three-step complaint process.' },
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
  '/investments': { t: 'Your investments', d: 'What you hold through Omnivest, checked against your Zerodha account.' },
  '/account': { t: 'Your account', d: 'Your profile, subscriptions and settings on Omnivest.' },
  '/notifications': { t: 'Notifications', d: 'Order updates, portfolio health and account events on Omnivest.' },
  '/dashboard': { t: 'Dashboard', d: 'Everything your money touches on Omnivest, on one screen.' },
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

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Zap, Code2, Building2, LineChart, ShieldCheck, Users } from 'lucide-react';

const offerings = [
  { title: 'Gateway', tagline: 'Investment & transaction APIs', desc: 'Let any fintech embed basket investing, order flow, and portfolio management with a few API calls.', icon: Code2, features: ['Broker-agnostic OAuth', 'Basket, order, holdings APIs', 'Webhooks for rebalance events', 'Sandbox with mock brokers'] },
  { title: 'Publisher', tagline: 'For RIAs & research analysts', desc: 'Create, publish, and manage your own baskets. Reach subscribers with subscription-based baskets.', icon: LineChart, features: ['Basket builder with backtests', 'Subscriber CRM', 'Rebalance publishing tools', 'Compliance and audit logs'] },
  { title: 'Brokers', tagline: 'Partner with Omnivest', desc: 'Add basket investing to your broker platform. Reduce churn and grow AUM with a curated marketplace.', icon: Building2, features: ['Deep-linked order flow', 'Co-branded storefront', 'Auto-SIP mandate support', 'Analytics dashboard'] },
  { title: 'Tickertape', tagline: 'Research & analytics', desc: 'A stock and MF screener + portfolio analysis product built for serious retail investors.', icon: Zap, features: ['200+ ready screens', 'Portfolio X-ray', 'Backtesting', 'Alerts & smart baskets'] },
];

export default function BusinessPage() {
  return (
    <div>
      <div className="grad-hero">
        <div className="container-x py-16">
          <div className="eyebrow">For businesses</div>
          <h1 className="mt-3 text-4xl md:text-6xl font-bold max-w-3xl">Build the future of curated investing on our stack</h1>
          <p className="mt-4 text-lg text-[#6B6480] max-w-2xl">APIs, publisher tools, broker partnerships and analytics — everything you need to launch a curated investing product.</p>
          <div className="mt-6 flex gap-3">
            <Link to="#" className="btn-primary">Talk to sales <ArrowRight className="h-4 w-4" /></Link>
            <Link to="#" className="btn-outline">Read the docs</Link>
          </div>
        </div>
      </div>

      <div className="container-x py-16 grid md:grid-cols-2 gap-6">
        {offerings.map(o => (
          <div key={o.title} className="surface p-8 relative overflow-hidden">
            <div className="h-12 w-12 rounded-2xl grad-card text-white grid place-items-center"><o.icon className="h-5 w-5" /></div>
            <div className="mt-5 text-2xl font-bold">{o.title}</div>
            <div className="text-sm font-semibold text-[#6C2BD9]">{o.tagline}</div>
            <p className="mt-3 text-[#6B6480]">{o.desc}</p>
            <ul className="mt-5 space-y-2 text-sm">
              {o.features.map(f => (
                <li key={f} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#6C2BD9]"></span>{f}</li>
              ))}
            </ul>
            <button className="mt-6 btn-outline">Learn more <ArrowRight className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      <div className="container-x pb-16 grid md:grid-cols-3 gap-4">
        {[
          { icon: ShieldCheck, t: 'SEBI-aware compliance', d: 'Audit logs, e-consents, and disclosure gating baked in.' },
          { icon: Users, t: 'Distribution at scale', d: 'Reach 18L+ investors on the Omnivest consumer app.' },
          { icon: LineChart, t: 'Analytics you can act on', d: 'Cohorts, funnels, and portfolio behaviour insights.' },
        ].map((f, i) => (
          <div key={i} className="rounded-2xl bg-[#F7F4FB] border border-[#E8E1F0] p-6">
            <f.icon className="h-5 w-5 text-[#6C2BD9]" />
            <div className="mt-3 font-semibold">{f.t}</div>
            <div className="text-sm text-[#6B6480]">{f.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

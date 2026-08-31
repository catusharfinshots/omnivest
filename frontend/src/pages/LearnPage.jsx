import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { learnPosts } from '../mock';

export function LearnPage() {
  return (
    <div className="container-x py-10 lg:py-14">
      <div className="eyebrow">Learn</div>
      <h1 className="mt-2 text-4xl md:text-5xl font-bold">Investment guides & essays</h1>
      <p className="mt-3 text-[#6B6480] max-w-xl">Frameworks, playbooks and deep-dives. Written in plain English.</p>

      <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {learnPosts.map((p, i) => (
          <Link key={p.slug} to={`/learn/${p.slug}`} className="surface overflow-hidden hover:border-[#D8C7F1] transition-all group">
            <div className={`h-40 bg-gradient-to-br ${['from-[#6C2BD9] to-[#B15CFF]','from-[#E23FA0] to-[#B15CFF]','from-[#3B1671] to-[#6C2BD9]','from-[#6C2BD9] to-[#E23FA0]','from-[#B15CFF] to-[#5320A8]','from-[#5320A8] to-[#E23FA0]'][i%6]}`}></div>
            <div className="p-5">
              <div className="chip-brand">{p.category}</div>
              <h3 className="mt-3 text-[17px] font-semibold group-hover:text-[#6C2BD9]">{p.title}</h3>
              <p className="mt-1 text-sm text-[#6B6480]">{p.excerpt}</p>
              <div className="mt-4 text-xs text-[#6B6480]">{p.readTime}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function LearnPost() {
  const { slug } = useParams();
  const p = learnPosts.find(x => x.slug === slug);
  if (!p) return <div className="container-x py-20 text-center"><h1 className="text-3xl font-bold">Article not found</h1></div>;
  return (
    <div>
      <div className="grad-hero">
        <div className="container-x py-14">
          <Link to="/learn" className="text-sm text-[#6C2BD9] font-semibold">← All guides</Link>
          <div className="mt-4 chip-brand">{p.category}</div>
          <h1 className="mt-4 text-4xl md:text-5xl font-bold max-w-3xl">{p.title}</h1>
          <div className="mt-3 text-sm text-[#6B6480]">{p.readTime}</div>
        </div>
      </div>
      <div className="container-x py-10 max-w-3xl">
        <p className="text-lg text-[#1A1030] leading-relaxed">{p.excerpt}</p>
        <div className="mt-8 space-y-4 text-[16px] text-[#1A1030] leading-8">
          <p>Investing well is less about picking the perfect stock and more about following a well-designed process, consistently, for many years. This guide walks you through a simple mental model that most successful investors use, and shows how you can adapt it to your own goals.</p>
          <p>The core idea is that every rupee you invest should be attached to a specific goal with a specific time horizon. Short goals belong in stable, low-volatility instruments. Long goals can absorb the ups and downs of equities and are usually the ones that compound the most.</p>
          <p>Once you have that mental split, the choice of vehicle — an index fund, a curated basket, or an actively managed mutual fund — becomes much simpler.</p>
        </div>
      </div>
    </div>
  );
}

export default LearnPage;

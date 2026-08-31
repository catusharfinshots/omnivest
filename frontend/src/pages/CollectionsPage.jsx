import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { collections, baskets, mutualFunds } from '../mock';
import * as Icons from 'lucide-react';

function Icon({ name, className }) {
  const C = Icons[name] || Icons.Circle;
  return <C className={className} />;
}

export default function CollectionsPage() {
  const { slug } = useParams();
  const collection = slug ? collections.find(c => c.slug === slug) : null;

  if (collection) {
    const items = collection.type === 'stock' ? baskets.slice(0, 6) : mutualFunds.slice(0, 8);
    return (
      <div className="container-x py-10 lg:py-14">
        <Link to="/collections" className="text-sm text-[#6C2BD9] font-semibold">← All collections</Link>
        <div className="mt-4 flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl grad-card text-white grid place-items-center"><Icon name={collection.icon} className="h-6 w-6" /></div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">{collection.title}</h1>
            <p className="text-[#6B6480]">{collection.description}</p>
          </div>
        </div>

        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {collection.type === 'stock' ? (
            items.map((b) => (
              <Link key={b.id} to={`/smallcase/${b.id}`} className="surface p-5 hover:border-[#D8C7F1] transition-colors">
                <div className="text-sm font-semibold text-[#1A1030]">{b.name}</div>
                <div className="text-xs text-[#6B6480] mt-1">{b.subtitle}</div>
                <div className="mt-4 num text-lg font-bold text-[#12B76A]">+{b.returns.y3.toFixed(1)}% <span className="text-xs text-[#6B6480] font-medium">3Y CAGR</span></div>
              </Link>
            ))
          ) : (
            items.map((f) => (
              <div key={f.id} className="surface p-5">
                <div className="text-sm font-semibold">{f.name}</div>
                <div className="text-xs text-[#6B6480]">{f.amc}</div>
                <div className="mt-3 num text-lg font-bold text-[#12B76A]">+{f.returns.y3.toFixed(1)}%</div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container-x py-10 lg:py-14">
      <div className="eyebrow">Collections</div>
      <h1 className="mt-2 text-4xl md:text-5xl font-bold">Curated groups to explore</h1>
      <p className="mt-3 text-[#6B6480] max-w-xl">Tap one to filter baskets and funds around a theme.</p>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {collections.map(c => (
          <Link key={c.id} to={`/collections/${c.slug}`} className="surface p-5 hover:border-[#D8C7F1] hover:-translate-y-0.5 transition-all">
            <div className="h-10 w-10 rounded-xl bg-[#F1E7FE] text-[#6C2BD9] grid place-items-center"><Icon name={c.icon} className="h-5 w-5" /></div>
            <div className="mt-4 text-sm font-semibold">{c.title}</div>
            <div className="text-xs text-[#6B6480] mt-1">{c.description}</div>
            <div className="mt-3 chip-brand text-[10px]">{c.type === 'stock' ? 'Stocks' : 'Mutual funds'}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

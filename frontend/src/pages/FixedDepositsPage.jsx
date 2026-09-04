import React, { useState } from 'react';
import { fixedDeposits } from '../mock';
import { Landmark, ShieldCheck, Info } from 'lucide-react';
import { toast } from 'sonner';

export default function FixedDepositsPage() {
  const [selected, setSelected] = useState(null);

  const book = (fd) => {
    toast.success('FD booking initiated (simulated)', { description: `${fd.provider} · ${fd.rate}% · ${fd.tenure}` });
    setSelected(null);
  };

  return (
    <div className="container-x py-10 lg:py-14">
      <div>
        <div className="eyebrow">Fixed deposits</div>
        <h1 className="mt-2 text-4xl md:text-5xl font-bold">Book RBI-insured FDs digitally</h1>
        <p className="mt-3 text-[#6B6480] max-w-xl">Stable, predictable returns from banks and NBFCs. Book in minutes with paperless KYC.</p>
      </div>

      <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {fixedDeposits.map(fd => (
          <div key={fd.id} className="surface p-5 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-[#F1E7FE] text-[#6C2BD9] grid place-items-center"><Landmark className="h-5 w-5" /></div>
              {fd.insured && <span className="inline-flex items-center gap-1 chip-brand"><ShieldCheck className="h-3 w-3" /> DICGC insured</span>}
            </div>
            <div className="mt-4 text-sm font-semibold text-[#6B6480]">{fd.provider}</div>
            <div className="mt-1 num text-3xl font-bold text-[#0B7F4A]">{fd.rate}%</div>
            <div className="text-xs text-[#6B6480]">Interest p.a. · {fd.tenure}</div>
            <div className="mt-3 text-xs text-[#6B6480]">Min. ₹{fd.minAmount.toLocaleString('en-IN')}</div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => book(fd)} className="btn-primary flex-1">Book FD</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-2xl bg-[#F7F4FB] border border-[#E8E1F0] p-6 flex items-start gap-3 text-sm text-[#6B6480]">
        <Info className="h-4 w-4 mt-0.5 text-[#6C2BD9]" />
        Rates shown are indicative and updated by providers. Demo — no real booking is placed.
      </div>
    </div>
  );
}

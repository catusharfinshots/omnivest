import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { baskets, getBasket, getManager } from '../mock';
import PerformanceChart from '../components/PerformanceChart';
import BasketCard from '../components/BasketCard';
import { usePortfolio } from '../context/PortfolioContext';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { ChevronRight, ShieldCheck, Repeat, Clock, Info, Heart, TrendingUp, BadgeCheck } from 'lucide-react';

export default function BasketDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const basket = getBasket(id);
  const { invest, startSip, toggleWatch, isWatched } = usePortfolio();
  const [investOpen, setInvestOpen] = useState(false);
  const [sipOpen, setSipOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [sipFreq, setSipFreq] = useState('monthly');
  const [sipMode, setSipMode] = useState('manual');

  if (!basket) {
    return (
      <div className="container-x py-20 text-center">
        <h1 className="text-3xl font-bold">Basket not found</h1>
        <Link to="/explore/smallcases" className="btn-primary mt-6">Back to Explore</Link>
      </div>
    );
  }
  const mgr = getManager(basket.managerId);
  const similar = baskets.filter(b => b.strategy === basket.strategy && b.id !== basket.id).slice(0, 3);
  const watched = isWatched(basket.id);

  const openInvest = () => { setAmount(basket.minAmount); setInvestOpen(true); };
  const openSip = () => { setAmount(Math.max(500, Math.round(basket.minAmount / 10))); setSipOpen(true); };

  const placeInvestment = () => {
    if (amount < basket.minAmount) { toast.error(`Minimum investment is ₹${basket.minAmount.toLocaleString('en-IN')}`); return; }
    invest({ basketId: basket.id, basketName: basket.name, amount });
    setInvestOpen(false);
    toast.success('Invested — order placed (simulated)', { description: `₹${amount.toLocaleString('en-IN')} in ${basket.name}` });
    setTimeout(() => nav('/dashboard'), 600);
  };
  const placeSip = () => {
    if (amount < 500) { toast.error('SIP minimum is ₹500'); return; }
    startSip({ basketId: basket.id, basketName: basket.name, amount, frequency: sipFreq, mode: sipMode });
    setSipOpen(false);
    toast.success('SIP started (simulated)', { description: `₹${amount.toLocaleString('en-IN')} ${sipFreq} · ${sipMode}` });
    setTimeout(() => nav('/dashboard'), 600);
  };

  return (
    <div>
      <div className="grad-hero">
        <div className="container-x pt-10 pb-8">
          <nav className="text-xs text-[#6B6480] flex items-center gap-1">
            <Link to="/" className="hover:text-[#1A1030]">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <Link to="/explore/smallcases" className="hover:text-[#1A1030]">Baskets</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-[#1A1030] font-medium truncate">{basket.name}</span>
          </nav>
          <div className="mt-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="chip">{basket.risk} risk</span>
                <span className="chip">{basket.strategy.replace('-', ' ')}</span>
                {basket.themes.map(t => <span key={t} className="chip-brand">{t}</span>)}
              </div>
              <h1 className="mt-3 text-4xl md:text-5xl font-bold max-w-2xl">{basket.name}</h1>
              <p className="mt-3 text-lg text-[#6B6480] max-w-2xl">{basket.subtitle}</p>
              <div className="mt-4 flex items-center gap-3 text-sm">
                <div className="h-8 w-8 rounded-lg grad-card text-white grid place-items-center text-xs font-bold">{mgr?.logo}</div>
                <div>
                  <Link to={`/manager/${mgr?.id}`} className="font-semibold hover:text-[#6C2BD9]">{mgr?.name}</Link>
                  <div className="text-xs text-[#6B6480]">SEBI Reg: {mgr?.sebiReg}</div>
                </div>
                <BadgeCheck className="h-4 w-4 text-[#0B7F4A]" />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => toggleWatch(basket.id)} className={`btn-outline ${watched ? 'text-[#E23FA0] border-[#E23FA0]' : ''}`}>
                <Heart className={`h-4 w-4 ${watched ? 'fill-[#E23FA0]' : ''}`} /> {watched ? 'Watching' : 'Watchlist'}
              </button>
              <button onClick={openSip} className="btn-outline">Start SIP</button>
              <button onClick={openInvest} className="btn-primary px-6">Invest now</button>
            </div>
          </div>
        </div>
      </div>

      <div className="container-x py-10 grid lg:grid-cols-[1fr_320px] gap-8">
        <div className="space-y-6">
          <PerformanceChart basket={basket} />

          <Tabs defaultValue="holdings" className="surface p-2">
            <TabsList className="bg-transparent border-b border-[#E8E1F0] w-full justify-start rounded-none p-0 h-auto">
              <TabsTrigger value="holdings" className="data-[state=active]:bg-transparent data-[state=active]:text-[#6C2BD9] data-[state=active]:border-b-2 data-[state=active]:border-[#6C2BD9] rounded-none px-4 py-3 text-sm font-semibold">Holdings</TabsTrigger>
              <TabsTrigger value="methodology" className="data-[state=active]:bg-transparent data-[state=active]:text-[#6C2BD9] data-[state=active]:border-b-2 data-[state=active]:border-[#6C2BD9] rounded-none px-4 py-3 text-sm font-semibold">Methodology</TabsTrigger>
              <TabsTrigger value="rebalance" className="data-[state=active]:bg-transparent data-[state=active]:text-[#6C2BD9] data-[state=active]:border-b-2 data-[state=active]:border-[#6C2BD9] rounded-none px-4 py-3 text-sm font-semibold">Rebalance history</TabsTrigger>
              <TabsTrigger value="fees" className="data-[state=active]:bg-transparent data-[state=active]:text-[#6C2BD9] data-[state=active]:border-b-2 data-[state=active]:border-[#6C2BD9] rounded-none px-4 py-3 text-sm font-semibold">Fees</TabsTrigger>
            </TabsList>
            <TabsContent value="holdings" className="p-4">
              <div className="grid grid-cols-12 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#6B6480]">
                <div className="col-span-6">Constituent</div>
                <div className="col-span-3">Type</div>
                <div className="col-span-3 text-right">Weight</div>
              </div>
              <div className="divide-y divide-[#F1E7FE]">
                {basket.constituents.map(c => (
                  <div key={c.symbol} className="grid grid-cols-12 px-3 py-3 items-center text-sm">
                    <div className="col-span-6 flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-[#F1E7FE] text-[#5320A8] grid place-items-center text-[12px] font-bold">{c.symbol.slice(0,2)}</div>
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-[#6B6480]">{c.symbol}</div>
                      </div>
                    </div>
                    <div className="col-span-3 text-[#6B6480]">{c.type}</div>
                    <div className="col-span-3 flex items-center justify-end gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-[#F1E7FE] overflow-hidden">
                        <div className="h-full grad-card" style={{ width: `${c.weight * 3}%` }} />
                      </div>
                      <span className="num font-semibold w-12 text-right">{c.weight}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="methodology" className="p-6 text-[15px] text-[#1A1030] leading-relaxed">
              {basket.methodology}
              <div className="mt-4 flex items-center gap-2 text-sm text-[#6B6480]"><Info className="h-4 w-4" /> Disclosures: past performance is not indicative of future returns.</div>
            </TabsContent>
            <TabsContent value="rebalance" className="p-6">
              <div className="space-y-4">
                {[
                  { date: basket.lastRebalancedAt, note: 'Quarterly rebalance — weights updated as per methodology.' },
                  { date: '2025-03-15', note: 'Minor rebalance to reduce single stock concentration.' },
                  { date: '2024-12-20', note: 'End of year rebalance; two names replaced.' },
                ].map((r, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="h-8 w-8 rounded-full bg-[#F1E7FE] text-[#6C2BD9] grid place-items-center shrink-0"><Repeat className="h-4 w-4" /></div>
                    <div>
                      <div className="text-sm font-semibold">{new Date(r.date).toDateString()}</div>
                      <div className="text-sm text-[#6B6480]">{r.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="fees" className="p-6 text-sm">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-[#E8E1F0] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#6B6480]">Transaction fee</div>
                  <div className="num mt-1 text-xl font-bold">₹100 + GST</div>
                  <div className="text-xs text-[#6B6480]">per lumpsum order. SIP orders: ₹10 + GST.</div>
                </div>
                <div className="rounded-xl border border-[#E8E1F0] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#6B6480]">Subscription</div>
                  <div className="num mt-1 text-xl font-bold">{basket.fee.type === 'free' ? 'Free' : `₹${basket.fee.amount}/${basket.fee.cycle}`}</div>
                  <div className="text-xs text-[#6B6480]">Manager fee. Broker & statutory charges pass-through.</div>
                </div>
              </div>
              <div className="mt-4 text-xs text-[#6B6480] flex items-start gap-2"><Info className="h-3.5 w-3.5 mt-0.5" /> Rebalance updates use only normal trade charges. No separate rebalance fee.</div>
            </TabsContent>
          </Tabs>

          {similar.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Similar baskets</h2>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {similar.map(b => <BasketCard key={b.id} basket={b} />)}
              </div>
            </div>
          )}
        </div>

        {/* Side stats */}
        <aside className="space-y-4 lg:sticky lg:top-24 h-fit">
          <div className="surface p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[12px] uppercase tracking-wider text-[#6B6480] font-semibold">3Y CAGR</div>
                <div className={`num mt-1 text-xl font-bold ${basket.returns.y3 >= 0 ? 'text-[#0B7F4A]' : 'text-[#B91C1C]'}`}>
                  {basket.returns.y3 >= 0 ? '+' : ''}{basket.returns.y3.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-wider text-[#6B6480] font-semibold">Min. amount</div>
                <div className="num mt-1 text-xl font-bold">₹{basket.minAmount.toLocaleString('en-IN')}</div>
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-wider text-[#6B6480] font-semibold">Risk</div>
                <div className="mt-1 text-sm font-semibold">{basket.risk}</div>
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-wider text-[#6B6480] font-semibold">Horizon</div>
                <div className="mt-1 text-sm font-semibold">{basket.horizon}</div>
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-wider text-[#6B6480] font-semibold">Rebalance</div>
                <div className="mt-1 text-sm font-semibold">{basket.rebalanceFreq}</div>
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-wider text-[#6B6480] font-semibold">Fee</div>
                <div className="mt-1 text-sm font-semibold">{basket.fee.type === 'free' ? 'Free' : `₹${basket.fee.amount}/${basket.fee.cycle}`}</div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <button onClick={openInvest} className="btn-primary w-full py-3">Invest now</button>
              <button onClick={openSip} className="btn-outline w-full py-3">Start SIP</button>
            </div>
            <p className="mt-3 text-[12px] text-[#6B6480] text-center">Demo — no real order is placed.</p>
          </div>

          <div className="surface p-5 space-y-3">
            <div className="flex items-start gap-3 text-sm"><ShieldCheck className="h-4 w-4 mt-0.5 text-[#0B7F4A]" /> <div><span className="font-semibold">Own it</span><div className="text-[#6B6480]">Shares sit in your demat.</div></div></div>
            <div className="flex items-start gap-3 text-sm"><Clock className="h-4 w-4 mt-0.5 text-[#6C2BD9]" /> <div><span className="font-semibold">Last rebalanced</span><div className="text-[#6B6480]">{new Date(basket.lastRebalancedAt).toDateString()}</div></div></div>
          </div>
        </aside>
      </div>

      {/* Invest Modal */}
      <Dialog open={investOpen} onOpenChange={setInvestOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-[Inter]">Invest in {basket.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-[#6B6480]">Amount</Label>
              <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="mt-1.5 h-11" />
              <div className="mt-1.5 text-xs text-[#6B6480]">Minimum ₹{basket.minAmount.toLocaleString('en-IN')}</div>
            </div>
            <div className="rounded-xl bg-[#F7F4FB] p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-[#6B6480]">Order value</span><span className="num font-semibold">₹{amount.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between"><span className="text-[#6B6480]">Transaction fee</span><span className="num">₹100</span></div>
              <div className="flex justify-between"><span className="text-[#6B6480]">GST (18%)</span><span className="num">₹18</span></div>
              <div className="flex justify-between pt-1.5 border-t border-[#E8E1F0]"><span className="font-semibold">Total</span><span className="num font-bold">₹{(amount+118).toLocaleString('en-IN')}</span></div>
            </div>
            <div className="rounded-xl bg-[#FFF5D6] text-[#6b4a00] px-3 py-2 text-xs">Demo — simulated, not real financial advice or trades.</div>
          </div>
          <DialogFooter>
            <button onClick={() => setInvestOpen(false)} className="btn-outline">Cancel</button>
            <button onClick={placeInvestment} className="btn-primary">Place order</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SIP Modal */}
      <Dialog open={sipOpen} onOpenChange={setSipOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-[Inter]">Start SIP in {basket.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-[#6B6480]">SIP amount</Label>
              <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="mt-1.5 h-11" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-[#6B6480]">Frequency</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {['weekly','monthly','quarterly'].map(f => (
                  <button key={f} onClick={()=>setSipFreq(f)} className={`py-2 rounded-lg border text-sm font-semibold ${sipFreq===f ? 'border-[#6C2BD9] bg-[#F1E7FE] text-[#5320A8]' : 'border-[#E8E1F0] text-[#1A1030]'}`}>{f}</button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-[#6B6480]">Mode</Label>
              <RadioGroup value={sipMode} onValueChange={setSipMode} className="mt-1.5">
                <div className="flex items-center gap-3 text-sm py-1"><RadioGroupItem value="manual" id="m1" /><Label htmlFor="m1">Manual — remind me and I approve each time</Label></div>
                <div className="flex items-center gap-3 text-sm py-1"><RadioGroupItem value="auto" id="m2" /><Label htmlFor="m2">Auto — execute automatically on due date</Label></div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setSipOpen(false)} className="btn-outline">Cancel</button>
            <button onClick={placeSip} className="btn-primary">Start SIP</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

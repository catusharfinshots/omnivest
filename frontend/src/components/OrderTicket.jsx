import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useBroker } from '../context/BrokerContext';
import { toast } from 'sonner';
import { Search, ArrowRightLeft, AlertTriangle, Loader2, CheckCircle2, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const EXCHANGES = ['NSE', 'BSE', 'NFO', 'MCX'];
const ORDER_TYPES = ['MARKET', 'LIMIT', 'SL', 'SL-M'];
const PRODUCTS = [
  { key: 'CNC', label: 'CNC', help: 'Delivery' },
  { key: 'MIS', label: 'MIS', help: 'Intraday' },
  { key: 'NRML', label: 'NRML', help: 'F&O' },
];
const VARIETIES = [
  { key: 'regular', label: 'Regular' },
  { key: 'amo', label: 'AMO' },
];

const POPULAR = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ITC', 'ICICIBANK', 'SBIN', 'BAJFINANCE'];

export default function OrderTicket({ open, onOpenChange, initialSymbol, initialTxn = 'BUY' }) {
  const { userId, connections } = useBroker();
  const kite = connections.kite;

  const [symbol, setSymbol] = useState(initialSymbol || '');
  const [exchange, setExchange] = useState('NSE');
  const [txn, setTxn] = useState(initialTxn);
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState('MARKET');
  const [product, setProduct] = useState('CNC');
  const [variety, setVariety] = useState('regular');
  const [validity, setValidity] = useState('DAY');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [ltp, setLtp] = useState(null);
  const [ltpLoading, setLtpLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(null); // { order_id, at }

  useEffect(() => {
    if (open) {
      setSymbol(initialSymbol || '');
      setTxn(initialTxn);
      setQuantity(1);
      setOrderType('MARKET');
      setProduct('CNC');
      setVariety('regular');
      setValidity('DAY');
      setPrice('');
      setTriggerPrice('');
      setLtp(null);
      setPlaced(null);
    }
  }, [open, initialSymbol, initialTxn]);

  const fetchLtp = useCallback(async (sym = symbol, ex = exchange) => {
    if (!sym || !kite) return;
    setLtpLoading(true);
    try {
      const key = `${ex}:${sym.toUpperCase()}`;
      const { data } = await axios.get(`${API}/broker/kite/ltp`, { params: { user_id: userId, symbols: key } });
      const entry = data?.ltp?.[key];
      if (entry?.last_price != null) setLtp({ symbol: key, last_price: entry.last_price });
      else { setLtp(null); toast.error('No LTP for that symbol'); }
    } catch (e) {
      setLtp(null);
      toast.error('LTP lookup failed', { description: e?.response?.data?.detail || e.message });
    } finally {
      setLtpLoading(false);
    }
  }, [symbol, exchange, kite, userId]);

  const estimatedCost = useMemo(() => {
    const px = orderType === 'MARKET' ? (ltp?.last_price || 0) : Number(price || 0);
    return Number(quantity || 0) * px;
  }, [ltp, price, orderType, quantity]);

  const canPlace = useMemo(() => {
    if (!symbol || !quantity || Number(quantity) <= 0) return false;
    if (orderType === 'LIMIT' && !price) return false;
    if (orderType === 'SL' && (!price || !triggerPrice)) return false;
    if (orderType === 'SL-M' && !triggerPrice) return false;
    return true;
  }, [symbol, quantity, orderType, price, triggerPrice]);

  const submit = async () => {
    setPlacing(true);
    try {
      const body = {
        user_id: userId,
        exchange,
        tradingsymbol: symbol.trim().toUpperCase(),
        transaction_type: txn,
        quantity: Number(quantity),
        order_type: orderType,
        product,
        variety,
        validity,
      };
      if (orderType === 'LIMIT' || orderType === 'SL') body.price = Number(price);
      if (orderType === 'SL' || orderType === 'SL-M') body.trigger_price = Number(triggerPrice);
      const { data } = await axios.post(`${API}/broker/kite/order`, body);
      setPlaced({ order_id: data.order_id, at: new Date().toISOString() });
      toast.success('Order placed', { description: `Order ID: ${data.order_id}` });
    } catch (e) {
      toast.error('Order failed', { description: e?.response?.data?.detail || e.message });
    } finally {
      setPlacing(false);
    }
  };

  if (!kite) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Connect a broker to trade</DialogTitle></DialogHeader>
          <div className="text-sm text-[#6B6480]">You need to connect your Zerodha account before placing an order.</div>
          <DialogFooter>
            <a href="/brokers/connect" className="btn-primary">Go to broker connect</a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-2xl p-0 overflow-hidden">
        <div className={`${txn === 'BUY' ? 'bg-gradient-to-r from-[#12B76A] to-[#059669]' : 'bg-gradient-to-r from-[#F04438] to-[#DC2626]'} text-white p-5`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold opacity-90">{txn === 'BUY' ? 'BUY' : 'SELL'} \u00b7 {product} \u00b7 {exchange}</div>
              <div className="font-[Inter] text-2xl font-bold mt-1">{symbol ? symbol.toUpperCase() : 'Place order'}</div>
              <div className="text-xs mt-1 opacity-90">Zerodha \u00b7 Kite \u00b7 {kite.profile?.user_id_kite}</div>
            </div>
            <button onClick={() => setTxn(t => t === 'BUY' ? 'SELL' : 'BUY')} className="h-9 w-9 rounded-full bg-white/15 backdrop-blur grid place-items-center hover:bg-white/25" title="Toggle Buy/Sell">
              <ArrowRightLeft className="h-4 w-4" />
            </button>
          </div>
        </div>

        {placed ? (
          <div className="p-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-[#12B76A] mx-auto" />
            <div className="mt-3 text-xl font-bold">Order placed</div>
            <div className="text-sm text-[#6B6480]">Order ID <span className="num font-semibold">{placed.order_id}</span></div>
            <div className="mt-4 text-xs text-[#6B6480]">Track live status in the Orders section of the dashboard.</div>
            <div className="mt-6 flex justify-center gap-2">
              <button className="btn-outline" onClick={() => setPlaced(null)}>Place another</button>
              <button className="btn-primary" onClick={() => onOpenChange(false)}>Done</button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Symbol row */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-[#6B6480]">Symbol</Label>
              <div className="mt-1.5 flex gap-2">
                <select value={exchange} onChange={e => setExchange(e.target.value)} className="h-10 px-3 rounded-md border border-[#E8E1F0] bg-white text-sm">
                  {EXCHANGES.map(x => <option key={x}>{x}</option>)}
                </select>
                <Input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. RELIANCE" className="h-10 flex-1 uppercase" />
                <button onClick={() => fetchLtp()} className="h-10 px-3 rounded-md border border-[#E8E1F0] hover:border-[#6C2BD9] hover:text-[#6C2BD9] text-sm font-semibold flex items-center gap-1 disabled:opacity-50" disabled={!symbol || ltpLoading}>
                  {ltpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} LTP
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {POPULAR.map(s => (
                  <button key={s} onClick={() => { setSymbol(s); }} className="px-2 py-0.5 rounded-full border border-[#E8E1F0] text-[11px] hover:border-[#6C2BD9] hover:text-[#6C2BD9]">{s}</button>
                ))}
              </div>
              {ltp && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="chip-brand">LTP</span>
                  <span className="num font-semibold">\u20B9{ltp.last_price.toFixed(2)}</span>
                  <button onClick={() => fetchLtp()} className="text-[#6C2BD9] hover:text-[#5320A8]" title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </div>

            {/* Buy/Sell + Product */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-[#6B6480]">Side</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button onClick={() => setTxn('BUY')} className={`h-10 rounded-md text-sm font-semibold flex items-center justify-center gap-1 ${txn==='BUY' ? 'bg-[#DCFCE7] text-[#059669] border border-[#12B76A]' : 'bg-white border border-[#E8E1F0] text-[#6B6480] hover:text-[#12B76A]'}`}><TrendingUp className="h-4 w-4" /> BUY</button>
                  <button onClick={() => setTxn('SELL')} className={`h-10 rounded-md text-sm font-semibold flex items-center justify-center gap-1 ${txn==='SELL' ? 'bg-[#FEE2E2] text-[#DC2626] border border-[#F04438]' : 'bg-white border border-[#E8E1F0] text-[#6B6480] hover:text-[#F04438]'}`}><TrendingDown className="h-4 w-4" /> SELL</button>
                </div>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-[#6B6480]">Product</Label>
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  {PRODUCTS.map(p => (
                    <button key={p.key} onClick={() => setProduct(p.key)} className={`h-10 rounded-md text-xs font-semibold border ${product===p.key ? 'border-[#6C2BD9] bg-[#F1E7FE] text-[#5320A8]' : 'border-[#E8E1F0]'}`} title={p.help}>{p.label}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Qty + Order type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-[#6B6480]">Quantity</Label>
                <Input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="h-10 mt-1.5 num" min={1} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-[#6B6480]">Order type</Label>
                <div className="mt-1.5 grid grid-cols-4 gap-1">
                  {ORDER_TYPES.map(o => (
                    <button key={o} onClick={() => setOrderType(o)} className={`h-10 rounded-md text-[11px] font-semibold border ${orderType===o ? 'border-[#6C2BD9] bg-[#F1E7FE] text-[#5320A8]' : 'border-[#E8E1F0]'}`}>{o}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Price / trigger */}
            {(orderType === 'LIMIT' || orderType === 'SL') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-[#6B6480]">Limit price (\u20B9)</Label>
                  <Input type="number" step="0.05" value={price} onChange={e => setPrice(e.target.value)} className="h-10 mt-1.5 num" />
                </div>
                {orderType === 'SL' && (
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-[#6B6480]">Trigger price (\u20B9)</Label>
                    <Input type="number" step="0.05" value={triggerPrice} onChange={e => setTriggerPrice(e.target.value)} className="h-10 mt-1.5 num" />
                  </div>
                )}
              </div>
            )}
            {orderType === 'SL-M' && (
              <div>
                <Label className="text-xs uppercase tracking-wider text-[#6B6480]">Trigger price (\u20B9)</Label>
                <Input type="number" step="0.05" value={triggerPrice} onChange={e => setTriggerPrice(e.target.value)} className="h-10 mt-1.5 num" />
              </div>
            )}

            {/* Variety + Validity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-[#6B6480]">Variety</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  {VARIETIES.map(v => (
                    <button key={v.key} onClick={() => setVariety(v.key)} className={`h-10 rounded-md text-xs font-semibold border ${variety===v.key ? 'border-[#6C2BD9] bg-[#F1E7FE] text-[#5320A8]' : 'border-[#E8E1F0]'}`}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-[#6B6480]">Validity</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  {['DAY','IOC'].map(v => (
                    <button key={v} onClick={() => setValidity(v)} className={`h-10 rounded-md text-xs font-semibold border ${validity===v ? 'border-[#6C2BD9] bg-[#F1E7FE] text-[#5320A8]' : 'border-[#E8E1F0]'}`}>{v}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-xl bg-[#F7F4FB] p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-[#6B6480]">Est. order value</span><span className="num font-semibold">\u20B9{estimatedCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between text-xs text-[#6B6480]"><span>Broker charges apply per Zerodha rate card.</span></div>
            </div>

            <div className="rounded-lg bg-[#FFFAEB] text-[#78350F] px-3 py-2 text-xs flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
              This will place a real order on your live Zerodha account. Please double-check before submitting.
            </div>
          </div>
        )}

        {!placed && (
          <DialogFooter className="px-5 pb-5">
            <button onClick={() => onOpenChange(false)} className="btn-outline">Cancel</button>
            <button disabled={!canPlace || placing} onClick={submit}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 ${txn === 'BUY' ? 'bg-[#12B76A] hover:bg-[#059669]' : 'bg-[#F04438] hover:bg-[#DC2626]'}`}>
              {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {txn === 'BUY' ? 'Place BUY order' : 'Place SELL order'}
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { CheckCircle2, XCircle, AlertTriangle, Clock, Archive, BadgeCheck, Wrench, LogOut, Bell } from 'lucide-react';

/** Icon + tint per notification type (shared by the bell dropdown and the full page). */
export const STYLE = {
  placed: [Clock, 'bg-[#EFF6FF] text-[#1D4ED8]'],
  failed: [XCircle, 'bg-[#FBE4E4] text-[#B91C1C]'],
  filled: [CheckCircle2, 'bg-[#E3F4EB] text-[#096B3E]'],
  rejected: [XCircle, 'bg-[#FBE4E4] text-[#B91C1C]'],
  cancelled: [XCircle, 'bg-[#FBE4E4] text-[#B91C1C]'],
  partial: [AlertTriangle, 'bg-[#FEF3C7] text-[#9A4A05]'],
  archived: [Archive, 'bg-[#F1EDF7] text-[#5320A8]'],
  incomplete: [AlertTriangle, 'bg-[#FEF3C7] text-[#9A4A05]'],
  fix: [Wrench, 'bg-[#EFF6FF] text-[#1D4ED8]'],
  exit: [LogOut, 'bg-[#EFF6FF] text-[#1D4ED8]'],
  expired: [AlertTriangle, 'bg-[#FEF3C7] text-[#9A4A05]'],
  subscribed: [BadgeCheck, 'bg-[#E3F4EB] text-[#096B3E]'],
};
export const styleOf = (type) => STYLE[type] || [Bell, 'bg-[#F1EDF7] text-[#5320A8]'];

const IST = 'Asia/Kolkata';
export const CTA = { '/investments': 'Open investments', '/orders': 'See orders', '/brokers/connect': 'Connect Zerodha', '/account': 'Open account' };
export const ctaFor = (link) => { if (!link) return null; const base = link.split('?')[0]; return CTA[base] || 'Open'; };

export function whenLabel(iso, now = new Date()) {
  const d = new Date(iso);
  const day = (x) => x.toLocaleDateString('en-IN', { timeZone: IST });
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const t = d.toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: IST });
  if (day(d) === day(now)) return `Today, ${t}`;
  if (day(d) === day(y)) return `Yesterday, ${t}`;
  return `${d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST })}, ${t}`;
}
export function dayGroup(iso, now = new Date()) {
  const d = new Date(iso);
  const day = (x) => x.toLocaleDateString('en-IN', { timeZone: IST });
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (day(d) === day(now)) return 'Today';
  if (day(d) === day(y)) return 'Yesterday';
  return d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST });
}

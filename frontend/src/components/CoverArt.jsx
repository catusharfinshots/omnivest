import React from 'react';
import {
  Droplets, Leaf, Sun, Wind, Car, Cpu, BrainCircuit, CircuitBoard, Landmark, ShieldCheck, Smartphone, HeartPulse, Stethoscope,
  ShoppingBag, Store, Building2, HardHat, TrainFront, Shield, Plane, Hotel, Gem, Pickaxe, Fuel, Zap, FlaskConical, Wheat, RadioTower,
  Gamepad2, Truck, GraduationCap, Shirt, Globe, Coins, TrendingUp, Scale, Award, Crown, Sprout, Layers, BarChart3, Flag, PieChart,
} from 'lucide-react';

const ICONS = { Droplets, Leaf, Sun, Wind, Car, Cpu, BrainCircuit, CircuitBoard, Landmark, ShieldCheck, Smartphone, HeartPulse, Stethoscope, ShoppingBag, Store, Building2, HardHat, TrainFront, Shield, Plane, Hotel, Gem, Pickaxe, Fuel, Zap, FlaskConical, Wheat, RadioTower, Gamepad2, Truck, GraduationCap, Shirt, Globe, Coins, TrendingUp, Scale, Award, Crown, Sprout, Layers, BarChart3, Flag, PieChart };

// Omnivest palettes: [gradient start, gradient end, accent for the pattern]
export const PALETTES = {
  violet:  ['#6C2BD9', '#A855F7', '#F5D0FE'],
  indigo:  ['#3730A3', '#6366F1', '#C7D2FE'],
  sky:     ['#0369A1', '#38BDF8', '#BAE6FD'],
  teal:    ['#0F766E', '#2DD4BF', '#99F6E4'],
  emerald: ['#047857', '#34D399', '#A7F3D0'],
  amber:   ['#B45309', '#FBBF24', '#FDE68A'],
  rose:    ['#BE123C', '#FB7185', '#FECDD3'],
  slate:   ['#1E293B', '#64748B', '#CBD5E1'],
};

const API = `${process.env.REACT_APP_BACKEND_URL || ''}`;

// Listing cover: an uploaded image, or a generated illustration (gradient + pattern + theme icon).
// `cover` = {kind, theme, palette, icon, url?} as served by the backend. Never blank.
export default function CoverArt({ cover, name = '', size = 56, radius = 16, className = '', iconName, palette: paletteOverride }) {
  const pal = PALETTES[paletteOverride || cover?.palette] || PALETTES.violet;
  const Icon = ICONS[iconName || cover?.icon] || PieChart;
  const id = React.useMemo(() => `cv${Math.random().toString(36).slice(2, 8)}`, []);
  if (cover?.kind === 'upload' && cover?.url) {
    return <img src={cover.url.startsWith('http') ? cover.url : `${API}${cover.url}`} alt={name} width={size} height={size} className={`shrink-0 object-cover ${className}`} style={{ width: size, height: size, borderRadius: radius }} loading="lazy" />;
  }
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" className={`shrink-0 ${className}`} style={{ borderRadius: radius }} role="img" aria-label={name} data-theme={cover?.theme}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={pal[0]} /><stop offset="100%" stopColor={pal[1]} /></linearGradient>
        <radialGradient id={`${id}r`} cx="30%" cy="25%" r="70%"><stop offset="0%" stopColor="#fff" stopOpacity="0.28" /><stop offset="100%" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <clipPath id={`${id}c`}><rect width="100" height="100" rx={radius * 100 / s} /></clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect width="100" height="100" fill={`url(#${id}g)`} />
        <circle cx="82" cy="18" r="34" fill={pal[2]} fillOpacity="0.18" />
        <circle cx="12" cy="90" r="26" fill="#fff" fillOpacity="0.10" />
        <circle cx="50" cy="50" r="30" fill="#fff" fillOpacity="0.10" />
        <rect width="100" height="100" fill={`url(#${id}r)`} />
        <foreignObject x="26" y="26" width="48" height="48">
          <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.22))' }}>
            <Icon width={40} height={40} strokeWidth={1.75} />
          </div>
        </foreignObject>
      </g>
    </svg>
  );
}

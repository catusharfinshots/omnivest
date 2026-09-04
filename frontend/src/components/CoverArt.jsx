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
// Plain CSS layers only — no SVG foreignObject, which iOS Safari mis-positions.
// `cover` = {kind, theme, palette, icon, url?} as served by the backend. Never blank.
export default function CoverArt({ cover, name = '', size = 56, radius = 16, className = '', iconName, palette: paletteOverride }) {
  const pal = PALETTES[paletteOverride || cover?.palette] || PALETTES.violet;
  const Icon = ICONS[iconName || cover?.icon] || PieChart;
  const box = { width: size, height: size, borderRadius: radius };
  if (cover?.kind === 'upload' && cover?.url) {
    return <img src={cover.url.startsWith('http') ? cover.url : `${API}${cover.url}`} alt={name} width={size} height={size} className={`shrink-0 object-cover ${className}`} style={box} loading="lazy" />;
  }
  const iconPx = Math.round(size * 0.42);
  return (
    <div className={`relative shrink-0 overflow-hidden ${className}`} style={{ ...box, background: `linear-gradient(135deg, ${pal[0]}, ${pal[1]})` }} role="img" aria-label={name} data-theme={cover?.theme}>
      <span aria-hidden="true" style={{ position: 'absolute', left: '48%', top: '-50%', width: '68%', height: '68%', borderRadius: '50%', background: pal[2], opacity: 0.18 }} />
      <span aria-hidden="true" style={{ position: 'absolute', left: '-14%', top: '64%', width: '52%', height: '52%', borderRadius: '50%', background: '#fff', opacity: 0.1 }} />
      <span aria-hidden="true" style={{ position: 'absolute', left: '20%', top: '20%', width: '60%', height: '60%', borderRadius: '50%', background: '#fff', opacity: 0.1 }} />
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.28), rgba(255,255,255,0) 70%)' }} />
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.22))' }}>
        <Icon width={iconPx} height={iconPx} strokeWidth={1.75} />
      </span>
    </div>
  );
}

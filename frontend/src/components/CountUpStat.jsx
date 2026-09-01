import React, { useEffect, useRef, useState } from 'react';

// Animates the numeric part of an admin-editable stat string ("4.6/5",
// "1000+", "₹100 Cr+") counting up from 0 when it scrolls into view.
// Non-numeric strings render as-is; prefers-reduced-motion skips the count.
const NUM_RE = /(\d[\d,]*\.?\d*)/;

export default function CountUpStat({ value, duration = 1600 }) {
  const str = String(value ?? '');
  const match = str.match(NUM_RE);
  const ref = useRef(null);
  const [display, setDisplay] = useState(match ? '0' : str);
  const started = useRef(false);

  useEffect(() => {
    if (!match) { setDisplay(str); return; }
    const target = parseFloat(match[1].replace(/,/g, ''));
    const decimals = (match[1].split('.')[1] || '').length;
    const hasCommas = match[1].includes(',');
    const fmt = (n) => hasCommas
      ? n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : n.toFixed(decimals);
    const finish = () => setDisplay(fmt(target));

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { finish(); return; }

    const obs = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || started.current) return;
      started.current = true;
      obs.disconnect();
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        setDisplay(fmt(target * eased));
        if (p < 1) requestAnimationFrame(tick); else finish();
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [str, duration]);

  if (!match) return <span ref={ref}>{str}</span>;
  const [prefix, , suffix] = [str.slice(0, match.index), match[1], str.slice(match.index + match[1].length)];
  return <span ref={ref}>{prefix}{display}{suffix}</span>;
}

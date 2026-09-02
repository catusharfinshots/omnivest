// Native behavior:'smooth' is a no-op on this site (overflow-x:clip guard on
// html/body breaks Chromium's smooth scrolling), so we animate it ourselves.
export function smoothScrollTo(target, { offset = -80, duration = 650 } = {}) {
  const el = typeof target === 'string' ? document.getElementById(target) || document.querySelector(target) : target;
  if (!el) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.scrollIntoView({ block: 'start' });
    return;
  }
  const startY = window.scrollY;
  const targetY = el.getBoundingClientRect().top + startY + offset;
  const t0 = performance.now();
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2); // easeInOutCubic
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    window.scrollTo(0, startY + (targetY - startY) * ease(p));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

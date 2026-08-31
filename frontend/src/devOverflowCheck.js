// Dev-only horizontal-overflow detector. Auto-runs in development, no-op in production.
// In the browser console call `__ck()` after each route / after opening any modal.
export function findOverflow() {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) bad.push({ el, right: Math.round(r.right), left: Math.round(r.left), vw });
  });
  if (bad.length) console.warn('OVERFLOW (' + bad.length + '):', bad);
  else console.log('\u2713 no overflow');
  return bad;
}

if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  window.__ck = findOverflow;
}

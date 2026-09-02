// Lightweight, privacy-respecting event tracker for partner analytics.
// Batches events and ships them with fetch(keepalive) so page unloads don't lose them.
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SID_KEY = 'omni-sid-v1';
const TOKEN_KEY = 'basketly-token-v1';

let queue = [];
let timer = null;

function sid() {
  try {
    let s = localStorage.getItem(SID_KEY);
    if (!s) {
      s = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(SID_KEY, s);
    }
    return s;
  } catch { return null; }
}

export function flush() {
  if (!queue.length) return;
  const body = JSON.stringify({ events: queue.splice(0, 50) });
  let headers = { 'Content-Type': 'application/json' };
  try {
    const tok = localStorage.getItem(TOKEN_KEY);
    if (tok) headers = { ...headers, Authorization: `Bearer ${tok}` };
  } catch { /* ignore */ }
  fetch(`${API}/events`, { method: 'POST', headers, body, keepalive: true }).catch(() => {});
  if (queue.length) flush();
}

export function track(type, data = {}) {
  if (typeof window === 'undefined') return;
  if (navigator.doNotTrack === '1') return;
  queue.push({ type, ...data, path: window.location.pathname, sid: sid() });
  if (queue.length >= 20) { flush(); return; }
  if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 1500);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

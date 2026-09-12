/** Referral attribution kept in the browser for 30 days after a friend opens /r/<code>. */
const KEY = 'omnivest-ref-v1';
const SID_KEY = 'omnivest-sid-v1';
const DAYS = 30;

export function rememberReferral(code) {
  try { localStorage.setItem(KEY, JSON.stringify({ code: String(code || '').toUpperCase(), at: Date.now() })); } catch { /* ignore */ }
}
export function storedReferral() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v || !v.code || Date.now() - v.at > DAYS * 86400000) return null;
    return v.code;
  } catch { return null; }
}
export function clearReferral() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
export function deviceId() {
  try {
    let s = localStorage.getItem(SID_KEY);
    if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(SID_KEY, s); }
    return s;
  } catch { return 'anon'; }
}
export const openInvite = () => window.dispatchEvent(new Event('omnivest-invite'));

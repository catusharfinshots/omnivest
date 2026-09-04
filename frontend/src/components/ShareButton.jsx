import React from 'react';
import { Share2 } from 'lucide-react';
import { toast } from 'sonner';

// Shares a link that routes through the backend /api/og endpoint so social
// crawlers get the correct per-page preview (Feature 1). Humans are redirected
// to the real page automatically.
export default function ShareButton({ path, title, text, label = 'Share', className, onShare: onShareHook, shortCode }) {
  // Listings share a short link (omnivest.in/s/<code>, rewritten to the backend OG page);
  // other pages use the path-style /api/og/<route> (rewrites/CDNs can drop query strings).
  const backend = process.env.REACT_APP_BACKEND_URL || '';
  const shareUrl = shortCode
    ? (backend ? `${backend}/api/og/s/${shortCode}` : `${window.location.origin}/s/${shortCode}`)
    : `${backend}/api/og${path.startsWith('/') ? path : `/${path}`}`;

  const onShare = async () => {
    try { onShareHook && onShareHook(); } catch { /* analytics must never break sharing */ }
    if (navigator.share) {
      try {
        await navigator.share({ title: title || 'Omnivest', text: text || '', url: shareUrl });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // user cancelled
      }
    }
    try {
      await navigator.clipboard.writeText(text ? `${text} ${shareUrl}` : shareUrl);
      toast.success(shortCode ? 'Share message copied — paste it anywhere.' : 'Share link copied — the preview shows this page.');
    } catch {
      toast.error('Could not copy the link.');
    }
  };

  return (
    <button
      type="button"
      data-testid="share-button"
      onClick={onShare}
      className={className || 'inline-flex items-center gap-1.5 text-sm font-semibold text-[#64748B] hover:text-[#6C2BD9] transition-colors'}
    >
      <Share2 className="h-4 w-4" /> {label}
    </button>
  );
}

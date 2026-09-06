import React from 'react';
import { MessageCircle, Link2, Mail } from 'lucide-react';
import { toast } from 'sonner';

// The share row under a listing's overview (the smallcase pattern): WhatsApp, X, email, copy link.
// Every link goes through the OG short link so the preview card shows on the other side.
export default function ShareRow({ shortCode, path, title, text, onShare }) {
  const backend = process.env.REACT_APP_BACKEND_URL || '';
  const url = shortCode ? (backend ? `${backend}/api/og/s/${shortCode}` : `${window.location.origin}/s/${shortCode}`) : `${backend}/api/og${path}`;
  const msg = `${text || title} ${url}`;
  const fire = (channel) => { try { onShare && onShare(channel); } catch { /* analytics never block sharing */ } };
  const copy = async () => {
    fire('copy');
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { toast.error('Could not copy the link'); }
  };
  const btn = 'h-10 w-10 grid place-items-center rounded-full border border-[#E6E8F0] bg-white text-[#526071] hover:text-[#5320A8] hover:border-[#D8C7F1] transition-colors';
  return (
    <div className="flex items-center gap-2" data-testid="share-row">
      <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" onClick={() => fire('whatsapp')} aria-label="Share on WhatsApp" className={btn} data-testid="share-whatsapp"><MessageCircle className="h-[18px] w-[18px]" /></a>
      <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text || title)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" onClick={() => fire('x')} aria-label="Share on X" className={btn} data-testid="share-x">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M18.244 2H21l-6.52 7.45L22 22h-6.828l-4.77-6.24L4.9 22H2.14l6.97-7.97L2 2h6.914l4.32 5.72L18.244 2Zm-1.196 18h1.833L7.03 3.9H5.08L17.048 20Z" /></svg>
      </a>
      <a href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(msg)}`} onClick={() => fire('email')} aria-label="Share by email" className={btn} data-testid="share-email"><Mail className="h-[18px] w-[18px]" /></a>
      <button type="button" onClick={copy} aria-label="Copy link" className={btn} data-testid="share-copy"><Link2 className="h-[18px] w-[18px]" /></button>
    </div>
  );
}

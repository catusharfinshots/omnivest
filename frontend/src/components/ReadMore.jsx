import React, { useEffect, useRef, useState } from 'react';

/**
 * Clamp long content to a few lines with a "Read more" link (the smallcase pattern), and show
 * everything on tap. The link appears only when the content actually overflows.
 */
export default function ReadMore({ lines = 3, className = '', children, testid = 'read-more' }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [children, open]);
  return (
    <div className={className}>
      <div ref={ref} style={open ? undefined : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {children}
      </div>
      {(overflows || open) && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-[14px] font-semibold text-[#5320A8] hover:underline" data-testid={testid}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Link2, RemoveFormatting } from 'lucide-react';

// Small, dependency-free rich-text editor (contenteditable + execCommand).
// Output is HTML; the backend sanitises it to an allow-list, so the toolbar only
// offers what survives: headings, bold/italic, lists, links.
export default function RichTextEditor({ value, onChange, placeholder = 'Write here…', minHeight = 160, testId }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const lastEmitted = useRef(value || '');

  useEffect(() => {
    if (ref.current && (value || '') !== lastEmitted.current) {
      ref.current.innerHTML = value || '';
      lastEmitted.current = value || '';
    }
  }, [value]);

  const emit = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML.replace(/<div>/g, '<p>').replace(/<\/div>/g, '</p>');
    lastEmitted.current = html;
    onChange(html === '<p><br></p>' || html === '<br>' ? '' : html);
  };
  const cmd = (name, arg) => { ref.current?.focus(); document.execCommand(name, false, arg); emit(); };
  const link = () => {
    const url = window.prompt('Link URL (https://…)');
    if (url && /^https?:\/\//i.test(url)) cmd('createLink', url);
  };
  const empty = !(value || '').replace(/<[^>]*>/g, '').trim();
  const Btn = ({ icon: Icon, title, onClick }) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className="h-7 w-7 grid place-items-center rounded-md text-[#4B4560] hover:bg-[#F1E7FE] hover:text-[#5320A8]"><Icon className="h-3.5 w-3.5" /></button>
  );
  return (
    <div className={`rounded-xl border bg-white transition-colors ${focused ? 'border-[#6C2BD9] ring-2 ring-[#6C2BD9]/15' : 'border-[#E8E1F0]'}`} data-testid={testId}>
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#F1EBF9]">
        <Btn icon={Heading2} title="Heading" onClick={() => cmd('formatBlock', 'h2')} />
        <Btn icon={Heading3} title="Sub-heading" onClick={() => cmd('formatBlock', 'h3')} />
        <span className="w-px h-4 bg-[#E8E1F0] mx-1" />
        <Btn icon={Bold} title="Bold" onClick={() => cmd('bold')} />
        <Btn icon={Italic} title="Italic" onClick={() => cmd('italic')} />
        <span className="w-px h-4 bg-[#E8E1F0] mx-1" />
        <Btn icon={List} title="Bullet list" onClick={() => cmd('insertUnorderedList')} />
        <Btn icon={ListOrdered} title="Numbered list" onClick={() => cmd('insertOrderedList')} />
        <Btn icon={Link2} title="Link" onClick={link} />
        <span className="w-px h-4 bg-[#E8E1F0] mx-1" />
        <Btn icon={RemoveFormatting} title="Plain paragraph" onClick={() => { cmd('removeFormat'); cmd('formatBlock', 'p'); }} />
      </div>
      <div className="relative">
        {empty && !focused && <div className="absolute left-3 top-2.5 text-sm text-[#9A93AD] pointer-events-none">{placeholder}</div>}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={() => { setFocused(false); emit(); }}
          onFocus={() => setFocused(true)}
          className="rich-text px-3 py-2.5 text-sm text-[#1A1030] outline-none"
          style={{ minHeight }}
        />
      </div>
    </div>
  );
}

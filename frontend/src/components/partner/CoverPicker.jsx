import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Upload, Wand2, Check, Trash2, Loader2, Image as ImageIcon } from 'lucide-react';
import CoverArt, { PALETTES } from '../CoverArt';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Step-1 cover block: auto-picked theme (never blank), suggestions for this listing,
// full theme library + palette, or the partner's own image.
export default function CoverPicker({ form, cover, onChange, editingId, token, ensureSaved }) {
  const [themes, setThemes] = useState([]);
  const [suggest, setSuggest] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => { axios.get(`${API}/covers/themes`).then(({ data }) => setThemes(data.themes || [])).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      axios.get(`${API}/covers/suggest`, { params: { name: form.name || '', subtitle: form.subtitle || '', tags: (form.tags || []).join(','), strategy: form.strategy || '' } })
        .then(({ data }) => setSuggest(data)).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [form.name, form.subtitle, form.tags, form.strategy]);

  const byId = Object.fromEntries(themes.map((t) => [t.id, t]));
  const kind = cover?.kind || 'auto';
  const palette = cover?.palette || suggest?.palette || 'violet';
  const currentTheme = kind === 'auto' ? (suggest?.auto || cover?.theme || 'default') : (cover?.theme || 'default');
  const preview = { kind: kind === 'upload' ? 'upload' : 'theme', theme: currentTheme, palette, icon: byId[currentTheme]?.icon || 'PieChart', url: cover?.url };

  const iconOf = (id) => byId[id]?.icon || 'PieChart';
  const chooseTheme = (id) => onChange({ kind: 'theme', theme: id, palette, icon: iconOf(id) });
  const choosePalette = (p) => onChange({ ...(kind === 'auto' ? { kind: 'theme', theme: currentTheme, icon: iconOf(currentTheme) } : cover), palette: p });
  const applyAuto = () => onChange({ kind: 'auto', theme: suggest?.auto, palette, icon: iconOf(suggest?.auto) });

  // keep an auto cover in sync with the suggestion as the partner types (never blank, never stale)
  useEffect(() => {
    if (!suggest || themes.length === 0) return;
    if (!cover || (cover.kind === 'auto' && (cover.theme !== suggest.auto || !cover.icon))) onChange({ kind: 'auto', theme: suggest.auto, palette: cover?.palette || suggest.palette, icon: iconOf(suggest.auto) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggest, themes.length]);

  const onUpload = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { toast.error('Use a PNG, JPG or WebP image'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be 2 MB or smaller'); return; }
    let id = editingId;
    if (!id) { const saved = await ensureSaved(); id = saved?.id; if (!id) return; }
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await axios.post(`${API}/analyst/portfolios/${id}/cover`, fd, auth);
      onChange(data.cover);
      toast.success('Cover uploaded');
    } catch (err) { toast.error(err?.response?.data?.detail || 'Upload failed'); }
    finally { setBusy(false); }
  };
  const removeUpload = async () => {
    if (!editingId) { applyAuto(); return; }
    setBusy(true);
    try { const { data } = await axios.delete(`${API}/analyst/portfolios/${editingId}/cover`, auth); onChange(data.cover); toast.success('Back to the generated cover'); }
    catch { toast.error('Could not remove'); }
    finally { setBusy(false); }
  };

  const suggested = (suggest?.suggested || []).filter((id) => byId[id]);
  const list = showAll ? themes : suggested.map((id) => byId[id]);

  return (
    <div className="rounded-xl border border-[#E8E1F0] bg-white p-4" data-testid="cover-picker">
      <div className="flex items-start gap-4">
        <CoverArt cover={preview} name={form.name} size={96} radius={22} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#1A1030] flex items-center gap-2"><ImageIcon className="h-4 w-4 text-[#6C2BD9]" /> Cover image</div>
          <div className="text-xs text-[#6B6480] mt-0.5">
            {kind === 'upload' ? 'Your uploaded image.' : kind === 'auto' ? <>Generated from your theme: <b className="text-[#1A1030]">{byId[currentTheme]?.label || 'Model portfolio'}</b>. It updates as you type — or pick one below.</> : <>Theme: <b className="text-[#1A1030]">{byId[currentTheme]?.label}</b>.</>}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {kind !== 'auto' && <button type="button" onClick={applyAuto} className="btn-ghost text-xs" data-testid="cover-auto"><Wand2 className="h-3.5 w-3.5" /> Use auto-pick</button>}
            <label className="btn-outline text-xs cursor-pointer"><Upload className="h-3.5 w-3.5" /> {busy ? 'Uploading…' : 'Upload your own'}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onUpload} disabled={busy} data-testid="cover-upload" /></label>
            {kind === 'upload' && <button type="button" onClick={removeUpload} disabled={busy} className="btn-ghost text-xs text-[#DC2626]"><Trash2 className="h-3.5 w-3.5" /> Remove</button>}
          </div>
          <div className="mt-2 flex items-center gap-1.5" data-testid="cover-palettes">
            {Object.entries(PALETTES).map(([p, [a, b]]) => (
              <button key={p} type="button" title={p} onClick={() => choosePalette(p)} className={`h-5 w-5 rounded-full border-2 ${palette === p ? 'border-[#1A1030]' : 'border-white'} shadow`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} />
            ))}
            <span className="text-[11px] text-[#94A3B8] ml-1">Colour</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">{showAll ? 'All themes' : 'Suggested for this listing'}</div>
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-[#6C2BD9]">{showAll ? 'Show suggestions' : `Browse all ${themes.length}`}</button>
      </div>
      <div className={`mt-2 grid gap-2 ${showAll ? 'grid-cols-5 sm:grid-cols-8' : 'grid-cols-3 sm:grid-cols-6'}`} data-testid="cover-themes">
        {list.map((t) => {
          const active = kind !== 'upload' && currentTheme === t.id;
          return (
            <button key={t.id} type="button" onClick={() => chooseTheme(t.id)} title={t.label} className={`group rounded-xl p-1.5 border text-left transition-colors ${active ? 'border-[#6C2BD9] bg-[#F7F4FB]' : 'border-transparent hover:border-[#D8C7F1]'}`} data-testid={`cover-theme-${t.id}`}>
              <div className="relative">
                <CoverArt cover={{ kind: 'theme', theme: t.id, palette, icon: t.icon }} name={t.label} size={showAll ? 44 : 56} radius={12} className="w-full" />
                {active && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#6C2BD9] text-white grid place-items-center"><Check className="h-3 w-3" /></span>}
              </div>
              <div className="mt-1 text-[10px] leading-tight text-[#4B4560] truncate">{t.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

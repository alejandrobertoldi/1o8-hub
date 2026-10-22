'use client';
import { useState } from 'react';
import type { DataMap } from '@/lib/data-map/types';
import { getHotspot, hotspotKey, removeHotspots, localPageUrl, type Binding, type VisualField, type VisualWorkspace } from '@/lib/data-map/visual-model';

export const inputStyle = 'w-full rounded-md border bg-card px-2 py-1.5 text-xs';
export function VisualEditor({ map, fields, field, route, workspace, selected, placing, ready, onRoute, onChange, onImage, onSelect, onPlace, onError }: {
  map: DataMap; fields: VisualField[]; field: string; route: string; workspace: VisualWorkspace; selected?: Binding; placing: boolean; ready: boolean;
  onRoute: (route: string) => void; onChange: (w: VisualWorkspace) => void; onImage: (file: File, state: string, url: string, another: boolean) => void; onSelect: (b: Binding) => void; onPlace: () => void; onError: (s: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [direction, setDirection] = useState<'read' | 'write'>('read');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState('');
  const [state, setState] = useState('Page overview');
  const [another, setAnother] = useState(false);
  const shots = workspace.shots.filter(s => s.route === route);
  const shot = shots.find(s => s.id === workspace.activeShots[route]) ?? shots[0];
  const selectedShot = selected ? workspace.shots.find(s => s.id === workspace.activeShots[selected.route]) ?? workspace.shots.find(s => s.route === selected.route) : undefined;
  const selectedHotspot = selected ? getHotspot(workspace.hotspots, selected.id, selectedShot?.id) : undefined;
  const coverage = workspace.coverage[route] ?? { status: route.includes('[') ? 'needs-record' as const : 'missing' as const, note: '', url: route.includes('[') ? '' : route };
  const updateCoverage = (changes: Partial<typeof coverage>) => onChange({ ...workspace, coverage: { ...workspace.coverage, [route]: { ...coverage, ...changes } } });
  const upload = (file?: File) => { if (file) onImage(file, state, coverage.url, another); };
  return <aside className="min-h-0 space-y-4 overflow-auto rounded-xl border bg-card p-3" aria-label="Visual flow editor">
    {selected && <section className="space-y-2 border-b pb-4" aria-label="Selected connection"><h3 className="text-sm font-semibold">{selected.label}</h3><p className="break-all font-mono text-[10px]">{selected.field}</p><p className="text-[10px] text-muted-foreground">{selected.direction === 'write' ? 'Writes to storage' : 'Displays / uses stored field'} · {selected.status === 'code' ? 'Code evidence' : selected.status === 'candidate' ? 'Query candidate · control unverified' : 'Manual annotation'}</p><p className="text-xs leading-relaxed">{selected.note}</p>{selected.evidence.map(e => <p key={`${e.file}:${e.line}`} className="break-all font-mono text-[9px] text-muted-foreground">{e.file}:{e.line}</p>)}
      <button type="button" disabled={!ready || selected.status === 'candidate'} onClick={onPlace} className={`w-full rounded-md border px-2 py-1.5 text-xs ${placing ? 'bg-brand-solid text-white' : 'bg-card'}`}>{placing ? 'Draw a box on the screenshot' : 'Place / replace hotspot'}</button>
      {selectedHotspot && <button type="button" className={inputStyle} onClick={() => { const hotspots = removeHotspots(workspace.hotspots, selected.id, selectedShot?.id); onChange({ ...workspace, hotspots }); }}>Remove hotspot</button>}
      {selectedHotspot && <details><summary className="cursor-pointer text-[10px]">Hotspot position (%)</summary><div className="mt-2 grid grid-cols-2 gap-2">{(['x', 'y', 'w', 'h'] as const).map(key => <label key={key} className="text-[10px]">{({ x: 'Left', y: 'Top', w: 'Width', h: 'Height' })[key]}<input aria-label={`Hotspot ${key}`} type="number" min={key === 'w' || key === 'h' ? .1 : 0} max={100} step={.1} className={inputStyle} value={Math.round(selectedHotspot[key] * 1000) / 10} onChange={e => { const h = selectedHotspot; const v = Number(e.target.value) / 100; const next = { ...h, [key]: v, review: false }; if (next.x + next.w <= 1 && next.y + next.h <= 1 && next.w >= .001 && next.h >= .001) onChange({ ...workspace, hotspots: { ...workspace.hotspots, [hotspotKey(selected.id, next.shotId)]: next } }); }}/></label>)}</div></details>}
      {selected.status === 'manual' && <><button type="button" className={inputStyle} onClick={() => { setEditingId(selected.id); setLabel(selected.label); setDirection(selected.direction); setNote(selected.note); onRoute(selected.route); }}>Edit connection below</button><button type="button" className={inputStyle} onClick={() => { const hotspots = removeHotspots(workspace.hotspots, selected.id); onChange({ ...workspace, manual: workspace.manual.filter(b => b.id !== selected.id), hotspots }); }}>Remove manual connection</button></>}
    </section>}
    <section className="space-y-2"><h3 className="text-xs font-bold">Page screenshot</h3><label className="block text-[10px]">Page<select aria-label="Screenshot page" className={inputStyle} value={route} onChange={e => onRoute(e.target.value)}>{map.pages.map(p => <option key={p.route}>{p.route}</option>)}</select></label>
      <label className="block text-[10px]">Representative page URL<input aria-label="Representative page URL" className={inputStyle} value={coverage.url} placeholder="/products/a-real-product-id" onChange={e => { if (localPageUrl(e.target.value)) updateCoverage({ url: e.target.value }); }}/></label>
      {coverage.url && !coverage.url.includes('[') && <a href={coverage.url} target="_blank" rel="noreferrer" className="inline-block text-xs text-brand">Open page to capture ↗</a>}
      {shots.length > 0 && <label className="block text-[10px]">Captured state<select aria-label="Captured state" className={inputStyle} value={shot?.id ?? ''} onChange={e => onChange({ ...workspace, activeShots: { ...workspace.activeShots, [route]: e.target.value } })}>{shots.map(s => <option key={s.id} value={s.id}>{s.state} · {new Date(s.capturedAt).toLocaleDateString()}</option>)}</select></label>}
      <label className="block text-[10px]">State / tab / dialog<input aria-label="Screenshot state" className={inputStyle} value={state} maxLength={200} onChange={e => setState(e.target.value)}/></label>
      {shot && <label className="flex items-center gap-2 text-[10px]"><input type="checkbox" checked={another} onChange={e => setAnother(e.target.checked)}/>Add another state instead of replacing</label>}
      <input aria-label="Screenshot image" type="file" accept="image/png,image/jpeg,image/webp" disabled={!ready} className="w-full text-[10px]" onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }}/>
      <div tabIndex={0} role="button" aria-label="Paste screenshot here" className="cursor-pointer rounded-lg border border-dashed p-3 text-center text-[10px] focus:ring-2 focus:ring-brand" onPaste={e => { if (!ready) return; const file = [...e.clipboardData.files].find(f => f.type.startsWith('image/')); if (file) { e.preventDefault(); upload(file); } else onError('Copy an image, then paste it here.'); }}>Click here and paste a screenshot<br/><span className="text-muted-foreground">PNG / JPEG / WebP · up to 10 MB · stored in this browser</span></div>
      <label className="block text-[10px]">Capture status<select aria-label="Capture status" className={inputStyle} value={coverage.status} onChange={e => updateCoverage({ status: e.target.value as typeof coverage.status })}><option value="missing">Not captured</option><option value="needs-record">Needs representative record</option><option value="blocked">Blocked by access / network</option></select></label>
      <textarea aria-label="Capture note" placeholder="Missing tab, access issue, or record context…" maxLength={2000} className={inputStyle} value={coverage.note} onChange={e => updateCoverage({ note: e.target.value })}/>
    </section>
    <form className="space-y-2 border-t pt-3" onSubmit={e => { e.preventDefault(); if (!label.trim() || !ready) return;
      const b: Binding = { id: editingId || `manual-${crypto.randomUUID()}`, route, field, label: label.trim(), direction, note: note.trim(), status: 'manual', evidence: [] };
      const previous = workspace.manual.find(m => m.id === b.id);
      const hotspots = previous && previous.route !== route ? removeHotspots(workspace.hotspots, b.id) : workspace.hotspots;
      onChange({ ...workspace, manual: [...workspace.manual.filter(m => m.id !== b.id), b], hotspots }); onSelect(b); setLabel(''); setNote(''); setEditingId('');
    }}><h3 className="text-xs font-bold">Connect a page control</h3><p className="break-all text-[10px] text-muted-foreground">Selected storage: {fields.find(f => f.id === field)?.id ?? field}</p>
      <label className="block text-[10px]">Page<select aria-label="Connection page" className={inputStyle} value={route} onChange={e => onRoute(e.target.value)}>{map.pages.map(p => <option key={p.route}>{p.route}</option>)}</select></label>
      <input aria-label="Control label" required maxLength={150} className={inputStyle} placeholder="e.g. Size selector" value={label} onChange={e => setLabel(e.target.value)}/>
      <select aria-label="Connection direction" className={inputStyle} value={direction} onChange={e => setDirection(e.target.value as 'read' | 'write')}><option value="read">Displays / uses this field</option><option value="write">Creates / edits this field</option></select>
      <textarea aria-label="Connection explanation" maxLength={2000} className={inputStyle} placeholder="Condition or explanation" value={note} onChange={e => setNote(e.target.value)}/>
      <button type="submit" disabled={!ready} className="w-full rounded-lg bg-brand-solid p-2 text-xs font-semibold text-white disabled:opacity-50">Save field connection</button>
    </form>
  </aside>;
}

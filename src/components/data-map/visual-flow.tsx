'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DataMap } from '@/lib/data-map/types';
import { hotspotKey, emptyWorkspace, fieldInventory, parseVisualWorkspace, queryBindings, traceFields, type Binding, type VisualWorkspace } from '@/lib/data-map/visual-model';
import { visualBindings, visualTransfers } from '@/lib/data-map/visual-bindings';
import { readRawVisualWorkspace, loadVisualWorkspace, saveVisualWorkspace, imageFile } from './visual-storage';
import { VisualStage } from './visual-stage';
import { VisualEditor, inputStyle } from './visual-editor';

export function VisualFlow({ map, storageKey }: { map: DataMap; storageKey: string }) {
  const [workspace, setWorkspace] = useState<VisualWorkspace>(emptyWorkspace);
  const fields = useMemo(() => fieldInventory(map, workspace.customFields), [map, workspace.customFields]);
  const [field, setField] = useState(() => fields.find(f => f.id === 'master.variations.Size')?.id ?? fields[0]?.id ?? '');
  const [jsonPath, setJsonPath] = useState('');
  const latest = useRef(workspace);
  const queue = useRef(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState('Loading browser workspace…');
  const [query, setQuery] = useState('');
  const [pageQuery, setPageQuery] = useState('');
  const [route, setRoute] = useState(map.pages.find(p => p.route === '/products/[id]')?.route ?? map.pages[0]?.route ?? '');
  const [extra, setExtra] = useState('');
  const [selected, setSelected] = useState('');
  const [placing, setPlacing] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  useEffect(() => {
    let active = true;
    loadVisualWorkspace(storageKey, map).then(w => { if (active) { latest.current = w; setWorkspace(w); setReady(true); setStatus('Browser workspace ready'); } }).catch(() => { if (active) { setLoadFailed(true); setStatus('Saved workspace could not be loaded. Export the stored data for recovery, or import a valid backup. Changes remain disabled until recovery.'); } });
    return () => { active = false; };
  }, [map, storageKey]);
  const commit = (w: VisualWorkspace, recovering = false) => {
    if (!ready && !recovering) return;
    try { parseVisualWorkspace(w, map); } catch { setStatus('Change could not be saved: invalid data or image limit reached.'); return; }
    latest.current = w; setWorkspace(w); setReady(true); setLoadFailed(false); setStatus('Saving…');
    queue.current = queue.current.catch(() => {}).then(() => saveVisualWorkspace(storageKey, w)).then(() => { if (latest.current === w) setStatus('Saved in this browser'); }).catch(() => { setStatus('Save failed. Export a backup now; the latest changes are only in memory.'); });
  };
  const allBindings = [...visualBindings.filter(b => map.pages.some(p => p.route === b.route) && fields.some(f => f.id === b.field)), ...workspace.manual];
  const connected = traceFields(field, visualTransfers);
  const visibleFields = fields.filter(f => connected.has(f.id));
  const verified = allBindings.filter(b => connected.has(b.field));
  const inferred = queryBindings(map, visibleFields).filter(b => !verified.some(v => v.route === b.route && v.field === b.field && v.direction === b.direction));
  const bindings = [...verified, ...(showCandidates || !verified.length ? inferred : [])];
  const routes = [...new Set([...bindings.map(b => b.route), ...(extra ? [extra] : [])])];
  const selectedBinding = [...allBindings, ...inferred].find(b => b.id === selected);
  const selectField = (id: string) => { setField(id); setSelected(''); setPlacing(false); setExtra(''); setShowCandidates(false); };
  const selectBinding = (b: Binding) => { setSelected(b.id); setRoute(b.route); setField(b.field); setShowEditor(true); setPlacing(false); };
  const selectRoute = (r: string) => { setRoute(r); setExtra(r); setShowEditor(true); setPlacing(false); };
  async function addImage(file: File, state: string, url: string, another: boolean) {
    const target = route;
    try {
      const image = await imageFile(file); const w = latest.current;
      const previous = !another && (w.shots.find(s => s.id === w.activeShots[target]) ?? w.shots.find(s => s.route === target));
      const shot = { id: previous ? previous.id : crypto.randomUUID(), route: target, state: state.trim() || 'Page overview', url, capturedAt: new Date().toISOString(), ...image };
      const hotspots = Object.fromEntries(Object.entries(w.hotspots).map(([id, h]) => [id, previous && h.shotId === previous.id ? { ...h, review: true } : h]));
      commit({ ...w, shots: [...w.shots.filter(s => s.id !== shot.id), shot], activeShots: { ...w.activeShots, [target]: shot.id }, hotspots });
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Screenshot could not be saved'); }
  }
  const exportBackup = async () => {
    try {
      const value = ready ? workspace : await readRawVisualWorkspace(storageKey);
      if (value === undefined) throw new Error('No saved workspace');
      const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'mfhub-visual-field-flow.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setStatus('Export failed: browser storage is unavailable. Your stored data has not been changed.'); }
  };
  const captured = new Set(workspace.shots.map(s => s.route));
  const selectedField = fields.find(f => f.id === field);
  const isJson = map.tables.find(t => t.name === selectedField?.table)?.columns.find(c => c.name === selectedField?.column)?.type.includes('json');
  const candidates = [...map.edges, ...(map.processEdges ?? [])].filter(e => visibleFields.some(f => e.table === f.table && e.evidence.some(ev => ev.fields?.columns.includes(f.column) || ev.fields?.allColumns || ev.fields?.unknown)));
  return <div className="flex min-h-0 flex-1 flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 text-xs">
      <label className="flex items-center gap-1 text-[10px]"><input type="checkbox" checked={showCandidates || !verified.length} disabled={!verified.length} onChange={e => setShowCandidates(e.target.checked)}/>Query candidates</label>
      {[['Size', 'master.variations.Size'], ['Variation theme', 'master.variations.VariationThemeName'], ['Variation ID', 'master.variations.VariationID']].filter(([, id]) => fields.some(f => f.id === id)).map(([label, id]) => <button type="button" aria-label={`Preset ${label}`} key={id} onClick={() => selectField(id)} className={`rounded-md border px-3 py-1.5 ${field === id ? 'border-brand bg-brand/10 text-brand' : ''}`}>{label}</button>)}
      <span className="flex-1"/><span className="text-[10px]"><span className="text-green-600">●</span> Writes <span className="ml-2 text-blue-600">●</span> Displays / uses <span className="ml-2 text-violet-500">●</span> Copies / transforms</span>
      <button type="button" className="rounded-md border px-2 py-1.5" onClick={() => setShowEditor(!showEditor)}>{showEditor ? 'Hide editor' : 'Screenshots & connections'}</button>
      <button type="button" disabled={!ready && !loadFailed} className="rounded-md border px-2 py-1.5" onClick={exportBackup}>Export visual backup</button>
      <label className="cursor-pointer rounded-md border px-2 py-1.5">Import<input aria-label="Import visual backup" type="file" accept="application/json,.json" disabled={!ready && !loadFailed} className="sr-only" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { if (file.size > 110_000_000) throw new Error('Too large'); const incoming = parseVisualWorkspace(JSON.parse(await file.text()), map); commit(incoming, true); setSelected(''); setPlacing(false); } catch { setStatus('Import rejected. Use a valid visual backup under 110 MB; your current workspace is unchanged.'); } }}/></label>
    </div>
    <div className={`grid min-h-0 flex-1 gap-3 ${showEditor ? 'lg:grid-cols-[215px_minmax(300px,1fr)_280px]' : 'lg:grid-cols-[215px_minmax(0,1fr)]'}`}>
      <nav className="max-h-80 space-y-3 overflow-auto rounded-xl border bg-card p-3 lg:max-h-none" aria-label="Fields and screenshot coverage">
        <h2 className="text-[10px] font-bold uppercase tracking-widest">Stored fields · {fields.length}</h2>
        <input aria-label="Find stored field" placeholder="Table, column or JSON key…" className={inputStyle} value={query} onChange={e => setQuery(e.target.value)}/>
        {isJson && selectedField && <form className="flex gap-1" onSubmit={e => { e.preventDefault(); const path = jsonPath.trim(); if (!path) return; const f = { table: selectedField.table, column: selectedField.column, path, label: path, id: `${selectedField.table}.${selectedField.column}.${path}` }; commit({ ...workspace, customFields: [...(workspace.customFields ?? []).filter(c => c.id !== f.id), f] }); setField(f.id); setSelected(''); setJsonPath(''); }}><input aria-label="JSON key path" value={jsonPath} maxLength={150} onChange={e => setJsonPath(e.target.value)} className={`${inputStyle} min-w-0`} placeholder="Add JSON key / path"/><button type="submit" disabled={!ready} className="rounded border px-2 text-xs">Add</button></form>}
        <div className="max-h-72 overflow-auto">{map.tables.filter(t => fields.some(f => f.table === t.name && `${f.id} ${f.label}`.toLowerCase().includes(query.toLowerCase()))).map(t => <details key={t.name} open={!!query || visibleFields.some(f => f.table === t.name)}><summary className="cursor-pointer py-1 text-xs font-semibold">{t.name}</summary>{fields.filter(f => f.table === t.name && `${f.id} ${f.label}`.toLowerCase().includes(query.toLowerCase())).map(f => <button type="button" key={f.id} aria-label={`Trace stored field ${f.id}`} className={`block w-full truncate rounded px-2 py-1 text-left text-[10px] ${connected.has(f.id) ? 'bg-muted text-brand' : ''}`} title={f.id} onClick={() => selectField(f.id)}>{f.path ? `↳ ${f.column} → ${f.path}` : f.column}</button>)}</details>)}</div>
        <div className="border-t pt-3"><h2 className="text-[10px] font-bold uppercase tracking-widest">Page screenshots</h2><p className="my-2 text-[10px] text-muted-foreground">{captured.size} / {map.pages.length} routes captured</p><input aria-label="Find screenshot page" placeholder="Find page…" className={inputStyle} value={pageQuery} onChange={e => setPageQuery(e.target.value)}/><div className="mt-2 max-h-64 overflow-auto">{map.pages.filter(p => p.route.includes(pageQuery)).map(p => <button type="button" aria-label={`Screenshot ${p.route}`} key={p.route} onClick={() => selectRoute(p.route)} className="block w-full rounded px-1 py-1.5 text-left text-[10px] hover:bg-muted"><span className="block truncate">{p.route}</span><span className="text-[9px] text-muted-foreground">{captured.has(p.route) ? 'Captured' : workspace.coverage[p.route]?.status === 'blocked' ? 'Blocked' : p.route.includes('[') ? 'Needs representative record' : 'Not captured'}</span></button>)}</div></div>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-col gap-2"><VisualStage fields={visibleFields} bindings={bindings} transfers={visualTransfers} workspace={workspace} routes={routes} selected={selected} placing={placing} onSelect={selectBinding} onField={selectField} onRoute={selectRoute} onMove={(id, p) => commit({ ...latest.current, positions: { ...latest.current.positions, [id]: p } })} onPlace={(id, h) => { commit({ ...latest.current, hotspots: { ...latest.current.hotspots, [hotspotKey(id, h.shotId)]: h } }); setPlacing(false); }}/>
        <details className="max-h-48 overflow-auto rounded-lg border bg-card p-2 text-[10px]"><summary className="cursor-pointer">Evidence & coverage · {bindings.length} UI bindings · {candidates.length} query candidates</summary><p className="my-2 text-muted-foreground">Code-confirmed bindings describe possible control flows. Query candidates below may fetch the whole JSON column; they do not prove this key is displayed. Historical record provenance and external writers are not tracked.</p>{visualTransfers.filter(t => connected.has(t.from) && connected.has(t.to)).map(t => <p key={t.from + t.to} className="mb-2"><strong>{t.from} → {t.to}</strong><br/>{t.note}<br/>{t.evidence.map(e => `${e.file}:${e.line}`).join(' · ')}</p>)}{candidates.map((c, i) => <details key={i} className="border-t py-1"><summary>{c.operation} · {c.page} · {c.table}</summary>{c.evidence.map((e, j) => <p key={j} className="break-all font-mono text-[9px]">{e.file}:{e.line}</p>)}</details>)}</details>
      </div>
      <div className={showEditor ? 'contents' : 'hidden'}><VisualEditor map={map} fields={fields} field={field} route={route} workspace={workspace} selected={selectedBinding} placing={placing} ready={ready} onRoute={selectRoute} onChange={commit} onImage={addImage} onSelect={selectBinding} onPlace={() => { if (!selectedBinding) return; setRoute(selectedBinding.route); setPlacing(true); }} onError={setStatus}/></div>
    </div>
    <p role="status" className="text-[10px] text-muted-foreground">{status} · Screenshots and manual connections stay in this browser. Export before clearing browser data.</p>
  </div>;
}

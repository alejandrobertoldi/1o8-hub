'use client';
import { useEffect, useMemo, useState } from 'react';
import { Database, Download, Search, Upload } from 'lucide-react';
import { OPERATIONS, type Annotation, type DataMap, type LiveSchema, type Operation } from '@/lib/data-map/types';
import { Graph, COLORS, type Selection } from './graph';
import { Inspector } from './inspector';
import { parseAnnotations } from './annotations';
import { TableLineage } from './lineage';
import { VisualFlow } from './visual-flow';
import { withLiveSchema } from '@/lib/data-map/live-schema';

const control = 'rounded-md border bg-card px-2 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-brand';
export function DataMapCanvas({ map: declaredMap, storageKey = 'mfhub:data-map:v1' }: { map: DataMap; storageKey?: string }) {
  const [live, setLive] = useState<LiveSchema | null>(null);
  const map = useMemo(() => withLiveSchema(declaredMap, live), [declaredMap, live]);
  const [search, setSearch] = useState('');
  const [operation, setOperation] = useState('ALL');
  const [selected, setSelected] = useState<Selection>(null);
  const [focus, setFocus] = useState(false);
  const [view, setView] = useState<'visual' | 'tables' | 'pages'>('visual');
  const [tableFocus, setTableFocus] = useState<string | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  const [manual, setManual] = useState<Annotation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('');
  const [checking, setChecking] = useState(false);
  const [schemaStatus, setSchemaStatus] = useState('Schema not checked');
  const [annotationPage, setAnnotationPage] = useState(map.pages[0]?.route ?? '');
  const [annotationTable, setAnnotationTable] = useState(map.tables[0]?.name ?? '');
  const [annotationOperation, setAnnotationOperation] = useState<Operation>('READ');
  const [note, setNote] = useState('');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setManual(parseAnnotations(JSON.parse(saved), map, true));
    } catch { setStatus('Saved annotations could not be loaded. You can import a backup.'); }
    setLoaded(true);
  }, [storageKey, map]);
  const persist = (annotations: Annotation[]) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(annotations));
      setManual(annotations);
      setStatus('Saved in this browser. Export a backup to move annotations.');
    } catch { setStatus('Could not save annotations: browser storage is unavailable or full.'); }
  };
  const select = (s: Selection) => {
    setSelected(s); setFocus(true);
    if (s?.kind === 'page') setAnnotationPage(s.id);
    if (s?.kind === 'table') { setAnnotationTable(s.id); setTableFocus(s.id); }
  };
  const connect = (page: string, table: string) => {
    if (!loaded || !map.pages.some(p => p.route === page) || !map.tables.some(t => t.name === table)) return;
    if (manual.length >= 1000) { setStatus('Annotation limit reached. Export a backup and remove unused connections.'); return; }
    if (manual.some(a => a.page === page && a.table === table && a.operation === annotationOperation)) { setStatus('That manual connection already exists.'); return; }
    persist([...manual, { id: crypto.randomUUID(), page, table, operation: annotationOperation, note: note.trim() }]);
    setAnnotationPage(page); setAnnotationTable(table); setNote('');
    setSelected({ kind: 'page', id: page }); setFocus(true);
  };
  const staticEdges = useMemo(() => view === 'tables' ? [...map.edges, ...(map.processEdges ?? [])] : map.edges, [map.edges, map.processEdges, view]);
  const allLinks = useMemo(() => [...staticEdges, ...manual], [staticEdges, manual]);
  const q = search.trim().toLowerCase();
  const eligibleLinks = allLinks.filter(e => operation === 'ALL' || e.operation === operation);
  const eligiblePages = map.pages.filter(p => {
    const links = eligibleLinks.filter(e => e.page === p.route);
    return (operation === 'ALL' || links.length > 0) && (!q || p.route.toLowerCase().includes(q) || links.some(e => e.table.toLowerCase().includes(q)));
  });
  const eligibleTables = map.tables.filter(t => {
    const links = eligibleLinks.filter(e => e.table === t.name);
    return (operation === 'ALL' || links.length > 0) && (!q || t.name.toLowerCase().includes(q) || t.columns.some(c => c.name.toLowerCase().includes(q)) || links.some(e => e.page.toLowerCase().includes(q)));
  });
  const selectedLink = (e: { page: string; table: string; operation: Operation }) => !!selected && (operation === 'ALL' || e.operation === operation) && (selected.kind === 'page' ? e.page === selected.id : e.table === selected.id);
  const edges = staticEdges.filter(selectedLink);
  const annotations = manual.filter(selectedLink);
  const connections = [...edges, ...annotations];
  const pages = focus && selected ? eligiblePages.filter(p => selected.kind === 'page' ? p.route === selected.id : connections.some(e => e.page === p.route)) : eligiblePages;
  const tables = focus && selected ? eligibleTables.filter(t => selected.kind === 'table' ? t.name === selected.id : connections.some(e => e.table === t.name)) : eligibleTables;
  const groups = [...new Set(eligiblePages.map(p => p.route.split('/')[1] || 'Home'))].sort();
  async function checkSchema() {
    setChecking(true); setSchemaStatus('Checking connected database…');
    try {
      const response = await fetch('/api/admin/data-map/schema', { cache: 'no-store' });
      if (!response.ok) throw new Error('Schema unavailable');
      const result = await response.json() as LiveSchema;
      setLive(result);
      const names = new Set(result.columns.map(c => c.table));
      const missing = declaredMap.tables.filter(t => !names.has(t.name)).length;
      const extra = [...names].filter(n => !declaredMap.tables.some(t => t.name === n)).length;
      setSchemaStatus(`Connected · ${names.size} tables/views · ${missing} declared tables absent/not visible · ${extra} live only · ${new Date(result.checkedAt).toLocaleTimeString()}`);
    } catch { setSchemaStatus('Schema check failed. Code map remains available.'); }
    finally { setChecking(false); }
  }
  function exportAnnotations() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(manual, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'mfhub-data-map-annotations.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (view === 'visual') return <div className="flex flex-col gap-3 py-3 lg:h-full lg:min-h-0">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold tracking-tighter">Data<span className="font-medium text-brand">Map</span></h1><p className="mt-1 text-xs text-muted-foreground">Page controls → stored fields → where they are used</p></div><div className="flex gap-2"><button type="button" className={`${control} text-brand`} aria-pressed>Visual field flow</button><button type="button" className={control} onClick={() => setView('tables')}>Table lineage</button><button type="button" className={control} onClick={() => setView('pages')}>Page map</button></div></header>
    <VisualFlow map={map} storageKey={`${storageKey}:visual`}/>
  </div>;
  return <div className="flex flex-col gap-3 py-3 lg:h-full lg:min-h-0">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-3xl font-bold tracking-tighter">Data<span className="font-medium text-brand">Map</span></h1><p className="mt-1 text-xs text-muted-foreground">{map.tables.length} tables · {map.pages.length} pages · {map.processes?.length ?? 0} API / job / script entry points</p></div>
      <div className="max-w-lg text-right"><button type="button" disabled={checking} onClick={checkSchema} className={`${control} inline-flex items-center gap-2 disabled:opacity-50`}><Database size={14}/>{checking ? 'Checking…' : 'Check live schema'}</button><p role="status" className="mt-1 text-[10px] text-muted-foreground">{schemaStatus}</p></div>
    </header>
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <div className="flex rounded-lg border p-0.5"><button type="button" aria-pressed={view === 'tables'} className={`${control} border-0 ${view === 'tables' ? 'bg-muted text-brand' : ''}`} onClick={() => { setView('tables'); setSelected(tableFocus ? { kind: 'table', id: tableFocus } : null); }}>Table lineage</button><button type="button" aria-pressed={view === 'pages'} className={`${control} border-0 ${view === 'pages' ? 'bg-muted text-brand' : ''}`} onClick={() => { setView('pages'); setSelected(null); setFocus(false); }}>Page map</button></div>
      <button type="button" className={control} onClick={() => setView('visual')}>Visual field flow</button>
      <label className="relative min-w-48 flex-1"><Search size={14} className="absolute left-2 top-2"/><input aria-label="Search pages and tables" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a table, field or page…" className={`${control} w-full pl-7`}/></label>
      <select aria-label="Filter operation" className={control} value={operation} onChange={e => setOperation(e.target.value)}><option value="ALL">All operations</option>{OPERATIONS.map(op => <option key={op}>{op}</option>)}</select>
      <button type="button" className={control} onClick={() => { setFocus(false); setSelected(null); setTableFocus(null); setSearch(''); setOperation('ALL'); }}>{view === 'tables' ? 'All tables' : 'Show all pages'}</button>
      {view === 'pages' ? <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={focus} disabled={!selected} onChange={e => setFocus(e.target.checked)}/>Focus selection</label> : <button type="button" aria-pressed={showInspector} className={control} onClick={() => setShowInspector(!showInspector)}>Notes & evidence</button>}
      <div className="flex gap-2 px-1 text-[10px]">{OPERATIONS.map(op => <span key={op}><span style={{ color: COLORS[op] }}>●</span> {op}</span>)}</div>
    </div>
    <div className={`grid gap-3 lg:min-h-0 lg:flex-1 ${view === 'pages' || showInspector ? 'lg:grid-cols-[190px_minmax(320px,1fr)_300px]' : 'lg:grid-cols-[210px_minmax(0,1fr)]'}`}>
      {view === 'tables' ? <nav aria-label="Table hierarchy" className="max-h-72 overflow-auto rounded-xl border bg-card p-2 lg:max-h-none"><p className="px-1 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Supabase tables · {eligibleTables.length}</p>{eligibleTables.map(t => <button type="button" key={t.name} aria-label={`Inspect table ${t.name}`} title={t.name} onClick={() => select({ kind: 'table', id: t.name })} className={`mb-1 flex w-full items-start gap-2 rounded px-2 py-2 text-left text-xs hover:bg-muted ${tableFocus === t.name ? 'bg-muted text-brand' : ''}`}><Database size={13} className="mt-0.5 shrink-0"/><span className="min-w-0 break-all">{t.name}<span className="mt-0.5 block text-[9px] text-muted-foreground">{t.columns.length} fields</span></span></button>)}</nav> :
      <nav aria-label="Page hierarchy" className="max-h-72 overflow-auto rounded-xl border bg-card p-2 lg:max-h-none">
        <p className="px-1 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Page tree</p>
        {groups.map(group => <details key={group} open className="mb-1"><summary className="cursor-pointer rounded px-1 py-1.5 text-xs font-bold">/{group === 'Home' ? '' : group} <span className="font-normal text-muted-foreground">{eligiblePages.filter(p => (p.route.split('/')[1] || 'Home') === group).length}</span></summary>
          {eligiblePages.filter(p => (p.route.split('/')[1] || 'Home') === group).map(p => <button type="button" key={p.route} aria-label={`Inspect ${p.route}`} title={p.route} onClick={() => select({ kind: 'page', id: p.route })} className={`block w-full truncate rounded py-1.5 pr-1 text-left text-[11px] hover:bg-muted ${selected?.id === p.route ? 'bg-muted text-brand' : 'text-muted-foreground'}`} style={{ paddingLeft: Math.min(36, 8 + (p.route.split('/').length - 2) * 8) }}>{p.route.split('/').slice(2).join('/') || 'Overview'}</button>)}
        </details>)}
        {!eligiblePages.length && <p className="p-2 text-xs text-muted-foreground">No matching pages.</p>}
      </nav>}
      {view === 'tables' ? <TableLineage key={tableFocus ?? 'overview'} map={map} tables={eligibleTables} tableName={tableFocus} manual={manual} operation={operation} onSelectTable={name => select({ kind: 'table', id: name })}/> : <Graph pages={pages} tables={tables} edges={edges} manual={annotations} selected={selected} select={select} connect={connect}/>}
      {(view === 'pages' || showInspector) && <aside className="min-h-0 overflow-auto rounded-xl border bg-card p-3">
        <Inspector map={map} selected={selected} edges={edges} manual={annotations} live={live} remove={id => persist(manual.filter(a => a.id !== id))}/>
        <details open className="mt-5 border-t pt-3"><summary className="cursor-pointer text-xs font-bold">Connect a page to a table</summary>
          <p className="my-2 text-[10px] text-muted-foreground">Annotations document relationships; they do not change app queries. They are saved in this browser. Drag a page’s dotted connector onto a table, or use this form. Dragging uses the operation selected below.</p>
          <form className="space-y-2" onSubmit={e => { e.preventDefault(); connect(annotationPage, annotationTable); }}>
            <label className="block text-[10px]">Page<select aria-label="Annotation page" className={`${control} mt-1 w-full`} value={annotationPage} onChange={e => setAnnotationPage(e.target.value)}>{map.pages.map(p => <option key={p.route} value={p.route}>{p.route}</option>)}</select></label>
            <label className="block text-[10px]">Table<select aria-label="Annotation table" className={`${control} mt-1 w-full`} value={annotationTable} onChange={e => setAnnotationTable(e.target.value)}>{map.tables.map(t => <option key={t.name}>{t.name}</option>)}</select></label>
            <label className="block text-[10px]">Operation<select aria-label="Annotation operation" className={`${control} mt-1 w-full`} value={annotationOperation} onChange={e => setAnnotationOperation(e.target.value as Operation)}>{OPERATIONS.map(op => <option key={op}>{op}</option>)}</select></label>
            <textarea aria-label="Annotation note" placeholder="Optional note" maxLength={500} value={note} onChange={e => setNote(e.target.value)} className={`${control} w-full`}/>
            <button type="submit" disabled={!loaded} className="w-full rounded-lg bg-brand-solid px-3 py-2 text-xs font-bold text-white hover:bg-brand-solid-hover disabled:opacity-50">Save connection</button>
          </form>
          <div className="mt-2 flex gap-2"><button type="button" onClick={exportAnnotations} className={`${control} inline-flex items-center gap-1`}><Download size={12}/>Export</button><label className={`${control} inline-flex cursor-pointer items-center gap-1`}><Upload size={12}/>Import<input aria-label="Import annotations" type="file" accept="application/json,.json" className="sr-only" onChange={async e => {
            const file = e.target.files?.[0]; e.target.value = '';
            if (!file) return;
            try {
              if (file.size > 1_000_000) throw new Error('File too large');
              const imported = parseAnnotations(JSON.parse(await file.text()), map);
              const merged = [...manual, ...imported.filter(a => !manual.some(m => m.id === a.id || (m.page === a.page && m.table === a.table && m.operation === a.operation)))];
              if (merged.length > 1000) throw new Error('Too many annotations');
              persist(merged);
            } catch { setStatus('Import failed. Use a valid Data Map export under 1 MB and 1,000 annotations.'); }
          }}/></label></div>
          <p role="status" className="mt-2 text-[10px] text-muted-foreground">{status}</p>
        </details>
      </aside>}
    </div>
    <footer className="text-[10px] leading-relaxed text-muted-foreground">Code snapshot: {new Date(map.generatedAt).toLocaleString()} · Select a node to reveal connections. Drag empty canvas to pan; use +/− to zoom. Solid lines are static possibilities, dashed lines are your annotations. Shared layout/auth queries are excluded. Dynamic requests and SQL may need review. Regenerate with <code>npm run data-map:generate</code> after source changes.</footer>
  </div>;
}

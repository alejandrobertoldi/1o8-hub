'use client';
import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Database, FileCode2, Layers, Minus, Plus, Scan } from 'lucide-react';
import type { Annotation, DataMap, Edge, Table } from '@/lib/data-map/types';
import { COLORS } from './graph';

type Flow = { actor: string; kind: string; edges: Edge[]; manual: Annotation[]; warnings: string[] };
const branches = [
  { name: 'Data sources', hint: 'Where data is created or changed', ops: ['CREATE', 'UPDATE'], color: 'var(--brand-green)' },
  { name: 'Data destinations', hint: 'Where stored data is read', ops: ['READ'], color: '#3b82f6' },
  { name: 'Data removal', hint: 'Where rows can be deleted', ops: ['DELETE'], color: 'var(--brand-red)' },
];
function FlowCard({ flow, field }: { flow: Flow; field: string }) {
  const [open, setOpen] = useState(false);
  const usages = flow.edges.flatMap(e => e.evidence);
  const columns = [...new Set(usages.flatMap(e => e.fields?.columns ?? []))].sort();
  const filters = [...new Set(usages.flatMap(e => e.fields?.filters ?? []))].sort();
  const unknown = !usages.length || usages.some(e => !e.fields || e.fields.unknown);
  const operations = [...new Set([...flow.edges, ...flow.manual].map(e => e.operation))];
  return <article className={`relative rounded-xl border bg-card shadow-sm ${flow.manual.length && !flow.edges.length ? 'border-dashed' : ''}`}>
    <button type="button" aria-label={`${open ? 'Collapse' : 'Expand'} ${flow.actor}`} aria-expanded={open} className="flex w-full items-start gap-2 p-3 text-left" onClick={() => setOpen(!open)}>
      <FileCode2 size={15} className="mt-0.5 shrink-0 text-muted-foreground"/>
      <span className="min-w-0 flex-1"><span className="block break-words text-xs font-semibold">{flow.actor}</span><span className="mt-1 block text-[10px] text-muted-foreground">{flow.kind} · {unknown ? 'Fields need review' : `${columns.length} fields`} {flow.manual.length > 0 ? '· annotation' : ''}</span>
        <span className="mt-1 flex flex-wrap gap-2 text-[9px]">{operations.map(op => <span key={op}><span style={{ color: COLORS[op] }}>●</span> {op}</span>)}</span>
      </span>{open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
    </button>
    {open && <div className="space-y-3 border-t px-3 py-3 text-[11px]">
      <div><p className="mb-1 text-[9px] font-bold uppercase text-muted-foreground">{operations.every(op => op === 'DELETE') ? 'Whole rows removed' : 'Fields involved in queries'}</p>
        <div className="flex flex-wrap gap-1">{columns.map(c => <span key={c} className={`break-all rounded border px-1.5 py-0.5 ${field === c ? 'border-brand text-brand' : 'bg-background'}`}>{c}</span>)}</div>
        {usages.some(e => e.fields?.allColumns) && <p className="mt-1 text-muted-foreground">Includes an all-column read.</p>}
        {unknown && <p className="mt-1 text-muted-foreground">Some fields are unresolved or supplied dynamically.{field ? ' This path may also use the selected field.' : ''}</p>}
        {!columns.length && !unknown && !operations.includes('DELETE') && <p className="text-muted-foreground">No table columns identified in the payload.</p>}
      </div>
      {filters.length > 0 && <div><p className="mb-1 text-[9px] font-bold uppercase text-muted-foreground">Filter / join / grouping fields</p><div className="flex flex-wrap gap-1">{filters.map(c => <span key={c} className="break-all rounded border px-1.5 py-0.5">{c}</span>)}</div></div>}
      <details><summary className="cursor-pointer text-muted-foreground">Source evidence · {usages.length} queries</summary>{flow.edges.map((e, i) => <div key={i} className="mt-2 space-y-1 border-l pl-2"><span className="text-[9px] font-bold">{e.operation}</span>{e.evidence.map((s, j) => <div key={j}><p className="break-all font-mono text-[9px]">{s.file}:{s.line}</p><p className="break-words text-[10px] text-muted-foreground">{s.fields?.columns.join(', ') || (s.fields?.unknown ? 'Dynamic fields' : 'Row operation')}</p><details className="mt-1"><summary className="cursor-pointer text-[10px]">Trace path</summary>{s.via.map((v, k) => <p key={k} className="break-all text-[9px] text-muted-foreground">{v}</p>)}</details></div>)}</div>)}</details>
      {flow.manual.map(a => <p key={a.id} className="break-words text-muted-foreground">Manual annotation: {a.note || 'No field mapping supplied'}</p>)}
      {flow.warnings.length > 0 && <details><summary className="cursor-pointer text-muted-foreground">Review warnings ({flow.warnings.length})</summary>{flow.warnings.map((w, i) => <p key={i} className="mt-1 break-words text-[10px]">{w}</p>)}</details>}
    </div>}
  </article>;
}

export function TableLineage({ map, tables, tableName, manual, operation, onSelectTable }: {
  map: DataMap; tables: Table[]; tableName: string | null; manual: Annotation[]; operation: string; onSelectTable: (name: string) => void;
}) {
  const [expandedFields, setExpandedFields] = useState(false);
  const [field, setField] = useState('');
  const [fieldSearch, setFieldSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const table = tables.find(t => t.name === tableName);
  const allEdges = useMemo(() => [...map.edges, ...(map.processEdges ?? [])], [map.edges, map.processEdges]);
  const actors = useMemo(() => new Map([...map.pages.map(p => ({ ...p, kind: 'Page' })), ...(map.processes ?? []).map(p => ({ ...p, kind: p.kind === 'job' ? 'Background job' : p.kind === 'script' ? 'Script' : 'API endpoint' }))].map(p => [p.route, p])), [map.pages, map.processes]);
  const selectedEdges = allEdges.filter(e => e.table === tableName && (operation === 'ALL' || operation === e.operation));
  const relevant = selectedEdges.filter(e => !field || e.evidence.some(s => !s.fields || s.fields.unknown || s.fields.columns.includes(field) || s.fields.filters.includes(field)));
  const annotated = manual.filter(a => a.table === tableName && (operation === 'ALL' || a.operation === operation));
  const pick = (name: string) => { setField(''); setFieldSearch(''); setExpandedFields(false); onSelectTable(name); };
  return <div className="flex min-h-[460px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background lg:min-h-0">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-3 py-2 text-xs">
      <span>{table ? 'Table → flow branches → pages / processes → fields' : 'Supabase → expand a table to follow its data'}</span>
      <div className="flex items-center gap-2"><button type="button" aria-label="Zoom out" className="rounded border p-1.5" onClick={() => setZoom(z => Math.max(.5, z-.1))}><Minus size={14}/></button><span>{Math.round(zoom*100)}%</span><button type="button" aria-label="Zoom in" className="rounded border p-1.5" onClick={() => setZoom(z => Math.min(1.5, z+.1))}><Plus size={14}/></button><button type="button" aria-label="Fit hierarchy width" className="rounded border p-1.5" onClick={() => setZoom(Math.max(.5, Math.min(1, (viewport.current?.clientWidth ?? 1000)/(content.current?.offsetWidth ?? 1000))))}><Scan size={14}/></button></div>
    </div>
    <div ref={viewport} aria-label="Table lineage canvas" role="region" tabIndex={0} className="relative flex-1 overflow-auto overscroll-contain" style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
      onPointerDown={e => { if ((e.target as HTMLElement).closest('button,input,summary,select,a') || e.pointerType === 'touch') return; pan.current = { x: e.clientX, y: e.clientY, left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (pan.current) { e.currentTarget.scrollLeft = pan.current.left-(e.clientX-pan.current.x); e.currentTarget.scrollTop = pan.current.top-(e.clientY-pan.current.y); } }}
      onPointerUp={() => { pan.current = null; }} onPointerCancel={() => { pan.current = null; }}>
      <div ref={content} className="mx-auto min-w-[820px] max-w-[1500px] p-4" style={{ zoom }}>
        <div className="mx-auto flex w-fit items-center gap-2 rounded-lg border bg-card px-4 py-2 text-xs font-bold"><Database size={16} className="text-brand"/>Supabase <span className="font-normal text-muted-foreground">public schema</span></div>
        <div className="mx-auto h-4 w-px bg-border"/>
        {!table ? <>
          <p className="mb-5 text-center text-xs text-muted-foreground">{tables.length} tables · choose a card to trace where its data comes from and where it goes</p>
          <div className="grid grid-cols-3 gap-4">{tables.map(t => {
            const links = allEdges.filter(e => e.table === t.name);
            const sources = new Set(links.filter(e => e.operation === 'CREATE' || e.operation === 'UPDATE').map(e => e.page)).size;
            const destinations = new Set(links.filter(e => e.operation === 'READ').map(e => e.page)).size;
            return <button key={t.name} type="button" aria-label={`Table ${t.name}`} className="rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-brand" onClick={() => pick(t.name)}><div className="mb-2 flex items-center gap-2"><Layers size={15} className="shrink-0 text-brand"/><span className="min-w-0 break-all text-xs font-bold">{t.name}</span><ChevronRight size={14} className="ml-auto shrink-0"/></div><p className="text-[10px] text-muted-foreground">{t.columns.length} fields</p><p className="mt-2 text-[10px]">{sources} sources · {destinations} destinations</p>{!links.length && <p className="mt-1 text-[10px] text-muted-foreground">No resolved paths · review needed</p>}</button>;
          })}</div>
          {!tables.length && <p className="text-center text-sm">No tables match the current search or operation filter.</p>}
        </> : <>
          <article className="mx-auto w-[440px] rounded-xl border border-brand bg-card p-3 shadow-sm">
            <div className="flex items-center gap-2"><Database size={20} className="text-brand"/><h2 className="min-w-0 flex-1 break-all text-base font-bold">{table.name}</h2><span className="text-[10px] text-muted-foreground">{table.columns.length} fields</span></div>
            {table.liveOnly && <p className="mt-2 text-[10px] text-muted-foreground">Live database table/view with no declaration in the app schema. No code lineage has been resolved.</p>}
            <button type="button" aria-label={expandedFields ? 'Collapse table fields' : 'Expand table fields'} aria-expanded={expandedFields} className="mt-3 flex w-full items-center justify-between rounded border px-2 py-1.5 text-xs" onClick={() => setExpandedFields(!expandedFields)}>Fields {field && <span className="text-brand">Tracing {field}</span>}{expandedFields ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</button>
            {expandedFields && <div className="mt-2"><input aria-label="Find table field" className="w-full rounded border bg-background px-2 py-1.5 text-xs" placeholder="Find a field to trace…" value={fieldSearch} onChange={e => setFieldSearch(e.target.value)}/><button type="button" className="my-2 text-[10px] underline" onClick={() => setField('')}>Show all fields</button><div className="max-h-52 overflow-auto">{table.columns.filter(c => c.name.toLowerCase().includes(fieldSearch.toLowerCase())).map(c => <button type="button" key={c.name} aria-label={`Trace field ${c.name}`} aria-pressed={field === c.name} onClick={() => setField(field === c.name ? '' : c.name)} className={`flex w-full items-center justify-between gap-2 border-b px-1 py-1.5 text-left text-[11px] ${field === c.name ? 'bg-muted text-brand' : ''}`}><span className="break-all">{c.name}</span><span className="text-[9px] text-muted-foreground">{c.type}</span></button>)}</div></div>}
          </article>
          <div className="mx-auto h-5 w-px bg-border"/>
          <div className="relative grid grid-cols-3 items-start gap-5 pt-6 before:absolute before:left-[16.66%] before:right-[16.66%] before:top-0 before:border-t before:border-border">
            {branches.map(branch => {
              const flowEdges = relevant.filter(e => branch.ops.includes(e.operation));
              const notes = annotated.filter(a => branch.ops.includes(a.operation));
              const flows: Flow[] = [...new Set([...flowEdges, ...notes].map(e => e.page))].map(actor => ({ actor, kind: actors.get(actor)?.kind ?? 'Manual', warnings: actors.get(actor)?.unresolved ?? [], edges: flowEdges.filter(e => e.page === actor), manual: notes.filter(a => a.page === actor) }));
              const categories = ['Page', 'Background job', 'Script', 'API endpoint', 'Manual'].filter(kind => flows.some(f => f.kind === kind));
              return <section role="region" aria-label={branch.name} key={branch.name} className="relative min-w-0 before:absolute before:-top-6 before:left-1/2 before:h-6 before:border-l before:border-border">
                <details open><summary className="cursor-pointer rounded-xl border bg-card p-3 text-xs font-bold shadow-sm" style={{ borderTop: `3px solid ${branch.color}` }}>{branch.name} <span className="font-normal text-muted-foreground">({flows.length})</span><span className="mt-1 block text-[10px] font-normal text-muted-foreground">{branch.hint}</span></summary>
                  <div className="ml-3 mt-3 space-y-3 border-l border-border pl-3">{categories.map(kind => <details key={kind} open={kind === 'Page' || kind === 'Background job'}><summary className="mb-2 cursor-pointer text-[10px] font-semibold">{kind === 'Page' ? 'Pages' : kind === 'API endpoint' ? 'API entry points' : kind + 's'} · {flows.filter(f => f.kind === kind).length}</summary><div className="space-y-2">{flows.filter(f => f.kind === kind).map(flow => <FlowCard key={flow.actor} flow={flow} field={field}/>)}</div></details>)}
                    {!flows.length && <p className="py-2 text-[11px] text-muted-foreground">No resolved {branch.name.toLowerCase()} {field ? `for ${field}` : 'in the scanned code'}. Dynamic paths may be missing.</p>}
                  </div>
                </details>
              </section>;
            })}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-[10px] text-muted-foreground">These are query-level code paths. API entry points may also appear through the pages that call them. Fields shown are query inputs/references, not proof of values rendered on screen or transferred to an external system. Unresolved SQL, database triggers and external writers need separate review.</p>
        </>}
      </div>
    </div>
  </div>;
}

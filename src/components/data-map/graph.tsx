'use client';
import { useRef, useState } from 'react';
import { Database, FileCode2, Grip, Minus, Plus, Scan } from 'lucide-react';
import type { Page, Table, Edge, Annotation } from '@/lib/data-map/types';

export const COLORS = { READ: '#3b82f6', CREATE: '#10b981', UPDATE: '#f59e0b', DELETE: '#ef4444' };
export type Selection = { kind: 'page' | 'table'; id: string } | null;
export function Graph({ pages, tables, edges, manual, selected, select, connect }: {
  pages: Page[]; tables: Table[]; edges: Edge[]; manual: Annotation[]; selected: Selection;
  select: (s: Selection) => void; connect: (page: string, table: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const height = Math.max(450, 95 + Math.max(pages.length, tables.length) * 78);
  const width = 930;
  const pageY = new Map(pages.map((p, i) => [p.route, 86 + i * 78]));
  const tableY = new Map(tables.map((t, i) => [t.name, 86 + i * 78]));
  const lines = [...edges.map(e => ({ ...e, manual: false })), ...manual.map(a => ({ ...a, manual: true }))];
  return <div className="relative flex min-h-[460px] flex-1 flex-col overflow-hidden rounded-xl border bg-background lg:min-h-0">
    <div className="flex items-center justify-between border-b bg-card px-3 py-2 text-xs">
      <span>{pages.length} pages · {tables.length} tables</span>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Zoom out" className="rounded border p-1.5" onClick={() => setZoom(z => Math.max(.35, z - .15))}><Minus size={14}/></button>
        <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" className="rounded border p-1.5" onClick={() => setZoom(z => Math.min(1.8, z + .15))}><Plus size={14}/></button>
        <button type="button" aria-label="Fit canvas width" className="rounded border p-1.5" onClick={() => setZoom(Math.min(1, (viewport.current?.clientWidth ?? width) / width))}><Scan size={14}/></button>
      </div>
    </div>
    <div ref={viewport} role="region" aria-label="Page and database canvas" tabIndex={0}
      className="relative flex-1 overflow-auto overscroll-contain" style={{ touchAction: 'pan-x pan-y', backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
      onPointerDown={e => {
        if ((e.target as HTMLElement).closest('button') || e.pointerType === 'touch') return;
        pan.current = { x: e.clientX, y: e.clientY, left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop };
        e.currentTarget.setPointerCapture(e.pointerId);
      }} onPointerMove={e => {
        if (!pan.current) return;
        e.currentTarget.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
        e.currentTarget.scrollTop = pan.current.top - (e.clientY - pan.current.y);
      }} onPointerUp={() => { pan.current = null; }} onPointerCancel={() => { pan.current = null; }}>
      <div style={{ width: width * zoom, height: height * zoom }}>
        <div className="relative origin-top-left" style={{ width, height, transform: `scale(${zoom})` }}>
          <div className="absolute left-8 top-5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Application pages</div>
          <div className="absolute left-[605px] top-5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Supabase · public schema</div>
          <svg width={width} height={height} className="pointer-events-none absolute inset-0" aria-hidden="true">
            <defs>{Object.entries(COLORS).map(([op, color]) => <marker key={op} id={`arrow-${op}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={color}/></marker>)}</defs>
            {pages.map((p, i) => i > 0 && <path key={p.route} d={`M 18 ${pageY.get(pages[i-1].route)} V ${pageY.get(p.route)} H 32`} fill="none" stroke="var(--border)" strokeWidth={2}/>)}
            {lines.map((e, i) => {
              const y1 = pageY.get(e.page), y2 = tableY.get(e.table);
              if (y1 === undefined || y2 === undefined) return null;
              const offset = (['READ', 'CREATE', 'UPDATE', 'DELETE'].indexOf(e.operation) - 1.5) * 8;
              return <g key={`${e.page}:${e.table}:${e.operation}:${i}`}>
                <path d={`M 340 ${y1+offset} C 445 ${y1+offset}, 480 ${y2+offset}, 595 ${y2+offset}`} fill="none" stroke={COLORS[e.operation]} strokeWidth={2} strokeDasharray={e.manual ? '6 5' : undefined} markerEnd={e.operation !== 'READ' ? `url(#arrow-${e.operation})` : undefined} markerStart={e.operation === 'READ' ? `url(#arrow-${e.operation})` : undefined}/>
              </g>;
            })}
          </svg>
          {pages.map(p => <div key={p.route} className={`absolute flex h-14 w-[310px] items-center rounded-lg border bg-card shadow-sm ${selected?.kind === 'page' && selected.id === p.route ? 'border-brand ring-1 ring-brand' : ''}`} style={{ left: 32, top: (pageY.get(p.route) ?? 0)-28 }}>
            <button type="button" aria-label={`Page ${p.route}`} onClick={() => select({ kind: 'page', id: p.route })} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left">
              <FileCode2 size={15} className="shrink-0 text-brand"/><span className="min-w-0"><span className="block truncate text-xs font-semibold" title={p.route}>{p.route}</span><span className="text-[10px] text-muted-foreground">{p.unresolved.length ? `${p.unresolved.length} items to review` : 'Page route'}</span></span>
            </button>
            <button type="button" draggable aria-label={`Drag connection from ${p.route}`} title="Drag to a table to add an annotation" onDragStart={e => { e.dataTransfer.setData('application/x-mfhub-page', p.route); e.dataTransfer.effectAllowed = 'link'; }} className="cursor-crosshair rounded-full border border-brand p-1.5 text-brand"><Grip size={13}/></button>
          </div>)}
          {tables.map(t => <button key={t.name} type="button" aria-label={`Table ${t.name}`} onClick={() => select({ kind: 'table', id: t.name })}
            onDragOver={e => { if (e.dataTransfer.types.includes('application/x-mfhub-page')) { e.preventDefault(); e.dataTransfer.dropEffect = 'link'; } }}
            onDrop={e => { e.preventDefault(); const page = e.dataTransfer.getData('application/x-mfhub-page'); if (page) connect(page, t.name); }}
            className={`absolute flex h-14 w-[305px] items-center gap-2 rounded-lg border bg-card px-3 text-left shadow-sm ${selected?.kind === 'table' && selected.id === t.name ? 'border-brand ring-1 ring-brand' : ''}`} style={{ left: 595, top: (tableY.get(t.name) ?? 0)-28 }}>
            <Database size={15} className="shrink-0 text-muted-foreground"/><span className="min-w-0"><span className="block truncate text-xs font-semibold">{t.name}</span><span className="text-[10px] text-muted-foreground">{t.columns.length} declared columns</span></span>
          </button>)}
          {!pages.length && !tables.length && <p className="absolute left-8 top-20 text-sm text-muted-foreground">No matches. Clear search or change the operation filter.</p>}
        </div>
      </div>
    </div>
  </div>;
}

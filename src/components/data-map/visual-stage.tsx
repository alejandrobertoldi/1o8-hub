'use client';
import { useRef, useState } from 'react';
import { Grip, ImageIcon, Minus, Plus, Scan } from 'lucide-react';
import { getHotspot, type Binding, type Hotspot, type Transfer, type VisualField, type VisualWorkspace } from '@/lib/data-map/visual-model';

const WIDTH = 480;
type Point = { x: number; y: number };
export function VisualStage({ fields, bindings, transfers, workspace, routes, selected, placing, onSelect, onMove, onPlace, onField, onRoute }: {
  fields: VisualField[]; bindings: Binding[]; transfers: Transfer[]; workspace: VisualWorkspace; routes: string[]; selected: string; placing: boolean;
  onSelect: (b: Binding) => void; onMove: (id: string, p: Point) => void; onPlace: (id: string, hotspot: Hotspot) => void; onField: (id: string) => void; onRoute: (route: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(.65);
  const [pan, setPan] = useState({ x: 18, y: 24 });
  const [moving, setMoving] = useState<{ id: string; p: Point } | null>(null);
  const gesture = useRef<{ id: string; start: Point; original: Point } | null>(null);
  const draw = useRef<{ binding: string; shotId: string; start: Point } | null>(null);
  const db = moving?.id === 'storage' ? moving.p : workspace.positions.storage ?? { x: 590, y: 130 };
  const rank = (route: string) => route === '/variations/[id]' ? -2 : route === '/products/[id]' ? -1 : 0;
  const ordered = [...routes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const cards = ordered.map((route, index) => {
    const shot = workspace.shots.find(s => s.id === workspace.activeShots[route]) ?? workspace.shots.find(s => s.route === route);
    const imageHeight = shot ? WIDTH * shot.height / shot.width : 260;
    const position = moving?.id === route ? moving.p : workspace.positions[route] ?? { x: index % 2 ? 1000 : 0, y: Math.floor(index / 2) * 700 };
    const controls = bindings.filter(b => b.route === route);
    return { route, shot, imageHeight, position, controls, height: 48 + imageHeight + controls.length * 30 + 38 };
  });
  const fieldPoint = (field: string, side: 'left' | 'right'): Point => ({ x: db.x + (side === 'left' ? 0 : 310), y: db.y + 72 + fields.findIndex(f => f.id === field) * 62 });
  const path = (a: Point, b: Point) => `M ${a.x} ${a.y} C ${a.x + (b.x > a.x ? 100 : -100)} ${a.y}, ${b.x - (b.x > a.x ? 100 : -100)} ${b.y}, ${b.x} ${b.y}`;
  const lines = cards.flatMap(card => card.controls.map((b, i) => {
    const h = getHotspot(workspace.hotspots, b.id, card.shot?.id);
    const pinned = h && !h.review && card.shot?.id === h.shotId;
    const left = card.position.x < db.x;
    const pagePoint = pinned ? { x: card.position.x + (left ? h.x + h.w : h.x) * WIDTH, y: card.position.y + 48 + (h.y + h.h / 2) * card.imageHeight } : { x: card.position.x + (left ? WIDTH : 0), y: card.position.y + 48 + card.imageHeight + i * 30 + 15 };
    const storePoint = fieldPoint(b.field, left ? 'left' : 'right');
    return { b, a: b.direction === 'write' ? pagePoint : storePoint, z: b.direction === 'write' ? storePoint : pagePoint, pinned };
  }));
  const start = (event: React.PointerEvent, id: string, original: Point) => {
    if (event.button !== 0) return;
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id, original, start: { x: event.clientX, y: event.clientY } };
  };
  const move = (event: React.PointerEvent) => {
    const g = gesture.current; if (!g) return;
    const scale = g.id === 'pan' ? 1 : zoom;
    const p = { x: g.original.x + (event.clientX - g.start.x) / scale, y: g.original.y + (event.clientY - g.start.y) / scale };
    if (g.id === 'pan') setPan(p); else setMoving({ id: g.id, p });
  };
  const end = () => { if (moving) onMove(moving.id, moving.p); setMoving(null); gesture.current = null; };
  const handle = (id: string, p: Point) => ({ onPointerDown: (e: React.PointerEvent) => start(e, id, p), onPointerMove: move, onPointerUp: end, onPointerCancel: end, onKeyDown: (e: React.KeyboardEvent) => { const d = ({ ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] } as Record<string, number[]>)[e.key]; if (d) { e.preventDefault(); onMove(id, { x: p.x + d[0], y: p.y + d[1] }); } } });
  const pointOnImage = (e: React.PointerEvent): Point => { const r = e.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(.999, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(.999, (e.clientY - r.top) / r.height)) }; };
  return <section className="relative flex min-h-[540px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-muted/30 lg:min-h-0" aria-label="Visual field canvas">
    <div className="z-20 flex items-center justify-between gap-2 border-b bg-card px-3 py-2 text-xs"><span>{routes.length} pages · {fields.length} stored fields</span><div className="flex items-center gap-2"><button type="button" aria-label="Zoom out field canvas" onClick={() => setZoom(z => Math.max(.2, z - .1))}><Minus size={15}/></button><span>{Math.round(zoom * 100)}%</span><button type="button" aria-label="Zoom in field canvas" onClick={() => setZoom(z => Math.min(1.5, z + .1))}><Plus size={15}/></button><button type="button" aria-label="Fit field canvas" onClick={() => { setZoom(Math.min(1, ((viewport.current?.clientWidth ?? 1000) - 40) / 1480)); setPan({ x: 20, y: 30 }); }}><Scan size={15}/></button></div></div>
    <div ref={viewport} className="relative flex-1 touch-none overflow-hidden bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:18px_18px]" onPointerDown={e => { if (e.target === e.currentTarget) start(e, 'pan', pan); }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <svg className="pointer-events-none absolute z-10 overflow-visible" width="1" height="1" aria-label="Field flow arrows">
          <defs>{[['read', '#2563eb'], ['write', '#16a34a'], ['copy', '#8b5cf6']].map(([id, color]) => <marker key={id} id={`visual-${id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill={color}/></marker>)}</defs>
          {lines.map(({ b, a, z, pinned }) => <path key={b.id} d={path(a, z)} fill="none" stroke={b.direction === 'write' ? '#16a34a' : '#2563eb'} strokeWidth={selected === b.id ? 4 : 2} opacity={selected && selected !== b.id ? .3 : .9} strokeDasharray={b.status !== 'code' ? '6 4' : undefined} markerEnd={`url(#visual-${b.direction})`}><title>{`${b.label}: ${b.direction === 'write' ? `${b.route} → ${b.field}` : `${b.field} → ${b.route}`}${pinned ? '' : ' · hotspot not placed'}`}</title></path>)}
          {transfers.filter(t => fields.some(f => f.id === t.from) && fields.some(f => f.id === t.to)).map(t => { const a = fieldPoint(t.from, 'right'), b = fieldPoint(t.to, 'right'); return <path key={`${t.from}-${t.to}`} d={`M${a.x} ${a.y} C${a.x + 70} ${a.y},${b.x + 70} ${b.y},${b.x} ${b.y}`} fill="none" stroke="#8b5cf6" strokeWidth="2" markerEnd="url(#visual-copy)"><title>{t.note}</title></path>; })}
        </svg>
        <article className="absolute w-[310px] rounded-xl border bg-card shadow-sm" style={{ left: db.x, top: db.y }}><button type="button" className="flex h-10 w-full cursor-grab items-center gap-2 border-b px-3 text-xs font-bold" aria-label="Move Supabase card" {...handle('storage', db)}><Grip size={14}/>SUPABASE · PUBLIC</button>{fields.map(f => <button key={f.id} type="button" aria-label={`Storage ${f.id}`} onClick={() => onField(f.id)} className="block h-[62px] w-full border-b px-3 text-left last:border-0 hover:bg-muted"><span className="block text-[10px] text-muted-foreground">{f.table} · {f.column}{f.path ? ' · JSON key' : ''}</span><span className="block truncate text-xs font-semibold" title={f.id}>{f.path ?? f.label}</span></button>)}</article>
        {cards.map(card => <article key={card.route} className="absolute overflow-hidden rounded-xl border bg-card shadow-sm" style={{ left: card.position.x, top: card.position.y, width: WIDTH }} aria-label={`Page card ${card.route}`}>
          <div className="flex h-12 items-center justify-between border-b px-3"><button type="button" className="flex cursor-grab items-center gap-2 text-xs font-semibold" aria-label={`Move page ${card.route}`} {...handle(card.route, card.position)}><Grip size={14}/>{card.route}</button><button type="button" className="text-[10px] text-brand" onClick={() => onRoute(card.route)}>Screenshot & fields</button></div>
          <div className={`relative ${placing && card.controls.some(b => b.id === selected) ? 'cursor-crosshair ring-2 ring-inset ring-brand' : ''}`} style={{ height: card.imageHeight }}
            onPointerDown={e => { if (!placing || !card.shot || !card.controls.some(b => b.id === selected)) return; e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); draw.current = { binding: selected, shotId: card.shot.id, start: pointOnImage(e) }; }}
            onPointerUp={e => { const d = draw.current; if (!d) return; e.stopPropagation(); const p = pointOnImage(e); const x = Math.min(d.start.x, p.x), y = Math.min(d.start.y, p.y); onPlace(d.binding, { shotId: d.shotId, x, y, w: Math.min(1 - x, Math.max(.03, Math.abs(p.x - d.start.x))), h: Math.min(1 - y, Math.max(.02, Math.abs(p.y - d.start.y))), review: false }); draw.current = null; }} onPointerCancel={() => { draw.current = null; }}>
            {/* Private browser-local raster data must never pass through a remote image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {card.shot ? <img src={card.shot.src} alt={`${card.route} — ${card.shot.state}`} draggable={false} className="pointer-events-none h-full w-full select-none"/> : <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/40 text-muted-foreground"><ImageIcon size={30}/><p className="text-sm">Screenshot not captured</p><button type="button" className="rounded border bg-card px-3 py-2 text-xs" onClick={() => onRoute(card.route)}>Add screenshot</button></div>}
            {card.controls.map(b => { const h = getHotspot(workspace.hotspots, b.id, card.shot?.id); if (!h || h.shotId !== card.shot?.id) return null; return <button type="button" key={b.id} aria-label={`Hotspot ${b.label}`} title={`${b.label}${h.review ? ' · needs review' : ''}`} onClick={() => onSelect(b)} className={`absolute rounded-sm border-2 ${h.review ? 'border-amber-500 bg-amber-500/10' : b.direction === 'write' ? 'border-green-600 bg-green-500/10' : 'border-blue-600 bg-blue-500/10'} ${placing ? 'pointer-events-none' : ''}`} style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, width: `${h.w * 100}%`, height: `${h.h * 100}%`, boxShadow: selected === b.id ? '0 0 0 2px white' : undefined }}/>; })}
          </div>
          <div>{card.controls.map(b => { const h = getHotspot(workspace.hotspots, b.id, card.shot?.id); return <button type="button" key={b.id} aria-label={`Control ${b.label}`} onClick={() => onSelect(b)} className={`flex h-[30px] w-full items-center gap-2 border-t px-3 text-left text-[11px] ${selected === b.id ? 'bg-muted font-semibold' : ''}`}><span style={{ color: b.direction === 'write' ? '#16a34a' : '#2563eb' }}>●</span><span className="flex-1 truncate">{b.label}</span><span className="text-[9px] text-muted-foreground">{b.status === 'candidate' ? 'Unverified · ' : b.status === 'manual' ? 'Manual · ' : ''}{h && card.shot && h.shotId === card.shot.id ? h.review ? 'Review hotspot' : 'Pinned' : 'Place hotspot'}</span></button>; })}</div>
          <p className="h-[38px] border-t px-3 py-2 text-[9px] text-muted-foreground">{card.shot ? `${card.shot.state} · ${new Date(card.shot.capturedAt).toLocaleDateString()} · ${card.shot.width} × ${card.shot.height}` : 'Connections use control labels until a screenshot hotspot is placed.'}</p>
        </article>)}
      </div>
    </div>
    <p className="border-t bg-card px-3 py-2 text-[10px] text-muted-foreground">Drag the background to pan. Drag card headers to arrange; arrow keys move a focused header. Select a control, then place its hotspot.</p>
  </section>;
}

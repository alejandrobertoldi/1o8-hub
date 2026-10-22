import type { DataMap } from './types';
import { visualFields } from './visual-bindings';

export interface VisualField { id: string; table: string; column: string; path?: string; label: string }
export interface Source { file: string; line: number }
export interface Binding { id: string; route: string; field: string; label: string; direction: 'read' | 'write'; note: string; evidence: Source[]; status: 'code' | 'manual' | 'candidate' }
export interface Transfer { from: string; to: string; note: string; evidence: Source[] }
export interface Shot { id: string; route: string; state: string; url: string; capturedAt: string; src: string; width: number; height: number }
export interface Hotspot { shotId: string; x: number; y: number; w: number; h: number; review: boolean }
export function hotspotKey(bindingId: string, shotId: string): string { return JSON.stringify([bindingId, shotId]); }
export function getHotspot(hotspots: Record<string, Hotspot>, bindingId: string, shotId?: string): Hotspot | undefined {
  if (!shotId) return undefined;
  const pin = hotspots[hotspotKey(bindingId, shotId)] ?? hotspots[bindingId];
  return pin?.shotId === shotId ? pin : undefined;
}
export function removeHotspots(hotspots: Record<string, Hotspot>, bindingId: string, shotId?: string): Record<string, Hotspot> {
  return Object.fromEntries(Object.entries(hotspots).filter(([key, h]) => !((key === bindingId || key === hotspotKey(bindingId, h.shotId)) && (!shotId || h.shotId === shotId))));
}
export interface VisualWorkspace {
  version: 1;
  customFields?: VisualField[];
  shots: Shot[];
  activeShots: Record<string, string>;
  hotspots: Record<string, Hotspot>;
  manual: Binding[];
  positions: Record<string, { x: number; y: number }>;
  coverage: Record<string, { status: 'missing' | 'blocked' | 'needs-record'; note: string; url: string }>;
}
export function emptyWorkspace(): VisualWorkspace { return { version: 1, shots: [], activeShots: {}, hotspots: {}, manual: [], positions: {}, coverage: {} }; }
export function fieldInventory(map: DataMap, custom: VisualField[] = []): VisualField[] {
  const fields = map.tables.flatMap(t => t.columns.map(c => ({ id: `${t.name}.${c.name}`, table: t.name, column: c.name, label: c.name })));
  const nested = (map.jsonFields ?? []).map(f => ({ ...f, id: `${f.table}.${f.column}.${f.path}` }));
  return [...new Map([...fields, ...nested, ...visualFields, ...custom].filter(f => map.tables.some(t => t.name === f.table && t.columns.some(c => c.name === f.column))).map(f => [f.id, f])).values()];
}
export function traceFields(id: string, transfers: Transfer[]): Set<string> {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of transfers) if (ids.has(t.from) || ids.has(t.to)) {
      if (!ids.has(t.from) || !ids.has(t.to)) changed = true;
      ids.add(t.from); ids.add(t.to);
    }
  }
  return ids;
}
export function queryBindings(map: DataMap, fields: VisualField[]): Binding[] {
  const result = new Map<string, Binding>();
  for (const f of fields) for (const edge of map.edges) {
    if (edge.table !== f.table || edge.operation === 'DELETE' || !map.pages.some(p => p.route === edge.page)) continue;
    const evidence = edge.evidence.filter(e => e.fields?.columns.includes(f.column) || e.fields?.allColumns || e.fields?.unknown);
    if (!evidence.length) continue;
    const direction = edge.operation === 'READ' ? 'read' : 'write';
    const id = `candidate:${edge.page}:${f.id}:${direction}`;
    const previous = result.get(id);
    result.set(id, { id, route: edge.page, field: f.id, direction, label: `Query ${direction} · ${f.path ?? f.column}`, status: 'candidate', note: `Static query candidate only. Access to ${f.table}.${f.column} does not prove ${f.path ? `the JSON key ${f.path} is accessed or ` : ''}a control displays or edits it. Inspect the evidence, then document the actual control below.`, evidence: [...(previous?.evidence ?? []), ...evidence.map(e => ({ file: e.file, line: e.line }))] });
  }
  return [...result.values()];
}
export function localPageUrl(url: string): boolean { return url === '' || (url.startsWith('/') && !url.startsWith('//') && !/[\\\s\u0000-\u001f]/.test(url)); }
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function str(v: unknown, max = 500): v is string { return typeof v === 'string' && v.length <= max; }
function number(v: unknown, min: number, max: number): v is number { return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max; }
/** Validate the entire portable document before replacing any saved workspace. */
export function parseVisualWorkspace(value: unknown, map: DataMap): VisualWorkspace {
  const fail = () => { throw new Error('Invalid visual workspace backup'); };
  if (!object(value) || value.version !== 1 || !Array.isArray(value.shots) || value.shots.length > 500 || !Array.isArray(value.manual) || value.manual.length > 5000) return fail();
  for (const key of ['activeShots', 'hotspots', 'positions', 'coverage']) if (!object(value[key]) || Object.keys(value[key]).length > 10000) return fail();
  const routes = new Set(map.pages.map(p => p.route));
  if (value.customFields !== undefined && (!Array.isArray(value.customFields) || value.customFields.length > 5000)) return fail();
  for (const f of (value.customFields ?? []) as unknown[]) if (!object(f) || !str(f.table) || !str(f.column) || !str(f.path, 300) || !f.path || !str(f.label, 150) || f.id !== `${f.table}.${f.column}.${f.path}` || !map.tables.some(t => t.name === f.table && t.columns.some(c => c.name === f.column && c.type.includes('json')))) return fail();
  const fields = new Set(fieldInventory(map, value.customFields as VisualField[] | undefined).map(f => f.id));
  const shots = new Set<string>();
  let bytes = 0;
  for (const s of value.shots) {
    if (!object(s) || !str(s.id, 200) || !s.id || shots.has(s.id) || !str(s.route) || !routes.has(s.route) || !str(s.state) || !str(s.url, 2000) || !localPageUrl(s.url) || !str(s.capturedAt) || !str(s.src, 15_000_000) || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(s.src) || !number(s.width, 1, 20000) || !number(s.height, 1, 50000)) return fail();
    shots.add(s.id); bytes += s.src.length;
  }
  if (bytes > 100_000_000) return fail();
  for (const [route, id] of Object.entries(value.activeShots as object)) if (!routes.has(route) || !shots.has(id as string) || !value.shots.some(s => s.id === id && s.route === route)) return fail();
  for (const h of Object.values(value.hotspots as object)) if (!object(h) || !shots.has(h.shotId as string) || !number(h.x, 0, 1) || !number(h.y, 0, 1) || !number(h.w, .001, 1) || !number(h.h, .001, 1) || h.x + h.w > 1.001 || h.y + h.h > 1.001 || typeof h.review !== 'boolean') return fail();
  const ids = new Set<string>();
  for (const b of value.manual) {
    if (!object(b) || !str(b.id, 200) || !b.id.startsWith('manual-') || ids.has(b.id) || !routes.has(b.route as string) || !fields.has(b.field as string) || !str(b.label, 150) || !b.label.trim() || !str(b.note, 2000) || !['read', 'write'].includes(b.direction as string) || b.status !== 'manual' || !Array.isArray(b.evidence) || b.evidence.length) return fail();
    ids.add(b.id);
  }
  for (const p of Object.values(value.positions as object)) if (!object(p) || !number(p.x, -10000, 10000) || !number(p.y, -10000, 10000)) return fail();
  for (const [route, c] of Object.entries(value.coverage as object)) if (!routes.has(route) || !object(c) || !['missing', 'blocked', 'needs-record'].includes(c.status as string) || !str(c.note, 2000) || !str(c.url, 2000) || !localPageUrl(c.url)) return fail();
  return value as unknown as VisualWorkspace;
}

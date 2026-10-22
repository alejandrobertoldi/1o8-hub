import { describe, expect, it } from 'vitest';
import { fieldInventory, traceFields, parseVisualWorkspace, emptyWorkspace, queryBindings, hotspotKey, getHotspot, removeHotspots } from './visual-model';
import { visualBindings, visualTransfers } from './visual-bindings';
import type { DataMap } from './types';
const map: DataMap = { generatedAt: '', pages: [{ route: '/products/[id]', file: '', unresolved: [] }], tables: [{ name: 'master', symbol: 'master', columns: [{ name: 'variations', property: 'variations', type: 'jsonb' }] }], edges: [] };
describe('field-level flow', () => {
  it('preserves a control hotspot separately in every screenshot state, including legacy pins', () => {
    const a = { shotId: 'a', x: .1, y: .2, w: .2, h: .1, review: false };
    const b = { ...a, shotId: 'b', x: .6 };
    const hotspots = { control: a, [hotspotKey('control', 'b')]: b };
    expect(getHotspot(hotspots, 'control', 'a')).toEqual(a);
    expect(getHotspot(hotspots, 'control', 'b')).toEqual(b);
    expect(getHotspot(removeHotspots(hotspots, 'control', 'b'), 'control', 'a')).toEqual(a);
    expect(removeHotspots(hotspots, 'control')).toEqual({});
  });
  it('keeps Size isolated from sibling JSON keys and does not label query reads as display bindings', () => {
    expect([...traceFields('master.variations.Size', visualTransfers)]).toEqual(['master.variations.Size']);
    expect(visualBindings.filter(b => b.field === 'master.variations.Size' && b.direction === 'write').map(b => b.route)).toContain('/products/[id]');
    expect(fieldInventory(map).some(f => f.id === 'master.variations.Size')).toBe(true);
  });
  it('traces a copied business code without confusing it with a database UUID', () => {
    const fields = traceFields('master.variations.VariationID', visualTransfers);
    expect(fields.has('variations.code')).toBe(true);
    expect(fields.has('variations.id')).toBe(false);
    expect(traceFields('master.variations.VariationThemeName', visualTransfers).has('variations.theme_attributes')).toBe(true);
  });
  it('does not describe a computed relationship label as a stored PDP input', () => {
    expect(visualBindings.some(b => b.route === '/products/[id]' && b.field === 'master.variations.ChildRelationshipType')).toBe(false);
  });
  it('shows unresolved page query candidates for every field without asserting a UI display', () => {
    const candidates = queryBindings({ ...map, edges: [{ page: '/products/[id]', table: 'master', operation: 'READ', evidence: [{ file: 'api.ts', line: 5, via: [], fields: { columns: ['variations'], filters: [], unknown: false, allColumns: false } }] }] }, fieldInventory(map).filter(f => f.id === 'master.variations.Size'));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ route: '/products/[id]', field: 'master.variations.Size', status: 'candidate', direction: 'read' });
    expect(candidates[0].note).toContain('does not prove');
  });
});
describe('private visual backup validation', () => {
  it('roundtrips images and normalized hotspots but rejects remote image URLs and invalid geometry', () => {
    const w = emptyWorkspace();
    w.shots.push({ id: 's', route: '/products/[id]', state: 'Variations', url: '/products/example', capturedAt: '2026-09-09', src: 'data:image/png;base64,aGVsbG8=', width: 100, height: 100 });
    w.hotspots['pdp-Size-read'] = { shotId: 's', x: .1, y: .2, w: .3, h: .1, review: false };
    expect(parseVisualWorkspace(JSON.parse(JSON.stringify(w)), map)).toEqual(w);
    expect(() => parseVisualWorkspace({ ...w, shots: [{ ...w.shots[0], src: 'https://evil.example/tracker.png' }] }, map)).toThrow();
    expect(() => parseVisualWorkspace({ ...w, hotspots: { a: { ...w.hotspots['pdp-Size-read'], x: 2 } } }, map)).toThrow();
  });
  it('rejects unknown route references and unsafe link targets', () => {
    const w = emptyWorkspace();
    w.coverage['/unknown'] = { status: 'blocked', note: 'Unavailable', url: '' };
    expect(() => parseVisualWorkspace(w, map)).toThrow();
    w.coverage = { '/products/[id]': { status: 'missing', note: '', url: 'javascript:alert(1)' } };
    expect(() => parseVisualWorkspace(w, map)).toThrow();
  });
});

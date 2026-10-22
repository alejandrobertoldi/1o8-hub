import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VisualFlow } from './visual-flow';
import { emptyWorkspace, type VisualWorkspace } from '@/lib/data-map/visual-model';
import type { DataMap } from '@/lib/data-map/types';
let saved: VisualWorkspace;
let loadFails = false;
vi.mock('./visual-storage', () => ({ readRawVisualWorkspace: async () => structuredClone(saved), loadVisualWorkspace: async () => { if (loadFails) throw new Error('Outdated workspace'); return structuredClone(saved); }, saveVisualWorkspace: async (_key: string, w: VisualWorkspace) => { saved = structuredClone(w); }, imageFile: async () => ({ src: 'data:image/png;base64,aGVsbG8=', width: 100, height: 100 }) }));
const map: DataMap = { generatedAt: '', pages: ['/products/[id]', '/variations/[id]', '/variations', '/products', '/other'].map(route => ({ route, file: '', unresolved: [] })), tables: [
  { name: 'master', symbol: 'master', columns: [{ name: 'variations', property: 'variations', type: 'jsonb' }, { name: 'variation_ref', property: 'variationRef', type: 'uuid' }] },
  { name: 'variations', symbol: 'variations', columns: [{ name: 'id', property: 'id', type: 'uuid' }, { name: 'code', property: 'code', type: 'text' }, { name: 'theme_attributes', property: 'themeAttributes', type: 'jsonb' }] },
], edges: [] };
beforeEach(() => { saved = emptyWorkspace(); loadFails = false; }); afterEach(cleanup);
it('allows recovery export and a valid backup import after saved workspace validation fails', async () => {
  loadFails = true;
  render(<VisualFlow map={map} storageKey="test"/>);
  await screen.findByText(/Saved workspace could not be loaded/);
  expect(screen.getByRole('button', { name: 'Export visual backup' })).toBeEnabled();
  expect(screen.getByLabelText('Import visual backup')).toBeEnabled();
  const backup = emptyWorkspace();
  backup.positions.storage = { x: 700, y: 200 };
  fireEvent.change(screen.getByLabelText('Import visual backup'), { target: { files: [{ size: 1000, text: async () => JSON.stringify(backup) }] } });
  await waitFor(() => expect(saved.positions.storage).toEqual({ x: 700, y: 200 }));
  fireEvent.click(screen.getByRole('button', { name: 'Screenshots & connections' }));
  expect(screen.getByRole('button', { name: 'Save field connection' })).toBeEnabled();
});
it('shows exact Size connections and switches to the copied theme path', async () => {
  render(<VisualFlow map={map} storageKey="test"/>);
  await screen.findByText(/Browser workspace ready/);
  expect(screen.getByRole('button', { name: 'Control Edit Size' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Control Size · product column / grouping' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Preset Variation theme' }));
  expect(screen.getByRole('button', { name: 'Storage variations.theme_attributes' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Control Edit Size' })).not.toBeInTheDocument();
});
it('saves a manual display binding and restores it on remount', async () => {
  const first = render(<VisualFlow map={map} storageKey="test"/>);
  await screen.findByText(/Browser workspace ready/);
  fireEvent.click(screen.getByRole('button', { name: 'Screenshots & connections' }));
  fireEvent.change(screen.getByLabelText('Connection page'), { target: { value: '/other' } });
  fireEvent.change(screen.getByLabelText('Control label'), { target: { value: 'Size preview' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save field connection' }));
  await waitFor(() => expect(saved.manual).toHaveLength(1));
  first.unmount(); render(<VisualFlow map={map} storageKey="test"/>);
  expect(await screen.findByRole('button', { name: 'Control Size preview' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Control Size preview' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit connection below' }));
  fireEvent.change(screen.getByLabelText('Control label'), { target: { value: 'Renamed size preview' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save field connection' }));
  await waitFor(() => expect(saved.manual.map(b => b.label)).toEqual(['Renamed size preview']));
  fireEvent.click(screen.getByRole('button', { name: 'Remove manual connection' }));
  await waitFor(() => expect(saved.manual).toHaveLength(0));
});
it('flags existing hotspots when a screenshot is replaced', async () => {
  saved.shots = [{ id: 'shot', route: '/products/[id]', state: 'PDP', url: '/products/example', src: 'data:image/png;base64,aGVsbG8=', width: 100, height: 100, capturedAt: '2026-09-09' }];
  saved.activeShots['/products/[id]'] = 'shot';
  saved.hotspots['pdp-Size-read'] = { shotId: 'shot', x: .1, y: .2, w: .3, h: .1, review: false };
  render(<VisualFlow map={map} storageKey="test"/>);
  await screen.findByText(/Browser workspace ready/);
  fireEvent.change(screen.getByLabelText('Screenshot image'), { target: { files: [new File(['x'], 'pdp.png', { type: 'image/png' })] } });
  await waitFor(() => expect(saved.hotspots['pdp-Size-read'].review).toBe(true));
});
it('imports image and hotspot backups atomically and preserves them after a rejected import', async () => {
  const backup = emptyWorkspace();
  backup.shots = [{ id: 'portable-shot', route: '/products/[id]', state: 'Imported PDP', url: '/products/example', src: 'data:image/png;base64,aGVsbG8=', width: 100, height: 100, capturedAt: '2026-09-09' }];
  backup.activeShots['/products/[id]'] = 'portable-shot';
  backup.hotspots['pdp-Size-read'] = { shotId: 'portable-shot', x: .1, y: .2, w: .3, h: .1, review: false };
  render(<VisualFlow map={map} storageKey="test"/>);
  await screen.findByText(/Browser workspace ready/);
  const upload = (value: unknown) => fireEvent.change(screen.getByLabelText('Import visual backup'), { target: { files: [{ size: 1000, text: async () => JSON.stringify(value) }] } });
  upload(backup);
  await waitFor(() => expect(saved).toEqual(backup));
  expect(screen.getByRole('img', { name: '/products/[id] — Imported PDP' })).toBeInTheDocument();
  upload({ ...backup, shots: [{ ...backup.shots[0], src: 'https://example.com/tracking.png' }] });
  await screen.findByText(/Import rejected/);
  expect(saved).toEqual(backup);
  expect(screen.getByRole('img', { name: '/products/[id] — Imported PDP' })).toBeInTheDocument();
});

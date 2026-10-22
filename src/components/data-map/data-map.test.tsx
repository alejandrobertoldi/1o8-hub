import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DataMapCanvas } from './data-map';
import type { DataMap } from '@/lib/data-map/types';
const map: DataMap = { generatedAt: '2026-09-09T00:00:00Z', pages: [
  { route: '/products', file: 'src/app/products/page.tsx', unresolved: [] },
  { route: '/clients', file: 'src/app/clients/page.tsx', unresolved: ['Dynamic request'] },
], tables: [
  { name: 'products', symbol: 'products', columns: [{ name: 'id', property: 'id', type: 'uuid' }] },
  { name: 'clients', symbol: 'clients', columns: [] },
], edges: [{ page: '/products', table: 'products', operation: 'READ', evidence: [{ file: 'src/lib/products.ts', line: 7, via: ['GET /api/products'] }] }] };
beforeEach(() => window.localStorage.clear());
function renderPageMap() { const result = render(<DataMapCanvas map={map}/>); fireEvent.click(screen.getByRole('button', { name: 'Page map' })); return result; }
afterEach(cleanup);
it('selects a page and exposes evidence, then reverses lookup from a table', () => {
  renderPageMap();
  fireEvent.click(screen.getByRole('button', { name: 'Page /products' }));
  expect(screen.getByText('src/lib/products.ts:7')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Table products' }));
  expect(screen.getByText('id')).toBeInTheDocument();
});
it('saves manual links across remounts and removes them', () => {
  const { unmount } = renderPageMap();
  fireEvent.change(screen.getByLabelText('Annotation page'), { target: { value: '/clients' } });
  fireEvent.change(screen.getByLabelText('Annotation table'), { target: { value: 'clients' } });
  fireEvent.change(screen.getByLabelText('Annotation operation'), { target: { value: 'CREATE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save connection' }));
  expect(screen.getByText('Manual annotation')).toBeInTheDocument();
  unmount();
  renderPageMap();
  fireEvent.click(screen.getByRole('button', { name: 'Page /clients' }));
  expect(screen.getByText('Manual annotation')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove annotation' }));
  expect(screen.queryByText('Manual annotation')).not.toBeInTheDocument();
});
it('filters pages by connected table names and operation', () => {
  renderPageMap();
  fireEvent.change(screen.getByLabelText('Search pages and tables'), { target: { value: 'products' } });
  expect(screen.queryByRole('button', { name: 'Page /clients' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Filter operation'), { target: { value: 'CREATE' } });
  expect(screen.queryByRole('button', { name: 'Page /products' })).not.toBeInTheDocument();
});
it('changes zoom and returns to the complete page overview', () => {
  renderPageMap();
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  expect(screen.getByText('115%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Page /products' }));
  expect(screen.queryByRole('button', { name: 'Page /clients' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show all pages' }));
  expect(screen.getByRole('button', { name: 'Page /clients' })).toBeInTheDocument();
});
it('creates a manual connection when a page connector is dropped onto a table', () => {
  renderPageMap();
  const data = new Map<string, string>();
  const dataTransfer = { types: ['application/x-mfhub-page'], setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) ?? '', effectAllowed: '', dropEffect: '' };
  fireEvent.dragStart(screen.getByRole('button', { name: 'Drag connection from /clients' }), { dataTransfer });
  fireEvent.drop(screen.getByRole('button', { name: 'Table clients' }), { dataTransfer });
  expect(screen.getByText('Manual annotation')).toBeInTheDocument();
  expect(screen.getByText('/clients → clients · READ')).toBeInTheDocument();
});

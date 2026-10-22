import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TableLineage } from './lineage';
import type { DataMap, Edge, Operation } from '@/lib/data-map/types';
const edge = (page: string, operation: Operation, columns: string[]): Edge => ({ page, table: 'products', operation, evidence: [{ file: 'src/lib/products.ts', line: 4, via: [], fields: { columns, filters: [], allColumns: false, unknown: false } }] });
const map: DataMap = { generatedAt: '', pages: [{ route: '/editor', file: '', unresolved: [] }, { route: '/shop', file: '', unresolved: [] }, { route: '/cleanup', file: '', unresolved: [] }], tables: [{ name: 'products', symbol: 'products', columns: [{ name: 'title', property: 'title', type: 'text' }, { name: 'price', property: 'price', type: 'integer' }] }], edges: [edge('/editor', 'UPDATE', ['title']), edge('/shop', 'READ', ['title']), edge('/cleanup', 'DELETE', [])], processes: [{ route: 'GET /api/cron/import', file: '', kind: 'job', unresolved: [] }], processEdges: [edge('GET /api/cron/import', 'CREATE', ['price'])] };
it('branches a table into sources, destinations and removals with expandable field cards', () => {
  render(<TableLineage map={map} tables={map.tables} tableName="products" manual={[]} operation="ALL" onSelectTable={vi.fn()}/>);
  const sources = screen.getByRole('region', { name: 'Data sources' });
  const destinations = screen.getByRole('region', { name: 'Data destinations' });
  const removals = screen.getByRole('region', { name: 'Data removal' });
  expect(within(sources).getByText('/editor')).toBeInTheDocument();
  expect(within(destinations).getByText('/shop')).toBeInTheDocument();
  expect(within(removals).getByText('/cleanup')).toBeInTheDocument();
  expect(within(destinations).queryByText('/cleanup')).not.toBeInTheDocument();
  fireEvent.click(within(sources).getByRole('button', { name: 'Expand /editor' }));
  expect(within(sources).getAllByText('title').some(element => element.tagName === 'SPAN')).toBe(true);
  expect(screen.getByText('GET /api/cron/import')).toBeInTheDocument();
});
it('filters table lineage by a selected field', () => {
  render(<TableLineage map={map} tables={map.tables} tableName="products" manual={[]} operation="ALL" onSelectTable={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Expand table fields' }));
  fireEvent.click(screen.getByRole('button', { name: 'Trace field price' }));
  expect(screen.queryByText('/editor')).not.toBeInTheDocument();
  expect(screen.getByText('GET /api/cron/import')).toBeInTheDocument();
});
it('keeps tables without resolved relationships in the overview', () => {
  const select = vi.fn();
  render(<TableLineage map={map} tables={map.tables} tableName={null} manual={[]} operation="ALL" onSelectTable={select}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Table products' }));
  expect(select).toHaveBeenCalledWith('products');
});

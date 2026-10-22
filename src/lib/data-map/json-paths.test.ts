import { expect, it } from 'vitest';
import { declaredJsonPaths } from './json-paths';
it('extracts declared nested JSON paths without inventing keys from index signatures', () => {
  const source = `type Detail = { Size?: string; dimensions?: { width: number }; [key:string]: unknown }; export const products = pgTable('products', { attributes: jsonb('attributes').$type<Detail>(), notes: jsonb('notes').$type<{message:string}[]>() });`;
  expect(declaredJsonPaths(source)).toEqual([
    { table: 'products', column: 'attributes', path: 'Size', label: 'Size' },
    { table: 'products', column: 'attributes', path: 'dimensions', label: 'dimensions' },
    { table: 'products', column: 'attributes', path: 'dimensions.width', label: 'width' },
    { table: 'products', column: 'notes', path: '[].message', label: 'message' },
  ]);
});

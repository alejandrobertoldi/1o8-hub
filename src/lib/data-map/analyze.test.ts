// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { analyze } from './analyze';

const schema = `export const products = pgTable('products', { id: uuid('id').primaryKey(), title: text('title') });
export const audit = pgTable('audit', { id: uuid('id') });`;
describe('page data tracing', () => {
  it('traces the requested HTTP method and imported helper without inheriting unused writes', () => {
    const map = analyze({
      'src/lib/db/schema.ts': schema,
      'src/app/products/page.tsx': `import { List } from '@/components/list'; export default function Page(){ return <List/> }`,
      'src/components/list.tsx': `export function List(){ fetch('/api/products'); return null }`,
      'src/app/api/products/route.ts': `import { read, write } from '@/lib/products'; export function GET(){return read()} export function POST(){return write()}`,
      'src/lib/products.ts': `import { products as p, audit } from '@/lib/db/schema'; export function read(){return db.select().from(p)} export function write(){ return db.insert(audit).values({}) }`,
    });
    expect(map.pages.map(p => p.route)).toEqual(['/products']);
    expect(map.edges.map(e => [e.page, e.table, e.operation])).toEqual([['/products', 'products', 'READ']]);
    expect(map.edges[0].evidence[0]).toMatchObject({ file: 'src/lib/products.ts', line: 1 });
    expect(map.tables[0].columns).toContainEqual({ name: 'id', property: 'id', type: 'uuid' });
  });
  it('resolves dynamic routes and distinct create/update/delete operations', () => {
    const map = analyze({
      'src/lib/db/schema.ts': schema,
      'src/app/(hub)/products/[id]/page.tsx': "export default function Page(){fetch(`/api/products/${id}`, {method:'PATCH'}); fetch('/api/products', {method:'POST'}); fetch(`/api/products/${id}`, {method:'DELETE'});}",
      'src/app/api/products/[id]/route.ts': `import { products } from '@/lib/db/schema'; export function PATCH(){return db.update(products).set({})} export function DELETE(){return db.delete(products)}`,
      'src/app/api/products/route.ts': `import { products } from '@/lib/db/schema'; export function POST(){return db.insert(products).values({})}`,
    });
    expect(map.edges.map(e => e.operation).sort()).toEqual(['CREATE', 'DELETE', 'UPDATE']);
    expect(map.pages[0].route).toBe('/products/[id]');
  });
  it('retains pages with unresolved requests and does not fabricate edges from string text', () => {
    const map = analyze({ 'src/lib/db/schema.ts': schema, 'src/app/page.tsx': `export default function Page(){ fetch(url); const example='db.insert(audit)'; return null }` });
    expect(map.pages).toHaveLength(1);
    expect(map.pages[0].unresolved.length).toBeGreaterThan(0);
    expect(map.edges).toEqual([]);
  });
  it('reports upserts as both create and update, and flags unresolved table references', () => {
    const map = analyze({
      'src/lib/db/schema.ts': schema,
      'src/app/page.tsx': `import { products } from '@/lib/db/schema'; export default function Page(){ db.insert(products).values({}).onConflictDoUpdate({set:{}}); db.update(dynamicTable).set({}); return null }`,
    });
    expect(map.edges.map(e => e.operation).sort()).toEqual(['CREATE', 'UPDATE']);
    expect(map.pages[0].unresolved.some(w => w.includes('table'))).toBe(true);
  });
  it('orders parent routes before their descendants', () => {
    const map = analyze({ 'src/app/z/page.tsx': 'export default function Page(){}', 'src/app/page.tsx': 'export default function Page(){}', 'src/app/z/a/page.tsx': 'export default function Page(){}' });
    expect(map.pages.map(p => p.route)).toEqual(['/', '/z', '/z/a']);
  });
  it('separates selected columns from filters and extracts written columns using DB names', () => {
    const map = analyze({
      'src/lib/db/schema.ts': `export const products = pgTable('products', {id: uuid('id'), displayName: text('display_name'), price: integer('price')});`,
      'src/app/page.tsx': `import { products as p } from '@/lib/db/schema'; export default function Page(){db.select({name:p.displayName}).from(p).where(eq(p.id,id)); db.update(p).set({displayName: body.name}).where(eq(p.id,id));}`,
    });
    expect(map.edges.find(e => e.operation === 'READ')?.evidence[0].fields).toEqual({ columns: ['display_name'], filters: ['id'], unknown: false, allColumns: false });
    expect(map.edges.find(e => e.operation === 'UPDATE')?.evidence[0].fields).toEqual({ columns: ['display_name'], filters: ['id'], unknown: false, allColumns: false });
  });
  it('keeps dynamic payloads unknown and distinguishes all-column reads', () => {
    const map = analyze({
      'src/lib/db/schema.ts': schema,
      'src/app/page.tsx': `import { products } from '@/lib/db/schema'; export default function Page(){db.select().from(products); db.insert(products).values({...payload, title: value});}`,
    });
    expect(map.edges.find(e => e.operation === 'READ')?.evidence[0].fields).toMatchObject({ allColumns: true, columns: ['id', 'title'] });
    expect(map.edges.find(e => e.operation === 'CREATE')?.evidence[0].fields).toMatchObject({ unknown: true, columns: ['title'] });
  });
  it('inventories a background job and executable script without inventing pages', () => {
    const map = analyze({
      'src/lib/db/schema.ts': schema,
      'src/app/api/cron/sync/route.ts': `import { products } from '@/lib/db/schema'; export function GET(){ return db.insert(products).values({title:'x'}) }`,
      'scripts/import-products.ts': `import { products } from '@/lib/db/schema'; function unused(){db.delete(products)} async function main(){await db.insert(products).values(payload)} main();`,
    });
    expect(map.pages).toEqual([]);
    expect(map.processes?.map(p => p.kind).sort()).toEqual(['job', 'script']);
    expect(map.processEdges?.map(e => e.operation)).toEqual(['CREATE', 'CREATE']);
  });
  it('tracks returned fields separately from the fields written by a mutation', () => {
    const map = analyze({ 'src/lib/db/schema.ts': schema, 'src/app/page.tsx': `import {products} from '@/lib/db/schema'; export default function Page(){return db.insert(products).values({title:body.title}).returning({id: products.id})}` });
    expect(map.edges.find(e => e.operation === 'CREATE')?.evidence[0].fields?.columns).toEqual(['title']);
    expect(map.edges.find(e => e.operation === 'READ')?.evidence[0].fields?.columns).toEqual(['id']);
  });
  it('finds script writes when schema imports are deferred until after environment setup', () => {
    const map = analyze({ 'src/lib/db/schema.ts': schema, 'scripts/seed.ts': `async function main(){const {products: p}=await import('@/lib/db/schema'); return db.insert(p).values(payload).returning({id:p.id})} main();` });
    expect(map.processEdges?.map(e => [e.table,e.operation]).sort()).toEqual([['products','CREATE'],['products','READ']]);
  });
});

import { expect, it } from 'vitest';
import { withLiveSchema } from './live-schema';
import type { DataMap } from './types';
it('includes live-only tables without inventing data lineage or losing declared fields', () => {
  const map: DataMap = { generatedAt: '', pages: [], edges: [], tables: [{name:'products',symbol:'products',columns:[{name:'title',property:'displayName',type:'text'}]}] };
  const result = withLiveSchema(map, { checkedAt:'', columns:[{table:'products',column:'price',type:'integer'},{table:'external_imports',column:'id',type:'uuid'}] });
  expect(result.tables[0].columns.map(c=>c.name)).toEqual(['title','price']);
  expect(result.tables[1]).toMatchObject({name:'external_imports',liveOnly:true});
  expect(result.edges).toEqual([]);
});

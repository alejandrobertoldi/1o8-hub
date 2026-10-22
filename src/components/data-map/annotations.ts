import { z } from 'zod';
import { OPERATIONS, type Annotation, type DataMap } from '@/lib/data-map/types';

export function parseAnnotations(value: unknown, map: DataMap, retainUnknownTables = false): Annotation[] {
  const parsed = z.array(z.object({
    id: z.string().min(1).max(100), page: z.string().max(300), table: z.string().max(200),
    operation: z.enum(OPERATIONS), note: z.string().max(500),
  })).max(1000).parse(value);
  if (new Set(parsed.map(a => a.id)).size !== parsed.length) throw new Error('Duplicate annotation IDs');
  return parsed.filter(a => map.pages.some(p => p.route === a.page) && (retainUnknownTables || map.tables.some(t => t.name === a.table)));
}

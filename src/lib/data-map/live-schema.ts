import type { DataMap, LiveSchema, Table } from './types';

export function withLiveSchema(map: DataMap, live: LiveSchema | null): DataMap {
  if (!live) return map;
  const liveTables = new Map<string, Table>();
  for (const c of live.columns) {
    const table = liveTables.get(c.table) ?? { name: c.table, symbol: c.table, columns: [], liveOnly: true };
    table.columns.push({ name: c.column, property: c.column, type: c.type });
    liveTables.set(c.table, table);
  }
  const tables = map.tables.map(t => ({ ...t, columns: [...t.columns, ...(liveTables.get(t.name)?.columns ?? []).filter(c => !t.columns.some(declared => declared.name === c.name))] }));
  for (const [name, table] of liveTables) if (!map.tables.some(t => t.name === name)) tables.push(table);
  return { ...map, tables };
}

export const OPERATIONS = ['READ', 'CREATE', 'UPDATE', 'DELETE'] as const;
export type Operation = typeof OPERATIONS[number];
export interface Column { name: string; property: string; type: string }
export interface Table { name: string; symbol: string; columns: Column[]; liveOnly?: boolean }
export interface Page { route: string; file: string; unresolved: string[] }
export interface Process extends Page { kind: 'api' | 'job' | 'script' }
export interface FieldUsage { columns: string[]; filters: string[]; unknown: boolean; allColumns: boolean }
export interface Evidence { file: string; line: number; via: string[]; fields?: FieldUsage }
export interface Edge { page: string; table: string; operation: Operation; evidence: Evidence[] }
export interface Annotation { id: string; page: string; table: string; operation: Operation; note: string }
export interface DataMap { generatedAt: string; pages: Page[]; tables: Table[]; edges: Edge[]; processes?: Process[]; processEdges?: Edge[]; jsonFields?: { table: string; column: string; path: string; label: string }[] }
export interface LiveSchema { columns: { table: string; column: string; type: string }[]; checkedAt: string }

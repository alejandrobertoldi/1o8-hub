'use client';
import type { Annotation, DataMap, Edge, LiveSchema } from '@/lib/data-map/types';
import { COLORS, type Selection } from './graph';

export function Inspector({ map, selected, edges, manual, live, remove }: {
  map: DataMap; selected: Selection; edges: Edge[]; manual: Annotation[]; live: LiveSchema | null; remove: (id: string) => void;
}) {
  const page = selected?.kind === 'page' ? map.pages.find(p => p.route === selected.id) : undefined;
  const table = selected?.kind === 'table' ? map.tables.find(t => t.name === selected.id) : undefined;
  const liveColumns = table && live ? live.columns.filter(c => c.table === table.name) : [];
  return <section aria-label="Connection details" className="space-y-4 text-xs">
    <div><h2 className="font-bold">{selected?.id ?? 'Inspect a page or table'}</h2><p className="mt-1 text-muted-foreground">{selected ? `${edges.length} static connections · ${manual.length} annotations` : 'Select a node to reveal reads, writes and source evidence.'}</p></div>
    {page && <><p className="break-all font-mono text-[10px]">{page.file}</p>{!edges.length && <p className="rounded border p-2 text-muted-foreground">No connections resolved. This does not prove the page has no database access.</p>}{page.unresolved.length > 0 && <details className="rounded border p-2"><summary className="cursor-pointer font-semibold">Needs review ({page.unresolved.length})</summary><ul className="mt-2 space-y-2 break-words">{page.unresolved.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}</>}
    {edges.map(e => <details key={`${e.page}:${e.table}:${e.operation}`} open={edges.length <= 4} className="rounded-lg border bg-background p-2.5">
      <summary className="cursor-pointer break-words font-semibold"><span style={{ color: COLORS[e.operation] }}>●</span> {e.operation} · {selected?.kind === 'table' ? e.page : e.table}</summary>
      <p className="my-2 text-[10px] text-muted-foreground">Static code path · execution depends on user actions and conditions</p>
      {e.evidence.map((s, i) => <div key={i} className="mb-2 break-all"><span className="font-mono text-[10px]">{s.file}:{s.line}</span><details className="mt-1 text-muted-foreground"><summary className="cursor-pointer">Trace path</summary><ol className="mt-1 space-y-1 border-l pl-2">{s.via.map((v, n) => <li key={n}>{v}</li>)}</ol></details></div>)}
    </details>)}
    {manual.map(a => <div key={a.id} className="rounded-lg border border-dashed p-2.5"><p className="font-semibold">Manual annotation</p><p className="mt-1 break-words">{a.page} → {a.table} · {a.operation}</p>{a.note && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{a.note}</p>}<button type="button" onClick={() => remove(a.id)} className="mt-2 underline">Remove annotation</button></div>)}
    {table && <div><h3 className="mb-2 font-bold">Columns · {table.columns.length}</h3>{live && <p className="mb-2 text-muted-foreground">{liveColumns.length ? `${liveColumns.length} columns visible in connected database` : 'Table absent or not visible to the database role'}</p>}
      <table className="w-full text-left text-[10px]"><thead><tr className="border-b"><th className="py-1">Column</th><th>Type</th><th>Live</th></tr></thead><tbody>{table.columns.map(c => <tr key={c.name} className="border-b"><td className="break-all py-1.5 pr-2">{c.name}</td><td className="break-all pr-2">{liveColumns.find(l => l.column === c.name)?.type ?? c.type}</td><td>{!live ? '—' : liveColumns.some(l => l.column === c.name) ? 'Present' : 'Missing'}</td></tr>)}</tbody></table>
      {liveColumns.filter(l => !table.columns.some(c => c.name === l.column)).map(c => <p key={c.column} className="mt-2 break-all">Live only: {c.column} ({c.type})</p>)}
    </div>}
  </section>;
}

"use client";
import type { ReactNode } from "react";
import type { SurfacePalette } from "./palette";
import { type MetricRow, roasBandOf, acosBandOf } from "./table-derivations";
import { Surface } from "./surface";
import { TableToolbar } from "./table-toolbar";
import { HeatCell } from "./heat-cell";
import { ProgressBar } from "./progress-bar";

export interface MetricColumn {
  key: keyof MetricRow;
  label: string;
  fmt: (n: number) => string;
  heat?: "roas" | "acos";   // render body cell via HeatCell
  bar?: boolean;            // render body cell as ProgressBar + value (CVR)
  tooltip?: string;         // metric definition → title= on the <th>
}

function SortIcon({ active, dir, accent }: { active: boolean; dir: "asc" | "desc"; accent: string }) {
  if (!active) return <span className="ml-1 opacity-40">↕</span>;
  return <span className="ml-1" style={{ color: accent }}>{dir === "desc" ? "↓" : "↑"}</span>;
}

function BodyCell({ row, col, palette }: { row: MetricRow; col: MetricColumn; palette: SurfacePalette }) {
  const raw = row[col.key] as number;
  if (col.heat === "roas") return <HeatCell band={roasBandOf(raw)}>{col.fmt(raw)}</HeatCell>;
  if (col.heat === "acos") return <HeatCell band={acosBandOf(raw)}>{col.fmt(raw)}</HeatCell>;
  if (col.bar) {
    return (
      <span className="inline-flex items-center justify-end gap-2">
        <ProgressBar pct={raw} palette={palette} />
        <span className="tabular-nums">{col.fmt(raw)}</span>
      </span>
    );
  }
  return <>{col.fmt(raw)}</>;
}

export function MetricTable({
  rows, columns, firstColumnLabel, totalsRow,
  sortKey, sortDir, onSort, palette,
  search, onSearch, searchPlaceholder, filters, count, onExportCsv, emptyLabel,
  title, subtitle,
}: {
  rows: MetricRow[];
  columns: MetricColumn[];
  firstColumnLabel: string;
  totalsRow: MetricRow | null;
  title?: string;
  subtitle?: string;
  sortKey: keyof MetricRow;
  sortDir: "asc" | "desc";
  onSort: (key: keyof MetricRow) => void;
  palette: SurfacePalette;
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder: string;
  filters?: ReactNode;
  count: string;
  onExportCsv: () => void;
  emptyLabel: string;
}) {
  const exportBtn = (
    <button
      type="button"
      onClick={onExportCsv}
      className="h-9 rounded-[9px] border border-mf-line bg-white px-3 text-xs font-semibold text-mf-ink hover:bg-mf-ghost"
    >
      Export CSV
    </button>
  );
  return (
    <Surface title={title} subtitle={subtitle}>
      <TableToolbar
        search={search}
        onSearch={onSearch}
        searchPlaceholder={searchPlaceholder}
        filters={<>{filters}{exportBtn}</>}
        count={count}
      />
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[1320px] border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-mf-charcoal-900">
              <th className="sticky left-0 z-20 min-w-[200px] bg-mf-charcoal-900 px-4 py-2.5 text-left font-bold uppercase tracking-wide text-white">
                {firstColumnLabel}
              </th>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  onClick={() => onSort(col.key)}
                  title={col.tooltip}
                  aria-sort={col.key === sortKey ? (sortDir === "desc" ? "descending" : "ascending") : undefined}
                  className="cursor-pointer select-none whitespace-nowrap px-4 py-2.5 text-right font-bold uppercase tracking-wide text-white"
                >
                  {col.label}
                  <SortIcon active={col.key === sortKey} dir={sortDir} accent={palette.accent} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.name}-${i}`} className="border-b border-mf-line odd:bg-white even:bg-mf-ghost hover:bg-mf-line">
                <td
                  className="sticky left-0 z-10 max-w-[280px] bg-inherit px-4 py-2.5 font-semibold text-mf-ink"
                  title={row.subtitle ? `${row.name} — ${row.subtitle}` : row.name}
                >
                  <div className="truncate">{row.name}</div>
                  {row.subtitle ? (
                    <div className="truncate text-[10px] font-normal text-mf-muted">{row.subtitle}</div>
                  ) : null}
                </td>
                {columns.map((col) => (
                  <td key={String(col.key)} className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-mf-ink">
                    <BodyCell row={row} col={col} palette={palette} />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-mf-muted">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
          {totalsRow && rows.length > 0 && (
            <tfoot className="sticky bottom-0 z-10">
              <tr
                className="bg-mf-charcoal-900 font-bold text-white"
                style={{ borderTop: `2px solid ${palette.accent}` }}
              >
                <td className="sticky left-0 z-20 bg-mf-charcoal-900 px-4 py-2.5 text-left">Total</td>
                {columns.map((col) => (
                  <td key={String(col.key)} className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                    {col.fmt(totalsRow[col.key] as number)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Surface>
  );
}

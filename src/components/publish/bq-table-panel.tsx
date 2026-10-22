/* eslint-disable react-doctor/query-mutation-missing-invalidation */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  FileSpreadsheet,
  FileText,
  Download,
  Loader2,
  Filter,
  Columns3,
  X,
} from "lucide-react";

const DATASET = "1o8 Hub";

type PreviewResult = {
  columns: string[];
  allColumns: string[];
  rows: string[][];
  totalRows: number;
  clientColumn: string | null;
  statusColumn: string | null;
};

type QueryBody = {
  dataset: string;
  table: string;
  clients?: string[];
  statuses?: string[];
  selectedColumns?: string[];
  format: "preview" | "xlsx" | "pdf";
  limit?: number;
};

async function queryBQ(body: QueryBody): Promise<PreviewResult | Blob> {
  const res = await fetch("/api/export/bq/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Query failed");
  }
  if (body.format === "preview") return res.json();
  return res.blob();
}

function extractUniqueValues(
  preview: PreviewResult,
  columnName: string | null
): string[] {
  if (!columnName) return [];
  const colIdx = preview.columns.indexOf(columnName);
  if (colIdx < 0) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of preview.rows) {
    const val = row[colIdx];
    if (val && !seen.has(val)) {
      seen.add(val);
      result.push(val);
    }
  }
  return result.sort();
}

type Props = {
  tableId: string;
  numRows: number;
  columnCount: number;
  showClientExport?: boolean;
};

export function BqTablePanel({
  tableId,
  numRows,
  columnCount,
  showClientExport,
}: Props) {
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const buildQueryBody = useCallback(
    (format: "preview" | "xlsx" | "pdf"): QueryBody => ({
      dataset: DATASET,
      table: tableId,
      clients: selectedClients.length > 0 ? selectedClients : undefined,
      statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      selectedColumns:
        selectedColumns.length > 0 ? selectedColumns : undefined,
      format,
      limit: format === "preview" ? 50 : undefined,
    }),
    [tableId, selectedClients, selectedStatuses, selectedColumns]
  );

  const previewMutation = useMutation({
    mutationFn: () =>
      queryBQ(buildQueryBody("preview")) as Promise<PreviewResult>,
    onSuccess: (data) => {
      setPreviewData(data);
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
      setPreviewData(null);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: (format: "xlsx" | "pdf") =>
      queryBQ(buildQueryBody(format)) as Promise<Blob>,
    onSuccess: (blob, format) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${DATASET}_${tableId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleClientExport = useCallback(() => {
    window.open(`/api/export?client=ALL`, "_blank");
  }, []);

  const toggleItem = useCallback(
    (item: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
      setter((prev) =>
        prev.includes(item) ? prev.filter((c) => c !== item) : [...prev, item]
      );
    },
    []
  );

  const availableClients = previewData
    ? extractUniqueValues(previewData, previewData.clientColumn)
    : [];
  const availableStatuses = previewData
    ? extractUniqueValues(previewData, previewData.statusColumn)
    : [];
  const allColumns = previewData?.allColumns ?? [];
  const filteredColumns = columnSearch
    ? allColumns.filter((c) =>
        c.toLowerCase().includes(columnSearch.toLowerCase())
      )
    : allColumns;
  const hasFilters = previewData?.clientColumn || previewData?.statusColumn;
  const activeFilterCount = selectedClients.length + selectedStatuses.length;

  return (
    <div className="bg-muted/20 border-t px-6 py-4 space-y-4">
      {/* Quick stats + actions bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="text-xs">
          {numRows.toLocaleString()} rows
        </Badge>
        <Badge variant="outline" className="text-xs">
          {columnCount} columns
        </Badge>

        <div className="flex-1" />

        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={previewMutation.isPending}
          onClick={() => previewMutation.mutate()}
        >
          {previewMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Search className="size-3.5" />
          )}
          Preview
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={downloadMutation.isPending}
          onClick={() => downloadMutation.mutate("xlsx")}
        >
          {downloadMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileSpreadsheet className="size-3.5" />
          )}
          XLSX
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={downloadMutation.isPending}
          onClick={() => downloadMutation.mutate("pdf")}
        >
          <FileText className="size-3.5" />
          PDF
        </Button>
        {showClientExport && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleClientExport}
          >
            <Download className="size-3.5" />
            Client CSV
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {previewMutation.isPending && !previewData && (
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {/* Preview results */}
      {previewData && (
        <div className="space-y-3">
          {/* Column picker + Filters toggles */}
          <div className="flex flex-wrap items-center gap-4">
            {allColumns.length > 0 && (
              <button
                onClick={() => setShowColumnPicker((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
              >
                <Columns3 className="size-3.5" />
                Columns
                {selectedColumns.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-1">
                    {selectedColumns.length}/{allColumns.length}
                  </Badge>
                )}
              </button>
            )}
            {hasFilters && (
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
              >
                <Filter className="size-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-1">
                    {activeFilterCount}
                  </Badge>
                )}
              </button>
            )}
          </div>

          {/* Column picker panel */}
          {showColumnPicker && (
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Input
                  placeholder="Search columns…"
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                  className="max-w-xs h-7 text-xs"
                />
                <div className="flex items-center gap-2">
                  {selectedColumns.length > 0 && (
                    <button
                      onClick={() => setSelectedColumns([])}
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <X className="size-3" />
                      Clear
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedColumns([...allColumns])}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    All
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1 max-h-[180px] overflow-y-auto">
                {filteredColumns.map((col) => (
                  <label
                    key={col}
                    className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:bg-muted/50 rounded px-1.5 py-0.5"
                  >
                    <Checkbox
                      checked={selectedColumns.includes(col)}
                      onCheckedChange={() =>
                        toggleItem(col, setSelectedColumns)
                      }
                      className="size-3"
                    />
                    <span className="truncate" title={col}>
                      {col}
                    </span>
                  </label>
                ))}
              </div>
              {selectedColumns.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  disabled={previewMutation.isPending}
                  onClick={() => previewMutation.mutate()}
                >
                  {previewMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Search className="size-3" />
                  )}
                  Apply
                </Button>
              )}
            </div>
          )}

          {/* Filters panel */}
          {showFilters && hasFilters && (
            <div className="rounded-lg border bg-card p-3 space-y-3">
              {previewData.statusColumn && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Status</span>
                    {selectedStatuses.length > 0 && (
                      <button
                        onClick={() => setSelectedStatuses([])}
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <X className="size-3" />
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {availableStatuses.map((s) => (
                      <label
                        key={s}
                        className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-muted/50 rounded px-2 py-1"
                      >
                        <Checkbox
                          checked={selectedStatuses.includes(s)}
                          onCheckedChange={() =>
                            toggleItem(s, setSelectedStatuses)
                          }
                          className="size-3"
                        />
                        {s}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {previewData.clientColumn && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Client</span>
                    {selectedClients.length > 0 && (
                      <button
                        onClick={() => setSelectedClients([])}
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <X className="size-3" />
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1">
                    {availableClients.map((c) => (
                      <label
                        key={c}
                        className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-muted/50 rounded px-2 py-1"
                      >
                        <Checkbox
                          checked={selectedClients.includes(c)}
                          onCheckedChange={() =>
                            toggleItem(c, setSelectedClients)
                          }
                          className="size-3"
                        />
                        <span className="truncate">{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                disabled={previewMutation.isPending}
                onClick={() => previewMutation.mutate()}
              >
                {previewMutation.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Search className="size-3" />
                )}
                Apply filters
              </Button>
            </div>
          )}

          {/* Data table */}
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground w-10">
                      #
                    </th>
                    {previewData.columns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {previewData.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-1 text-muted-foreground">
                        {i + 1}
                      </td>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className="px-3 py-1 max-w-[200px] truncate"
                          title={cell}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewData.rows.length < previewData.totalRows && (
              <div className="px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/30 border-t">
                Showing {previewData.rows.length} of{" "}
                {previewData.totalRows.toLocaleString()} rows
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

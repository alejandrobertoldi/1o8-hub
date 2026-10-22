"use client";
import type { ReactNode } from "react";

export function TableToolbar({
  search,
  onSearch,
  searchPlaceholder,
  filters,
  count,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder: string;
  filters?: ReactNode;
  count: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-mf-line bg-white px-4 py-3">
      <div className="flex flex-wrap gap-2">
        <input
          className="h-9 min-w-[240px] rounded-[9px] border border-mf-line bg-white px-[11px] text-mf-ink"
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        {filters}
      </div>
      <div className="text-xs text-mf-muted tabular-nums">{count}</div>
    </div>
  );
}

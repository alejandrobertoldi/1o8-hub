"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HoursEntriesTable,
  type HoursEntryRow,
} from "@/components/admin/hours-entries-table";
import {
  buildCategoryQuery,
  formatDayRowLabel,
  fmtHM,
} from "@/lib/hours/dashboard-utils";

export type HeatmapCellSelection = {
  date: string;
  /** member cell, client cell, or team All row */
  scope: "member" | "client" | "all";
  key: string;
  label: string;
  hours: number;
};

export function HeatmapDayDetail({
  selection,
  categories,
  onClear,
}: {
  selection: HeatmapCellSelection;
  categories: string[];
  onClear: () => void;
}) {
  const { data, isLoading, error } = useQuery<{ entries: HoursEntryRow[] }>({
    queryKey: [
      "hours-heatmap-day",
      selection.date,
      selection.scope,
      selection.key,
      categories,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ entryDate: selection.date });
      if (selection.scope === "member") params.set("userId", selection.key);
      else if (selection.scope === "client") params.set("clientIdCode", selection.key);
      else params.set("all", "1");
      const res = await fetch(
        `/api/hours/drill/entries?${params}${buildCategoryQuery(categories)}`,
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load entries");
      return res.json();
    },
  });

  const entries = useMemo(() => {
    const rows = [...(data?.entries ?? [])];
    rows.sort((a, b) => {
      const byStart = a.startTime.localeCompare(b.startTime);
      if (byStart !== 0) return byStart;
      const byEnd = a.endTime.localeCompare(b.endTime);
      if (byEnd !== 0) return byEnd;
      return (a.userName ?? a.userEmail).localeCompare(b.userName ?? b.userEmail);
    });
    return rows;
  }, [data?.entries]);

  const showMember = selection.scope !== "member";

  return (
    <div className="rounded-xl border border-stone-200 bg-card p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase text-muted-foreground">
            Day detail
          </div>
          <div className="mt-0.5 text-sm font-medium text-foreground">
            {selection.label}
          </div>
          <div className="mt-0.5 text-sm font-medium text-foreground">
            {formatDayRowLabel(selection.date)}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            Total Hours:{" "}
            <span className="text-base font-medium tabular-nums text-foreground">
              {fmtHM(selection.hours)}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-muted-foreground"
          onClick={onClear}
        >
          <X className="size-3" />
          Clear
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-xs text-destructive">
          {error instanceof Error ? error.message : "Failed to load entries"}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No entries for this day.</p>
      ) : (
        <HoursEntriesTable
          entries={entries}
          showMember={showMember}
          showClient
          editable
          fallbackDate={selection.date}
        />
      )}
    </div>
  );
}

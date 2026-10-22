"use client";

/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */

import { useMemo, useState } from "react";
import { ListFilter, X, ChevronLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// col -> selected raw values. "" represents a blank cell.
export type AacFilters = Record<string, string[]>;

type AACRow = Record<string, string>;

const BLANK_LABEL = "(blank)";

function removeKey(obj: AacFilters, key: string): AacFilters {
  const next = { ...obj };
  delete next[key];
  return next;
}

// Distinct values for a column with counts, sorted (blank last).
function distinctValues(
  rows: AACRow[],
  col: string,
  numeric: boolean
): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = r[col] ?? "";
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => {
    if (a[0] === "" && b[0] !== "") return 1;
    if (b[0] === "" && a[0] !== "") return -1;
    if (numeric) return (parseFloat(a[0]) || 0) - (parseFloat(b[0]) || 0);
    return a[0].localeCompare(b[0], undefined, { sensitivity: "base" });
  });
}

// ── Distinct-value checkbox list for one column ───────────────────────

function ValueSelector({
  rows,
  col,
  numeric,
  selected,
  onToggle,
  onClear,
}: {
  rows: AACRow[];
  col: string;
  numeric: boolean;
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const values = useMemo(
    () => distinctValues(rows, col, numeric),
    [rows, col, numeric]
  );
  const sel = new Set(selected);

  return (
    <Command>
      <CommandInput placeholder="Search values..." />
      <CommandList className="max-h-[300px]">
        <CommandEmpty>No values.</CommandEmpty>
        <CommandGroup>
          {values.map(([v, count]) => {
            const isSel = sel.has(v);
            const label = v === "" ? BLANK_LABEL : v;
            return (
              <CommandItem
                key={v || "__blank__"}
                value={label}
                onSelect={() => onToggle(v)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isSel
                      ? "bg-brand border-brand text-brand-foreground"
                      : "border-muted-foreground/40"
                  }`}
                >
                  {isSel && <Check className="h-3 w-3" />}
                </span>
                <span
                  className={`flex-1 truncate text-xs ${
                    v === "" ? "italic text-muted-foreground" : ""
                  }`}
                >
                  {label}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {count}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
      {selected.length > 0 && (
        <div className="border-t p-1.5 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={onClear}
          >
            Clear
          </Button>
        </div>
      )}
    </Command>
  );
}

// ── "Filter" button → pick column → pick values ───────────────────────

function AddFilterButton({
  columns,
  labels,
  rows,
  numericCols,
  filters,
  onChange,
}: {
  columns: string[];
  labels: Record<string, string>;
  rows: AACRow[];
  numericCols: Set<string>;
  filters: AacFilters;
  onChange: (next: AacFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickedCol, setPickedCol] = useState<string | null>(null);

  const toggleValue = (col: string, v: string) => {
    const cur = filters[col] ?? [];
    const nextVals = cur.includes(v)
      ? cur.filter((x) => x !== v)
      : [...cur, v];
    onChange(
      nextVals.length ? { ...filters, [col]: nextVals } : removeKey(filters, col)
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setPickedCol(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <ListFilter className="h-3.5 w-3.5" />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        {pickedCol === null ? (
          <Command>
            <CommandInput placeholder="Filter by column..." />
            <CommandList className="max-h-[320px]">
              <CommandEmpty>No columns.</CommandEmpty>
              <CommandGroup>
                {columns.map((col) => {
                  const activeCount = filters[col]?.length ?? 0;
                  return (
                    <CommandItem
                      key={col}
                      value={labels[col] ?? col}
                      onSelect={() => setPickedCol(col)}
                      className="flex items-center gap-2 cursor-pointer text-xs"
                    >
                      <span className="flex-1 truncate">
                        {labels[col] ?? col.replace(/_/g, " ")}
                      </span>
                      {activeCount > 0 && (
                        <span className="text-[10px] rounded-full bg-brand/15 text-brand px-1.5 tabular-nums">
                          {activeCount}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <div>
            <div className="flex items-center gap-1 border-b px-2 py-1.5">
              <button
                type="button"
                onClick={() => setPickedCol(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Back to columns"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-medium truncate">
                {labels[pickedCol] ?? pickedCol.replace(/_/g, " ")}
              </span>
            </div>
            <ValueSelector
              rows={rows}
              col={pickedCol}
              numeric={numericCols.has(pickedCol)}
              selected={filters[pickedCol] ?? []}
              onToggle={(v) => toggleValue(pickedCol, v)}
              onClear={() => onChange(removeKey(filters, pickedCol))}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Active-filter chip (click to edit, ✕ to remove) ───────────────────

function FilterChip({
  col,
  label,
  rows,
  numeric,
  values,
  onChange,
  onRemove,
}: {
  col: string;
  label: string;
  rows: AACRow[];
  numeric: boolean;
  values: string[];
  onChange: (vals: string[]) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const summary =
    values.length <= 2
      ? values.map((v) => (v === "" ? BLANK_LABEL : v)).join(", ")
      : `${values.length} selected`;

  return (
    <span className="inline-flex items-center h-7 rounded-md border border-brand/40 bg-brand/10 text-xs overflow-hidden">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 px-2 h-full hover:bg-brand/15"
          >
            <span className="font-medium text-brand">{label}:</span>
            <span className="text-foreground/80 max-w-[180px] truncate">
              {summary}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <div className="px-2 py-1.5 border-b text-xs font-medium truncate">
            {label}
          </div>
          <ValueSelector
            rows={rows}
            col={col}
            numeric={numeric}
            selected={values}
            onToggle={(v) =>
              onChange(
                values.includes(v)
                  ? values.filter((x) => x !== v)
                  : [...values, v]
              )
            }
            onClear={() => onChange([])}
          />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={onRemove}
        className="px-1.5 h-full hover:bg-brand/20 border-l border-brand/30"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ── Bar: Filter button + active chips + clear all ─────────────────────

export function AacColumnFilterBar({
  columns,
  labels,
  rows,
  numericCols,
  filters,
  onChange,
}: {
  columns: string[];
  labels: Record<string, string>;
  /** Rows in the current status+search context, used for distinct values/counts. */
  rows: AACRow[];
  numericCols: Set<string>;
  filters: AacFilters;
  onChange: (next: AacFilters) => void;
}) {
  const activeCols = columns.filter((c) => (filters[c]?.length ?? 0) > 0);

  return (
    <div className="flex items-center gap-2 flex-wrap mt-3">
      <AddFilterButton
        columns={columns}
        labels={labels}
        rows={rows}
        numericCols={numericCols}
        filters={filters}
        onChange={onChange}
      />
      {activeCols.map((col) => (
        <FilterChip
          key={col}
          col={col}
          label={labels[col] ?? col.replace(/_/g, " ")}
          rows={rows}
          numeric={numericCols.has(col)}
          values={filters[col]}
          onChange={(vals) =>
            onChange(
              vals.length ? { ...filters, [col]: vals } : removeKey(filters, col)
            )
          }
          onRemove={() => onChange(removeKey(filters, col))}
        />
      ))}
      {activeCols.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => onChange({})}
        >
          Clear all
        </Button>
      )}
    </div>
  );
}

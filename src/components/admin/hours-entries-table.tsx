"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronRight, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildCategoryQuery,
  clientLabel,
  formatClock,
  formatDayRowLabel,
  fmtHM,
} from "@/lib/hours/dashboard-utils";
import {
  categoryKey,
  filterHoursEntries,
  groupHoursEntries,
  hoursSubtotalGrouping,
  nextHoursSort,
  shouldShowHoursSubtotals,
  sortHoursEntries,
  sumHours,
  uniqueCategories,
  uniqueMembers,
  type HoursSortCol,
  type HoursSortDir,
} from "@/lib/hours/entries-table-view";
import {
  draftFromEntry,
  isDraftDirty,
  isDraftValid,
  type ApiEntry,
  type Draft,
} from "@/lib/hours/inline-edit";
import { normalizeRange } from "@/lib/hours/validation";

export type HoursEntryRow = {
  id: string;
  entryDate?: string;
  startTime: string;
  endTime: string;
  hours: number;
  note: string | null;
  category: string | null;
  clientIdCode: string;
  userId: string;
  userName: string | null;
  userEmail: string;
};

type ClientOption = { clientIdCode: string; clientName: string };

function clockToHm(t: string): string {
  return t.slice(0, 5);
}

function toApiEntry(e: HoursEntryRow, fallbackDate?: string): ApiEntry {
  return {
    id: e.id,
    userId: e.userId,
    clientIdCode: e.clientIdCode,
    entryDate: e.entryDate ?? fallbackDate ?? "",
    startTime: clockToHm(e.startTime),
    endTime: clockToHm(e.endTime),
    hours: e.hours,
    note: e.note,
    category: e.category,
  };
}

function applyDraftToHoursRows(
  rows: HoursEntryRow[],
  id: string,
  draft: Draft,
): HoursEntryRow[] {
  return rows.map((row) => {
    if (row.id !== id) return row;
    const r = normalizeRange({ startTime: draft.startTime, endTime: draft.endTime });
    if (!r.ok) return row;
    const note = draft.note.trim();
    const category = draft.category.trim();
    return {
      ...row,
      clientIdCode: draft.clientIdCode,
      category: category === "" ? null : category,
      startTime: r.range.startTime,
      endTime: r.range.endTime,
      hours: r.range.hours,
      note: note === "" ? null : note,
    };
  });
}

function applyServerToHoursRows(
  rows: HoursEntryRow[],
  entry: ApiEntry,
): HoursEntryRow[] {
  return rows.map((row) =>
    row.id === entry.id
      ? {
          ...row,
          clientIdCode: entry.clientIdCode,
          category: entry.category,
          startTime: entry.startTime,
          endTime: entry.endTime,
          hours: entry.hours,
          note: entry.note,
          entryDate: entry.entryDate || row.entryDate,
        }
      : row,
  );
}

function invalidateHoursCaches(qc: ReturnType<typeof useQueryClient>) {
  // Aggregates only — entry lists are patched in-place so the open table
  // does not snap back to a stale refetch.
  void qc.invalidateQueries({ queryKey: ["hours-summary"] });
  void qc.invalidateQueries({ queryKey: ["hours-daily"] });
}

/** Keep open day/range detail queries aligned with a successful PATCH. */
function patchEntryListCaches(
  qc: ReturnType<typeof useQueryClient>,
  entry: ApiEntry,
) {
  const patch = (old: { entries: HoursEntryRow[] } | undefined) => {
    if (!old?.entries) return old;
    return { ...old, entries: applyServerToHoursRows(old.entries, entry) };
  };
  qc.setQueriesData<{ entries: HoursEntryRow[] }>({ queryKey: ["hours-heatmap-day"] }, patch);
  qc.setQueriesData<{ entries: HoursEntryRow[] }>({ queryKey: ["hours-range-entries"] }, patch);
}

function FacetFilter({
  label,
  items,
  selected,
  onToggle,
  onSetSelected,
}: {
  label: string;
  items: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onSetSelected: (ids: string[]) => void;
}) {
  if (items.length === 0) return null;
  const count = selected.length;
  const allOn = items.length > 0 && items.every((it) => selected.includes(it.id));
  const someOn = !allOn && count > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={count > 0 ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1 text-xs"
        >
          {label}
          {count > 0 ? ` (${count})` : ""}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="flex max-h-64 w-56 flex-col overflow-hidden p-0"
      >
        <div className="shrink-0 border-b border-border p-1">
          <DropdownMenuCheckboxItem
            checked={allOn ? true : someOn ? "indeterminate" : false}
            onCheckedChange={() => onSetSelected(allOn ? [] : items.map((it) => it.id))}
            onSelect={(ev) => ev.preventDefault()}
            className="text-xs font-medium"
          >
            All
          </DropdownMenuCheckboxItem>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {items.map((it) => (
            <DropdownMenuCheckboxItem
              key={it.id === "" ? "__uncategorized__" : it.id}
              checked={selected.includes(it.id)}
              onCheckedChange={() => onToggle(it.id)}
              onSelect={(ev) => ev.preventDefault()}
              className="text-xs"
            >
              {it.label}
            </DropdownMenuCheckboxItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortableHead({
  label,
  col,
  sortCol,
  sortDir,
  onToggle,
}: {
  label: string;
  col: HoursSortCol;
  sortCol: HoursSortCol | null;
  sortDir: HoursSortDir;
  onToggle: (col: HoursSortCol) => void;
}) {
  const active = sortCol === col;
  return (
    <TableHead
      aria-sort={active ? (sortDir === "desc" ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={() => onToggle(col)}
        className="inline-flex items-center gap-1 text-left font-medium"
        aria-label={`Sort by ${label}`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-30" />
        )}
      </button>
    </TableHead>
  );
}

function HoursSubtotalRow({
  label,
  hours,
  colSpan,
  editable,
  strong = false,
}: {
  label: string;
  hours: number;
  colSpan: number;
  editable: boolean;
  strong?: boolean;
}) {
  return (
    <TableRow className="bg-muted/50 hover:bg-muted/50">
      <TableCell
        colSpan={colSpan}
        className={
          strong
            ? "text-xs font-bold uppercase tracking-wide text-foreground"
            : "text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
        }
      >
        {label}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums text-foreground">
        {fmtHM(hours)}
      </TableCell>
      {editable && <TableCell />}
    </TableRow>
  );
}

export function HoursEntriesTable({
  entries,
  showDate = false,
  showMember = false,
  showClient = true,
  editable = true,
  fallbackDate,
}: {
  entries: HoursEntryRow[];
  showDate?: boolean;
  showMember?: boolean;
  showClient?: boolean;
  /** Super-admin inline edit (Admin Hours). */
  editable?: boolean;
  /** Used when entries lack entryDate (single-day heatmap detail). */
  fallbackDate?: string;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState(entries);
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [selectOpen, setSelectOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [bulkClient, setBulkClient] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [memberFilter, setMemberFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [sortCol, setSortCol] = useState<HoursSortCol | null>(null);
  const [sortDir, setSortDir] = useState<HoursSortDir>("asc");

  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  // Adopt parent data only when the prop changes. Do NOT re-sync when drafts
  // drain after a silent save — that was clobbering persisted edits with the
  // still-stale parent list and making quick edits "disappear".
  useEffect(() => {
    if (draftsRef.current.size > 0) return;
    setRows(entries);
  }, [entries]);

  // Drop selection for rows that disappeared after a parent refresh.
  useEffect(() => {
    const ids = new Set(rows.map((r) => r.id));
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [rows]);

  useEffect(() => {
    const memberIds = new Set(rows.map((r) => r.userId));
    const cats = new Set(rows.map((r) => categoryKey(r)));
    setMemberFilter((prev) => {
      const next = prev.filter((id) => memberIds.has(id));
      return next.length === prev.length ? prev : next;
    });
    setCategoryFilter((prev) => {
      const next = prev.filter((id) => cats.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [rows]);

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ["hours-client-options"],
    enabled: editable,
    queryFn: async () => {
      const res = await fetch("/api/clients/list?status=Active");
      if (!res.ok) throw new Error("Failed to load clients");
      const json = await res.json();
      return Array.isArray(json) ? json : (json.clients ?? []);
    },
  });

  const { data: categories = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["hours-categories"],
    enabled: editable,
    queryFn: async () => {
      const res = await fetch("/api/hours/categories");
      if (!res.ok) throw new Error("Failed to load categories");
      return (await res.json()).categories;
    },
  });

  const memberOptions = useMemo(() => uniqueMembers(rows), [rows]);
  const categoryOptions = useMemo(() => uniqueCategories(rows), [rows]);
  const visibleRows = useMemo(
    () => sortHoursEntries(filterHoursEntries(rows, memberFilter, categoryFilter), sortCol, sortDir),
    [rows, memberFilter, categoryFilter, sortCol, sortDir],
  );
  const showSubtotals = shouldShowHoursSubtotals(sortCol, memberFilter, categoryFilter);
  const grouping = hoursSubtotalGrouping(sortCol, memberFilter, categoryFilter, showMember);
  const groups = useMemo(
    () => (grouping ? groupHoursEntries(visibleRows, grouping) : []),
    [visibleRows, grouping],
  );
  const interleaveSubtotals = sortCol !== null && groups.length > 0;
  const filteredHours = useMemo(() => sumHours(visibleRows), [visibleRows]);
  const bodyItems = useMemo(() => {
    if (!interleaveSubtotals) {
      return visibleRows.map((row) => ({ kind: "entry" as const, row }));
    }
    const items: Array<
      | { kind: "entry"; row: HoursEntryRow }
      | { kind: "subtotal"; key: string; label: string; hours: number }
    > = [];
    for (const g of groups) {
      for (const row of g.rows) items.push({ kind: "entry", row });
      items.push({ kind: "subtotal", key: g.key, label: g.label, hours: g.hours });
    }
    return items;
  }, [interleaveSubtotals, visibleRows, groups]);
  // 1o8 time logs carry hours only (no start/end clock), so those columns drop out.
  const showTimes = rows.some((r) => !!r.startTime);
  const colsBeforeHours =
    (editable ? 1 : 0) +
    (showDate ? 1 : 0) +
    (showTimes ? 2 : 0) +
    (showMember ? 1 : 0) +
    (showClient ? 1 : 0) +
    2;
  const totalCols = colsBeforeHours + 1 + (editable ? 1 : 0);
  const showFooter =
    showSubtotals && (interleaveSubtotals ? groups.length > 1 : groups.length > 0);
  const hasFacetFilters = memberFilter.length > 0 || categoryFilter.length > 0;

  const allSelected =
    visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id));
  const someSelected = visibleRows.some((r) => selected.has(r.id)) && !allSelected;
  const canBulkApply = selected.size > 0 && (bulkClient !== "" || bulkCategory !== "");

  function toggleMemberFilter(id: string) {
    setMemberFilter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleCategoryFilter(id: string) {
    setCategoryFilter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function clearFilters() {
    setMemberFilter([]);
    setCategoryFilter([]);
  }

  function toggleSort(col: HoursSortCol) {
    const next = nextHoursSort(sortCol, sortDir, col);
    setSortCol(next.col);
    setSortDir(next.dir);
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of visibleRows) next.delete(r.id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of visibleRows) next.add(r.id);
        return next;
      });
    }
  }

  function toggleSelect(id: string, shiftKey: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedId) {
        const ids = visibleRows.map((r) => r.id);
        const a = ids.indexOf(lastClickedId);
        const b = ids.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastClickedId(id);
  }

  function clearSelection() {
    setSelected(new Set());
    setLastClickedId(null);
    setBulkClient("");
    setBulkCategory("");
    setBulkError(null);
  }

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => {
      const cur = prev.get(id);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(id, { ...cur, ...patch });
      return next;
    });
  }

  async function sendDraft(id: string, draft: Draft) {
    const res = await fetch(`/api/hours/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entryDate: draft.snapshot.entryDate,
        clientIdCode: draft.clientIdCode,
        category: draft.category.trim() || null,
        startTime: draft.startTime,
        endTime: draft.endTime,
        note: draft.note.trim() || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to update entry");
    return json.entry as ApiEntry;
  }

  function openRow(entry: HoursEntryRow) {
    const api = toApiEntry(entry, fallbackDate);
    if (!api.entryDate) return;
    setDrafts((prev) => {
      const next = new Map(prev);
      const existing = prev.get(entry.id);
      next.set(
        entry.id,
        existing
          ? { ...existing, status: "editing", error: undefined }
          : draftFromEntry(api),
      );
      return next;
    });
    setActiveRowId(entry.id);
  }

  function discardRow(id: string) {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setActiveRowId((cur) => (cur === id ? null : cur));
  }

  /** Optimistic, non-blocking — same as Log hours. */
  function commitRow(id: string) {
    const draft = drafts.get(id);
    if (!draft) return;

    if (!isDraftDirty(draft)) {
      discardRow(id);
      return;
    }

    const valid = isDraftValid(draft);
    if (!valid.ok) {
      patchDraft(id, { status: "error", error: valid.error });
      setActiveRowId((cur) => (cur === id ? null : cur));
      return;
    }

    setRows((prev) => applyDraftToHoursRows(prev, id, draft));
    const savedDraft: Draft = { ...draft, status: "saving", error: undefined };
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(id, savedDraft);
      return next;
    });
    setActiveRowId((cur) => (cur === id ? null : cur));

    void sendDraft(id, draft)
      .then((entry) => {
        const cur = draftsRef.current.get(id);
        if (cur !== undefined && cur !== savedDraft) return;
        setRows((prev) => applyServerToHoursRows(prev, entry));
        setDrafts((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        patchEntryListCaches(qc, entry);
        invalidateHoursCaches(qc);
      })
      .catch((err: Error) => {
        const cur = draftsRef.current.get(id);
        if (cur !== undefined && cur !== savedDraft) return;
        setRows((prev) => applyServerToHoursRows(prev, draft.snapshot));
        patchDraft(id, { status: "error", error: err.message });
      });
  }

  async function applyBulk() {
    if (!canBulkApply || bulkBusy) return;
    if (activeRowId) commitRow(activeRowId);

    const ids = [...selected];
    const snapshots = new Map(rows.map((r) => [r.id, r] as const));

    setBulkBusy(true);
    setBulkError(null);

    // Optimistic UI: only overwrite fields the admin chose to change.
    setRows((prev) =>
      prev.map((row) => {
        if (!selected.has(row.id)) return row;
        return {
          ...row,
          ...(bulkClient ? { clientIdCode: bulkClient } : {}),
          ...(bulkCategory ? { category: bulkCategory } : {}),
        };
      }),
    );

    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const row = snapshots.get(id);
        if (!row) throw new Error("Row missing");
        const entryDate = row.entryDate ?? fallbackDate;
        if (!entryDate) throw new Error("Missing date");
        const res = await fetch(`/api/hours/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryDate,
            clientIdCode: bulkClient || row.clientIdCode,
            category: bulkCategory || row.category,
            startTime: clockToHm(row.startTime),
            endTime: clockToHm(row.endTime),
            note: row.note,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to update");
        return json.entry as ApiEntry;
      }),
    );

    const failed: string[] = [];
    results.forEach((r, i) => {
      const id = ids[i];
      if (r.status === "fulfilled") {
        setRows((prev) => applyServerToHoursRows(prev, r.value));
        patchEntryListCaches(qc, r.value);
      } else {
        failed.push(id);
        const snap = snapshots.get(id);
        if (snap) {
          setRows((prev) => prev.map((row) => (row.id === id ? snap : row)));
        }
      }
    });

    setBulkBusy(false);
    if (failed.length > 0) {
      setBulkError(`Failed to update ${failed.length} of ${ids.length} rows`);
      setSelected(new Set(failed));
    } else {
      clearSelection();
      invalidateHoursCaches(qc);
    }
  }

  const activeRowIdRef = useRef(activeRowId);
  const commitRowRef = useRef(commitRow);
  useEffect(() => {
    activeRowIdRef.current = activeRowId;
    commitRowRef.current = commitRow;
  });

  // Commit on click outside the open row (covers clicking another row).
  useEffect(() => {
    if (!editable || !activeRowId) return;
    const rowId = activeRowId;
    function onPointerDown(ev: PointerEvent) {
      if (selectOpen) return;
      const target = ev.target as HTMLElement | null;
      if (target?.closest(`[data-row-id="${rowId}"]`)) return;
      commitRowRef.current(rowId);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [activeRowId, selectOpen, drafts, editable]);

  // Commit on unmount.
  useEffect(() => {
    return () => {
      const id = activeRowIdRef.current;
      if (id) commitRowRef.current(id);
    };
  }, []);

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No entries.</p>;
  }

  return (
    <div className="space-y-2">
      {editable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-muted/40 px-3 py-2 dark:border-zinc-800">
          <span className="text-xs font-medium tabular-nums text-foreground">
            {selected.size} selected
          </span>
          <Select
            value={bulkClient || "__keep__"}
            onValueChange={(v) => setBulkClient(v === "__keep__" ? "" : v)}
            onOpenChange={setSelectOpen}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__keep__">Keep client</SelectItem>
              <SelectItem
                value="INTERNAL"
                className="font-medium text-brand focus:text-brand data-[highlighted]:text-brand"
              >
                1o8
              </SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                  {c.clientName || c.clientIdCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={bulkCategory || "__keep__"}
            onValueChange={(v) => setBulkCategory(v === "__keep__" ? "" : v)}
            onOpenChange={setSelectOpen}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__keep__">Keep category</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={!canBulkApply || bulkBusy}
            onClick={() => void applyBulk()}
          >
            {bulkBusy ? "Applying…" : "Apply"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            disabled={bulkBusy}
            onClick={clearSelection}
          >
            Clear
          </Button>
          {bulkError && (
            <span className="text-xs text-brand-red" role="alert">
              {bulkError}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {showMember && (
          <FacetFilter
            label="Team member"
            items={memberOptions}
            selected={memberFilter}
            onToggle={toggleMemberFilter}
            onSetSelected={setMemberFilter}
          />
        )}
        <FacetFilter
          label="Department"
          items={categoryOptions}
          selected={categoryFilter}
          onToggle={toggleCategoryFilter}
          onSetSelected={setCategoryFilter}
        />
        {hasFacetFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs text-muted-foreground"
            onClick={clearFilters}
          >
            <X className="size-3" />
            Clear filters
          </Button>
        )}
        {hasFacetFilters && (
          <span className="text-xs tabular-nums text-muted-foreground">
            Showing {visibleRows.length} of {rows.length} · {fmtHM(filteredHours)}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {editable && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={() => toggleSelectAll()}
                    aria-label="Select all rows"
                    onClick={(ev) => ev.stopPropagation()}
                  />
                </TableHead>
              )}
              {showDate && <TableHead className="w-36">Date</TableHead>}
              {showTimes && <TableHead className="w-24">Start</TableHead>}
              {showTimes && <TableHead className="w-24">End</TableHead>}
              {showMember && (
                <SortableHead
                  label="Team member"
                  col="member"
                  sortCol={sortCol}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              )}
              {showClient && <TableHead>Client</TableHead>}
              <SortableHead
                label="Department"
                col="category"
                sortCol={sortCol}
                sortDir={sortDir}
                onToggle={toggleSort}
              />
              <TableHead>Comments</TableHead>
              <TableHead className="w-20 text-right">Hours</TableHead>
              {editable && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bodyItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalCols} className="text-muted-foreground">
                  No matching entries.
                </TableCell>
              </TableRow>
            ) : (
            bodyItems.map((item) => {
              if (item.kind === "subtotal") {
                return (
                  <HoursSubtotalRow
                    key={`subtotal-${item.key}`}
                    label={`Subtotal · ${item.label}`}
                    hours={item.hours}
                    colSpan={colsBeforeHours}
                    editable={editable}
                  />
                );
              }
              const e = item.row;
              const draft = drafts.get(e.id);
              const isEditing =
                editable &&
                draft !== undefined &&
                (e.id === activeRowId || draft.status === "error");
              const isSelected = selected.has(e.id);

              const selectCell = editable ? (
                <TableCell
                  className="w-10"
                  onClick={(ev) => ev.stopPropagation()}
                  onPointerDown={(ev) => ev.stopPropagation()}
                >
                  <Checkbox
                    checked={isSelected}
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      toggleSelect(e.id, ev.shiftKey);
                    }}
                    aria-label="Select row"
                  />
                </TableCell>
              ) : null;

              if (isEditing && draft) {
                const editRange = normalizeRange({
                  startTime: draft.startTime,
                  endTime: draft.endTime,
                });
                const editCategoryOptions =
                  draft.category && !categories.some((c) => c.name === draft.category)
                    ? [{ id: `current:${draft.category}`, name: draft.category }, ...categories]
                    : categories;

                return (
                  <TableRow
                    key={e.id}
                    data-row-id={e.id}
                    className={
                      draft.status === "error"
                        ? "border border-brand-red/60 bg-muted/40"
                        : "bg-muted/40"
                    }
                  >
                    {selectCell}
                    {showDate && (
                      <TableCell className="tabular-nums text-muted-foreground">
                        {e.entryDate ? formatDayRowLabel(e.entryDate) : "—"}
                      </TableCell>
                    )}
                    <TableCell>
                      <Input
                        type="time"
                        value={draft.startTime}
                        onChange={(ev) => patchDraft(e.id, { startTime: ev.target.value })}
                        className="h-8 w-[7.5rem] text-sm tabular-nums"
                        aria-label="Edit start time"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="time"
                        value={draft.endTime}
                        onChange={(ev) => patchDraft(e.id, { endTime: ev.target.value })}
                        className="h-8 w-[7.5rem] text-sm tabular-nums"
                        aria-label="Edit end time"
                      />
                    </TableCell>
                    {showMember && (
                      <TableCell className="text-sm text-muted-foreground">
                        {e.userName ?? e.userEmail}
                      </TableCell>
                    )}
                    {showClient && (
                      <TableCell>
                        <Select
                          value={draft.clientIdCode}
                          onValueChange={(v) => patchDraft(e.id, { clientIdCode: v })}
                          onOpenChange={setSelectOpen}
                        >
                          <SelectTrigger className="h-8 w-44 text-sm">
                            <SelectValue placeholder="Client" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem
                              value="INTERNAL"
                              className="font-medium text-brand focus:text-brand data-[highlighted]:text-brand"
                            >
                              1o8
                            </SelectItem>
                            {clients.map((c) => (
                              <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                                {c.clientName || c.clientIdCode}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    <TableCell>
                      <Select
                        value={draft.category}
                        onValueChange={(v) => patchDraft(e.id, { category: v })}
                        onOpenChange={setSelectOpen}
                      >
                        <SelectTrigger className="h-8 w-36 text-sm">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          {editCategoryOptions.map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.note}
                        onChange={(ev) => patchDraft(e.id, { note: ev.target.value })}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") {
                            ev.preventDefault();
                            commitRow(e.id);
                          }
                          if (ev.key === "Escape") {
                            ev.preventDefault();
                            discardRow(e.id);
                          }
                        }}
                        placeholder="Note"
                        aria-label="Edit note"
                        className="h-8 min-w-[12rem] text-sm"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {editRange.ok ? fmtHM(editRange.range.hours) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {draft.status === "error" && (
                          <div className="flex items-center gap-1">
                            <span
                              className="max-w-[10rem] truncate text-xs text-brand-red"
                              role="alert"
                            >
                              {draft.error}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => commitRow(e.id)}
                              aria-label="Retry save"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={!isDraftValid(draft).ok}
                          onClick={() => commitRow(e.id)}
                          aria-label="Save entry"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => discardRow(e.id)}
                          aria-label="Cancel edit"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }

              return (
                <TableRow
                  key={e.id}
                  data-row-id={e.id}
                  className={
                    editable
                      ? `cursor-pointer hover:bg-muted/40 ${isSelected ? "bg-amber-50/80 dark:bg-amber-500/10" : ""}`
                      : undefined
                  }
                  onClick={editable ? () => openRow(e) : undefined}
                  title={editable ? "Click to edit" : undefined}
                >
                  {selectCell}
                  {showDate && (
                    <TableCell className="tabular-nums text-muted-foreground">
                      {e.entryDate ? formatDayRowLabel(e.entryDate) : "—"}
                    </TableCell>
                  )}
                  {showTimes && (
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatClock(e.startTime)}
                    </TableCell>
                  )}
                  {showTimes && (
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatClock(e.endTime)}
                    </TableCell>
                  )}
                  {showMember && (
                    <TableCell className="text-sm">{e.userName ?? e.userEmail}</TableCell>
                  )}
                  {showClient && (
                    <TableCell
                      className={
                        e.clientIdCode === "INTERNAL" ? "font-medium text-brand" : undefined
                      }
                    >
                      {clientLabel(e.clientIdCode)}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground">{e.category ?? "—"}</TableCell>
                  <TableCell
                    className="max-w-md truncate italic text-muted-foreground"
                    title={e.note ?? undefined}
                  >
                    {e.note ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmtHM(e.hours)}
                  </TableCell>
                  {editable && <TableCell />}
                </TableRow>
              );
            })
            )}
          </TableBody>
          {showFooter && (
            <TableFooter>
              {!interleaveSubtotals &&
                groups.map((g) => (
                  <HoursSubtotalRow
                    key={`footer-${g.key}`}
                    label={`Subtotal · ${g.label}`}
                    hours={g.hours}
                    colSpan={colsBeforeHours}
                    editable={editable}
                  />
                ))}
              {groups.length > 1 && (
                <HoursSubtotalRow
                  label="Total"
                  hours={filteredHours}
                  colSpan={colsBeforeHours}
                  editable={editable}
                  strong
                />
              )}
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}

const CARD = "rounded-xl border border-stone-200 bg-card p-4 dark:border-zinc-800";

/** Date-range scope card matching HeatmapDayDetail layout. */
export function RangeScopeDetail({
  label,
  brand,
  from,
  to,
  hours,
  userId,
  clientIdCode,
  categories,
  open,
  onToggle,
  showMember,
  showClient,
  editable = true,
}: {
  label: string;
  brand?: boolean;
  from: string;
  to: string;
  hours: number;
  userId?: string;
  clientIdCode?: string;
  categories: string[];
  open: boolean;
  onToggle: () => void;
  showMember?: boolean;
  showClient?: boolean;
  editable?: boolean;
}) {
  const { data, isLoading, error } = useQuery<{ entries: HoursEntryRow[] }>({
    queryKey: ["hours-range-entries", from, to, userId, clientIdCode, categories],
    enabled: open,
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (userId) params.set("userId", userId);
      if (clientIdCode) params.set("clientIdCode", clientIdCode);
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
      const byDate = (a.entryDate ?? "").localeCompare(b.entryDate ?? "");
      if (byDate !== 0) return byDate;
      const byStart = a.startTime.localeCompare(b.startTime);
      if (byStart !== 0) return byStart;
      return (a.userName ?? a.userEmail).localeCompare(b.userName ?? b.userEmail);
    });
    return rows;
  }, [data?.entries]);

  return (
    <div className={CARD}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="mt-0.5 text-muted-foreground">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={`text-sm font-medium ${brand ? "text-brand" : "text-foreground"}`}
          >
            {label}
          </div>
          <div className="mt-0.5 text-sm font-medium text-foreground">
            {formatDayRowLabel(from)} – {formatDayRowLabel(to)}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            Total Hours:{" "}
            <span className="text-base font-medium tabular-nums text-foreground">
              {fmtHM(hours)}
            </span>
          </div>
        </div>
      </button>

      {open && (
        <div className="mt-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-xs text-destructive">
              {error instanceof Error ? error.message : "Failed to load entries"}
            </p>
          ) : (
            <HoursEntriesTable
              entries={entries}
              showDate
              showMember={showMember}
              showClient={showClient ?? true}
              editable={editable}
            />
          )}
        </div>
      )}
    </div>
  );
}

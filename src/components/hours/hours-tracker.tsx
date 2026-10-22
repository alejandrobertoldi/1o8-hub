"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import {
  Trash2,
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  X,
  RotateCcw,
} from "lucide-react";
import {
  normalizeRange,
  findOverlaps,
  formatHoursMinutes,
  computeShift,
  nextEntryStart,
} from "@/lib/hours/validation";
import {
  type ApiEntry,
  type Draft,
  draftFromEntry,
  isDraftDirty,
  isDraftValid,
  applyDraftToRows,
  applyServerEntry,
} from "@/lib/hours/inline-edit";
import { HoursHeatmapCalendar } from "@/components/hours/hours-heatmap-calendar";
import { HoursExportDialog } from "@/components/hours/hours-export-dialog";
import { formatDayLabel } from "@/lib/hours/dashboard-utils";

type ClientOption = { clientIdCode: string; clientName: string | null };

/** 1o8 (orange) display remap for the stored "INTERNAL" client code. */
function displayClient(clientIdCode: string): { label: string; isInternal: boolean } {
  return clientIdCode === "INTERNAL"
    ? { label: "1o8", isInternal: true }
    : { label: clientIdCode, isInternal: false };
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/** Hour + minute dropdowns that read/emit a "HH:MM" string (minutes in 5-min steps). */
function TimeSelect({
  value,
  onChange,
  ariaLabel,
  onOpenChange,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [h, m] = value ? value.split(":") : ["", ""];
  return (
    <div className="flex items-center gap-1" aria-label={ariaLabel}>
      <Select
        value={h || ""}
        onValueChange={(nh) => onChange(`${nh}:${m || "00"}`)}
        onOpenChange={onOpenChange}
      >
        <SelectTrigger className="w-20" aria-label="Hour">
          <SelectValue placeholder="HH" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {HOURS.map((hh) => (
            <SelectItem key={hh} value={hh}>
              {hh}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select
        value={m || ""}
        onValueChange={(nm) => onChange(`${h || "09"}:${nm}`)}
        onOpenChange={onOpenChange}
      >
        <SelectTrigger className="w-20" aria-label="Minute">
          <SelectValue placeholder="MM" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {MINUTES.map((mm) => (
            <SelectItem key={mm} value={mm}>
              {mm}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-07-20" -> "2026-07-20 Mon". Parses as local date parts, not UTC. */
function dayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
  return `${dateStr} ${weekday}`;
}

/** Monday..Sunday range containing `today`. */
function currentWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: isoDate(monday), to: isoDate(sunday) };
}

/** Monday..Sunday range for the previous calendar week. */
function lastWeekRange(): { from: string; to: string } {
  const { from } = currentWeekRange();
  const [y, m, d] = from.split("-").map(Number);
  const thisMonday = new Date(y, m - 1, d);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  return { from: isoDate(lastMonday), to: isoDate(lastSunday) };
}

/** First..last day of the current calendar month. */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: isoDate(first), to: isoDate(last) };
}

/** First..last day of the previous calendar month. */
function lastMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: isoDate(first), to: isoDate(last) };
}

/** Safely-early fixed floor date for the "All Time" preset. */
const ALL_TIME_FROM = "2020-01-01";

type RangePreset = "week" | "last-week" | "month" | "last-month" | "all";

export function HoursTracker() {
  const queryClient = useQueryClient();
  const week = useMemo(() => currentWeekRange(), []);
  const lastWeek = useMemo(() => lastWeekRange(), []);
  const month = useMemo(() => currentMonthRange(), []);
  const lastMonth = useMemo(() => lastMonthRange(), []);
  const [preset, setPreset] = useState<RangePreset>("week");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const range = useMemo(() => {
    if (selectedDate) return { from: selectedDate, to: selectedDate };
    if (preset === "last-week") return lastWeek;
    if (preset === "month") return month;
    if (preset === "last-month") return lastMonth;
    if (preset === "all") return { from: ALL_TIME_FROM, to: isoDate(new Date()) };
    return week;
  }, [selectedDate, preset, week, lastWeek, month, lastMonth]);

  const [mode, setMode] = useState<"range" | "duration">("range");
  const [entryDate, setEntryDate] = useState(() => isoDate(new Date()));
  const [clientIdCode, setClientIdCode] = useState("");
  const [category, setCategory] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");

  const { data: clients = [] } = useQuery<ClientOption[]>({
    // Unique key: the shared "clients-list" key is reused by several other pages
    // that fetch different endpoints/filters. React Query caches by key, so this
    // dropdown would otherwise render whichever result those pages cached first
    // (sometimes an empty array) instead of its own. Keep this query isolated.
    queryKey: ["hours-client-options"],
    queryFn: async () => {
      // Lightweight active-client list ({ clientIdCode, clientName }) — the right
      // shape for the dropdown without the heavy /api/clients aggregation.
      const res = await fetch("/api/clients/list?status=Active");
      if (!res.ok) throw new Error("Failed to load clients");
      const json = await res.json();
      return Array.isArray(json) ? json : (json.clients ?? []);
    },
  });

  // `isPending`/`isError` are surfaced deliberately. Destructuring only
  // `data: categories = []` makes a 503, a timeout and a genuinely empty table
  // render identically — see the Category field below.
  const {
    data: categories = [],
    isPending: categoriesPending,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["hours-categories"],
    queryFn: async () => {
      const res = await fetch("/api/hours/categories");
      if (!res.ok) throw new Error(`Failed to load categories (HTTP ${res.status})`);
      return (await res.json()).categories;
    },
  });

  const { data: entries = [], isLoading } = useQuery<ApiEntry[]>({
    queryKey: ["hours", range.from, range.to],
    queryFn: async () => {
      const res = await fetch(`/api/hours?from=${range.from}&to=${range.to}`);
      if (!res.ok) throw new Error("Failed to load hours");
      return (await res.json()).entries;
    },
    // A draft on a currently-loaded row holds unsaved input a background refetch
    // would clobber. A draft whose row is NOT in the visible range is unreachable
    // — the user can neither see nor dismiss it — so it must not suppress
    // refetching forever (ruling H6).
    //
    // Rows come from the `query` TanStack hands the function form, so that half
    // is exact at event time. Drafts come from the render closure. Never through
    // a closure over `entries` — a function capturing `entries` is opaque to the
    // React Compiler, which then cannot prove `entries` is immutable and drops
    // memoization on every `useMemo` depending on it (`overlapIds`,
    // `clientFilterOptions`, `filteredEntries`): five
    // `react-hooks/preserve-manual-memoization` errors that fail `npm run lint`,
    // and real lost optimization once `reactCompiler` is switched on.
    //
    // The drafts half lags by at most one passive-effect flush, and that is NOT
    // removable from here: QueryObserver#shouldFetchOnWindowFocus reads
    // `observer.options`, which useBaseQuery assigns from its own useEffect. A
    // focus event is user-gated and cannot land inside that window. An `online`
    // event is not user-gated and can — accepted, because the only reachable
    // case is openRow, where the draft is not yet dirty. Do not "fix" this with
    // a mirror ref: that lags on both halves instead of one.
    //
    // TanStack invokes these only from shouldFetchOnWindowFocus /
    // shouldFetchOnReconnect — on events, never during this call — so
    // referencing `drafts`, declared below, is TDZ-safe.
    refetchOnWindowFocus: (q) => !(q.state.data ?? []).some((e) => drafts.has(e.id)),
    refetchOnReconnect: (q) => !(q.state.data ?? []).some((e) => drafts.has(e.id)),
  });

  // Live end-time preview for both modes; marks a next-day end.
  const shiftPreview = useMemo(() => {
    const input =
      mode === "range"
        ? { startTime, endTime }
        : { startTime, durationHours: Number(duration) };
    const r = computeShift(input);
    if (!r.ok) return null;
    const last = r.segments[r.segments.length - 1];
    const crosses = r.segments.length > 1;
    return { end: last.endTime, crosses };
  }, [mode, startTime, endTime, duration]);

  const createEntry = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        entryDate,
        clientIdCode,
        category,
        startTime,
        note: note || null,
      };
      if (mode === "range") body.endTime = endTime;
      else body.durationHours = Number(duration);

      const res = await fetch("/api/hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save entry");
      return json as { entries: ApiEntry[]; overlaps: ApiEntry[] };
    },
    onSuccess: ({ entries, overlaps }) => {
      queryClient.invalidateQueries({ queryKey: ["hours"] });
      // Chain the form to where this entry ended so consecutive entries can be
      // logged back-to-back without re-picking a start (or overlapping). The
      // LAST row is the one to chain from: a midnight-crossing shift comes back
      // as two rows, and the second one carries the next day's date.
      if (entries.length > 0) {
        const next = nextEntryStart(entries[entries.length - 1]);
        setStartTime(next.startTime);
        setEntryDate(next.entryDate);
      }
      setEndTime("");
      setDuration("");
      setNote("");
      setCategory("");
      if (overlaps.length > 0) {
        const o = overlaps[0];
        toast.warning(
          `Overlaps an existing entry: ${o.clientIdCode} ${o.startTime}–${o.endTime}`
        );
      } else if (entries.length > 1) {
        const parts = entries.map((e) => formatHoursMinutes(e.hours)).join(" + ");
        toast.success(`Logged 2 entries — split at midnight (${parts})`);
      } else {
        toast.success("Hours logged");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hours/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete");
      return id;
    },
    onSuccess: (deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["hours"] });
      // A draft (e.g. mid-"saving") cannot outlive the row it belongs to,
      // or it becomes an unreachable entry in `drafts` forever.
      setDrafts((prev) => {
        if (!prev.has(deletedId)) return prev;
        const next = new Map(prev);
        next.delete(deletedId);
        return next;
      });
      toast.success("Entry deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Client-side pre-submit validation mirrors the server
  const canSubmit = useMemo(() => {
    if (!clientIdCode || !entryDate || !category) return false;
    const input =
      mode === "range"
        ? { startTime, endTime }
        : { startTime, durationHours: Number(duration) };
    return computeShift(input).ok;
  }, [clientIdCode, entryDate, category, mode, startTime, endTime, duration]);

  // Badge overlapping entries per day (same rule as the server)
  const overlapIds = useMemo(() => {
    const ids = new Set<string>();
    const byDay = new Map<string, ApiEntry[]>();
    for (const e of entries) {
      const list = byDay.get(e.entryDate) ?? [];
      list.push(e);
      byDay.set(e.entryDate, list);
    }
    for (const list of byDay.values()) {
      for (const e of list) {
        const others = list.filter((o) => o.id !== e.id);
        if (findOverlaps(e, others).length > 0) ids.add(e.id);
      }
    }
    return ids;
  }, [entries]);

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  // ---- List section: filtering, sorting, day-grouping ----
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [noteSearch, setNoteSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<"date" | "hours">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [timeSortDir, setTimeSortDir] = useState<"asc" | "desc">("desc");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  function handleSelectDay(date: string) {
    setSelectedDate(date);
    setExpandedDays(new Set([date]));
  }

  // ---- Inline edit mode: click-to-edit rows with optimistic background commit ----
  type FocusField = "client" | "category" | "time" | "note";

  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [selectOpen, setSelectOpen] = useState(false);
  const [focusField, setFocusField] = useState<FocusField | null>(null);

  // Mirrors `drafts` for the async sendDraft callbacks in commitRow, which need
  // to read the latest Map at resolution time without capturing stale state.
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const queryKey = ["hours", range.from, range.to] as const;

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => {
      const cur = prev.get(id);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(id, { ...cur, ...patch });
      return next;
    });
  }

  /** PATCH one row. Cache is already optimistically patched by commitRow. */
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

  function openRow(entry: ApiEntry, field: FocusField) {
    setDrafts((prev) => {
      const next = new Map(prev);
      const existing = prev.get(entry.id);
      // Resuming a red or in-flight row keeps the typed values AND its original
      // snapshot, so a rollback still lands on the pre-first-edit row rather than
      // on a value that was itself never confirmed.
      next.set(
        entry.id,
        existing
          ? { ...existing, status: "editing", error: undefined }
          : draftFromEntry(entry)
      );
      return next;
    });
    setActiveRowId(entry.id);
    setFocusField(field);
  }

  function discardRow(id: string) {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setActiveRowId((cur) => (cur === id ? null : cur));
    setFocusField(null);
  }

  /** Optimistic, non-blocking. Returns immediately; the request settles later. */
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
      setFocusField(null);
      return;
    }

    queryClient.setQueryData<ApiEntry[]>(queryKey, (rows) =>
      rows ? applyDraftToRows(rows, id, draft) : rows
    );
    // Captured by object identity: the stale-response guard below must tell
    // "the very draft I sent" apart from a new draft a later re-open created,
    // even when the two happen to hold identical field values.
    const savedDraft: Draft = { ...draft, status: "saving", error: undefined };
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(id, savedDraft);
      return next;
    });
    setActiveRowId((cur) => (cur === id ? null : cur));
    setFocusField(null);

    void sendDraft(id, draft)
      .then((entry) => {
        // A second edit may have re-opened this row while the request was in
        // flight. Patch the cache, but never delete the newer draft.
        const cur = draftsRef.current.get(id);
        const superseded = cur !== undefined && cur !== savedDraft;
        if (superseded) return;
        queryClient.setQueryData<ApiEntry[]>(queryKey, (rows) =>
          rows ? applyServerEntry(rows, entry) : rows
        );
        setDrafts((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      })
      .catch((err: Error) => {
        // Same identity guard as the success path: a newer draft (from a
        // re-open, itself possibly already mid-save) must not be clobbered
        // by a rollback and error status that belong to a stale request.
        const cur = draftsRef.current.get(id);
        if (cur !== undefined && cur !== savedDraft) return;
        queryClient.setQueryData<ApiEntry[]>(queryKey, (rows) =>
          rows ? applyServerEntry(rows, draft.snapshot) : rows
        );
        patchDraft(id, { status: "error", error: err.message });
      });
  }

  // Latest-ref mirrors: the range-change/unmount cleanup and the document
  // listener must never call a `commitRow` frozen at an earlier render.
  const activeRowIdRef = useRef(activeRowId);
  const commitRowRef = useRef(commitRow);
  useEffect(() => {
    activeRowIdRef.current = activeRowId;
    commitRowRef.current = commitRow;
  });

  // Commit on a click outside the open row. Suppressed while a Select
  // dropdown is open, because Radix renders that dropdown in a portal
  // outside the row — without the guard, opening the client dropdown would
  // commit the row.
  useEffect(() => {
    if (!activeRowId) return;
    // Captured in its own binding, not read as `activeRowId` inside the
    // closure below: TypeScript does not carry the `if (!activeRowId) return`
    // narrowing into a nested function declaration, so referencing
    // `activeRowId` directly inside `onPointerDown` still types as
    // `string | null` and fails to compile against `commitRowRef.current`'s
    // `(id: string) => void` signature. A fresh `const` fixes the type at the
    // point of assignment.
    const rowId = activeRowId;
    function onPointerDown(ev: PointerEvent) {
      if (selectOpen) return;
      const target = ev.target as HTMLElement | null;
      if (target?.closest(`[data-row-id="${rowId}"]`)) return;
      commitRowRef.current(rowId);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [activeRowId, selectOpen, drafts]);

  // Commit the open row when the visible range changes or the tracker unmounts.
  // React runs every cleanup before any of the next render's effect bodies, so
  // these refs still hold the values from the render that had the row open.
  useEffect(() => {
    return () => {
      const id = activeRowIdRef.current;
      if (id) commitRowRef.current(id);
    };
  }, [range.from, range.to]);

  function toggleDay(date: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function toggleSort(column: "date" | "hours") {
    if (column === sortColumn) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDir("desc");
    }
  }

  function toggleTimeSort() {
    setTimeSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  // Distinct clients present in the currently-loaded entries, for the filter dropdown.
  const clientFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (!seen.has(e.clientIdCode)) {
        seen.set(e.clientIdCode, displayClient(e.clientIdCode).label);
      }
    }
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    return entries.filter((e) => {
      if (clientFilter !== "all" && e.clientIdCode !== clientFilter) return false;
      if (q && !(e.note ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, clientFilter, noteSearch]);

  // Group filtered entries by day; sort day-summary rows by the active column/direction.
  const dayGroups = useMemo(() => {
    const byDay = new Map<string, ApiEntry[]>();
    for (const e of filteredEntries) {
      const list = byDay.get(e.entryDate) ?? [];
      list.push(e);
      byDay.set(e.entryDate, list);
    }
    const groups = Array.from(byDay.entries()).map(([date, list]) => {
      const dayEntries = [...list].sort((a, b) => {
        const cmp = a.startTime.localeCompare(b.startTime);
        return timeSortDir === "asc" ? cmp : -cmp;
      });
      const dayTotalHours = dayEntries.reduce((sum, e) => sum + e.hours, 0);
      const clients = Array.from(new Set(dayEntries.map((e) => e.clientIdCode)));
      const categoriesForDay = Array.from(
        new Set(dayEntries.map((e) => e.category).filter((c): c is string => Boolean(c)))
      );
      return { date, entries: dayEntries, totalHours: dayTotalHours, clients, categories: categoriesForDay };
    });
    groups.sort((a, b) => {
      const cmp =
        sortColumn === "date"
          ? a.date.localeCompare(b.date)
          : a.totalHours - b.totalHours;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return groups;
  }, [filteredEntries, sortColumn, sortDir, timeSortDir]);

  return (
    <div className="space-y-6">
      <div className="sticky -top-6 lg:-top-8 z-30 flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-card px-3 py-2 dark:border-zinc-800">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-muted-foreground">Date</label>
          <DatePicker
            value={entryDate}
            onChange={setEntryDate}
            className="h-9 w-40 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-muted-foreground">Client</label>
          <Select value={clientIdCode} onValueChange={setClientIdCode}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Select client" />
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
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-muted-foreground">Category</label>
          {categoriesPending ? (
            <p className="flex h-9 items-center text-xs text-muted-foreground">
              Loading categories…
            </p>
          ) : categoriesError ? (
            // A failed request must NEVER read as "the table is empty". During the
            // 2026-08-04 production DB-starvation incident /api/hours/categories timed
            // out, fell back to [], and rendered the admin message below — so an outage
            // was reported as a configuration problem. Keep these two states distinct.
            <div className="flex h-9 items-center gap-2">
              <span className="text-xs text-red-600 dark:text-red-400">
                Couldn&apos;t load categories
              </span>
              <button
                type="button"
                onClick={() => refetchCategories()}
                className="text-xs font-medium text-red-600 underline underline-offset-2 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                Retry
              </button>
            </div>
          ) : categories.length === 0 ? (
            <p className="flex h-9 items-center text-xs text-muted-foreground">
              Ask an admin to add categories
            </p>
          ) : (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-muted-foreground">Start</label>
          <TimeSelect value={startTime} onChange={setStartTime} ariaLabel="Start time" />
        </div>

        {mode === "range" ? (
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground">
              End{shiftPreview?.crosses ? " (+1 day)" : ""}
            </label>
            <TimeSelect value={endTime} onChange={setEndTime} ariaLabel="End time" />
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground" htmlFor="hours-duration">
              Hours{shiftPreview ? ` (ends ${shiftPreview.end}${shiftPreview.crosses ? " +1 day" : ""})` : ""}
            </label>
            <Input
              id="hours-duration"
              type="number"
              step="0.25"
              min="0.25"
              max="16"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-28"
              placeholder="2.5"
            />
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMode(mode === "range" ? "duration" : "range")}
        >
          {mode === "range" ? "Use duration" : "Use end time"}
        </Button>

        <div className="min-w-48 flex-1 space-y-1">
          <label className="text-[10px] font-bold text-muted-foreground" htmlFor="hours-note">Note (optional)</label>
          <Input
            id="hours-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you work on?"
          />
        </div>

        <Button
          onClick={() => createEntry.mutate()}
          disabled={!canSubmit || createEntry.isPending}
        >
          Log hours
        </Button>
      </div>

      <HoursHeatmapCalendar selectedDate={selectedDate} onSelectDay={handleSelectDay} />

      <div className="min-h-[24rem]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button
              variant={preset === "week" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setPreset("week");
                setSelectedDate(null);
              }}
            >
              This Week
            </Button>
            <Button
              variant={preset === "last-week" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setPreset("last-week");
                setSelectedDate(null);
              }}
            >
              Last Week
            </Button>
            <Button
              variant={preset === "month" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setPreset("month");
                setSelectedDate(null);
              }}
            >
              This Month
            </Button>
            <Button
              variant={preset === "last-month" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setPreset("last-month");
                setSelectedDate(null);
              }}
            >
              Last Month
            </Button>
            <Button
              variant={preset === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setPreset("all");
                setSelectedDate(null);
              }}
            >
              All Time
            </Button>
            {selectedDate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(null)}
                className="gap-1"
              >
                Showing {formatDayLabel(selectedDate)}
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="h-8 w-48 text-sm">
                <SelectValue placeholder="All clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clientFilterOptions.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className={
                      opt.value === "INTERNAL"
                        ? "font-medium text-brand focus:text-brand data-[highlighted]:text-brand"
                        : undefined
                    }
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={noteSearch}
                onChange={(e) => setNoteSearch(e.target.value)}
                placeholder="Search notes…"
                aria-label="Search notes"
                className="h-8 pl-8 text-sm"
              />
            </div>

            <HoursExportDialog defaultFrom={range.from} defaultTo={range.to} />
          </div>
        </div>

        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand">
            {selectedDate
              ? formatDayLabel(selectedDate)
              : preset === "week"
                ? `This week (${range.from} → ${range.to})`
                : preset === "last-week"
                  ? `Last week (${range.from} → ${range.to})`
                  : preset === "month"
                    ? `This month (${range.from} → ${range.to})`
                    : preset === "last-month"
                      ? `Last month (${range.from} → ${range.to})`
                      : "All records"}
          </h2>
          <span className="text-sm text-muted-foreground">
            Total: {formatHoursMinutes(totalHours)}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button
                  type="button"
                  onClick={() => toggleSort("date")}
                  className="flex items-center gap-1 font-medium hover:text-foreground"
                >
                  Date
                  {sortColumn === "date" &&
                    (sortDir === "asc" ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    ))}
                </button>
              </TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={toggleTimeSort}
                  className="flex items-center gap-1 font-medium hover:text-foreground"
                >
                  Time
                  {timeSortDir === "asc" ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("hours")}
                  className="flex w-full items-center justify-end gap-1 font-medium hover:text-foreground"
                >
                  Hours
                  {sortColumn === "hours" &&
                    (sortDir === "asc" ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    ))}
                </button>
              </TableHead>
              <TableHead>Note</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="min-h-6">
                <TableCell colSpan={7} className="py-0.5 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : dayGroups.length === 0 ? (
              <TableRow className="min-h-6">
                <TableCell colSpan={7} className="py-0.5 text-center text-muted-foreground">
                  {entries.length > 0
                    ? "No entries match the current filters."
                    : preset === "week"
                      ? "No hours logged this week yet."
                      : preset === "last-week"
                        ? "No hours logged last week."
                        : preset === "month"
                          ? "No hours logged this month yet."
                          : preset === "last-month"
                            ? "No hours logged last month."
                            : "No hours logged yet."}
                </TableCell>
              </TableRow>
            ) : (
              dayGroups.map((day) => {
                const isExpanded = expandedDays.has(day.date);
                return (
                  <Fragment key={day.date}>
                    <TableRow
                      className="min-h-6 cursor-pointer"
                      onClick={() => toggleDay(day.date)}
                    >
                      <TableCell className="py-0.5">
                        <span className="flex items-center gap-1.5 font-medium">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                          )}
                          {dayLabel(day.date)}
                        </span>
                      </TableCell>
                      <TableCell className="py-0.5">
                        <div className="flex flex-wrap gap-1">
                          {day.clients.map((c) => {
                            const { label, isInternal } = displayClient(c);
                            return (
                              <Badge
                                key={c}
                                variant="outline"
                                className={isInternal ? "font-medium text-brand" : undefined}
                              >
                                {label}
                              </Badge>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="py-0.5">
                        <div className="flex flex-wrap gap-1">
                          {day.categories.map((c) => (
                            <Badge key={c} variant="outline">{c}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="py-0.5" />
                      <TableCell className="py-0.5 text-right font-medium">
                        {formatHoursMinutes(day.totalHours)}
                      </TableCell>
                      <TableCell className="py-0.5" />
                      <TableCell className="py-0.5" />
                    </TableRow>
                    {isExpanded &&
                      day.entries.map((e) => {
                        const { label, isInternal } = displayClient(e.clientIdCode);
                        const draft = drafts.get(e.id);
                        const isEditing =
                          draft !== undefined &&
                          (e.id === activeRowId || draft.status === "error");

                        if (isEditing) {
                          const d = draft!;
                          const editRange = normalizeRange({
                            startTime: d.startTime,
                            endTime: d.endTime,
                          });
                          const editCategoryOptions =
                            d.category && !categories.some((c) => c.name === d.category)
                              ? [{ id: `current:${d.category}`, name: d.category }, ...categories]
                              : categories;
                          return (
                            <TableRow
                              key={e.id}
                              data-row-id={e.id}
                              className={
                                d.status === "error"
                                  ? "min-h-6 border border-brand-red/60 bg-muted/40"
                                  : "min-h-6 bg-muted/40"
                              }
                            >
                              <TableCell className="py-0.5" />
                              <TableCell className="py-0.5 pl-8">
                                <Select
                                  value={d.clientIdCode}
                                  onValueChange={(v) => patchDraft(e.id, { clientIdCode: v })}
                                  onOpenChange={setSelectOpen}
                                >
                                  <SelectTrigger className="h-8 w-40 text-sm">
                                    <SelectValue placeholder="Select client" />
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
                              <TableCell className="py-0.5">
                                <Select
                                  value={d.category}
                                  onValueChange={(v) => patchDraft(e.id, { category: v })}
                                  onOpenChange={setSelectOpen}
                                >
                                  <SelectTrigger className="h-8 w-36 text-sm">
                                    <SelectValue placeholder="Category" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {editCategoryOptions.map((c) => (
                                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="py-0.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <TimeSelect
                                    value={d.startTime}
                                    onChange={(v) => patchDraft(e.id, { startTime: v })}
                                    ariaLabel="Edit start time"
                                    onOpenChange={setSelectOpen}
                                  />
                                  <span className="text-muted-foreground">–</span>
                                  <TimeSelect
                                    value={d.endTime}
                                    onChange={(v) => patchDraft(e.id, { endTime: v })}
                                    ariaLabel="Edit end time"
                                    onOpenChange={setSelectOpen}
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="py-0.5 text-right text-muted-foreground">
                                {editRange.ok ? formatHoursMinutes(editRange.range.hours) : "—"}
                              </TableCell>
                              <TableCell className="py-0.5">
                                <Input
                                  value={d.note}
                                  onChange={(ev) => patchDraft(e.id, { note: ev.target.value })}
                                  autoFocus={e.id === activeRowId && focusField === "note"}
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
                                  className="h-8 text-sm"
                                />
                              </TableCell>
                              <TableCell className="py-0.5">
                                <div className="flex items-center gap-1">
                                  {d.status === "error" && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-brand-red" role="alert">
                                        {d.error}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-6"
                                        onClick={() => commitRow(e.id)}
                                        aria-label="Retry save"
                                      >
                                        <RotateCcw className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6"
                                    onClick={() => commitRow(e.id)}
                                    disabled={!isDraftValid(d).ok}
                                    aria-label="Save entry"
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6"
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

                        // Keyboard equivalent of the cell's onClick — Enter/Space open the
                        // row on that field, since the pencil button (previously the only
                        // focusable, keyboard-activatable control) no longer exists.
                        const openOnKey =
                          (field: FocusField) =>
                          (ev: React.KeyboardEvent<HTMLTableCellElement>) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              openRow(e, field);
                            }
                          };

                        return (
                          <TableRow key={e.id} data-row-id={e.id} className="min-h-6 bg-muted/40">
                            <TableCell className="py-0.5" />
                            <TableCell
                              className="cursor-text py-0.5 pl-8"
                              tabIndex={0}
                              onClick={() => openRow(e, "client")}
                              onKeyDown={openOnKey("client")}
                            >
                              <span className={isInternal ? "font-medium text-brand" : undefined}>
                                {label}
                              </span>
                              {overlapIds.has(e.id) && (
                                <Badge variant="outline" className="ml-2 text-brand-red">
                                  <AlertTriangle className="mr-1 h-3 w-3" />
                                  overlap
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell
                              className="cursor-text py-0.5 text-muted-foreground"
                              tabIndex={0}
                              onClick={() => openRow(e, "category")}
                              onKeyDown={openOnKey("category")}
                            >
                              {e.category ?? "—"}
                            </TableCell>
                            <TableCell
                              className="cursor-text py-0.5 text-muted-foreground"
                              tabIndex={0}
                              onClick={() => openRow(e, "time")}
                              onKeyDown={openOnKey("time")}
                            >
                              {e.startTime}–{e.endTime}
                            </TableCell>
                            <TableCell className="py-0.5 text-right text-muted-foreground">
                              {formatHoursMinutes(e.hours)}
                            </TableCell>
                            <TableCell
                              className="cursor-text py-0.5 max-w-64 truncate text-muted-foreground"
                              tabIndex={0}
                              onClick={() => openRow(e, "note")}
                              onKeyDown={openOnKey("note")}
                            >
                              {e.note}
                            </TableCell>
                            <TableCell className="py-0.5">
                              <div className="flex items-center gap-1">
                                {drafts.get(e.id)?.status === "saving" && (
                                  <span
                                    className="size-1.5 rounded-full bg-muted-foreground/50"
                                    aria-label="Saving"
                                  />
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6"
                                  onClick={() => removeEntry.mutate(e.id)}
                                  aria-label="Delete entry"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

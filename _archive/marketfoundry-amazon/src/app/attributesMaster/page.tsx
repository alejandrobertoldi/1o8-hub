/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, Search, Check, ChevronDown, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

type AttrRow = Record<string, string>;
type AttrResponse = { columns: string[]; rows: AttrRow[] };
type SortDir = "asc" | "desc" | null;

const READONLY_COLS = new Set(["UUID"]);

function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === "asc") return <ArrowUp className="size-3 shrink-0" />;
  if (dir === "desc") return <ArrowDown className="size-3 shrink-0" />;
  return <ArrowUpDown className="size-3 opacity-30 shrink-0" />;
}

function EditableCell({
  uuid,
  col,
  val,
  readOnly,
  onSaved,
}: {
  uuid: string;
  col: string;
  val: string;
  readOnly: boolean;
  onSaved: (uuid: string, col: string, newVal: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(val);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isROReadOnly = readOnly || READONLY_COLS.has(col);

  const commit = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed === val) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/products/attributes-master/${uuid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: col, value: trimmed }),
      });
      if (res.ok) {
        onSaved(uuid, col, trimmed);
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
      }
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [draft, val, uuid, col, onSaved]);

  if (saving) return <Loader2 className="size-3 animate-spin text-muted-foreground" />;
  if (saved) return <Check className="size-3 text-emerald-500" />;

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(val); setEditing(false); }
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full min-w-[60px] h-6 px-1 text-xs bg-background border border-brand/50 rounded outline-none"
      />
    );
  }

  if (col === "UUID") {
    return <span className="font-mono text-xs text-muted-foreground">{val}</span>;
  }

  if (col === "Attributes_HubLabel") {
    return (
      <span
        className={`font-semibold text-foreground ${!isROReadOnly ? "cursor-text" : ""}`}
        onDoubleClick={(e) => { if (!isROReadOnly) { e.stopPropagation(); setDraft(val); setEditing(true); } }}
      >
        {val || <span className="text-muted-foreground/25">—</span>}
      </span>
    );
  }

  return (
    <span
      className={!isROReadOnly ? "cursor-text" : ""}
      onDoubleClick={(e) => { if (!isROReadOnly) { e.stopPropagation(); setDraft(val); setEditing(true); } }}
    >
      {val || <span className="text-muted-foreground/25">—</span>}
    </span>
  );
}

function CollapseCard({
  cardName,
  cardRows,
  columns,
  collapsed,
  onToggle,
  sortCol,
  sortDir,
  readOnly,
  onSort,
  onCellSaved,
}: {
  cardName: string;
  cardRows: AttrRow[];
  columns: string[];
  collapsed: boolean;
  onToggle: () => void;
  sortCol: string | null;
  sortDir: SortDir | null;
  readOnly: boolean;
  onSort: (col: string) => void;
  onCellSaved: (uuid: string, col: string, newVal: string) => void;
}) {
  if (!collapsed) {
    return (
      <div className="border border-border/40 rounded-md bg-background overflow-hidden">
        <button
          onClick={onToggle}
          className="w-full px-4 py-2 bg-muted border-b border-border/40 flex items-center gap-2 hover:bg-muted/80 transition-colors cursor-pointer"
        >
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-bold text-foreground tracking-wide">{cardName}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{cardRows.length} attrs</span>
        </button>
        <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    onClick={() => onSort(col)}
                    className="py-1.5 px-2 text-[10px] font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors last:border-r-0 bg-muted border-b border-r border-border/50 text-left"
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {col}
                      <SortIcon dir={sortCol === col ? sortDir : null} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cardRows.map((row, i) => {
                const rowUuid = row.UUID || "";
                return (
                  <tr
                    key={rowUuid || i}
                    className="bg-background hover:bg-muted/50 border-b border-r border-border/50 last:border-r-0 transition-colors"
                  >
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="py-1.5 px-2 whitespace-nowrap border-b border-r border-border/50 last:border-r-0 text-left"
                      >
                        <EditableCell
                          uuid={rowUuid}
                          col={col}
                          val={row[col] || ""}
                          readOnly={readOnly || READONLY_COLS.has(col)}
                          onSaved={onCellSaved}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onToggle}
      className="w-full border border-border/40 rounded-md bg-background px-4 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs font-bold text-foreground tracking-wide">{cardName}</span>
      <span className="text-[10px] text-muted-foreground tabular-nums">{cardRows.length} attrs</span>
    </button>
  );
}

export default function AttributesMasterPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const readOnly = role === "viewer" || !role;

  const { data, isLoading } = useQuery<AttrResponse>({
    queryKey: ["attributes-master-table"],
    queryFn: async () => {
      const res = await fetch("/api/products/attributes-master");
      if (!res.ok) return { columns: [], rows: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());

  const allRows = data?.rows ?? [];
  const columns = data?.columns ?? [];

  const rows = useMemo(() => {
    let result = allRows;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) =>
        columns.some((col) => (r[col] || "").toLowerCase().includes(q))
      );
    }

    if (sortCol && sortDir) {
      result = result.toSorted((a, b) => {
        const aVal = a[sortCol] || "";
        const bVal = b[sortCol] || "";
        const cmp = aVal.localeCompare(bVal, undefined, { sensitivity: "base" });
        return sortDir === "desc" ? -cmp : cmp;
      });
    }

    return result;
  }, [allRows, searchQuery, sortCol, sortDir, columns]);

  const groupedRows = useMemo(() => {
    const grouped: Record<string, typeof rows> = {};
    for (const row of rows) {
      const card = row.Attributes_PDPCardName || "No Card Name";
      if (!grouped[card]) grouped[card] = [];
      grouped[card].push(row);
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  useEffect(() => {
    if (!isLoading && allRows.length > 0 && groupedRows.length > 0) {
      setCollapsedCards(new Set(groupedRows.map(([name]) => name)));
    }
  }, [isLoading, allRows.length, groupedRows.length]);

  const handleSort = useCallback((col: string) => {
    if (sortCol !== col) { setSortCol(col); setSortDir("asc"); }
    else if (sortDir === "asc") { setSortDir("desc"); }
    else { setSortCol(null); setSortDir(null); }
  }, [sortCol, sortDir]);

  const handleCellSaved = useCallback((uuid: string, col: string, newVal: string) => {
    queryClient.setQueryData<AttrResponse>(["attributes-master-table"], (old) => {
      if (!old) return old;
      return {
        ...old,
        rows: old.rows.map((r) =>
          r.UUID === uuid ? { ...r, [col]: newVal } : r
        ),
      };
    });
  }, [queryClient]);

  const toggleCard = useCallback((cardName: string) => {
    setCollapsedCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardName)) next.delete(cardName);
      else next.add(cardName);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedCards(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedCards(new Set(groupedRows.map(([name]) => name)));
  }, [groupedRows]);

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <PageMetaSlot>
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0">
            <span className="font-bold text-sidebar-foreground">AttributesMaster</span><span className="font-normal text-brand"> Table</span>
          </h1>
        </div>
        {!isLoading && allRows.length > 0 && (
          <div className="glass-card rounded-lg border border-border/60 px-3 py-1 text-sm flex items-center gap-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search all columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 w-56 pl-7 pr-2 text-xs bg-background border border-border/60 rounded-md outline-none focus:border-brand transition-colors"
              />
            </div>
            <div className="h-4 w-px bg-border/40" />
            <span className="text-xs text-foreground/70 tabular-nums">
              {rows.length}{searchQuery.trim() ? ` / ${allRows.length}` : ""} shown
            </span>
            <div className="h-4 w-px bg-border/40" />
            <button
              onClick={expandAll}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Expand all
            </button>
            <button
              onClick={collapseAll}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Collapse all
            </button>
            {!readOnly && (
              <span className="text-[10px] text-muted-foreground/50">Dbl-click to edit</span>
            )}
          </div>
        )}
      </PageMetaSlot>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : allRows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState title="No AttributesMaster data" description="Import data into attributes_master to see the attributes table." />
        </div>
      ) : (
        <div className="flex-1 overflow-auto mt-3 px-4 pb-6 space-y-2">
          {groupedRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No attributes match the current filters
            </div>
          ) : (
            groupedRows.map(([cardName, cardRows]) => (
              <CollapseCard
                key={cardName}
                cardName={cardName}
                cardRows={cardRows}
                columns={columns}
                collapsed={collapsedCards.has(cardName)}
                onToggle={() => toggleCard(cardName)}
                sortCol={sortCol}
                sortDir={sortDir}
                readOnly={readOnly}
                onSort={handleSort}
                onCellSaved={handleCellSaved}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

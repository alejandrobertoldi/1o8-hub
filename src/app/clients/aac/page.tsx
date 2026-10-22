/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, Search, Check } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { DatePicker } from "@/components/ui/date-picker";
import { AacColumnFilterBar, type AacFilters } from "@/components/clients/aac-column-filter";

// ── Types ─────────────────────────────────────────────────────────────

type AACRow = Record<string, string>;
type AACResponse = { columns: string[]; rows: AACRow[] };
type SortDir = "asc" | "desc" | null;
type StatusFilter = "Active" | "Inactive" | "Prospect" | "All";

// ── Column display labels ─────────────────────────────────────────────

const AAC_COL_LABELS: Record<string, string> = {
  ClientStatus: "Status", ClientName: "Client",
  ClientIDCode: "ID Code", BrandName: "Brand", MarketplaceClientName: "Marketplace Client",
  Tier: "Tier", RetainerType: "Retainer", Commission: "Commission",
  Marketplace: "Marketplace", Country: "Country",
  OnboardingDate: "Onboarding Date", OffboardingDate: "Offboarding Date",
  ExecutiveStrategist_MF: "Exec Strategist", AccountManager_MF: "Account Manager",
  ProjectManager_MF: "Project Manager", ProjectManagerAsana_MF: "PM Asana",
  DesignManager_MF: "Design Manager", SEOManager_MF: "SEO Manager",
  PPCManager_MF: "PPC Manager", CatalogManager_MF: "Catalog Manager",
  DesignUploadManager_MF: "Upload Manager",
  ExecutiveStrategist_1o8A: "Exec Strategist (A)", AccountManager_1o8A: "Account Manager (A)",
  ProjectManager_1o8A: "Project Manager (A)", BrandURL: "Brand URL",
  Competitor1Name: "Comp 1", Competitor1URL: "Comp 1 URL",
  Competitor2Name: "Comp 2", Competitor2URL: "Comp 2 URL",
  Competitor3Name: "Comp 3", Competitor3URL: "Comp 3 URL",
  Competitor4Name: "Comp 4", Competitor4URL: "Comp 4 URL",
  Competitor5Name: "Comp 5", Competitor5URL: "Comp 5 URL",
  IntentwiseName: "Intentwise Name", IntentwiseID: "Intentwise ID",
  IntentwiseNameAMC: "IW Name AMC", IntentwiseIDAMC: "IW ID AMC",
  IntentwiseShareOfVoice: "Intentwise SoV", PowerBIDashboardURL: "PowerBI Dashboard",
  Levanta: "Levanta", FeedbackWhiz: "FeedbackWhiz",
  ExpoWest2026Location: "Expo West",
  AmazonContactName: "Amazon Contact", AmazonContactEmail: "Amazon Email",
  BrandRegistry: "Brand Registry",
  ADSpendBudgetComment: "AdSpend Note", SalesForecastComment: "Forecast Note",
  PercentageOrgRevComment: "OrgRev Note", ACOSGoalComment: "ACOS Note",
  ROASGoalComment: "ROAS Note", TACOSGoalComment: "TACOS Note",
};

const NUMERIC_COLS = new Set(["Tier"]);
const DATE_COLS = new Set(["OnboardingDate", "OffboardingDate"]);
const READONLY_COLS = new Set(["ClientIDCode"]);
const FROZEN_COLS = ["ClientStatus", "ClientName"] as const;
// Pixel widths for frozen columns so offsets can stack
const FROZEN_W = [80, 160] as const; // Status=80px, ClientName=160px


const STATUS_OPTIONS: StatusFilter[] = ["Active", "Inactive", "Prospect", "All"];

// Full, un-abbreviated header title from the raw column key.
function humanizeCol(col: string) {
  return col
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Helpers ───────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active") return "bg-emerald-600/15 text-emerald-600 dark:text-emerald-400";
  if (s === "inactive") return "bg-red-600/15 text-red-500";
  if (s === "prospect") return "bg-brand/15 text-brand";
  return "";
}

function rowBg(status: string) {
  const s = status.toLowerCase();
  if (s === "active") return "bg-[#F9C01B]/10 hover:bg-[#F9C01B]/20";
  if (s === "inactive") return "bg-[#EA4336]/10 hover:bg-[#EA4336]/20";
  if (s === "prospect") return "bg-[#93C47D]/10 hover:bg-[#93C47D]/20";
  return "bg-background hover:bg-muted/50";
}

function cellAlign(col: string) {
  if (col === "Tier") return "text-center";
  if (col === "Commission") return "text-right";
  return "text-left";
}

function frozenStyle(col: string): React.CSSProperties | undefined {
  const idx = FROZEN_COLS.indexOf(col as (typeof FROZEN_COLS)[number]);
  if (idx < 0) return undefined;
  const left = idx === 0 ? 0 : FROZEN_W.slice(0, idx).reduce((a, b) => a + b, 0);
  const isLast = idx === FROZEN_COLS.length - 1;
  return {
    position: "sticky", left, zIndex: 2,
    minWidth: FROZEN_W[idx], maxWidth: FROZEN_W[idx],
    ...(isLast ? { boxShadow: "2px 0 4px -2px rgba(0,0,0,0.1)" } : {}),
  };
}

function statusBtnStyle(s: StatusFilter, active: boolean) {
  if (!active) return "border-border/50 text-muted-foreground hover:border-brand/30";
  if (s === "Active") return "border-emerald-500/50 bg-emerald-500/10 text-emerald-500";
  if (s === "Inactive") return "border-red-500/50 bg-red-500/10 text-red-400";
  if (s === "Prospect") return "border-brand/50 bg-brand/10 text-brand";
  return "border-brand/50 bg-brand/10 text-brand";
}

// ── Inline editable cell ──────────────────────────────────────────────

function EditableCell({
  clientIdCode,
  col,
  val,
  readOnly,
  onSaved,
}: {
  clientIdCode: string;
  col: string;
  val: string;
  readOnly: boolean;
  onSaved: (clientIdCode: string, col: string, newVal: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(val);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isRO = readOnly || READONLY_COLS.has(col);

  const commit = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed === val) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientIdCode}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: col, value: trimmed }),
      });
      if (res.ok) {
        onSaved(clientIdCode, col, trimmed);
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
      }
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [draft, val, clientIdCode, col, onSaved]);

  if (saving) {
    return <Loader2 className="size-3 animate-spin text-muted-foreground" />;
  }
  if (saved) {
    return <Check className="size-3 text-emerald-500" />;
  }

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

  // Display mode
  if (col === "ClientStatus") {
    return (
      <span
        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${statusBadge(val)} ${!isRO ? "cursor-text" : ""}`}
        onDoubleClick={(e) => { if (!isRO) { e.stopPropagation(); setDraft(val); setEditing(true); } }}
      >
        {val || "—"}
      </span>
    );
  }
  if (col === "ClientName") {
    return (
      <span
        className={`font-semibold text-foreground ${!isRO ? "cursor-text" : ""}`}
        onDoubleClick={(e) => { if (!isRO) { e.stopPropagation(); setDraft(val); setEditing(true); } }}
      >
        {val || <span className="text-muted-foreground/25">—</span>}
      </span>
    );
  }
  if (col === "ClientIDCode") {
    return <span className="font-mono text-xs text-muted-foreground">{val}</span>;
  }

  return (
    <span
      className={!isRO ? "cursor-text" : ""}
      onDoubleClick={(e) => { if (!isRO) { e.stopPropagation(); setDraft(val); setEditing(true); } }}
    >
      {val || <span className="text-muted-foreground/25">—</span>}
    </span>
  );
}

// ── Date cell ─────────────────────────────────────────────────────────

function DateCell({
  clientIdCode,
  col,
  val,
  readOnly,
  onSaved,
}: {
  clientIdCode: string;
  col: string;
  val: string;
  readOnly: boolean;
  onSaved: (clientIdCode: string, col: string, newVal: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = useCallback(async (newVal: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientIdCode}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: col, value: newVal }),
      });
      if (res.ok) {
        onSaved(clientIdCode, col, newVal);
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
      }
    } finally {
      setSaving(false);
    }
  }, [clientIdCode, col, onSaved]);

  if (saving) return <Loader2 className="size-3 animate-spin text-muted-foreground" />;
  if (saved) return <Check className="size-3 text-emerald-500" />;

  return <DatePicker value={val} onChange={save} disabled={readOnly} />;
}

// ── Sort icon ─────────────────────────────────────────────────────────

function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === "asc") return <ArrowUp className="size-3 shrink-0" />;
  if (dir === "desc") return <ArrowDown className="size-3 shrink-0" />;
  return <ArrowUpDown className="size-3 opacity-30 shrink-0" />;
}

// ── Page ──────────────────────────────────────────────────────────────

export default function AACPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const readOnly = role === "viewer" || !role;

  const { data, isLoading } = useQuery<AACResponse>({
    queryKey: ["aac-table"],
    queryFn: async () => {
      const res = await fetch("/api/clients/aac");
      if (!res.ok) return { columns: [], rows: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Active");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<AacFilters>({});

  const allRows = data?.rows ?? [];
  const columns = data?.columns ?? [];

  // Counts per status (across all rows, before filters)
  const statusCounts = useMemo(() => {
    const c = { Active: 0, Inactive: 0, Prospect: 0 };
    for (const r of allRows) {
      const s = r.ClientStatus?.toLowerCase();
      if (s === "active") c.Active++;
      else if (s === "inactive") c.Inactive++;
      else if (s === "prospect") c.Prospect++;
    }
    return c;
  }, [allRows]);

  // Status + text search context (drives the column-filter facet values).
  const baseRows = useMemo(() => {
    let result = allRows;

    if (statusFilter !== "All") {
      result = result.filter((r) => r.ClientStatus?.toLowerCase() === statusFilter.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) =>
        columns.some((col) => (r[col] || "").toLowerCase().includes(q))
      );
    }

    return result;
  }, [allRows, statusFilter, searchQuery, columns]);

  const rows = useMemo(() => {
    let result = baseRows;

    // Per-column filters (AND across columns, OR within a column; "" = blank cell)
    const activeCols = Object.keys(filters).filter((c) => filters[c]?.length);
    if (activeCols.length) {
      result = result.filter((r) =>
        activeCols.every((col) => filters[col].includes(r[col] ?? ""))
      );
    }

    // Sort
    if (sortCol && sortDir) {
      const col = sortCol;
      const dir = sortDir;
      const isNum = NUMERIC_COLS.has(col);
      result = result.toSorted((a, b) => {
        const aVal = a[col] || "";
        const bVal = b[col] || "";
        let cmp: number;
        if (isNum) {
          cmp = (parseFloat(aVal) || 0) - (parseFloat(bVal) || 0);
        } else {
          cmp = aVal.localeCompare(bVal, undefined, { sensitivity: "base" });
        }
        return dir === "desc" ? -cmp : cmp;
      });
    }

    return result;
  }, [baseRows, filters, sortCol, sortDir]);

  const hasFilters = searchQuery.trim().length > 0 || Object.keys(filters).some((c) => filters[c]?.length);

  function handleSort(col: string) {
    if (sortCol !== col) { setSortCol(col); setSortDir("asc"); }
    else if (sortDir === "asc") { setSortDir("desc"); }
    else { setSortCol(null); setSortDir(null); }
  }

  // Optimistic update after inline edit
  const handleCellSaved = useCallback((clientIdCode: string, col: string, newVal: string) => {
    queryClient.setQueryData<AACResponse>(["aac-table"], (old) => {
      if (!old) return old;
      return {
        ...old,
        rows: old.rows.map((r) =>
          r.ClientIDCode === clientIdCode ? { ...r, [col]: newVal } : r
        ),
      };
    });
    // Also invalidate the client detail cache
    queryClient.invalidateQueries({ queryKey: ["client-detail", clientIdCode] });
  }, [queryClient]);

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <PageMetaSlot>
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0">
            <span className="font-bold text-sidebar-foreground">AAC</span><span className="font-normal text-brand">Table</span>
          </h1>
          {!isLoading && allRows.length > 0 && (
            <div className="flex items-center gap-1">
              {STATUS_OPTIONS.map((s) => {
                const isActive = statusFilter === s;
                const count = s === "All" ? allRows.length : statusCounts[s as keyof typeof statusCounts] ?? 0;
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`inline-flex items-center gap-1 h-7 px-2.5 text-xs font-bold rounded-md border transition-colors ${statusBtnStyle(s, isActive)}`}
                  >
                    {s}
                    <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {!isLoading && allRows.length > 0 && (
          <div className="glass-card rounded-lg border border-border/60 px-3 py-1 text-sm flex items-center gap-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search all columns…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 w-56 pl-7 pr-2 text-xs bg-background border border-border/60 rounded-md outline-none focus:border-brand transition-colors"
              />
            </div>
            <div className="h-4 w-px bg-border/40" />
            <span className="text-xs text-foreground/70 tabular-nums">
              {rows.length}{hasFilters ? ` / ${allRows.length}` : ""} shown
            </span>
            {!readOnly && (
              <span className="text-[10px] text-muted-foreground/50">Dbl-click to edit</span>
            )}
          </div>
        )}
      </PageMetaSlot>

      {/* Table area */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : allRows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState title="No AAC data" description="Import AAC data from BigQuery to see the client table." />
        </div>
      ) : (
        <>
          <AacColumnFilterBar
            columns={columns}
            labels={AAC_COL_LABELS}
            rows={baseRows}
            numericCols={NUMERIC_COLS}
            filters={filters}
            onChange={setFilters}
          />
          <div className="flex-1 overflow-auto mt-2 border border-border/40 rounded-md">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                {columns.map((col) => {
                  const frozen = frozenStyle(col);
                  return (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      style={frozen}
                      className={`py-1.5 px-2 text-[10px] font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors bg-muted border-b border-r border-border/50 last:border-r-0 ${frozen ? "z-20" : ""} ${cellAlign(col)}`}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {humanizeCol(col)}
                        <SortIcon dir={sortCol === col ? sortDir : null} />
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-12 text-center text-sm text-muted-foreground">
                    No clients match the current filters
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const status = row.ClientStatus || "";
                  const cid = row.ClientIDCode || "";
                  return (
                    <tr
                      key={cid || i}
                      className={`transition-colors ${rowBg(status)}`}
                    >
                      {columns.map((col) => {
                        const frozen = frozenStyle(col);
                        let frozenBg = "";
                        if (frozen) {
                          const st = status.toLowerCase();
                          // Sticky cells need an opaque bg that matches the row tint in both light + dark mode.
                          if (st === "active") frozenBg = "bg-amber-50 dark:bg-[#1f1c09]";
                          else if (st === "inactive") frozenBg = "bg-red-50 dark:bg-[#1d0c09]";
                          else if (st === "prospect") frozenBg = "bg-green-50 dark:bg-[#12190f]";
                          else frozenBg = "bg-background";
                        }
                        return (
                          <td
                            key={col}
                            style={frozen}
                            className={`py-1 px-2 whitespace-nowrap border-b border-r border-border/50 last:border-r-0 ${frozenBg} ${cellAlign(col)}`}
                          >
                            {DATE_COLS.has(col) ? (
                              <DateCell
                                clientIdCode={cid}
                                col={col}
                                val={row[col] || ""}
                                readOnly={readOnly}
                                onSaved={handleCellSaved}
                              />
                            ) : (
                              <EditableCell
                                clientIdCode={cid}
                                col={col}
                                val={row[col] || ""}
                                readOnly={readOnly}
                                onSaved={handleCellSaved}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}

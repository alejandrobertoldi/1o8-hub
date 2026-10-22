/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/js-combine-iterations */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  Check,
  Download,
  Loader2,
  Percent,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeadlineCalendar } from "@/components/holiday-deals/deadline-calendar";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import {
  DEAL_TYPE_LABELS,
  CLIENT_AGREEMENT_LABELS,
  HOLIDAY_EVENTS,
  INBOUND_METHOD_LABELS,
  INBOUND_STATUS_LABELS,
  SUBMISSION_STATUS_LABELS,
  clientTrackerStatus,
  dealProductTitle,
  daysUntil,
  missingDealTerms,
  todayISO,
} from "@/lib/holiday-deals/calendar";
import {
  CLIENT_AGREEMENTS,
  DEAL_TYPES,
  HOLIDAY_EVENT_IDS,
  INBOUND_METHODS,
  INBOUND_STATUSES,
  SUBMISSION_STATUSES,
  type EnrichedHolidayDeal,
  type HolidayDealSummary,
  type HolidayEventId,
  type InboundRisk,
  type ClientAgreement,
} from "@/lib/holiday-deals/types";
import { isEditorOrAbove } from "@/lib/roles";
import {
  EMPTY_HOLIDAY_DEALS_LAYOUT,
  applyHolidayDealsLayout,
  type HolidayDealsLayout,
} from "@/lib/holiday-deals/layout";
import { asClientList, type ReportClient } from "@/components/reports/v2/use-report-controls";
import { cn } from "@/lib/utils";

type SheetResponse = {
  rows: EnrichedHolidayDeal[];
  summary: HolidayDealSummary;
  canEdit: boolean;
};

type ProductHit = {
  id: string;
  asin: string | null;
  sku: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
  status?: string | null;
  parentageLevel?: string | null;
  variationId?: string | null;
  variationName?: string | null;
  variationGroup?: string | null;
};

type CatalogGroup = { key: string; label: string; items: ProductHit[] };

function parentGroupLabel(p: ProductHit): string {
  const fromVariation = p.variationName?.trim();
  if (fromVariation) return fromVariation;
  const fromTitle = (p.summarizedTitle ?? "").replace(/\s*\|\s*parent\s*$/i, "").trim();
  if (fromTitle && !/^parent$/i.test(fromTitle)) return fromTitle;
  return (p.itemName ?? "").trim();
}

/** Group a client's catalog by variation family. Parent listings name the group
 *  but are not pickable (deals run on child ASINs); standalones sit last.
 *  Discontinued listings are left out since they cannot run a deal. */
export function groupCatalogByVariation(products: ProductHit[], query: string): CatalogGroup[] {
  const q = query.trim().toLowerCase();
  const groups = new Map<string, CatalogGroup>();
  const standalone: ProductHit[] = [];
  const parentLabels = new Map<string, string>();

  for (const p of products) {
    if (/discontinued/i.test(p.status ?? "")) continue;
    const isParent = (p.parentageLevel ?? "").toLowerCase() === "parent";
    const key = p.variationId?.trim() || (isParent ? p.asin ?? p.id : "");
    if (isParent) {
      const label = parentGroupLabel(p);
      if (key && label) parentLabels.set(key, label);
      continue;
    }
    if (q) {
      const hay = [p.asin, p.sku, p.summarizedTitle, p.itemName, p.variationName]
        .map((v) => (v ?? "").toLowerCase());
      if (!hay.some((v) => v.includes(q))) continue;
    }
    if (!key) {
      standalone.push(p);
      continue;
    }
    const group = groups.get(key) ?? {
      key,
      label: p.variationName?.trim() || p.variationGroup?.trim() || "",
      items: [],
    };
    group.items.push(p);
    groups.set(key, group);
  }

  const result = [...groups.values()].map((g) => ({
    ...g,
    label: g.label || parentLabels.get(g.key) || `Variation ${g.key}`,
  }));
  result.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  if (standalone.length) result.push({ key: "__standalone", label: "Standalone", items: standalone });
  return result;
}

type ClientGroup = {
  clientIdCode: string;
  clientName: string;
  rows: EnrichedHolidayDeal[];
  totalRows: number;
};

const SHEET_COLUMNS = [
  "ASIN", "Product", "Event",
  "Talked", "When", "Agreed", "Spend", "%",
  "Deal type", "Promo $", "Start", "End", "Est. units",
  "Inbound", "Inbound deadline", "Submit", "Stock", "Fee", "",
];

/** One group per visible client, in the configured order, plus any client that
 *  already has deal rows but is not in the list so nothing on the sheet hides.
 *  Clients hidden in the sheet config are dropped, rows and all. */
export function groupDealsByClient(
  clients: ReportClient[],
  allRows: EnrichedHolidayDeal[],
  visibleRows: EnrichedHolidayDeal[],
  layout: HolidayDealsLayout = EMPTY_HOLIDAY_DEALS_LAYOUT,
): ClientGroup[] {
  const hidden = new Set(layout.hidden);
  const groups = new Map<string, ClientGroup>();
  for (const c of clients) {
    if (hidden.has(c.clientIdCode)) continue;
    groups.set(c.clientIdCode, {
      clientIdCode: c.clientIdCode,
      clientName: c.clientName || c.clientIdCode,
      rows: [],
      totalRows: 0,
    });
  }
  for (const row of allRows) {
    if (hidden.has(row.clientIdCode)) continue;
    const group = groups.get(row.clientIdCode);
    if (group) {
      group.totalRows += 1;
    } else {
      groups.set(row.clientIdCode, {
        clientIdCode: row.clientIdCode,
        clientName: row.clientName || row.clientIdCode,
        rows: [],
        totalRows: 1,
      });
    }
  }
  for (const row of visibleRows) {
    groups.get(row.clientIdCode)?.rows.push(row);
  }
  return applyHolidayDealsLayout([...groups.values()], layout);
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const moneyExact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function daysLabel(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 1) return `${n} days`;
  return `${Math.abs(n)} days ago`;
}

function riskClass(risk: InboundRisk | "closed" | "due_soon" | "ok" | "n/a"): string {
  if (risk === "overdue" || risk === "closed") {
    return "bg-red-50 text-red-600 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30";
  }
  if (risk === "due_soon") {
    return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30";
  }
  if (risk === "received") {
    return "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30";
  }
  return "bg-stone-200 text-stone-500 border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-500 dark:border-zinc-800";
}

const cellInput =
  "h-7 min-w-0 rounded-md border border-field-border bg-field-bg px-1.5 text-xs tabular-nums text-field-text";

async function fetchSheet(): Promise<SheetResponse> {
  const res = await fetch("/api/holiday-deals");
  if (!res.ok) throw new Error("Failed to load holiday deals");
  return res.json();
}

async function fetchClients(): Promise<ReportClient[]> {
  const res = await fetch("/api/clients?lite=1&status=Active", {
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error("Failed to load clients");
  return asClientList(await res.json());
}

async function fetchLayout(): Promise<HolidayDealsLayout> {
  const res = await fetch("/api/holiday-deals/config");
  if (!res.ok) return EMPTY_HOLIDAY_DEALS_LAYOUT;
  return res.json();
}

export function HolidayDealsBoard() {
  const { data: session } = useSession();
  const canEdit = isEditorOrAbove(session?.user?.role);
  const queryClient = useQueryClient();
  const today = todayISO();

  const { data, isLoading } = useQuery({
    queryKey: ["holiday-deals"],
    queryFn: fetchSheet,
  });
  const { data: allClients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["clients-lite-active"],
    queryFn: fetchClients,
  });
  const { data: layout = EMPTY_HOLIDAY_DEALS_LAYOUT } = useQuery({
    queryKey: ["holiday-deals-layout"],
    queryFn: fetchLayout,
  });
  const clients = useMemo(() => applyHolidayDealsLayout(allClients, layout), [allClients, layout]);

  const [client, setClient] = useState("all");
  const [event, setEvent] = useState("all");
  const [risk, setRisk] = useState("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addClient, setAddClient] = useState("");

  const rows = data?.rows ?? [];
  const rowFiltersActive = event !== "all" || risk !== "all" || search.trim() !== "";
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (event !== "all" && row.event !== event) return false;
      if (risk === "not_talked" && clientTrackerStatus(row) !== "not_talked") return false;
      if (risk === "waiting" && clientTrackerStatus(row) !== "waiting") return false;
      if (risk === "agreed" && clientTrackerStatus(row) !== "agreed") return false;
      if (risk === "missing_spend" && !missingDealTerms(row).spend) return false;
      if (risk === "missing_percent" && !missingDealTerms(row).percent) return false;
      if (risk === "inbound" && row.inboundRisk !== "overdue" && row.inboundRisk !== "due_soon") {
        return false;
      }
      if (risk === "submission" && row.submissionRisk !== "closed" && row.submissionRisk !== "due_soon") {
        return false;
      }
      if (!q) return true;
      return (
        (row.clientName ?? "").toLowerCase().includes(q) ||
        row.clientIdCode.toLowerCase().includes(q) ||
        (row.asin ?? "").toLowerCase().includes(q) ||
        (row.sku ?? "").toLowerCase().includes(q) ||
        (row.summarizedTitle ?? "").toLowerCase().includes(q) ||
        (row.itemName ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, event, risk, search]);

  const groups = useMemo(() => {
    const all = groupDealsByClient(allClients, rows, filtered, layout);
    return all.filter((g) => {
      if (client !== "all" && g.clientIdCode !== client) return false;
      if (rowFiltersActive && g.rows.length === 0) return false;
      return true;
    });
  }, [allClients, layout, rows, filtered, client, rowFiltersActive]);

  function openAdd(clientIdCode = "") {
    setAddClient(clientIdCode);
    setAddOpen(true);
  }

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/holiday-deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Save failed");
      return json as { row: EnrichedHolidayDeal };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["holiday-deals"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/holiday-deals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      toast.success("Row removed");
      void queryClient.invalidateQueries({ queryKey: ["holiday-deals"] });
    },
    onError: () => toast.error("Could not remove that row"),
  });

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      <DeadlineCalendar today={today} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Not talked" value={String(summary?.notTalked ?? 0)} warn={(summary?.notTalked ?? 0) > 0} />
        <StatCard label="Waiting on yes" value={String(summary?.waitingOnClient ?? 0)} warn={(summary?.waitingOnClient ?? 0) > 0} />
        <StatCard label="Agreed" value={String(summary?.agreed ?? 0)} />
        <StatCard label="Spend" value={money.format(summary?.adBudget ?? 0)} />
        <StatCard label="Missing %" value={String(summary?.missingPercent ?? 0)} warn={(summary?.missingPercent ?? 0) > 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, ASIN, SKU, product"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <select className={cn(cellInput, "h-8 w-[160px]")} value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="all">All clients</option>
          {clients.map((c) => (
            <option key={c.clientIdCode} value={c.clientIdCode}>
              {c.clientName || c.clientIdCode}
            </option>
          ))}
        </select>
        <select className={cn(cellInput, "h-8 w-[170px]")} value={event} onChange={(e) => setEvent(e.target.value)}>
          <option value="all">All events</option>
          {HOLIDAY_EVENTS.map((e) => (
            <option key={e.id} value={e.id}>{e.shortLabel}</option>
          ))}
        </select>
        <select className={cn(cellInput, "h-8 w-[180px]")} value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="not_talked">Not talked</option>
          <option value="waiting">Waiting on yes</option>
          <option value="agreed">Agreed</option>
          <option value="missing_spend">Missing spend</option>
          <option value="missing_percent">Missing %</option>
          <option value="inbound">Inbound at risk</option>
          <option value="submission">Submission at risk</option>
        </select>
        <a href="/api/holiday-deals/export">
          <Button variant="outline" size="sm">
            <Download className="size-3.5" />
            Export CSV
          </Button>
        </a>
        {canEdit && (
          <Button variant="brand" size="sm" onClick={() => openAdd()}>
            <Plus className="size-3.5" />
            Add product
          </Button>
        )}
        {canEdit && (
          <Link
            href="/holiday-deals/config"
            title="Choose which clients show on the sheet"
            aria-label="Configure sheet clients"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          >
            <Settings className="size-4" />
          </Link>
        )}
      </div>

      {isLoading || (clients.length === 0 && rows.length === 0 && clientsLoading) ? (
        <LoadingPlaceholder height="h-72" />
      ) : groups.length === 0 ? (
        <div className="rounded-[18px] border border-stone-200 bg-card dark:border-zinc-800">
          <EmptyState
            icon={Percent}
            title={rows.length === 0 && clients.length === 0 ? "No active clients" : "No rows match these filters"}
            description={
              rows.length === 0 && clients.length === 0
                ? "Active clients appear here automatically. Mark a client Active to plan their deals."
                : "Clear search or filters to see the rest of the sheet."
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-[18px] border border-stone-200 bg-card dark:border-zinc-800">
          <div className="overflow-auto max-h-[calc(100dvh-280px)]">
            <table className="w-max min-w-full text-xs">
              <thead className="sticky top-0 z-20 bg-card">
                <tr className="border-b border-border text-left">
                  {SHEET_COLUMNS.map((label) => (
                    <th
                      key={label || "actions"}
                      className="px-2 py-2 font-bold uppercase tracking-wide text-[10px] text-muted-foreground whitespace-nowrap"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <ClientGroupRows
                    key={group.clientIdCode}
                    group={group}
                    canEdit={canEdit}
                    filtered={rowFiltersActive}
                    onAdd={() => openAdd(group.clientIdCode)}
                    onPatch={(id, body) => patch.mutate({ id, body })}
                    onDelete={(row) => {
                      if (window.confirm(`Remove ${row.asin || dealProductTitle(row) || "this row"} from the sheet?`)) {
                        remove.mutate(row.id);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddDealDialog
        key={addClient || "any"}
        open={addOpen}
        onOpenChange={setAddOpen}
        clients={clients}
        initialClientIdCode={addClient}
        onCreated={() => {
          setAddOpen(false);
          void queryClient.invalidateQueries({ queryKey: ["holiday-deals"] });
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-[18px] border border-stone-200 bg-card p-5 card-glow animate-card-enter dark:border-zinc-800">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums tracking-tighter", warn && "text-brand-red")}>
        {value}
      </p>
    </div>
  );
}

function ClientGroupRows({
  group,
  canEdit,
  filtered,
  onAdd,
  onPatch,
  onDelete,
}: {
  group: ClientGroup;
  canEdit: boolean;
  filtered: boolean;
  onAdd: () => void;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (row: EnrichedHolidayDeal) => void;
}) {
  const agreed = group.rows.filter((r) => clientTrackerStatus(r) === "agreed").length;
  const talked = group.rows.filter((r) => r.clientTalked).length;
  const spend = group.rows.reduce((sum, r) => sum + (r.adBudget ?? 0), 0);
  const productCount = new Set(group.rows.map((r) => r.asin || r.sku || r.id)).size;

  return (
    <>
      <tr className="border-y border-border bg-muted/50">
        <td colSpan={SHEET_COLUMNS.length} className="px-2 py-1.5">
          <div className="sticky left-2 flex w-max items-center gap-x-4">
            <span className="text-sm font-bold text-foreground">{group.clientName}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground tabular-nums">
              {productCount} {productCount === 1 ? "product" : "products"}
              {group.rows.length > 0 && (
                <>
                  {" · "}{talked} talked{" · "}{agreed} agreed{" · "}{money.format(spend)}
                </>
              )}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={onAdd}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold text-brand hover:bg-brand/10"
              >
                <Plus className="size-3" />
                Add product
              </button>
            )}
          </div>
        </td>
      </tr>
      {group.rows.length === 0 ? (
        <tr className="border-b border-border/60">
          <td colSpan={SHEET_COLUMNS.length} className="px-4 py-2 text-xs text-muted-foreground">
            <span className="sticky left-4 inline-block">
              {filtered ? "No rows match these filters." : "No products in deals yet."}
            </span>
          </td>
        </tr>
      ) : (
        group.rows.map((row) => (
          <DealRow
            key={row.id}
            row={row}
            canEdit={canEdit}
            onPatch={(body) => onPatch(row.id, body)}
            onDelete={() => onDelete(row)}
          />
        ))
      )}
    </>
  );
}

function DealRow({
  row,
  canEdit,
  onPatch,
  onDelete,
}: {
  row: EnrichedHolidayDeal;
  canEdit: boolean;
  onPatch: (body: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-b border-border/60 hover:bg-muted/40">
      <td className="px-2 py-1 pl-4 font-mono text-[11px] whitespace-nowrap">
        {row.productId ? (
          <Link
            href={`/products/${row.productId}?from=holiday-deals`}
            className="font-bold text-brand hover:underline"
            title="Open product detail"
          >
            {row.asin || row.sku || "Open"}
          </Link>
        ) : (
          row.asin || "—"
        )}
      </td>
      <td className="px-2 py-1 max-w-[220px] truncate" title={dealProductTitle(row) || undefined}>
        {dealProductTitle(row) || "—"}
      </td>
      <td className="px-2 py-1">
        <CellSelect
          disabled={!canEdit}
          value={row.event}
          onChange={(v) => onPatch({ event: v })}
          options={HOLIDAY_EVENTS.map((e) => ({ value: e.id, label: e.shortLabel }))}
        />
      </td>
      <td className="px-2 py-1">
        <CellSelect
          disabled={!canEdit}
          warn={!row.clientTalked && row.clientAgreement !== "declined"}
          value={row.clientTalked ? "yes" : "no"}
          onChange={(v) => onPatch({ clientTalked: v === "yes" })}
          options={[
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ]}
        />
      </td>
      <td className="px-2 py-1">
        <input
          type="date"
          disabled={!canEdit}
          className={cn(cellInput, !row.clientTalkedAt && row.clientTalked && "border-brand-red")}
          value={row.clientTalkedAt ?? ""}
          onChange={(e) => onPatch({ clientTalkedAt: e.target.value || null })}
        />
      </td>
      <td className="px-2 py-1">
        <CellSelect
          disabled={!canEdit}
          warn={row.clientTalked && row.clientAgreement === "unset"}
          value={row.clientAgreement}
          onChange={(v) => onPatch({ clientAgreement: v })}
          options={CLIENT_AGREEMENTS.map((s) => ({
            value: s,
            label: CLIENT_AGREEMENT_LABELS[s] === "—" ? "—" : CLIENT_AGREEMENT_LABELS[s],
          }))}
        />
      </td>
      <td className="px-2 py-1 w-[96px]">
        <CellNumber
          key={`${row.id}-budget`}
          disabled={!canEdit}
          warn={missingDealTerms(row).spend}
          value={row.adBudget}
          onSave={(v) => onPatch({ adBudget: v })}
        />
      </td>
      <td className="px-2 py-1 w-[72px]">
        <CellNumber
          key={`${row.id}-discount`}
          disabled={!canEdit}
          warn={missingDealTerms(row).percent}
          value={row.discountPercent}
          onSave={(v) => onPatch({ discountPercent: v })}
        />
      </td>
      <td className="px-2 py-1">
        <CellSelect
          disabled={!canEdit}
          value={row.dealType ?? ""}
          onChange={(v) => onPatch({ dealType: v || null })}
          options={[
            { value: "", label: "—" },
            ...DEAL_TYPES.map((t) => ({ value: t, label: DEAL_TYPE_LABELS[t] })),
          ]}
        />
      </td>
      <td className="px-2 py-1 w-[88px]">
        <CellNumber
          key={`${row.id}-promo`}
          disabled={!canEdit}
          value={row.promoPrice}
          step="0.01"
          onSave={(v) => onPatch({ promoPrice: v })}
        />
      </td>
      <td className="px-2 py-1">
        <input
          type="date"
          disabled={!canEdit}
          className={cellInput}
          value={row.startDate ?? ""}
          onChange={(e) => onPatch({ startDate: e.target.value || null })}
        />
      </td>
      <td className="px-2 py-1">
        <input
          type="date"
          disabled={!canEdit}
          className={cellInput}
          value={row.endDate ?? ""}
          onChange={(e) => onPatch({ endDate: e.target.value || null })}
        />
      </td>
      <td className="px-2 py-1 w-[80px]">
        <CellNumber
          key={`${row.id}-units`}
          disabled={!canEdit}
          value={row.estimatedUnits}
          integer
          onSave={(v) => onPatch({ estimatedUnits: v })}
        />
      </td>
      <td className="px-2 py-1">
        <CellSelect
          disabled={!canEdit}
          value={row.inboundMethod}
          onChange={(v) => onPatch({ inboundMethod: v })}
          options={INBOUND_METHODS.map((m) => ({ value: m, label: INBOUND_METHOD_LABELS[m] }))}
        />
      </td>
      <td className="px-2 py-1 whitespace-nowrap">
        <span className={cn("rounded-md border px-2 py-0.5 text-[9px] font-bold", riskClass(row.inboundRisk))}>
          {row.inboundDeadline} ({daysLabel(row.inboundDaysRemaining)})
        </span>
      </td>
      <td className="px-2 py-1">
        <CellSelect
          disabled={!canEdit}
          value={row.submissionStatus}
          onChange={(v) => onPatch({ submissionStatus: v })}
          options={SUBMISSION_STATUSES.map((s) => ({
            value: s,
            label: SUBMISSION_STATUS_LABELS[s],
          }))}
        />
      </td>
      <td className="px-2 py-1">
        <CellSelect
          disabled={!canEdit}
          value={row.inboundStatus}
          onChange={(v) => onPatch({ inboundStatus: v })}
          options={INBOUND_STATUSES.map((s) => ({
            value: s,
            label: INBOUND_STATUS_LABELS[s],
          }))}
        />
      </td>
      <td className="px-2 py-1 tabular-nums whitespace-nowrap text-muted-foreground">
        {row.fee.incomplete ? `${moneyExact.format(row.fee.upfront)}+` : moneyExact.format(row.fee.total)}
      </td>
      <td className="px-2 py-1">
        {canEdit && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1 text-muted-foreground hover:text-brand-red"
            aria-label="Remove row"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}

function CellSelect({
  value,
  options,
  disabled,
  warn,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  warn?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      className={cn(cellInput, "w-full max-w-[160px]", warn && "border-brand-red text-brand-red")}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value || "empty"} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function CellNumber({
  value,
  disabled,
  integer,
  step,
  warn,
  onSave,
}: {
  value: number | null;
  disabled?: boolean;
  integer?: boolean;
  step?: string;
  warn?: boolean;
  onSave: (value: number | null) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      step={step ?? (integer ? "1" : "any")}
      disabled={disabled}
      className={cn(cellInput, "w-full", warn && "border-brand-red")}
      defaultValue={value ?? ""}
      onBlur={(e) => {
        const draft = e.target.value.trim();
        const next = draft === "" ? null : Number(draft);
        if (next === null) {
          if (value !== null) onSave(null);
          return;
        }
        if (!Number.isFinite(next)) return;
        if (next !== value) onSave(next);
      }}
    />
  );
}

function catalogTitle(p: Pick<ProductHit, "summarizedTitle" | "itemName">) {
  return p.summarizedTitle?.trim() || p.itemName?.trim() || "Untitled";
}

function CatalogHit({ p }: { p: ProductHit }) {
  const title = catalogTitle(p);
  return (
    <span className="block min-w-0">
      <span className="flex min-w-0 items-baseline gap-3">
        <span className="shrink-0 font-mono text-[11px] font-bold text-brand">
          {p.asin || "—"}
        </span>
        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
          {p.sku || "—"}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-sm text-foreground" title={title}>
        {title}
      </span>
    </span>
  );
}

function AddDealDialog({
  open,
  onOpenChange,
  clients,
  initialClientIdCode = "",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ReportClient[];
  initialClientIdCode?: string;
  onCreated: () => void;
}) {
  const [clientIdCode, setClientIdCode] = useState(initialClientIdCode);
  const [events, setEvents] = useState<HolidayEventId[]>(["bf_week"]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ProductHit[]>([]);
  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);

  function togglePicked(p: ProductHit) {
    setPicked((prev) =>
      prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p],
    );
  }

  function toggleGroup(items: ProductHit[]) {
    setPicked((prev) => {
      const ids = new Set(prev.map((x) => x.id));
      const allIn = items.every((p) => ids.has(p.id));
      if (allIn) return prev.filter((x) => !items.some((p) => p.id === x.id));
      return [...prev, ...items.filter((p) => !ids.has(p.id))];
    });
  }
  const [asin, setAsin] = useState("");
  const [sku, setSku] = useState("");
  const [itemName, setItemName] = useState("");
  const [dealType, setDealType] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [promoPrice, setPromoPrice] = useState("");
  const [adBudget, setAdBudget] = useState("");
  const [estimatedUnits, setEstimatedUnits] = useState("");
  const [clientTalked, setClientTalked] = useState(false);
  const [clientTalkedAt, setClientTalkedAt] = useState("");
  const [clientAgreement, setClientAgreement] = useState<ClientAgreement>("unset");

  const products = useQuery({
    queryKey: ["holiday-deal-catalog", clientIdCode],
    enabled: open && !!clientIdCode,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({
        client: clientIdCode,
        pageSize: "1000",
        sortBy: "asin",
        sortOrder: "asc",
      });
      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error("Could not load the client catalog");
      const json = await res.json() as { data: ProductHit[] };
      return json.data ?? [];
    },
  });
  const catalogGroups = useMemo(
    () => groupCatalogByVariation(products.data ?? [], query),
    [products.data, query],
  );

  const manualEntry = picked.length === 0 && Boolean(asin.trim() || sku.trim());
  const canSubmit = !!clientIdCode && events.length > 0 && (picked.length > 0 || manualEntry);

  const create = useMutation({
    mutationFn: async () => {
      const terms = {
        clientIdCode,
        events,
        dealType: dealType || null,
        discountPercent: discountPercent || null,
        promoPrice: promoPrice || null,
        adBudget: adBudget || null,
        estimatedUnits: estimatedUnits || null,
        clientTalked,
        clientTalkedAt: clientTalkedAt || null,
        clientAgreement,
      };
      const payloads =
        picked.length > 0
          ? picked.map((p) => ({
              ...terms,
              productId: p.id,
              asin: p.asin,
              sku: p.sku,
              itemName: catalogTitle(p),
            }))
          : [{ ...terms, asin: asin || null, sku: sku || null, itemName: itemName || null }];

      const results = await Promise.all(
        payloads.map(async (body) => {
          const res = await fetch("/api/holiday-deals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const json = await res.json().catch(() => ({}));
          return {
            ok: res.ok,
            label: body.asin || body.sku || "product",
            error: res.ok ? null : (json.error as string | undefined) || "Could not add product",
          };
        }),
      );
      const added = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      if (added === 0) throw new Error(failed[0]?.error ?? "Could not add product");
      return { added, failed };
    },
    onSuccess: ({ added, failed }) => {
      toast.success(
        `Added ${added} ${added === 1 ? "product" : "products"} to the sheet`,
      );
      for (const f of failed) toast.error(`${f.label}: ${f.error}`);
      setPicked([]);
      setQuery("");
      setAsin("");
      setSku("");
      setItemName("");
      onCreated();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function toggleEvent(id: HolidayEventId, checked: boolean) {
    setEvents((prev) => {
      if (checked) return HOLIDAY_EVENT_IDS.filter((e) => prev.includes(e) || e === id);
      return prev.filter((e) => e !== id);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add products to deals</DialogTitle>
          <DialogDescription>
            Pick one or more ASINs. Each gets a row per event with the same deal terms,
            which you can adjust on the sheet afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-[10px] font-bold uppercase text-muted-foreground">
            Client
            <select
              className={cn(cellInput, "mt-1 h-9 w-full text-sm")}
              value={clientIdCode}
              onChange={(e) => {
                setClientIdCode(e.target.value);
                setPicked([]);
              }}
            >
              <option value="">Select client</option>
              {clients.map((c) => (
                <option key={c.clientIdCode} value={c.clientIdCode}>
                  {c.clientName || c.clientIdCode}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5">Events</p>
            <div className="flex flex-col gap-1.5">
              {HOLIDAY_EVENTS.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={events.includes(e.id)}
                    onCheckedChange={(v) => toggleEvent(e.id, v === true)}
                  />
                  {e.label}
                  <span className="text-xs text-muted-foreground">
                    {e.startDate} to {e.endDate}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="block text-[10px] font-bold uppercase text-muted-foreground">
            Catalog
            <Input
              className="mt-1 h-9"
              value={query}
              disabled={!clientIdCode}
              placeholder="Filter by ASIN, SKU, or title"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {products.isLoading && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> Loading catalog
            </p>
          )}
          {clientIdCode && products.data && (
            catalogGroups.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {products.data.length === 0
                  ? "No products in this client's catalog."
                  : "No ASINs match that filter."}
              </p>
            ) : (
              <div className="max-h-72 overflow-auto rounded-md border border-border">
                {catalogGroups.map((group) => {
                  const allIn = group.items.every((p) => pickedIds.has(p.id));
                  return (
                    <div key={group.key}>
                      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-muted/70 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground backdrop-blur">
                        <Checkbox
                          checked={allIn}
                          aria-label={`Select all in ${group.label}`}
                          onCheckedChange={() => toggleGroup(group.items)}
                        />
                        <span className="truncate">{group.label}</span>
                        <span className="shrink-0 tabular-nums">{group.items.length}</span>
                      </div>
                      <ul>
                        {group.items.map((p) => {
                          const on = pickedIds.has(p.id);
                          return (
                            <li key={p.id}>
                              <button
                                type="button"
                                aria-pressed={on}
                                className={cn(
                                  "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted",
                                  on && "bg-brand/5",
                                )}
                                onClick={() => togglePicked(p)}
                              >
                                <span
                                  aria-hidden
                                  className={cn(
                                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-field-border bg-field-bg",
                                    on && "border-brand bg-brand text-brand-foreground",
                                  )}
                                >
                                  {on && <Check className="size-3" />}
                                </span>
                                <CatalogHit p={p} />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )
          )}
          {picked.length > 0 && (
            <div className="rounded-md border border-brand/40 bg-brand/5 px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wide text-brand">
                  {picked.length} selected
                </p>
                <button
                  type="button"
                  className="text-[11px] font-bold text-brand hover:underline"
                  onClick={() => setPicked([])}
                >
                  Clear
                </button>
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {picked.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 font-mono text-[11px] hover:border-brand-red hover:text-brand-red"
                      title={`Remove ${catalogTitle(p)}`}
                      onClick={() => togglePicked(p)}
                    >
                      {p.asin || p.sku}
                      <span aria-hidden>×</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {picked.length === 0 && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Or add one manually
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">
                  ASIN
                  <Input className="mt-1 h-8" value={asin} onChange={(e) => setAsin(e.target.value)} />
                </label>
                <label className="text-[10px] font-bold uppercase text-muted-foreground">
                  SKU
                  <Input className="mt-1 h-8" value={sku} onChange={(e) => setSku(e.target.value)} />
                </label>
              </div>
              <label className="block text-[10px] font-bold uppercase text-muted-foreground">
                Summarized Title
                <Input className="mt-1 h-8" value={itemName} onChange={(e) => setItemName(e.target.value)} />
              </label>
            </>
          )}
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              Talked
              <select
                className={cn(cellInput, "mt-1 h-8 w-full")}
                value={clientTalked ? "yes" : "no"}
                onChange={(e) => {
                  const yes = e.target.value === "yes";
                  setClientTalked(yes);
                  if (yes && !clientTalkedAt) setClientTalkedAt(todayISO());
                }}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              When
              <Input
                type="date"
                className="mt-1 h-8"
                value={clientTalkedAt}
                onChange={(e) => setClientTalkedAt(e.target.value)}
              />
            </label>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              Agreed
              <select
                className={cn(cellInput, "mt-1 h-8 w-full")}
                value={clientAgreement}
                onChange={(e) => {
                  const next = e.target.value as ClientAgreement;
                  setClientAgreement(next);
                  if (next === "agreed") {
                    setClientTalked(true);
                    if (!clientTalkedAt) setClientTalkedAt(todayISO());
                  }
                }}
              >
                {CLIENT_AGREEMENTS.map((s) => (
                  <option key={s} value={s}>{CLIENT_AGREEMENT_LABELS[s]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              Spend
              <Input className="mt-1 h-8" value={adBudget} onChange={(e) => setAdBudget(e.target.value)} />
            </label>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              Discount %
              <Input className="mt-1 h-8" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} />
            </label>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              Deal type
              <select
                className={cn(cellInput, "mt-1 h-8 w-full")}
                value={dealType}
                onChange={(e) => setDealType(e.target.value)}
              >
                <option value="">Not set</option>
                {DEAL_TYPES.map((t) => (
                  <option key={t} value={t}>{DEAL_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              Promo price
              <Input className="mt-1 h-8" value={promoPrice} onChange={(e) => setPromoPrice(e.target.value)} />
            </label>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              Est. units
              <Input className="mt-1 h-8" value={estimatedUnits} onChange={(e) => setEstimatedUnits(e.target.value)} />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="brand"
            disabled={create.isPending || !canSubmit}
            onClick={() => create.mutate()}
          >
            {create.isPending && <Loader2 className="size-3.5 animate-spin" />}
            {picked.length > 1 ? `Add ${picked.length} products` : "Add to sheet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

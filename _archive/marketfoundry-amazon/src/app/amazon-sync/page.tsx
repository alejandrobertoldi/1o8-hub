"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/no-array-index-as-key */

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BetaPill } from "@/components/ui/beta-pill";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { hasAdminPowers } from "@/lib/roles";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  Minus,
  ChevronDown,
  Search,
  ArrowUpDown,
  Check,
  Download,
} from "lucide-react";
import { CLIENT_NAMES } from "@/lib/constants";
import { SYNC_FIELDS, SYNC_FIELD_GROUPS } from "@/lib/amazon-sync-field-map";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────

type ClientSummary = {
  clientIdCode: string;
  productCount: number;
  lastSync: string | null;
  unresolved: number;
};

type ProductSummary = {
  productId: string;
  asin: string;
  sku: string | null;
  title: string | null;
  parentageLevel: string | null;
  parentAsin: string | null;
  lastSynced: string | null;
  mismatches: number;
  thumbnailUrl: string | null;
};

type Discrepancy = {
  id: string;
  snapshotId: string;
  productId: string;
  asin: string;
  fieldName: string;
  fieldGroup: string;
  catalogValue: string | null;
  amazonValue: string | null;
  status: string;
  resolved: boolean;
  resolvedAction: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
};

type SnapshotHistory = {
  id: string;
  fetchedAt: string;
  creditsUsed: number;
};

// ─── Data fetching ──────────────────────────────────────────────────

async function fetchSummary(clientId?: string) {
  const url = clientId
    ? `/api/amazon-sync/summary?client_id=${clientId}`
    : "/api/amazon-sync/summary";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch summary");
  return res.json();
}

async function fetchDiscrepancies(productId: string) {
  const res = await fetch(
    `/api/amazon-sync/discrepancies?product_id=${productId}&pageSize=200`
  );
  if (!res.ok) throw new Error("Failed to fetch discrepancies");
  return res.json();
}

async function fetchSnapshot(productId: string) {
  const res = await fetch(`/api/amazon-sync/snapshot/${productId}`);
  if (!res.ok) throw new Error("Failed to fetch snapshot");
  return res.json();
}

// ─── Helpers ────────────────────────────────────────────────────────

function relativeTime(ts: string | null): string {
  if (!ts) return "Never";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isStale(ts: string | null): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > 24 * 60 * 60 * 1000;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "match":
      return <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />;
    case "mismatch":
      return <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />;
    case "missing_in_catalog":
      return <Info className="size-3.5 text-blue-400 shrink-0" />;
    case "missing_in_amazon":
      return <Minus className="size-3.5 text-muted-foreground/50 shrink-0" />;
    default:
      return null;
  }
}

function SyncDot({ lastSynced }: { lastSynced: string | null }) {
  if (!lastSynced) return <div className="size-2 rounded-full bg-gray-500" />;
  if (isStale(lastSynced))
    return <div className="size-2 rounded-full bg-yellow-500" />;
  return <div className="size-2 rounded-full bg-green-500" />;
}

function DiscrepancyBadge({ count }: { count: number }) {
  const color =
    count === 0
      ? "bg-emerald-500/10 text-emerald-500"
      : count <= 5
        ? "bg-amber-500/10 text-amber-500"
        : "bg-red-500/10 text-red-500";
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-bold tabular-nums ${color}`}
    >
      {count}
    </span>
  );
}

// ─── JSON Tree Viewer ───────────────────────────────────────────────

function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) {
    return <span className="text-muted-foreground">null</span>;
  }
  if (typeof data !== "object") {
    return (
      <span
        className={
          typeof data === "string"
            ? "text-green-400"
            : typeof data === "number"
              ? "text-blue-400"
              : typeof data === "boolean"
                ? "text-amber-400"
                : "text-white"
        }
      >
        {typeof data === "string" ? `"${data}"` : String(data)}
      </span>
    );
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-muted-foreground">[]</span>;
    return (
      <Collapsible defaultOpen={depth < 1}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white">
          <ChevronDown className="size-3" />
          Array[{data.length}]
        </CollapsibleTrigger>
        <CollapsibleContent className="ml-4 border-l border-border pl-2">
          {data.map((item, i) => (
            <div key={i} className="py-0.5">
              <span className="text-muted-foreground text-xs mr-1">{i}:</span>
              <JsonTree data={item} depth={depth + 1} />
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }
  const entries = Object.entries(data);
  if (entries.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;
  return (
    <Collapsible defaultOpen={depth < 1}>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white">
        <ChevronDown className="size-3" />
        {"{"}
        {entries.length} keys
        {"}"}
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-4 border-l border-border pl-2">
        {entries.map(([key, val]) => (
          <div key={key} className="py-0.5">
            <span className="text-purple-400 text-xs mr-1">{key}:</span>
            <JsonTree data={val} depth={depth + 1} />
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── CSV Export ──────────────────────────────────────────────────────

function exportToCsv(rows: Discrepancy[], asin: string) {
  const headers = ["Field", "Group", "1o8 Hub Value", "Amazon Value", "Status", "Resolved", "Action"];
  const csvRows = rows.map((r) => [
    r.fieldName,
    r.fieldGroup,
    `"${(r.catalogValue ?? "").replace(/"/g, '""')}"`,
    `"${(r.amazonValue ?? "").replace(/"/g, '""')}"`,
    r.status,
    r.resolved ? "Yes" : "No",
    r.resolvedAction === "update_amazon" ? "Update Amazon" : r.resolvedAction === "update_hub" ? "Update 1o8 Hub" : "",
  ]);
  const csv = [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `amazon-sync-${asin}-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function AmazonSyncPage() {
  const { data: session } = useSession();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [checkedProducts, setCheckedProducts] = useState<Set<string>>(new Set());
  const [productSearch, setProductSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"mismatches" | "lastSynced" | "title">(
    "mismatches"
  );
  const [hoverImage, setHoverImage] = useState<{ src: string; x: number; y: number } | null>(null);

  // Fetch summary data
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["amazon-sync-summary", selectedClient],
    queryFn: () => fetchSummary(selectedClient ?? undefined),
    staleTime: 60_000,
  });

  // Fetch discrepancies for selected product
  const { data: discData, isLoading: discLoading } = useQuery({
    queryKey: ["amazon-sync-discrepancies", selectedProduct],
    queryFn: () => fetchDiscrepancies(selectedProduct!),
    enabled: !!selectedProduct,
    staleTime: 30_000,
  });

  // Fetch snapshot for selected product
  const { data: snapshotData } = useQuery({
    queryKey: ["amazon-sync-snapshot", selectedProduct],
    queryFn: () => fetchSnapshot(selectedProduct!),
    enabled: !!selectedProduct,
    staleTime: 60_000,
  });

  // Provider setting (admin only)
  const { data: providerData } = useQuery({
    queryKey: ["amazon-sync-provider"],
    queryFn: async () => {
      const res = await fetch("/api/amazon-sync/settings");
      if (!res.ok) return { provider: "rainforest" };
      return res.json();
    },
    staleTime: 300_000,
  });

  const providerMutation = useMutation({
    mutationFn: async (provider: "rainforest" | "firecrawl") => {
      const res = await fetch("/api/amazon-sync/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error("Failed to update provider");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["amazon-sync-provider"] });
      toast.success(`Sync provider set to ${data.provider === "firecrawl" ? "Firecrawl" : "Rainforest"}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const currentProvider = providerData?.provider || "rainforest";

  // Run full sync mutation
  const syncMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const res = await fetch("/api/amazon-sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Sync failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(
        `Sync complete: ${data.completed} synced, ${data.failed} failed, ${data.credits_used} credits used`
      );
      queryClient.invalidateQueries({ queryKey: ["amazon-sync-summary"] });
      queryClient.invalidateQueries({
        queryKey: ["amazon-sync-discrepancies"],
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Sync one or more products
  const syncProductMutation = useMutation({
    mutationFn: async ({
      productId,
      clientId,
    }: {
      productId: string;
      clientId: string;
    }) => {
      const ids = productId.includes(",") ? productId.split(",") : [productId];
      const res = await fetch("/api/amazon-sync/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_ids: ids,
          client_id: clientId,
        }),
      });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Product synced");
      queryClient.invalidateQueries({ queryKey: ["amazon-sync-summary"] });
      queryClient.invalidateQueries({
        queryKey: ["amazon-sync-discrepancies"],
      });
      queryClient.invalidateQueries({ queryKey: ["amazon-sync-snapshot"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Run Both providers for a product
  const runBothMutation = useMutation({
    mutationFn: async ({
      productId,
      clientId,
    }: {
      productId: string;
      clientId: string;
    }) => {
      const res = await fetch("/api/amazon-sync/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_ids: [productId],
          client_id: clientId,
          provider: "both",
        }),
      });
      if (!res.ok) throw new Error("Run Both failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Both providers synced");
      queryClient.invalidateQueries({ queryKey: ["amazon-sync-summary"] });
      queryClient.invalidateQueries({ queryKey: ["amazon-sync-discrepancies"] });
      queryClient.invalidateQueries({ queryKey: ["amazon-sync-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["amazon-sync-compare"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Three-way comparison data
  const { data: compareData } = useQuery({
    queryKey: ["amazon-sync-compare", selectedProduct],
    queryFn: async () => {
      const res = await fetch(`/api/amazon-sync/compare?product_id=${selectedProduct}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedProduct,
    staleTime: 30_000,
  });

  // Resolve discrepancy
  const resolveMutation = useMutation({
    mutationFn: async ({
      id,
      resolved,
      resolvedAction,
    }: {
      id: string;
      resolved: boolean;
      resolvedAction?: "update_amazon" | "update_hub" | null;
    }) => {
      const res = await fetch("/api/amazon-sync/discrepancies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, resolved, resolvedAction }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["amazon-sync-discrepancies"],
      });
    },
  });

  const clients: ClientSummary[] = summaryData?.allClients ?? [];
  const productList: ProductSummary[] = summaryData?.products ?? [];
  const discrepancies: Discrepancy[] = discData?.data ?? [];

  // Filter + sort products
  const filteredProducts = useMemo(() => {
    let list = productList;
    if (productSearch) {
      const q = productSearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.asin.toLowerCase().includes(q) ||
          (p.title?.toLowerCase() ?? "").includes(q)
      );
    }
    // Group by variation family: parent first, then children indented
    const sorted = list.toSorted((a, b) => {
      if (sortBy === "mismatches") return b.mismatches - a.mismatches;
      if (sortBy === "lastSynced") {
        const aTime = a.lastSynced ? new Date(a.lastSynced).getTime() : 0;
        const bTime = b.lastSynced ? new Date(b.lastSynced).getTime() : 0;
        return bTime - aTime;
      }
      return (a.title ?? "").localeCompare(b.title ?? "");
    });

    // Build family groups: parent ASIN -> children
    const families = new Map<string, ProductSummary[]>();
    const standalone: ProductSummary[] = [];
    const parentMap = new Map<string, ProductSummary>();

    for (const p of sorted) {
      const level = (p.parentageLevel ?? "").toLowerCase();
      if (level === "parent") {
        parentMap.set(p.asin, p);
        if (!families.has(p.asin)) families.set(p.asin, []);
      }
    }
    for (const p of sorted) {
      const level = (p.parentageLevel ?? "").toLowerCase();
      if (level === "child" && p.parentAsin && (families.has(p.parentAsin) || parentMap.has(p.parentAsin))) {
        if (!families.has(p.parentAsin)) families.set(p.parentAsin, []);
        families.get(p.parentAsin)!.push(p);
      } else if (level !== "parent") {
        if (p.parentAsin && families.has(p.parentAsin)) {
          families.get(p.parentAsin)!.push(p);
        } else {
          standalone.push(p);
        }
      }
    }

    // Flatten: parent then children, then standalone
    const result: ProductSummary[] = [];
    for (const [parentAsin, children] of families) {
      const parent = parentMap.get(parentAsin);
      if (parent) result.push(parent);
      result.push(...children);
    }
    result.push(...standalone);
    return result;
  }, [productList, productSearch, sortBy]);

  // Filter discrepancies
  const filteredDisc = useMemo(() => {
    if (statusFilter === "all") return discrepancies;
    if (statusFilter === "mismatches")
      return discrepancies.filter((d) => d.status === "mismatch");
    if (statusFilter === "missing")
      return discrepancies.filter(
        (d) =>
          d.status === "missing_in_catalog" ||
          d.status === "missing_in_amazon"
      );
    if (statusFilter === "matches")
      return discrepancies.filter((d) => d.status === "match");
    return discrepancies;
  }, [discrepancies, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = discrepancies.length;
    const matches = discrepancies.filter((d) => d.status === "match").length;
    const mismatches = discrepancies.filter(
      (d) => d.status === "mismatch"
    ).length;
    const missing = discrepancies.filter(
      (d) =>
        d.status === "missing_in_catalog" || d.status === "missing_in_amazon"
    ).length;
    return { total, matches, mismatches, missing };
  }, [discrepancies]);

  const selectedProductData = productList.find(
    (p) => p.productId === selectedProduct
  );
  const selectedClientName = selectedClient
    ? CLIENT_NAMES[selectedClient] || selectedClient
    : null;

  // Snapshot history for chart
  const historyData = useMemo(() => {
    if (!snapshotData?.history) return [];
    return snapshotData.history
      .slice()
      .reverse()
      .map((h: SnapshotHistory) => ({
        date: new Date(h.fetchedAt).toLocaleDateString("en-US"),
        fetchedAt: h.fetchedAt,
      }));
  }, [snapshotData]);

  return (
    <div className="space-y-4">
      <PageMetaSlot>
        <div className="flex items-center gap-4 min-w-0 w-full">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Amazon Sync"
          >
            <span className="font-bold text-sidebar-foreground">Amazon</span>
            <span className="font-normal text-brand">Sync</span>
          </h1>
          <BetaPill />
        </div>
      </PageMetaSlot>
    <div className="flex h-[calc(100vh-80px)] gap-4">
      {/* Left panel — Client + Product selector */}
      <div className="w-[280px] shrink-0 flex flex-col gap-3 overflow-hidden">
        {/* Provider toggle (admin only) */}
        {isAdmin && (
          <div className="glass-card rounded-lg p-3 space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Data Provider
            </h3>
            <div className="flex gap-1.5">
              <button
                onClick={() => providerMutation.mutate("rainforest")}
                disabled={providerMutation.isPending}
                className={`flex-1 flex items-center justify-center gap-1.5 text-[10px] px-2 py-1.5 rounded font-medium transition-colors ${
                  currentProvider === "rainforest"
                    ? "bg-[#C8944A]/20 text-[#C8944A] border border-[#C8944A]/40"
                    : "bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50"
                }`}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/></svg>
                Rainforest
              </button>
              <button
                onClick={() => providerMutation.mutate("firecrawl")}
                disabled={providerMutation.isPending}
                className={`flex-1 flex items-center justify-center gap-1.5 text-[10px] px-2 py-1.5 rounded font-medium transition-colors ${
                  currentProvider === "firecrawl"
                    ? "bg-[#F56B2A]/20 text-[#F56B2A] border border-[#F56B2A]/40"
                    : "bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50"
                }`}
              >
                <svg width="10" height="12" viewBox="0 0 16 22" fill="none"><path d="M8 0S3.6 6.4 3.6 11.2C3.6 15.2 5.6 18 8 20c2.4-2 4.4-4.8 4.4-8.8C12.4 6.4 8 0 8 0zm0 17.6c-1.2-1.2-2.4-3.2-2.4-6.4C5.6 7.6 8 3.2 8 3.2s2.4 4.4 2.4 8c0 3.2-1.2 5.2-2.4 6.4z" fill="currentColor"/></svg>
                Firecrawl
              </button>
            </div>
          </div>
        )}

        {/* Client selector */}
        <div className="glass-card rounded-lg p-3 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Clients
          </h3>
          {summaryLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-1 max-h-[280px] overflow-y-auto">
              {clients.filter((c) => c.productCount > 0).map((c) => {
                const isSelected = selectedClient === c.clientIdCode;
                return (
                  <button
                    key={c.clientIdCode}
                    onClick={() => {
                      setSelectedClient(
                        isSelected ? null : c.clientIdCode!
                      );
                      setSelectedProduct(null);
                    }}
                    className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? "border border-brand/30 bg-brand/15 text-brand"
                        : "border border-transparent bg-transparent text-white/80 hover:bg-muted hover:text-white"
                    }`}
                  >
                    <div className="flex flex-col items-start gap-0.5 min-w-0">
                      <span className="truncate">
                        {CLIENT_NAMES[c.clientIdCode!] || c.clientIdCode}
                      </span>
                      <span className="text-[10px] text-white/50">
                        {c.productCount} products
                        {c.lastSync
                          ? ` · ${relativeTime(c.lastSync)}`
                          : " · never synced"}
                      </span>
                    </div>
                    {c.unresolved > 0 && (
                      <DiscrepancyBadge count={c.unresolved} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Product list */}
        {selectedClient && (
          <div className="glass-card rounded-lg p-3 flex-1 flex flex-col gap-2 overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Products
              </h3>
              <span className="text-[10px] text-muted-foreground">
                {filteredProducts.length}
              </span>
            </div>

            {/* Search + Sort */}
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search…"
                  className="h-7 pl-7 text-xs"
                />
              </div>
              <Select
                value={sortBy}
                onValueChange={(v) =>
                  setSortBy(v as "mismatches" | "lastSynced" | "title")
                }
              >
                <SelectTrigger className="size-7 p-0 [&>svg]:hidden">
                  <ArrowUpDown className="size-3" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mismatches">Most issues</SelectItem>
                  <SelectItem value="lastSynced">Last synced</SelectItem>
                  <SelectItem value="title">Alphabetical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Select all */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-3 accent-[#F8BF1D] rounded"
                checked={checkedProducts.size > 0 && checkedProducts.size === filteredProducts.length}
                ref={(el) => { if (el) el.indeterminate = checkedProducts.size > 0 && checkedProducts.size < filteredProducts.length; }}
                onChange={(e) => {
                  if (e.target.checked) {
                    setCheckedProducts(new Set(filteredProducts.map((p) => p.productId)));
                  } else {
                    setCheckedProducts(new Set());
                  }
                }}
              />
              <span className="text-[10px] text-muted-foreground">
                {checkedProducts.size > 0 ? `${checkedProducts.size} selected` : "Select all"}
              </span>
            </div>

            {/* Product list */}
            <div className="flex-1 overflow-y-auto space-y-1">
              {filteredProducts.map((p) => {
                const isSelected = selectedProduct === p.productId;
                const isChecked = checkedProducts.has(p.productId);
                const isChild = (p.parentageLevel ?? "").toLowerCase() === "child";
                const isParent = (p.parentageLevel ?? "").toLowerCase() === "parent";
                return (
                  <div
                    key={p.productId}
                    className={`w-full flex items-start gap-2 rounded-lg py-1.5 text-left transition-all cursor-pointer ${isChild ? "pl-5 pr-2" : "px-2"} ${
                      isSelected
                        ? "bg-brand/10 border border-brand/30"
                        : "border border-transparent hover:bg-muted"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="size-3 accent-[#F8BF1D] rounded shrink-0 mt-1"
                      checked={isChecked}
                      onChange={(e) => {
                        setCheckedProducts((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(p.productId);
                          else next.delete(p.productId);
                          return next;
                        });
                      }}
                    />
                    <button
                      type="button"
                      className="flex items-start gap-2 flex-1 min-w-0 text-left"
                      onClick={() => setSelectedProduct(p.productId)}
                    >
                      {p.thumbnailUrl ? (
                        <img
                          src={p.thumbnailUrl}
                          alt=""
                          className="size-8 object-contain rounded shrink-0 mt-0.5"
                        />
                      ) : (
                        <div className="size-8 rounded bg-muted shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-white/90 break-words leading-snug" style={{ fontStretch: "condensed" }}>
                          {p.title || p.asin}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {isParent && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 leading-tight" style={{ fontStretch: "condensed" }}>Parent</span>
                          )}
                          {isChild && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 leading-tight" style={{ fontStretch: "condensed" }}>Child</span>
                          )}
                          <span className="text-[10px] text-white/50 font-mono">
                            {p.asin}
                          </span>
                          <SyncDot lastSynced={p.lastSynced} />
                        </div>
                        {p.sku && (
                          <div className="text-[10px] text-white/40 font-mono mt-0.5">
                            {p.sku}
                          </div>
                        )}
                      </div>
                      <DiscrepancyBadge count={p.mismatches} />
                    </button>
                  </div>
                );
              })}
              {filteredProducts.length === 0 && !summaryLoading && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No products found
                </p>
              )}
            </div>

            {/* Bulk actions */}
            <div className="pt-2 border-t border-border space-y-1.5">
              {checkedProducts.size > 0 && (
                <Button
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() =>
                    selectedClient &&
                    syncProductMutation.mutate({
                      productId: [...checkedProducts].join(","),
                      clientId: selectedClient,
                    })
                  }
                  disabled={syncProductMutation.isPending}
                >
                  {syncProductMutation.isPending ? (
                    <Loader2 className="size-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3 mr-1" />
                  )}
                  Sync Selected ({checkedProducts.size})
                </Button>
              )}
              <Button
                size="sm"
                variant={checkedProducts.size > 0 ? "outline" : "default"}
                className="w-full h-7 text-xs"
                onClick={() =>
                  selectedClient && syncMutation.mutate(selectedClient)
                }
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="size-3 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="size-3 mr-1" />
                )}
                Sync All ({filteredProducts.length})
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Right panel — Comparison view */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selectedProduct ? (
          // Empty state
          <div className="glass-card rounded-lg flex flex-col items-center justify-center h-full gap-4 p-8">
            <RefreshCw className="size-12 text-muted-foreground/30" />
            <div className="text-center space-y-1">
              <h2 className="text-lg font-semibold text-white font-[family-name:var(--font-outfit)]">
                Amazon Sync
              </h2>
              <p className="text-sm text-muted-foreground max-w-md">
                {selectedClient
                  ? "Select a product from the list to view its comparison data, or run a full sync."
                  : "Select a client to get started, then choose a product to compare."}
              </p>
            </div>
            {selectedClient && (
              <Button
                onClick={() => syncMutation.mutate(selectedClient)}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="size-4 mr-2" />
                )}
                Run Full Sync
              </Button>
            )}
          </div>
        ) : (
          // Product comparison view
          <div className="space-y-4">
            {/* Header */}
            <div className="glass-card rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-white break-words">
                    {selectedProductData?.title || selectedProductData?.asin}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {selectedProductData?.asin}
                    </Badge>
                    {selectedProductData?.lastSynced && (
                      <span className="text-[10px] text-white/50">
                        Last synced:{" "}
                        {relativeTime(selectedProductData.lastSynced)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() =>
                      selectedClient &&
                      syncProductMutation.mutate({
                        productId: selectedProduct,
                        clientId: selectedClient,
                      })
                    }
                    disabled={syncProductMutation.isPending}
                  >
                    {syncProductMutation.isPending ? (
                      <Loader2 className="size-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3 mr-1" />
                    )}
                    Refresh
                  </Button>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                      onClick={() =>
                        selectedClient &&
                        runBothMutation.mutate({
                          productId: selectedProduct,
                          clientId: selectedClient,
                        })
                      }
                      disabled={runBothMutation.isPending}
                    >
                      {runBothMutation.isPending ? (
                        <Loader2 className="size-3 mr-1 animate-spin" />
                      ) : (
                        <span className="flex items-center gap-0.5 mr-1">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="#C8944A"/></svg>
                          <svg width="8" height="10" viewBox="0 0 16 22" fill="none"><path d="M8 0S3.6 6.4 3.6 11.2C3.6 15.2 5.6 18 8 20c2.4-2 4.4-4.8 4.4-8.8C12.4 6.4 8 0 8 0zm0 17.6c-1.2-1.2-2.4-3.2-2.4-6.4C5.6 7.6 8 3.2 8 3.2s2.4 4.4 2.4 8c0 3.2-1.2 5.2-2.4 6.4z" fill="#F56B2A"/></svg>
                        </span>
                      )}
                      Run Both
                    </Button>
                  )}
                </div>
              </div>

              {/* Quick stats */}
              {discrepancies.length > 0 && (
                <div className="flex items-center gap-4 mt-3 text-xs">
                  <span className="text-muted-foreground">
                    {stats.total} fields
                  </span>
                  <span className="flex items-center gap-1 text-green-500">
                    <CheckCircle2 className="size-3" />
                    {stats.matches}
                  </span>
                  <span className="flex items-center gap-1 text-amber-500">
                    <AlertTriangle className="size-3" />
                    {stats.mismatches}
                  </span>
                  <span className="flex items-center gap-1 text-blue-400">
                    <Info className="size-3" />
                    {stats.missing}
                  </span>
                </div>
              )}
            </div>

            {/* Tabs */}
            <Tabs defaultValue="comparison">
              <TabsList variant="line">
                <TabsTrigger value="comparison">Field Comparison</TabsTrigger>
                {isAdmin && (
                  <TabsTrigger value="compare3">
                    <span className="flex items-center gap-1">
                      3-Way Compare
                      {compareData?.firecrawlSnapshot && compareData?.rainforestSnapshot && (
                        <span className="inline-block size-1.5 rounded-full bg-purple-400" />
                      )}
                    </span>
                  </TabsTrigger>
                )}
                <TabsTrigger value="snapshot">Snapshot</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="reviews">Reviews</TabsTrigger>
                <TabsTrigger value="aplus">A+ Content</TabsTrigger>
              </TabsList>

              {/* Tab 1: Field Comparison */}
              <TabsContent value="comparison" className="mt-3">
                {discLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : discrepancies.length === 0 ? (
                  <div className="glass-card rounded-lg p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      No sync data yet. Click Refresh to fetch live data.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Filter bar */}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1.5">
                        {[
                          { value: "all", label: "All" },
                          { value: "mismatches", label: "Mismatches" },
                          { value: "missing", label: "Missing" },
                          { value: "matches", label: "Matches" },
                        ].map((f) => (
                          <button
                            key={f.value}
                            onClick={() => setStatusFilter(f.value)}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                              statusFilter === f.value
                                ? "bg-brand/15 text-brand"
                                : "text-muted-foreground hover:text-white"
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() =>
                          exportToCsv(
                            discrepancies,
                            selectedProductData?.asin ?? ""
                          )
                        }
                      >
                        <Download className="size-3 mr-1" />
                        CSV
                      </Button>
                    </div>

                    {/* Grouped rows */}
                    {SYNC_FIELD_GROUPS.map((group) => {
                      const groupRows = filteredDisc.filter(
                        (d) => d.fieldGroup === group
                      );
                      if (groupRows.length === 0) return null;

                      return (
                        <Collapsible key={group} defaultOpen>
                          <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              {group}
                            </span>
                            <ChevronDown className="size-3.5 text-muted-foreground/50" />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-1 rounded-lg border border-border overflow-hidden">
                              {/* Table header */}
                              <div className="grid grid-cols-[160px_1fr_1fr_60px_1fr] gap-2 px-3 py-1.5 bg-muted/20 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                <span>Field</span>
                                <span><span className="normal-case text-white">MF</span><span className="normal-case text-[#F8BF1D]">Hub</span> Value</span>
                                <span>Amazon Value</span>
                                <span>Status</span>
                                <span>Resolve</span>
                              </div>
                              {groupRows.map((d) => {
                                const field = SYNC_FIELDS.find(
                                  (f) => f.field_name === d.fieldName
                                );
                                return (
                                  <div
                                    key={d.id}
                                    className={`grid grid-cols-[160px_1fr_1fr_60px_1fr] gap-2 px-3 py-2 items-start border-t border-border text-xs ${
                                      d.resolved ? "opacity-50" : ""
                                    } ${
                                      d.status === "mismatch" && !d.resolved
                                        ? "bg-yellow-50/5"
                                        : ""
                                    }`}
                                  >
                                    <span className="text-muted-foreground font-medium truncate">
                                      {field?.label ?? d.fieldName}
                                    </span>
                                    <span className="text-white break-words whitespace-pre-wrap min-w-0">
                                      {d.catalogValue || (
                                        <span className="text-muted-foreground/50">
                                          &mdash;
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-white break-words whitespace-pre-wrap min-w-0">
                                      {d.amazonValue || (
                                        <span className="text-muted-foreground/50">
                                          &mdash;
                                        </span>
                                      )}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <StatusIcon status={d.status} />
                                      {d.resolved && (
                                        <Check className="size-3 text-green-500" />
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {d.status !== "match" && !d.resolved && (
                                        <>
                                          <button
                                            onClick={() =>
                                              resolveMutation.mutate({
                                                id: d.id,
                                                resolved: true,
                                                resolvedAction: "update_amazon",
                                              })
                                            }
                                            className="text-[10px] px-2 py-0.5 rounded border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors whitespace-nowrap"
                                          >
                                            Update Amazon
                                          </button>
                                          <button
                                            onClick={() =>
                                              resolveMutation.mutate({
                                                id: d.id,
                                                resolved: true,
                                                resolvedAction: "update_hub",
                                              })
                                            }
                                            className="text-[10px] px-2 py-0.5 rounded border border-[#F8BF1D]/30 bg-[#F8BF1D]/10 hover:bg-[#F8BF1D]/20 transition-colors whitespace-nowrap"
                                          >
                                            Update <span className="text-white">MF</span><span className="text-[#F8BF1D]">Hub</span>
                                          </button>
                                        </>
                                      )}
                                      {d.status !== "match" && d.resolved && (
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] text-muted-foreground">
                                            {d.resolvedAction === "update_amazon" ? "Update Amazon" : (
                                              <>Update <span className="text-white">MF</span><span className="text-[#F8BF1D]">Hub</span></>
                                            )}
                                          </span>
                                          <button
                                            onClick={() =>
                                              resolveMutation.mutate({
                                                id: d.id,
                                                resolved: false,
                                              })
                                            }
                                            className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-white transition-colors"
                                          >
                                            Undo
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Tab: 3-Way Compare */}
              <TabsContent value="compare3" className="mt-3">
                {compareData?.fields ? (
                  <div className="space-y-3">
                    {/* Timestamps */}
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                      {compareData.rainforestSnapshot && (
                        <span className="flex items-center gap-1 text-[#C8944A]">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/></svg>
                          {new Date(compareData.rainforestSnapshot.fetchedAt).toLocaleString()}
                        </span>
                      )}
                      {compareData.firecrawlSnapshot && (
                        <span className="flex items-center gap-1 text-[#F56B2A]">
                          <svg width="7" height="9" viewBox="0 0 16 22" fill="none"><path d="M8 0S3.6 6.4 3.6 11.2C3.6 15.2 5.6 18 8 20c2.4-2 4.4-4.8 4.4-8.8C12.4 6.4 8 0 8 0zm0 17.6c-1.2-1.2-2.4-3.2-2.4-6.4C5.6 7.6 8 3.2 8 3.2s2.4 4.4 2.4 8c0 3.2-1.2 5.2-2.4 6.4z" fill="currentColor"/></svg>
                          {new Date(compareData.firecrawlSnapshot.fetchedAt).toLocaleString()}
                        </span>
                      )}
                    </div>

                    {SYNC_FIELD_GROUPS.map((group) => {
                      const groupFields = compareData.fields.filter(
                        (f: { fieldGroup: string }) => f.fieldGroup === group
                      );
                      if (groupFields.length === 0) return null;

                      return (
                        <Collapsible key={group} defaultOpen>
                          <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              {group}
                            </span>
                            <ChevronDown className="size-3.5 text-muted-foreground/50" />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-1 rounded-lg border border-border overflow-hidden">
                              {/* Header */}
                              <div className="grid grid-cols-[140px_1fr_1fr_1fr] gap-2 px-3 py-1.5 bg-muted/20 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                <span>Field</span>
                                <span><span className="normal-case text-white">MF</span><span className="normal-case text-[#F8BF1D]">Hub</span></span>
                                <span className="normal-case text-[#C8944A] flex items-center gap-1"><svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/></svg>Rainforest</span>
                                <span className="normal-case text-[#F56B2A] flex items-center gap-1"><svg width="8" height="10" viewBox="0 0 16 22" fill="none"><path d="M8 0S3.6 6.4 3.6 11.2C3.6 15.2 5.6 18 8 20c2.4-2 4.4-4.8 4.4-8.8C12.4 6.4 8 0 8 0zm0 17.6c-1.2-1.2-2.4-3.2-2.4-6.4C5.6 7.6 8 3.2 8 3.2s2.4 4.4 2.4 8c0 3.2-1.2 5.2-2.4 6.4z" fill="currentColor"/></svg>Firecrawl</span>
                              </div>
                              {groupFields.map((f: {
                                fieldName: string;
                                label: string;
                                hubValue: string | null;
                                rainforestValue: string | null;
                                firecrawlValue: string | null;
                                allMatch: boolean;
                                providersMatch: boolean;
                              }) => {
                                const allEmpty = !f.hubValue && !f.rainforestValue && !f.firecrawlValue;
                                if (allEmpty) return null;

                                return (
                                  <div
                                    key={f.fieldName}
                                    className={`grid grid-cols-[140px_1fr_1fr_1fr] gap-2 px-3 py-2 items-start border-t border-border text-xs ${
                                      f.allMatch ? "opacity-50" : ""
                                    } ${!f.allMatch && !f.providersMatch ? "bg-purple-500/5" : !f.allMatch ? "bg-yellow-50/5" : ""}`}
                                  >
                                    <span className="text-muted-foreground font-medium truncate">
                                      {f.label}
                                    </span>
                                    <span className="text-white break-words whitespace-pre-wrap min-w-0">
                                      {f.hubValue || <span className="text-muted-foreground/50">&mdash;</span>}
                                    </span>
                                    <span className={`break-words whitespace-pre-wrap min-w-0 ${
                                      f.hubValue && f.rainforestValue && f.hubValue !== f.rainforestValue
                                        ? "text-amber-400"
                                        : "text-white"
                                    }`}>
                                      {f.rainforestValue || <span className="text-muted-foreground/50">&mdash;</span>}
                                    </span>
                                    <span className={`break-words whitespace-pre-wrap min-w-0 ${
                                      f.hubValue && f.firecrawlValue && f.hubValue !== f.firecrawlValue
                                        ? "text-amber-400"
                                        : f.rainforestValue && f.firecrawlValue && f.rainforestValue !== f.firecrawlValue
                                          ? "text-purple-400"
                                          : "text-white"
                                    }`}>
                                      {f.firecrawlValue || <span className="text-muted-foreground/50">&mdash;</span>}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                ) : (
                  <div className="glass-card rounded-lg p-8 text-center text-sm text-muted-foreground">
                    <p>Run Both to see a three-way comparison.</p>
                    <p className="text-[10px] mt-1">
                      <span className="text-white">MF</span><span className="text-[#F8BF1D]">Hub</span> vs Rainforest vs Firecrawl
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Tab 2: Snapshot */}
              <TabsContent value="snapshot" className="mt-3">
                {snapshotData?.snapshot ? (
                  <div className="glass-card rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Fetched:{" "}
                        {new Date(
                          snapshotData.snapshot.fetchedAt
                        ).toLocaleString()}
                      </span>
                    </div>
                    <div className="font-mono text-xs max-h-[600px] overflow-y-auto">
                      <JsonTree
                        data={snapshotData.snapshot.snapshotData}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="glass-card rounded-lg p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      No snapshot available
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Tab 3: History */}
              <TabsContent value="history" className="mt-3">
                <div className="glass-card rounded-lg p-4 space-y-4">
                  {historyData.length > 1 && (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historyData}>
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10, fill: "#888" }}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: "#888" }}
                            width={30}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#2a2a2a",
                              border: "1px solid #444",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="date"
                            stroke="#F8BF1D"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Past Snapshots
                    </h4>
                    {snapshotData?.history?.map((h: SnapshotHistory) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between px-3 py-2 rounded border border-border text-xs"
                      >
                        <span className="text-white">
                          {new Date(h.fetchedAt).toLocaleString()}
                        </span>
                        <span className="text-muted-foreground">
                          {h.creditsUsed} credit{h.creditsUsed !== 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                    {(!snapshotData?.history ||
                      snapshotData.history.length === 0) && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No history yet
                      </p>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Tab 4: Reviews */}
              <TabsContent value="reviews" className="mt-3">
                {(() => {
                  const snapshot = snapshotData?.snapshot?.snapshotData as
                    | Record<string, unknown>
                    | undefined;
                  const reviews = (snapshot?.top_reviews ?? []) as Array<{
                    id: string;
                    title: string;
                    body: string;
                    rating: number;
                    date: { raw: string };
                    profile: { name: string };
                    verified_purchase: boolean;
                    helpful_votes?: number;
                  }>;
                  const breakdown = snapshot?.rating_breakdown as
                    | Record<
                        string,
                        { percentage: number; count: number }
                      >
                    | undefined;

                  if (!snapshot) {
                    return (
                      <div className="glass-card rounded-lg p-8 text-center">
                        <p className="text-sm text-muted-foreground">
                          No snapshot data available
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {/* Rating breakdown */}
                      {breakdown && (
                        <div className="glass-card rounded-lg p-4">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            Rating Distribution
                          </h4>
                          <div className="space-y-1.5">
                            {["five_star", "four_star", "three_star", "two_star", "one_star"].map(
                              (key, i) => {
                                const val = breakdown[key];
                                if (!val) return null;
                                return (
                                  <div
                                    key={key}
                                    className="flex items-center gap-2 text-xs"
                                  >
                                    <span className="w-8 text-right text-muted-foreground">
                                      {5 - i}⭐
                                    </span>
                                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-brand rounded-full"
                                        style={{
                                          width: `${val.percentage}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="w-10 text-right text-muted-foreground tabular-nums">
                                      {val.percentage}%
                                    </span>
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </div>
                      )}

                      {/* Reviews list */}
                      <div className="glass-card rounded-lg p-4">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          Recent Reviews ({reviews.length})
                        </h4>
                        <div className="space-y-3">
                          {reviews.map((r) => (
                            <div
                              key={r.id}
                              className="border-b border-border pb-3 last:border-0"
                            >
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-amber-400">
                                  {"⭐".repeat(Math.round(r.rating))}
                                </span>
                                <span className="font-medium text-white">
                                  {r.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                                <span>{r.profile.name}</span>
                                <span>{r.date.raw}</span>
                                {r.verified_purchase && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] py-0 px-1 text-emerald-500 border-emerald-500/30"
                                  >
                                    Verified
                                  </Badge>
                                )}
                                {r.helpful_votes != null &&
                                  r.helpful_votes > 0 && (
                                    <span>
                                      {r.helpful_votes} helpful
                                    </span>
                                  )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                                {r.body}
                              </p>
                            </div>
                          ))}
                          {reviews.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">
                              No reviews in snapshot
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>

              {/* Tab 5: A+ Content */}
              <TabsContent value="aplus" className="mt-3">
                {(() => {
                  const snapshot = snapshotData?.snapshot?.snapshotData as
                    | Record<string, unknown>
                    | undefined;
                  const aPlus = snapshot?.a_plus_content as
                    | {
                        has_a_plus_content?: boolean;
                        has_brand_story?: boolean;
                        all_images?: { link: string; name: string }[];
                        brand_story?: { images?: string[] };
                      }
                    | undefined;

                  if (!snapshot) {
                    return (
                      <div className="glass-card rounded-lg p-8 text-center">
                        <p className="text-sm text-white/50">
                          No snapshot data available
                        </p>
                      </div>
                    );
                  }

                  if (!aPlus?.has_a_plus_content) {
                    return (
                      <div className="glass-card rounded-lg p-8 text-center">
                        <p className="text-sm text-white/50">
                          No A+ Content detected for this product
                        </p>
                      </div>
                    );
                  }

                  const allImages = aPlus.all_images ?? [];
                  const brandStoryImages = aPlus.brand_story?.images ?? [];
                  const imagesWithoutAlt = allImages.filter((img) => !img.name?.trim());

                  return (
                    <div className="space-y-3">
                      {/* Summary badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                          A+ Content
                        </Badge>
                        {aPlus.has_brand_story && (
                          <Badge variant="outline" className="text-purple-400 border-purple-400/30">
                            Brand Story
                          </Badge>
                        )}
                        <span className="text-xs text-white/50">
                          {allImages.length} image{allImages.length !== 1 ? "s" : ""}
                          {imagesWithoutAlt.length > 0 && (
                            <span className="text-amber-400 ml-1">
                              ({imagesWithoutAlt.length} missing alt text)
                            </span>
                          )}
                        </span>
                      </div>

                      {/* A+ Images table */}
                      {allImages.length > 0 && (
                        <Collapsible defaultOpen>
                          <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                              A+ Content Images ({allImages.length})
                            </span>
                            <ChevronDown className="size-3.5 text-white/30" />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-1 rounded-lg border border-border overflow-hidden">
                              <div className="grid grid-cols-[80px_1fr_1fr_60px_1fr] gap-2 px-3 py-1.5 bg-muted/20 text-[10px] font-medium text-white/40 uppercase tracking-wider">
                                <span>Image</span>
                                <span><span className="normal-case text-white">MF</span><span className="normal-case text-[#F8BF1D]">Hub</span> Alt Text</span>
                                <span>Amazon Alt Text</span>
                                <span>Status</span>
                                <span>Resolve</span>
                              </div>
                              {allImages.map((img, i) => {
                                const amazonAlt = img.name?.trim() || "";
                                const hubAlt = ""; // No hub-side A+ alt text yet
                                const status: string = !amazonAlt
                                  ? "missing_in_amazon"
                                  : !hubAlt
                                    ? "missing_in_catalog"
                                    : amazonAlt === hubAlt
                                      ? "match"
                                      : "mismatch";

                                return (
                                  <div
                                    key={i}
                                    className={`grid grid-cols-[80px_1fr_1fr_60px_1fr] gap-2 px-3 py-2 items-center border-t border-border text-xs ${
                                      status === "mismatch" ? "bg-yellow-50/5" : ""
                                    } ${status === "missing_in_amazon" ? "bg-red-500/5" : ""}`}
                                  >
                                    {/* Thumbnail with hover preview */}
                                    <div
                                      className="h-12 w-16 rounded bg-black/40 overflow-hidden cursor-pointer"
                                      onMouseEnter={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setHoverImage({ src: img.link, x: rect.right + 8, y: rect.top });
                                      }}
                                      onMouseLeave={() => setHoverImage(null)}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={img.link}
                                        alt={amazonAlt || `A+ image ${i + 1}`}
                                        className="w-full h-full object-contain"
                                        loading="lazy"
                                      />
                                    </div>
                                    {/* Hub alt text */}
                                    <span className="text-white break-words whitespace-pre-wrap min-w-0">
                                      <span className="text-white/30">&mdash;</span>
                                    </span>
                                    {/* Amazon alt text */}
                                    <span className="text-white break-words whitespace-pre-wrap min-w-0">
                                      {amazonAlt || (
                                        <span className="text-amber-400 italic text-[11px]">No alt text</span>
                                      )}
                                    </span>
                                    {/* Status */}
                                    <div className="flex items-center gap-1">
                                      <StatusIcon status={status} />
                                    </div>
                                    {/* Resolve */}
                                    <div className="flex items-center gap-1.5">
                                      {status !== "match" && (
                                        <>
                                          <button
                                            onClick={() => toast.info("A+ alt text resolve coming soon")}
                                            className="text-[10px] px-2 py-0.5 rounded border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors whitespace-nowrap"
                                          >
                                            Update Amazon
                                          </button>
                                          <button
                                            onClick={() => toast.info("A+ alt text resolve coming soon")}
                                            className="text-[10px] px-2 py-0.5 rounded border border-[#F8BF1D]/30 bg-[#F8BF1D]/10 hover:bg-[#F8BF1D]/20 transition-colors whitespace-nowrap"
                                          >
                                            Update <span className="text-white">MF</span><span className="text-[#F8BF1D]">Hub</span>
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {/* Brand Story Images table */}
                      {brandStoryImages.length > 0 && (
                        <Collapsible defaultOpen>
                          <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                              Brand Story Images ({brandStoryImages.length})
                            </span>
                            <ChevronDown className="size-3.5 text-white/30" />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-1 rounded-lg border border-border overflow-hidden">
                              <div className="grid grid-cols-[80px_1fr_1fr_60px_1fr] gap-2 px-3 py-1.5 bg-muted/20 text-[10px] font-medium text-white/40 uppercase tracking-wider">
                                <span>Image</span>
                                <span><span className="normal-case text-white">MF</span><span className="normal-case text-[#F8BF1D]">Hub</span> Alt Text</span>
                                <span>Amazon Alt Text</span>
                                <span>Status</span>
                                <span>Resolve</span>
                              </div>
                              {brandStoryImages.map((url, i) => (
                                <div
                                  key={i}
                                  className="grid grid-cols-[80px_1fr_1fr_60px_1fr] gap-2 px-3 py-2 items-center border-t border-border text-xs bg-red-500/5"
                                >
                                  {/* Thumbnail with hover preview */}
                                  <div
                                    className="h-12 w-16 rounded bg-black/40 overflow-hidden cursor-pointer"
                                    onMouseEnter={(e) => {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setHoverImage({ src: url, x: rect.right + 8, y: rect.top });
                                    }}
                                    onMouseLeave={() => setHoverImage(null)}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={url}
                                      alt={`Brand story image ${i + 1}`}
                                      className="w-full h-full object-contain"
                                      loading="lazy"
                                    />
                                  </div>
                                  {/* Hub alt text */}
                                  <span className="text-white/30">&mdash;</span>
                                  {/* Amazon alt text */}
                                  <span className="text-amber-400 italic text-[11px]">No alt text available</span>
                                  {/* Status */}
                                  <div className="flex items-center gap-1">
                                    <StatusIcon status="missing_in_amazon" />
                                  </div>
                                  {/* Resolve */}
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => toast.info("Brand story alt text resolve coming soon")}
                                      className="text-[10px] px-2 py-0.5 rounded border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors whitespace-nowrap"
                                    >
                                      Update Amazon
                                    </button>
                                    <button
                                      onClick={() => toast.info("Brand story alt text resolve coming soon")}
                                      className="text-[10px] px-2 py-0.5 rounded border border-[#F8BF1D]/30 bg-[#F8BF1D]/10 hover:bg-[#F8BF1D]/20 transition-colors whitespace-nowrap"
                                    >
                                      Update <span className="text-white">MF</span><span className="text-[#F8BF1D]">Hub</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {allImages.length === 0 && brandStoryImages.length === 0 && (
                        <div className="glass-card rounded-lg p-8 text-center">
                          <p className="text-sm text-white/50">
                            A+ Content detected but no images found in snapshot
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
      {/* Hover image preview portal */}
      {hoverImage &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none p-1 rounded-lg border border-border bg-[#1a1a1a] shadow-2xl"
            style={{ left: hoverImage.x, top: hoverImage.y }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hoverImage.src}
              alt=""
              className="max-w-[400px] max-h-[300px] object-contain rounded"
            />
          </div>,
          document.body
        )}
    </div>
    </div>
  );
}

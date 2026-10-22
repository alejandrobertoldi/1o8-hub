"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  SortingState,
  RowSelectionState,
  type Row,
} from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { getColumns, getDynamicColumns, selectColumn, type ProductRow, type SaveFieldFn } from "./product-table-columns";
import { useThemeValidValues } from "@/hooks/use-theme-valid-values";
import { ProductTableControls, ProductTableStatusChips } from "./product-table-toolbar";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { ProductColumnPicker } from "./product-column-picker";
import { BulkEditBar } from "./bulk-edit-bar";
import { BulkEditDialog } from "./bulk-edit-dialog";
import { CreateProductDialog } from "./create-product-dialog";
import { ImportProductsDialog } from "./import-products-dialog";
import { CLIENT_NAMES } from "@/lib/constants";
import type { EnrichedAttribute } from "@/hooks/use-column-attributes";
import { ChevronDown, ChevronLeft, ChevronRight, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { cn, hiResAmazonImg } from "@/lib/utils";
import { isEditorOrAbove } from "@/lib/roles";
import Link from "next/link";
import Image from "next/image";

type ClientEntry = { clientIdCode: string; count: number; activeCount: number };

// Deadline plus a real throw. Swallowing a failure into `[]` left the client
// filter silently empty, which reads as "this hub has no clients" rather than
// "the request failed"; and with no deadline a non-responding function (what a
// starved DB connection produces) left the query pending indefinitely.
const CLIENTS_FETCH_TIMEOUT_MS = 25_000;

async function fetchClients(): Promise<ClientEntry[]> {
  const res = await fetch("/api/clients?lite=1", {
    signal: AbortSignal.timeout(CLIENTS_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Failed to load clients (HTTP ${res.status})`);
  return res.json();
}

type ProductsResponse = {
  data: ProductRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

async function fetchProducts(params: URLSearchParams): Promise<ProductsResponse> {
  const res = await fetch(`/api/products?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
}

export function ProductTable() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [client, setClient] = useState(searchParams.get("client") || "");
  const [marketplace, setMarketplace] = useState("");
  const [statuses, setStatuses] = useState<Set<string>>(() => new Set(["Active"]));
  const [isDirty, setIsDirty] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  // Bulk edit state
  const [bulkMode, setBulkMode] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [allSelectedIds, setAllSelectedIds] = useState<Set<string>>(new Set());
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [extraColumns, setExtraColumns] = useState<EnrichedAttribute[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportingSheet, setExportingSheet] = useState(false);

  const userRole = session?.user?.role;
  const canEdit = isEditorOrAbove(userRole);

  // Save mutation for inline editing
  const saveMutation = useMutation({
    mutationFn: async ({
      productId,
      field,
      bqName,
      value,
    }: {
      productId: string;
      field: string | null;
      bqName: string;
      value: string | null;
    }) => {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value, bqName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["publish-info"] });
      queryClient.invalidateQueries({ queryKey: ["completeness"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  const handleSave: SaveFieldFn = useCallback(
    (productId, field, bqName, value) => {
      saveMutation.mutate({ productId, field, bqName, value });
    },
    [saveMutation]
  );

  const deleteMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await fetch(`/api/products/${productId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const handleDelete = useCallback(
    (productId: string) => setDeleteTargetId(productId),
    []
  );

  // Sync client filter from URL when navigating from sidebar
  const urlClient = searchParams.get("client") || "";
  useEffect(() => {
    setClient(urlClient);
    setPage(1);
    setExpandedFamilies(new Set());
  }, [urlClient]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    const timeout = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, []);

  const handleStatusToggle = useCallback((status: string) => {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
    setPage(1);
  }, []);

  const statusParam = useMemo(() => [...statuses].join(","), [statuses]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    // Unfiltered catalog must include every client; a 50-row page only showed BNutty.
    p.set("pageSize", client ? "500" : "2000");
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (client) p.set("client", client);
    if (marketplace) p.set("marketplace", marketplace);
    if (statusParam) p.set("status", statusParam);
    if (isDirty) p.set("isDirty", isDirty);
    if (sorting.length > 0) {
      p.set("sortBy", sorting[0].id);
      p.set("sortOrder", sorting[0].desc ? "desc" : "asc");
    } else {
      p.set("sortBy", "variationId");
      p.set("sortOrder", "asc");
    }
    if (includeInactive) p.set("includeInactive", "true");
    if (extraColumns.length > 0) p.set("fields", "all");
    return p;
  }, [page, debouncedSearch, client, marketplace, statusParam, isDirty, sorting, includeInactive, extraColumns.length]);

  const { data: clientsData = [], isError: clientsError } = useQuery({
    queryKey: ["clients", "lite"],
    queryFn: fetchClients,
    staleTime: 5 * 60 * 1000,
  });

  // An empty client filter is ambiguous on its own — say which case it is.
  useEffect(() => {
    if (clientsError) {
      toast.error("Couldn't load the client list — the client filter may be incomplete.");
    }
  }, [clientsError]);

  const clientCodes = useMemo(
    () =>
      [...clientsData.map((c) => c.clientIdCode)].sort((a, b) =>
        (CLIENT_NAMES[a] || a).localeCompare(CLIENT_NAMES[b] || b, undefined, { sensitivity: "base" })
      ),
    [clientsData]
  );

  const { data, isLoading } = useQuery({
    queryKey: ["products", params.toString()],
    queryFn: () => fetchProducts(params),
  });

  const rawTableData = useMemo(() => data?.data ?? [], [data?.data]);

  // Fetch completeness scores when a client filter is active
  const productIds = useMemo(() => rawTableData.map((p) => p.id), [rawTableData]);
  const { data: completenessData } = useQuery({
    queryKey: ["completeness", client, productIds],
    queryFn: async () => {
      if (!client || productIds.length === 0) return null;
      const res = await fetch(
        `/api/products/completeness?client=${encodeURIComponent(client)}&productIds=${productIds.join(",")}`
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!client && productIds.length > 0,
    staleTime: 60 * 1000,
  });

  // Merge completeness scores + rawColumnValues, then catalog order:
  // client name A–Z → variation families → standalones → parent then children.
  const tableData = useMemo(() => {
    const enriched = rawTableData.map((row) => {
      const next: ProductRow = { ...row };
      if (completenessData?.scores) {
        const score = completenessData.scores.find(
          (s: { productId: string; score: number }) => s.productId === row.id
        );
        next._completenessScore = score?.score ?? null;
      }
      const rawRow = row as ProductRow & { rawColumnValues?: Record<string, string> };
      if (rawRow.rawColumnValues) {
        next._raw = rawRow.rawColumnValues;
      }
      return next;
    });
    if (sorting.length > 0) return enriched;
    return [...enriched].sort(compareCatalogRows);
  }, [rawTableData, completenessData, sorting.length]);

  // Fetch valid values for theme attribute columns (Flavor, Size, etc.)
  const { data: themeValidValues } = useThemeValidValues(client);

  // Derive active theme attributes from products' VariationThemeName
  const activeThemeAttrs = useMemo(() => {
    if (!rawTableData?.length) return undefined;
    const attrs = new Set<string>();
    for (const p of rawTableData) {
      const cast = p as { variations?: { VariationThemeName?: string }; otherAttributes?: { VariationThemeName?: string } };
      const theme = cast.variations?.VariationThemeName ?? cast.otherAttributes?.VariationThemeName;
      if (!theme) continue;
      for (const k of theme.split(/[-\/]/)) {
        const stripped = k.replace(/_name$/i, "");
        attrs.add(stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase());
      }
    }
    return attrs.size > 0 ? attrs : undefined;
  }, [rawTableData]);

  const baseColumns = useMemo(
    () => getColumns(canEdit, canEdit ? handleSave : undefined, canEdit ? handleDelete : undefined, activeThemeAttrs, themeValidValues),
    [canEdit, handleSave, handleDelete, activeThemeAttrs, themeValidValues]
  );

  const dynamicColumns = useMemo(
    () =>
      extraColumns.length > 0
        ? getDynamicColumns(extraColumns, canEdit, canEdit ? handleSave : undefined)
        : [],
    [extraColumns, canEdit, handleSave]
  );

  // Filter out dynamic columns where no row has data (hide empty variation columns)
  const populatedDynamicColumns = useMemo(() => {
    if (dynamicColumns.length === 0 || tableData.length === 0) return dynamicColumns;
    return dynamicColumns.filter((col) => {
      // Extract the BigQuery label from the column id (format: "dyn_{bqLabel}")
      const colId = (col as { id?: string }).id;
      if (!colId?.startsWith("dyn_")) return true;
      const bqLabel = colId.slice(4);
      return tableData.some((row) => {
        const val = row._raw?.[bqLabel];
        return val != null && val !== "" && val !== "—";
      });
    });
  }, [dynamicColumns, tableData]);

  const tableColumns = useMemo(
    () => {
      const cols = bulkMode ? [selectColumn, ...baseColumns] : baseColumns;
      return populatedDynamicColumns.length > 0 ? [...cols, ...populatedDynamicColumns] : cols;
    },
    [bulkMode, baseColumns, populatedDynamicColumns]
  );

  // Sync cross-page selections: when rowSelection changes, merge into allSelectedIds
  const handleRowSelectionChange = useCallback(
    (updaterOrValue: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
      setRowSelection((prev) => {
        const next = typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue;

        setAllSelectedIds((prevIds) => {
          const newIds = new Set(prevIds);
          // Get current page row IDs
          const pageRowIds = tableData.map((r) => r.id);

          for (const id of pageRowIds) {
            if (next[id]) {
              newIds.add(id);
            } else {
              newIds.delete(id);
            }
          }
          return newIds;
        });

        return next;
      });
    },
    [tableData]
  );

  // When page changes, restore rowSelection from allSelectedIds for visible rows
  useEffect(() => {
    if (!bulkMode) return;
    const restored: RowSelectionState = {};
    for (const row of tableData) {
      if (allSelectedIds.has(row.id)) {
        restored[row.id] = true;
      }
    }
    setRowSelection(restored);
  }, [tableData, bulkMode, allSelectedIds]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    const toastId = toast.loading("Preparing export…");
    try {
      const exportParams = new URLSearchParams(params);
      exportParams.delete("page");
      exportParams.set("pageSize", "100");

      const collected: ProductRow[] = [];
      let pageNum = 1;
      let totalPages = 1;
      do {
        exportParams.set("page", String(pageNum));
        const res = await fetch(`/api/products?${exportParams.toString()}`);
        if (!res.ok) throw new Error(`Fetch failed at page ${pageNum}`);
        const json: ProductsResponse = await res.json();
        collected.push(...json.data);
        totalPages = json.pagination.totalPages;
        if (collected.length >= json.pagination.total) break;
        pageNum++;
        toast.loading(
          `Preparing export… ${collected.length} / ${json.pagination.total}`,
          { id: toastId }
        );
      } while (pageNum <= totalPages);

      if (collected.length === 0) {
        toast.error("No products to export", { id: toastId });
        return;
      }

      const rowsOut = collected.map((r) => {
        const v = r.variations || {};
        const themeAttr = (r as ProductRow & { variationThemeName?: string | null }).variationThemeName;
        const isVariety = (r.varietyPackItemCount ?? 0) > 0 || (r.vpFlavors?.length ?? 0) > 0;
        return {
          "Client Name": CLIENT_NAMES[r.clientIdCode || ""] || r.clientIdCode || "",
          "Client Code": r.clientIdCode || "",
          "Marketplace": r.marketplace || "",
          "ASIN": r.asin || "",
          "SKU": r.sku || "",
          "Listing Status": r.status || "",
          "Parentage Level": r.parentageLevel || "",
          "Summarized Title": r.summarizedTitle || r.itemName || "",
          "Variation ID": r.variationId || "",
          "Variation Group": r.variationGroup || "",
          "Variation Theme": themeAttr || "",
          "Variety Pack": isVariety ? "Yes" : "",
          "Variety Pack Items": r.vpFlavors?.join(", ") || "",
          "Color": v.Color || "",
          "Size": v.Size || "",
          "Flavor": v.Flavor || "",
          "Style": v.Style || "",
          "Brand": r.brandName || "",
          "List Price": r.listPrice || "",
          "Parent ASIN": r.parentAsin || "",
          "Parent SKU": r.parentSku || "",
          "Updated At": r.updatedAt || "",
        };
      });

      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(rowsOut);
      const headers = Object.keys(rowsOut[0]);
      ws["!cols"] = headers.map((h) => ({
        wch: Math.min(
          50,
          Math.max(
            h.length,
            ...rowsOut.slice(0, 200).map((r) => String((r as Record<string, unknown>)[h] ?? "").length)
          ) + 2
        ),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Products");

      const stamp = new Date().toISOString().slice(0, 10);
      const slug = (client || "all-clients").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      XLSX.writeFile(wb, `products_${slug}_${stamp}.xlsx`);

      toast.success(`Exported ${rowsOut.length} products`, { id: toastId });
    } catch (err) {
      toast.error(
        `Export failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        { id: toastId }
      );
    } finally {
      setExporting(false);
    }
  }, [params, client]);

  const handleExportToSheet = useCallback(async () => {
    if (!client || client.includes(",")) {
      toast.error("Pick a single client before saving to Google Sheets");
      return;
    }
    setExportingSheet(true);
    const toastId = toast.loading("Saving to Google Sheets…");
    try {
      const sheetParams = new URLSearchParams(params);
      sheetParams.delete("page");
      sheetParams.delete("pageSize");

      const res = await fetch(
        `/api/products/export/sheet?${sheetParams.toString()}`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }

      toast.success(
        `Saved ${json.count}${json.capped ? "+ (capped)" : ""} products to Google Sheets`,
        {
          id: toastId,
          action: {
            label: "Open",
            onClick: () => window.open(json.sheetUrl, "_blank", "noopener"),
          },
          duration: 12000,
        }
      );
    } catch (err) {
      toast.error(
        `Failed to save to Sheets: ${err instanceof Error ? err.message : "Unknown error"}`,
        { id: toastId }
      );
    } finally {
      setExportingSheet(false);
    }
  }, [params, client]);

  // When bulk mode is turned off, clear all selection state
  const handleBulkModeChange = useCallback((enabled: boolean) => {
    setBulkMode(enabled);
    if (!enabled) {
      setRowSelection({});
      setAllSelectedIds(new Set());
      setEditDialogOpen(false);
    }
  }, []);

  // After successful bulk edit
  const handleBulkEditSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["publish-info"] });
    setAllSelectedIds(new Set());
    setRowSelection({});
    setBulkMode(false);
    setEditDialogOpen(false);
  }, [queryClient]);

  const table = useReactTable({
    data: tableData,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onRowSelectionChange: handleRowSelectionChange,
    enableRowSelection: bulkMode,
    getRowId: (row) => row.id,
    state: { sorting, rowSelection },
    manualSorting: true,
  });

  const pagination = data?.pagination;
  const rows = table.getRowModel().rows;

  const catalogBlocks = useMemo(() => groupCatalogRows(rows), [rows]);

  const toggleFamily = useCallback((key: string) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toolbarRef = useRef<HTMLDivElement>(null);

  const selectedCount = allSelectedIds.size;

  const colCount = table.getAllColumns().length;

  return (
    <div className={cn(selectedCount > 0 && "pb-16")}>
      {/* Page heading + controls portaled into TopNav row 3 (page-meta-slot) */}
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none">
            <span className="font-bold text-sidebar-foreground">Product</span>
            <span className="font-normal text-brand">Catalog</span>
          </h1>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            View, edit, and manage products across all clients.
          </p>
        </div>

        <div className="shrink-0">
          <ProductTableControls
            search={search}
            onSearchChange={handleSearchChange}
            client={client}
            onClientChange={(v) => { setClient(v); setPage(1); }}
            marketplace={marketplace}
            onMarketplaceChange={(v) => { setMarketplace(v); setPage(1); }}
            clientCodes={clientCodes}
            isDirty={isDirty}
            onIsDirtyChange={(v) => { setIsDirty(v); setPage(1); }}
            onClearFilters={() => {
              setSearch("");
              setDebouncedSearch("");
              setClient("");
              setMarketplace("");
              setStatuses(new Set(["Active"]));
              setIsDirty("");
              setIncludeInactive(false);
              setPage(1);
            }}
            bulkMode={bulkMode}
            onBulkModeChange={handleBulkModeChange}
            canEdit={canEdit}
            onCreateProduct={() => setCreateDialogOpen(true)}
            onImportExcel={() => setImportDialogOpen(true)}
            includeInactive={includeInactive}
            onIncludeInactiveChange={(v) => { setIncludeInactive(v); setPage(1); }}
            columnPickerSlot={
              <ProductColumnPicker
                clientCode={client || undefined}
                selectedAttrs={extraColumns}
                onSelectedChange={setExtraColumns}
              />
            }
            hasStatusFilter={statuses.size > 0}
            onExport={handleExport}
            onExportToSheet={handleExportToSheet}
            exporting={exporting}
            exportingSheet={exportingSheet}
          />
        </div>
      </PageMetaSlot>

      {/* Status filter chips — pin under the top nav while the catalog scrolls */}
      <div
        ref={toolbarRef}
        className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 pt-2 pb-3 glass-panel"
      >
        <ProductTableStatusChips
          statuses={statuses}
          onStatusToggle={handleStatusToggle}
        />
      </div>

      {/* Flat table layout */}
      {isLoading ? (
        <div className="space-y-2 mt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No products found.</div>
      ) : (
        <div className="rounded-xl border border-stone-200 bg-card dark:border-zinc-800 mt-4">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-left">
                {table.getHeaderGroups()[0].headers.map((header) => {
                  const meta = header.column.columnDef.meta as { width?: string; maxWidth?: string } | undefined;
                  return (
                    <th
                      key={header.id}
                      className="sticky top-[2.625rem] z-20 px-3 py-2.5 font-bold text-brand whitespace-nowrap align-top bg-card border-b border-stone-100 dark:border-zinc-800"
                      style={{ width: meta?.width, maxWidth: meta?.maxWidth }}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {catalogBlocks.map((block, idx) => {
                const fragments: ReactNode[] = [];
                const thisClient = catalogBlockClient(block);
                const prevClient = idx === 0 ? null : catalogBlockClient(catalogBlocks[idx - 1]);
                if (idx === 0 || thisClient !== prevClient) {
                  const count = tableData.filter((r) => (r.clientIdCode || "") === thisClient).length;
                  fragments.push(
                    <tr key={`client-${thisClient}`} className="border-b border-stone-100 dark:border-zinc-800">
                      <td colSpan={colCount} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-brand">
                            {CLIENT_NAMES[thisClient] || thisClient || "No Client"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{thisClient}</span>
                          <span className="text-[10px] text-muted-foreground">({count})</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      </td>
                    </tr>
                  );
                }

                const isStandalone = catalogBlockIsStandalone(block);
                const prevStandalone =
                  idx > 0 &&
                  catalogBlockClient(catalogBlocks[idx - 1]) === thisClient &&
                  catalogBlockIsStandalone(catalogBlocks[idx - 1]);
                if (isStandalone && !prevStandalone) {
                  const standaloneCount = catalogBlocks.filter(
                    (b) => catalogBlockClient(b) === thisClient && catalogBlockIsStandalone(b)
                  ).length;
                  fragments.push(
                    <tr key={`standalone-${thisClient}`} className="border-b border-stone-100 dark:border-zinc-800">
                      <td colSpan={colCount} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-brand">
                            Standalone
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {standaloneCount} product{standaloneCount !== 1 ? "s" : ""}
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      </td>
                    </tr>
                  );
                }

                if (block.kind === "single") {
                  fragments.push(
                    <ProductDataRow key={block.row.id} row={block.row} />
                  );
                } else {
                  const expanded = expandedFamilies.has(block.key);
                  fragments.push(
                    <VariationFamilyRow
                      key={`family-${block.key}`}
                      parent={block.parent.original}
                      childCount={block.children.length}
                      expanded={expanded}
                      onToggle={() => toggleFamily(block.key)}
                      colCount={colCount}
                    />
                  );
                  if (expanded) {
                    fragments.push(
                      <ProductDataRow key={block.parent.id} row={block.parent} />
                    );
                    for (const child of block.children) {
                      fragments.push(
                        <ProductDataRow key={child.id} row={child} indent />
                      );
                    }
                  }
                }

                return fragments;
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total > pagination.pageSize && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10px] text-muted-foreground">
            {pagination.total} products &middot; Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="h-7 w-7 p-0 text-muted-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
              className="h-7 w-7 p-0 text-muted-foreground"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Edit Bar */}
      <BulkEditBar
        selectedCount={selectedCount}
        onClear={() => {
          setAllSelectedIds(new Set());
          setRowSelection({});
        }}
        onEditField={() => setEditDialogOpen(true)}
      />

      {/* Create Product Dialog */}
      <CreateProductDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <ImportProductsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />

      {/* Bulk Edit Dialog */}
      <BulkEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        selectedIds={allSelectedIds}
        onSuccess={handleBulkEditSuccess}
        clientFilter={client}
      />

      <DeleteConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(o) => { if (!o) setDeleteTargetId(null); }}
        onConfirm={() => {
          if (deleteTargetId) {
            deleteMutation.mutate(deleteTargetId, {
              onSuccess: () => setDeleteTargetId(null),
            });
          }
        }}
        title="Delete product?"
        description={(() => {
          const row = tableData.find((r) => r.id === deleteTargetId);
          const label = row?.asin || row?.sku || deleteTargetId;
          return (
            <>
              This will permanently delete product{" "}
              <strong className="text-foreground">{label}</strong>. This action cannot be undone.
            </>
          );
        })()}
        pending={deleteMutation.isPending}
        confirmLabel="Delete product"
      />
    </div>
  );
}

type CatalogBlock =
  | { kind: "family"; key: string; parent: Row<ProductRow>; children: Row<ProductRow>[] }
  | { kind: "single"; row: Row<ProductRow> };

function clientDisplayName(code: string | null | undefined): string {
  return CLIENT_NAMES[code || ""] || code || "";
}

/** Hub variation name or Amazon VariationID — empty means standalone. */
function catalogFamilyKey(row: ProductRow): string | null {
  const vid = (row.variationId || "").trim();
  if (vid) return `vid:${vid}`;
  const vname = (row.variationName || "").trim();
  if (vname) return `name:${vname}`;
  return null;
}

function isCatalogStandalone(row: ProductRow): boolean {
  return catalogFamilyKey(row) === null;
}

function compareCatalogRows(a: ProductRow, b: ProductRow): number {
  const clientCmp = clientDisplayName(a.clientIdCode).localeCompare(
    clientDisplayName(b.clientIdCode),
    undefined,
    { sensitivity: "base" }
  );
  if (clientCmp !== 0) return clientCmp;

  // Variations first, standalones after the last variation (matches Listing Images).
  const aKey = catalogFamilyKey(a);
  const bKey = catalogFamilyKey(b);
  if (!aKey && bKey) return 1;
  if (aKey && !bKey) return -1;
  if (aKey && bKey) {
    const varCmp = aKey.localeCompare(bKey, undefined, { numeric: true, sensitivity: "base" });
    if (varCmp !== 0) return varCmp;
  }

  const rank = (row: ProductRow) => {
    const p = (row.parentageLevel || "").toLowerCase();
    if (p === "parent") return 0;
    if (p === "child") return 1;
    return 2;
  };
  const parentCmp = rank(a) - rank(b);
  if (parentCmp !== 0) return parentCmp;

  return (a.asin || a.sku || "").localeCompare(b.asin || b.sku || "", undefined, {
    sensitivity: "base",
  });
}

function catalogBlockClient(block: CatalogBlock): string {
  return block.kind === "family"
    ? block.parent.original.clientIdCode || ""
    : block.row.original.clientIdCode || "";
}

function catalogBlockIsStandalone(block: CatalogBlock): boolean {
  return block.kind === "single" && isCatalogStandalone(block.row.original);
}

function groupCatalogRows(rows: Row<ProductRow>[]): CatalogBlock[] {
  const blocks: CatalogBlock[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    const key = catalogFamilyKey(row.original);
    const client = row.original.clientIdCode || "";
    if (!key) {
      blocks.push({ kind: "single", row });
      i += 1;
      continue;
    }
    const members = [row];
    let j = i + 1;
    while (j < rows.length) {
      const next = rows[j];
      if (catalogFamilyKey(next.original) !== key) break;
      if ((next.original.clientIdCode || "") !== client) break;
      members.push(next);
      j += 1;
    }
    if (members.length >= 2) {
      const parent =
        members.find((m) => (m.original.parentageLevel || "").toLowerCase() === "parent") ??
        members[0];
      const children = members.filter((m) => m.id !== parent.id);
      blocks.push({ kind: "family", key: `${client}::${key}`, parent, children });
    } else {
      blocks.push({ kind: "single", row });
    }
    i = j;
  }

  // Within each client: all variation blocks first, then standalones.
  const byClient = new Map<string, CatalogBlock[]>();
  for (const block of blocks) {
    const client = catalogBlockClient(block);
    if (!byClient.has(client)) byClient.set(client, []);
    byClient.get(client)!.push(block);
  }
  const ordered: CatalogBlock[] = [];
  for (const clientBlocks of byClient.values()) {
    ordered.push(
      ...clientBlocks.filter((b) => !catalogBlockIsStandalone(b)),
      ...clientBlocks.filter((b) => catalogBlockIsStandalone(b))
    );
  }
  return ordered;
}

function FamilyThumb({ product }: { product: ProductRow }) {
  return (
    <div className="size-10 rounded border border-stone-200 bg-stone-100 dark:border-zinc-700 dark:bg-zinc-800 overflow-hidden shrink-0">
      {product.listingImageDriveFileId ? (
        <img
          src={`/api/design/listing-images/image?driveFileId=${encodeURIComponent(product.listingImageDriveFileId)}&thumb=1`}
          alt=""
          width={40}
          height={40}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : product.mainImageUrl ? (
        <Image
          src={hiResAmazonImg(product.mainImageUrl, 100)}
          alt=""
          width={40}
          height={40}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-muted-foreground">
          <PackageOpen className="size-4" />
        </div>
      )}
    </div>
  );
}

function VariationFamilyRow({
  parent,
  childCount,
  expanded,
  onToggle,
  colCount,
}: {
  parent: ProductRow;
  childCount: number;
  expanded: boolean;
  onToggle: () => void;
  colCount: number;
}) {
  const familyName =
    parent.variationName ||
    parent.variationGroup ||
    parent.summarizedTitle ||
    parent.itemName ||
    "Variation family";
  const parentAsin = parent.asin || parent.parentAsin;
  const parentSku = parent.sku || parent.parentSku;

  return (
    <tr className="border-b border-stone-100 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-800/40">
      <td colSpan={colCount} className="px-3 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse variations" : "Expand variations"}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          <span className="text-xs font-semibold text-foreground shrink-0">
            Variations ({childCount})
          </span>
          <FamilyThumb product={parent} />
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-8 gap-y-0.5 min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground min-w-0 truncate">
              Variation ID:{" "}
              <span className="font-mono text-foreground">{parent.variationId || "—"}</span>
            </div>
            <div className="text-[11px] text-muted-foreground min-w-0 truncate">
              Parent ASIN:{" "}
              <span className="font-mono text-foreground">{parentAsin || "—"}</span>
            </div>
            <div className="text-xs min-w-0 truncate">
              <Link
                href={`/products/${parent.id}`}
                className="font-semibold text-brand hover:underline"
              >
                {familyName}
              </Link>
            </div>
            <div className="text-[11px] text-muted-foreground min-w-0 truncate">
              Parent SKU:{" "}
              <span className="font-mono text-foreground">{parentSku || "—"}</span>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function ProductDataRow({ row, indent }: { row: Row<ProductRow>; indent?: boolean }) {
  const isParent = (row.original.parentageLevel || "").toLowerCase() === "parent";
  return (
    <tr
      className={cn(
        "border-b border-stone-50 dark:border-zinc-800/50 transition-colors",
        isParent && "bg-blue-500/[0.04] dark:bg-blue-400/[0.04]",
        indent && "border-l-2 border-l-brand/30",
        "hover:bg-stone-50 dark:hover:bg-zinc-800/50"
      )}
    >
      {row.getVisibleCells().map((cell) => {
        const meta = cell.column.columnDef.meta as { width?: string; maxWidth?: string } | undefined;
        return (
          <td
            key={cell.id}
            className="px-3 py-2 align-top"
            style={{ width: meta?.width, maxWidth: meta?.maxWidth }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );
}

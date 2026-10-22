"use client";
/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/no-array-index-as-key */

import { useState, useRef, useCallback, useMemo, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import {
  Package,
  Search,
  ArrowLeft,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  PackageOpen,
  Plus,
  ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, hiResAmazonImg } from "@/lib/utils";
import { CLIENT_NAMES } from "@/lib/constants";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { SubmitProductDialog } from "./submit-product-dialog";
import { usePortalClientParam } from "@/components/portal/portal-visible-clients";
import { PortalStackedClients, usePortalStackedClients } from "@/components/portal/portal-stacked-clients";

const PARENTAGE_STYLES: Record<string, string> = {
  parent: "bg-blue-500/10 text-blue-400",
  child: "bg-purple-500/10 text-purple-400",
  standalone: "bg-muted text-muted-foreground",
};

function ParentageBadge({ value }: { value: string }) {
  const style = PARENTAGE_STYLES[value.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${style}`}
      style={{ fontStretch: "condensed" }}
    >
      {value}
    </span>
  );
}

// ── Types ──────────────────────────────────────────────────────────

type Product = {
  id: string;
  asin: string | null;
  sku: string | null;
  status: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
  variationId: string | null;
  variationGroup: string | null;
  variations: Record<string, string | undefined> | null;
  parentageLevel: string | null;
  parentAsin: string | null;
  mainImageUrl: string | null;
  /** Drive GID for Hub listing-image MAIN slot (preferred thumb). */
  listingImageDriveFileId: string | null;
  listPrice: string | null;
  varietyPackItemCount: number;
  vpFlavors: string[] | null;
  isPortalSubmission: boolean;
};

type ApiResponse = {
  products: Product[];
  total: number;
};

// ── Status styles (matching hub) ──────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  active: "bg-status-active/15 text-status-active border-status-active/30",
  inactive: "bg-status-inactive/15 text-status-inactive border-status-inactive/30",
  closed: "bg-status-closed/15 text-status-closed border-status-closed/30",
  discontinued: "bg-status-discontinued/15 text-status-discontinued border-status-discontinued/30",
  incomplete: "bg-status-incomplete/15 text-status-incomplete border-status-incomplete/30",
  "out of stock": "bg-status-oos/15 text-status-oos border-status-oos/30",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium whitespace-nowrap ${style}`}>
      {status}
    </span>
  );
}

// ── Status filter chips (matching hub colors) ─────────────────────

const STATUS_CHIP_COLORS: Record<string, { on: string; off: string }> = {
  Active: { on: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", off: "bg-muted text-muted-foreground border-transparent" },
  Closed: { on: "bg-red-500/15 text-red-400 border-red-500/30", off: "bg-muted text-muted-foreground border-transparent" },
  Discontinued: { on: "bg-orange-500/15 text-orange-400 border-orange-500/30", off: "bg-muted text-muted-foreground border-transparent" },
  Inactive: { on: "bg-muted text-foreground/80 border-border", off: "bg-muted text-muted-foreground border-transparent" },
  Incomplete: { on: "bg-yellow-500/15 text-yellow-400 border-brand/30", off: "bg-muted text-muted-foreground border-transparent" },
  "Out of Stock": { on: "bg-purple-100 text-purple-700 border-purple-300", off: "bg-muted text-muted-foreground border-transparent" },
};

const ALL_STATUSES = ["Active", "Closed", "Discontinued", "Inactive", "Incomplete", "Out of Stock"];

// ── Content ───────────────────────────────────────────────────────

function PortalProductsContent() {
  const { label } = usePortalStackedClients();
  const clientParam = usePortalClientParam();

  return (
    <div className="space-y-6 -mt-6 lg:-mt-8">
      {/* Page heading portaled into TopNav row 3 (page-meta-slot) */}
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Product Catalog"
          >
            <span className="font-bold text-sidebar-foreground">Product</span>
            <span className="font-normal text-portal-accent">Catalog</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {label} &mdash; your product catalog.
          </p>
        </div>
      </PageMetaSlot>

      <Link
        href={`/portal${clientParam}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3" />
        Back to portal
      </Link>

      {/* One catalog per visible client, stacked in assignment order. Search,
          filters, sort and paging are per client. */}
      <PortalStackedClients
        empty={
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <p className="text-sm text-muted-foreground">No client assigned to your account yet.</p>
          </div>
        }
      >
        {(code) => <PortalProductsForClient clientCode={code} />}
      </PortalStackedClients>
    </div>
  );
}

function PortalProductsForClient({ clientCode }: { clientCode: string }) {
  const { data: session } = useSession();
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [statuses, setStatuses] = useState<Set<string>>(new Set(["Active"]));
  const [submitOpen, setSubmitOpen] = useState(false);
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const pageSize = 50;

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearch = useCallback((val: string) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 300);
  }, []);

  const statusParam = [...statuses].join(",");

  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ["portal-products", clientCode, debouncedSearch, statusParam, sortBy, sortOrder, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("client", clientCode);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusParam) params.set("status", statusParam);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/portal/products?${params}`);
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
    staleTime: 2 * 60_000,
  });

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // Derive active theme attributes from products' VariationThemeName (hub parity)
  const activeThemeAttrs = useMemo(() => {
    if (!products?.length) return undefined;
    const attrs = new Set<string>();
    for (const p of products) {
      const theme = p.variations?.VariationThemeName;
      if (!theme) continue;
      for (const k of theme.split(/[-/]/)) {
        const stripped = k.replace(/_name$/i, "");
        attrs.add(stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase());
      }
    }
    return attrs.size > 0 ? attrs : undefined;
  }, [products]);

  const themeAttrColumns = useMemo(() => {
    const hasFlavor = !activeThemeAttrs || activeThemeAttrs.has("Flavor");
    const others = activeThemeAttrs
      ? Array.from(activeThemeAttrs).filter((a) => a !== "Flavor").sort()
      : [];
    const cols: string[] = [];
    if (hasFlavor) cols.push("Flavor");
    cols.push(...others);
    return cols;
  }, [activeThemeAttrs]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const toggleStatus = (status: string) => {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <SubmitProductDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        clientParam={`client=${encodeURIComponent(clientCode)}`}
        onSubmitted={() => {
          setStatuses((prev) => new Set([...prev, "Incomplete"]));
          setPage(1);
        }}
      />

      {/* Count + submit */}
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString()} product{total !== 1 ? "s" : ""}
        </p>
        <div className="flex-1" />
        {session?.user?.role !== "prospect" && (
          <Button
            size="sm"
            className="bg-portal-accent text-white hover:bg-portal-accent-hover"
            onClick={() => setSubmitOpen(true)}
          >
            <Plus className="size-4 mr-1" />
            Submit Product
          </Button>
        )}
      </div>

      {/* Toolbar: Search + Status filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="max-w-sm relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60 pointer-events-none" />
          <Input
            placeholder="Search ASIN, SKU, brand, title…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              handleSearch(e.target.value);
            }}
            className="pl-8 h-9 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setDebouncedSearch("");
                setPage(1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Status:</span>
          {ALL_STATUSES.map((s) => {
            const isOn = statuses.has(s);
            const colors = STATUS_CHIP_COLORS[s] || STATUS_CHIP_COLORS.Active;
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer select-none ${isOn ? colors.on : colors.off}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <Skeleton className="h-[400px] w-full rounded-xl" />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-sm text-muted-foreground">Failed to load products. Please try again.</p>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="rounded-full bg-muted/40 p-6">
            <Package className="size-8 text-muted-foreground/50" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {debouncedSearch || statuses.size > 0
                ? "No products matching your filters"
                : "No products in your catalog yet"}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {debouncedSearch
                ? "Try a different search term or adjust status filters."
                : "Products will appear here once they are added to the system."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-stone-200 bg-card dark:border-zinc-800 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-100 dark:border-zinc-800 text-left">
                  <th className="px-3 py-2.5 font-bold text-portal-accent whitespace-nowrap align-top" style={{ width: "150px" }}>
                    <div className="flex flex-col items-start gap-0.5">
                      <SortButton col="asin" label="ASIN" current={sortBy} order={sortOrder} onToggle={toggleSort} />
                      <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                        SKU
                      </span>
                    </div>
                  </th>
                  <th className="px-3 py-2.5 font-bold text-portal-accent whitespace-nowrap align-top" style={{ width: "100px" }}>
                    <div className="flex flex-col items-start gap-0.5">
                      <span>Listing Status</span>
                      <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                        Parentage Level
                      </span>
                    </div>
                  </th>
                  <th className="px-3 py-2.5 font-bold text-portal-accent whitespace-nowrap align-top" style={{ width: "280px", maxWidth: "280px" }}>Summarized Title</th>
                  <th className="px-3 py-2.5 font-bold text-portal-accent whitespace-nowrap align-top" style={{ width: "90px" }}>
                    <SortButton col="variationId" label="Variation ID" current={sortBy} order={sortOrder} onToggle={toggleSort} />
                  </th>
                  <th className="px-3 py-2.5 font-bold text-portal-accent whitespace-nowrap align-top" style={{ width: "100px" }}>Variation Group</th>
                  <th className="px-3 py-2.5 font-bold text-portal-accent whitespace-nowrap align-top" style={{ width: "80px" }}>Variation Theme</th>
                  <th className="px-3 py-2.5 font-bold text-portal-accent whitespace-nowrap align-top" style={{ width: "40px" }}><span title="Variety Pack">Variety Pack</span></th>
                  {themeAttrColumns.map((attr) => (
                    <th key={attr} className="px-3 py-2.5 font-bold text-portal-accent whitespace-nowrap align-top" style={{ width: "120px" }}>
                      {attr}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Client group header */}
                {products.length > 0 && (
                  <tr className="border-b border-stone-100 dark:border-zinc-800">
                    <td colSpan={7 + themeAttrColumns.length} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-portal-accent">
                          {CLIENT_NAMES[clientCode] || clientCode}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{clientCode}</span>
                        <span className="text-[10px] text-muted-foreground">({total})</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    </td>
                  </tr>
                )}
                {products.map((p) => {
                  const isParent = (p.parentageLevel || "").toLowerCase() === "parent";
                  return (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b transition-colors",
                      p.isPortalSubmission
                        ? "border-l-2 border-l-yellow-400 bg-yellow-500/[0.03] border-b-yellow-100 dark:border-b-yellow-900/20 hover:bg-yellow-500/[0.06]"
                        : isParent
                          ? "border-stone-50 dark:border-zinc-800/50 bg-blue-500/[0.04] dark:bg-blue-400/[0.04] hover:bg-blue-500/[0.08] dark:hover:bg-blue-400/[0.08]"
                          : "border-stone-50 dark:border-zinc-800/50 hover:bg-stone-50 dark:hover:bg-zinc-800/50",
                    )}
                  >
                        {/* ASIN + SKU combined cell with thumbnail */}
                        <td className="px-3 py-2 align-top" style={{ width: "150px" }}>
                          {p.isPortalSubmission && !p.asin ? (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 whitespace-nowrap">
                              Pending Review
                            </span>
                          ) : (
                            <div className="flex items-start gap-2 min-w-0 w-[150px]">
                              <div className="size-8 rounded border border-stone-200 bg-stone-100 dark:border-zinc-700 dark:bg-zinc-800 overflow-hidden shrink-0">
                                {p.listingImageDriveFileId ? (
                                  // Listing-image MAIN from Hub Design (Drive), not Amazon catalog.
                                  <img
                                    src={`/api/portal/design/listing-images/image?driveFileId=${encodeURIComponent(p.listingImageDriveFileId)}&thumb=1`}
                                    alt=""
                                    width={32}
                                    height={32}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                ) : p.mainImageUrl ? (
                                  <Image
                                    src={hiResAmazonImg(p.mainImageUrl, 100)}
                                    alt=""
                                    width={32}
                                    height={32}
                                    className="h-full w-full object-cover"
                                    unoptimized
                                  />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                    <PackageOpen className="size-4" />
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                <span className="font-mono font-bold text-xs text-portal-accent whitespace-nowrap inline-flex items-center gap-1">
                                  {p.asin || "—"}
                                  {p.asin && (
                                    <a
                                      href={`https://www.amazon.com/dp/${p.asin}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-muted-foreground/50 hover:text-portal-accent transition-colors"
                                      title="View on Amazon"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink className="size-3" />
                                    </a>
                                  )}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground line-clamp-2 break-words block">
                                  {p.sku || "—"}
                                </span>
                              </div>
                            </div>
                          )}
                        </td>
                        {/* Listing Status + Parentage combined */}
                        <td className="px-3 py-2 align-top" style={{ width: "100px" }}>
                          <div className="flex flex-col items-start gap-1 min-w-0">
                            {p.parentageLevel ? (
                              <ParentageBadge value={p.parentageLevel} />
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                            {p.status ? (
                              <StatusBadge status={p.status} />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        {/* Summarized Title */}
                        <td className="px-3 py-2 align-top" style={{ width: "280px", maxWidth: "280px" }}>
                          <span className="text-xs text-foreground line-clamp-3 break-words">
                            {p.summarizedTitle || p.itemName || "—"}
                          </span>
                        </td>
                        {/* Variation ID */}
                        <td className="px-3 py-2 align-top" style={{ width: "90px" }}>
                          <span className="font-mono text-xs truncate block text-foreground">{p.variationId || "—"}</span>
                        </td>
                        {/* Variation Group */}
                        <td className="px-3 py-2 align-top" style={{ width: "100px" }}>
                          <span className={cn("text-xs font-mono", p.variationGroup ? "text-brand-group" : "text-foreground")}>
                            {p.variationGroup || "—"}
                          </span>
                        </td>
                        {/* Variation Theme */}
                        <td className="px-3 py-2 align-top" style={{ width: "80px" }}>
                          <span className="font-mono text-xs truncate block text-foreground">
                            {p.variations?.VariationThemeName || "—"}
                          </span>
                        </td>
                        {/* Variety Pack icon */}
                        <td className="px-3 py-2 align-top" style={{ width: "40px" }}>
                          {(p.varietyPackItemCount ?? 0) > 0 ? (
                            <span
                              className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-bold bg-brand-vp/15 text-brand-vp border border-brand-vp/30"
                              title={`${p.varietyPackItemCount} pack items`}
                            >
                              <PackageOpen className="size-2.5" />
                            </span>
                          ) : null}
                        </td>
                        {/* Dynamic theme attribute columns */}
                        {themeAttrColumns.map((attr) => {
                          if (isParent) {
                            return (
                              <td key={attr} className="px-3 py-2 align-top" style={{ width: "120px" }}>
                                <ParentageBadge value="Parent" />
                              </td>
                            );
                          }
                          if (attr === "Flavor") {
                            const isVP = (p.varietyPackItemCount ?? 0) > 0;
                            if (isVP && p.vpFlavors?.length) {
                              return (
                                <td key={attr} className="px-3 py-2 align-top" style={{ width: "120px" }}>
                                  <div className="flex flex-col gap-0.5">
                                    {p.vpFlavors.map((f, i) => (
                                      <span key={i} className="px-1.5 py-0.5 rounded text-[9px] bg-brand-vp/10 text-brand-vp whitespace-nowrap">
                                        {f}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              );
                            }
                          }
                          const value = p.variations?.[attr] ?? null;
                          return (
                            <td key={attr} className="px-3 py-2 align-top" style={{ width: "120px" }}>
                              <span className="text-xs text-foreground break-words whitespace-normal">{value || "—"}</span>
                            </td>
                          );
                        })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages} &mdash; {total.toLocaleString()} product{total !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sort button ───────────────────────────────────────────────────

function SortButton({
  col,
  label,
  current,
  order,
  onToggle,
}: {
  col: string;
  label: string;
  current: string;
  order: "asc" | "desc";
  onToggle: (col: string) => void;
}) {
  return (
    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => onToggle(col)}>
      {label}
      <ArrowUpDown className="ml-1 size-3.5" />
    </Button>
  );
}

export default function PortalProducts() {
  return (
    <Suspense>
      <PortalProductsContent />
    </Suspense>
  );
}

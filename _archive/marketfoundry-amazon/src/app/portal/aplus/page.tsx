"use client";
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/design-no-bold-heading */

/* eslint-disable react-doctor/nextjs-no-img-element */

import { useState, useMemo, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ImageIcon,
  Search,
  Loader2,
  ArrowLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePortalClientParam, portalClientQuery } from "@/components/portal/portal-visible-clients";
import { PortalStackedClients } from "@/components/portal/portal-stacked-clients";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

// ── Types ──────────────────────────────────────────────────────────────

type AplusProduct = {
  id: string;
  asin: string | null;
  sku: string | null;
  productName: string | null;
  clientIdCode: string | null;
  variationGroup: string | null;
  variationId: string | null;
  variationTheme: string | null;
  flavor: string | null;
  color: string | null;
  style: string | null;
  size: string | null;
  moduleCount: number;
  approvedCount: number;
  thumbnailUrl: string | null;
};

type ApiResponse = {
  products: AplusProduct[];
  clients: string[];
  role: string;
};

// ── Status badge ────────────────────────────────────────────────────────

function StatusBadge({ moduleCount, approvedCount }: { moduleCount: number; approvedCount: number }) {
  if (moduleCount === 0) {
    return <span className="text-xs text-muted-foreground">No modules</span>;
  }
  const allApproved = approvedCount === moduleCount;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs",
        allApproved
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
          : "border-amber-500/40 bg-amber-500/10 text-amber-600"
      )}
    >
      {approvedCount}/{moduleCount} approved
    </Badge>
  );
}

// ── Content ─────────────────────────────────────────────────────────────

function PortalAplusContent() {
  const clientParam = usePortalClientParam();

  return (
    <div className="space-y-8 -mt-6 lg:-mt-8">
      {/* Page heading portaled into TopNav row 3 (page-meta-slot) */}
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="A+ Content"
          >
            <span className="font-bold text-sidebar-foreground">A+</span>
            <span className="font-normal text-portal-accent">Content</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review and comment on A+ content for your products.
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

      {/* One block per visible client, stacked in assignment order. */}
      <PortalStackedClients>{(code) => <PortalAplusForClient clientCode={code} />}</PortalStackedClients>
    </div>
  );
}

function PortalAplusForClient({ clientCode }: { clientCode: string }) {
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch products filtered by client
  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ["portal-aplus-products", clientCode],
    queryFn: async () => {
      const url = clientCode
        ? `/api/aplus/products?client=${encodeURIComponent(clientCode)}`
        : "/api/aplus/products";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
    enabled: !!clientCode,
    staleTime: 2 * 60_000,
  });

  // Only show products that actually have A+ modules
  const productsWithModules = useMemo(() => {
    const all = data?.products ?? [];
    return all.filter((p) => p.moduleCount > 0);
  }, [data]);

  // Apply search filter
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return productsWithModules;
    const q = searchQuery.toLowerCase();
    return productsWithModules.filter(
      (p) =>
        p.asin?.toLowerCase().includes(q) ||
        p.productName?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.variationId?.toLowerCase().includes(q) ||
        p.flavor?.toLowerCase().includes(q) ||
        p.color?.toLowerCase().includes(q) ||
        p.size?.toLowerCase().includes(q)
    );
  }, [productsWithModules, searchQuery]);

  const clientParam = portalClientQuery(clientCode);

  return (
    <div className="space-y-8">
      {/* Search */}
      <div>
        <div className="max-w-sm relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60 pointer-events-none" />
          <Input
            placeholder="Search by ASIN or product name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
            disabled={isLoading}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[160px] rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-sm text-muted-foreground">Failed to load A+ products. Please try again.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="rounded-full bg-muted/40 p-6">
            <ImageIcon className="size-8 text-muted-foreground/50" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {searchQuery ? `No products matching "${searchQuery}"` : "No A+ content available yet"}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {searchQuery
                ? "Try a different search term."
                : "A+ modules will appear here once our team starts creating content."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((product) => (
            <Link
              key={product.id}
              href={`/portal/aplus/${product.id}${clientParam}`}
              className="group rounded-xl border border-border/60 bg-card p-5 transition-all hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/20 hover:border-[#008296]/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-foreground font-[family-name:var(--font-outfit)] tracking-tight leading-snug">
                    {product.productName || product.sku || "Untitled Product"}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono text-muted-foreground">
                    <span>ASIN: <span className="text-foreground/70">{product.asin ?? "—"}</span></span>
                    <span>SKU: <span className="text-foreground/70">{product.sku ?? "—"}</span></span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono text-muted-foreground">
                    {product.variationId && (
                      <span>VAR: <span className="text-foreground/70">{product.variationId}</span></span>
                    )}
                    {(() => {
                      const theme = product.variationTheme?.toLowerCase();
                      const val = theme?.includes("flavor") ? product.flavor
                        : theme?.includes("color") ? product.color
                        : theme?.includes("style") ? product.style
                        : product.flavor || product.color || product.style || null;
                      const label = theme?.includes("flavor") ? "Flavor"
                        : theme?.includes("color") ? "Color"
                        : theme?.includes("style") ? "Style"
                        : val === product.flavor ? "Flavor"
                        : val === product.color ? "Color"
                        : val === product.style ? "Style" : null;
                      return val ? <span>{label}: <span className="text-foreground/70">{val}</span></span> : null;
                    })()}
                    {product.size && (
                      <span>Size: <span className="text-foreground/70">{product.size}</span></span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg bg-[#008296]/10 shrink-0 overflow-hidden size-14 flex items-center justify-center">
                  {product.thumbnailUrl ? (
                    <img
                      src={product.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <ImageIcon className="size-4 text-[#008296]" />
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {product.moduleCount} module{product.moduleCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <StatusBadge moduleCount={product.moduleCount} approvedCount={product.approvedCount} />
              </div>

              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-[#008296] opacity-0 group-hover:opacity-100 transition-opacity">
                Review
                <ChevronRight className="size-3" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Footer count */}
      {!isLoading && !isError && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {filtered.length} product{filtered.length !== 1 ? "s" : ""} with A+ content
          {searchQuery ? ` matching "${searchQuery}"` : ""}
        </p>
      )}
    </div>
  );
}

// ── Default export with Suspense for useSearchParams ─────────────────

export default function PortalAplusPage() {
  return (
    <Suspense>
      <PortalAplusContent />
    </Suspense>
  );
}

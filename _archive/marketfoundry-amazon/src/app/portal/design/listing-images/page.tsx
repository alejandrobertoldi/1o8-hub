"use client";
/* eslint-disable @next/next/no-img-element */

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ImageIcon, X } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePortalClientParam, portalClientQuery } from "@/components/portal/portal-visible-clients";
import { PortalStackedClients, usePortalStackedClients } from "@/components/portal/portal-stacked-clients";
import { getStatusMeta } from "@/lib/design-status";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { IMAGE_SLOTS } from "@/lib/listing-image-slots";

const STATUS_CHIPS = [
  { value: "Active", label: "Active" },
  { value: "Closed", label: "Closed" },
  { value: "Discontinued", label: "Discontinued" },
  { value: "Inactive", label: "Inactive" },
  { value: "Incomplete", label: "Incomplete" },
  { value: "Out of Stock", label: "Out of Stock" },
];

const STATUS_COLORS: Record<string, { on: string; off: string }> = {
  Active: { on: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", off: "bg-muted text-muted-foreground border-transparent" },
  Closed: { on: "bg-red-500/15 text-red-400 border-red-500/30", off: "bg-muted text-muted-foreground border-transparent" },
  Discontinued: { on: "bg-orange-500/15 text-orange-400 border-orange-500/30", off: "bg-muted text-muted-foreground border-transparent" },
  Inactive: { on: "bg-muted text-foreground/80 border-border", off: "bg-muted text-muted-foreground border-transparent" },
  Incomplete: { on: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", off: "bg-muted text-muted-foreground border-transparent" },
  "Out of Stock": { on: "bg-purple-100 text-purple-700 border-purple-300", off: "bg-muted text-muted-foreground border-transparent" },
};

/** Product-catalog status badge tokens (same as hub product table). */
const PRODUCT_STATUS_STYLES: Record<string, string> = {
  active: "bg-status-active/15 text-status-active border-status-active/30",
  inactive: "bg-status-inactive/15 text-status-inactive border-status-inactive/30",
  closed: "bg-status-closed/15 text-status-closed border-status-closed/30",
  discontinued: "bg-status-discontinued/15 text-status-discontinued border-status-discontinued/30",
  incomplete: "bg-status-incomplete/15 text-status-incomplete border-status-incomplete/30",
  "out of stock": "bg-status-oos/15 text-status-oos border-status-oos/30",
};

// ── Wire types (match /api/portal/design/listing-images GET) ───────────

type ProductDto = {
  id: string;
  asin: string | null;
  sku: string | null;
  status: string | null;
  parentageLevel: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
  variationId: string | null;
  variationName: string | null;
};

type ImageDto = {
  id: string;
  driveFileId: string;
  displayName: string;
  versionNumber: number;
  status: string;
  productId: string;
  slot: string;
};

type GetResponse = {
  clientIdCode: string;
  clientName: string;
  products: ProductDto[];
  images: ImageDto[];
};

async function fetchListingImages(clientParam: string): Promise<GetResponse> {
  const res = await fetch(`/api/portal/design/listing-images${clientParam}`);
  if (!res.ok) throw new Error("Failed to load listing images");
  return res.json();
}

function imageUrl(driveFileId: string, thumb: boolean) {
  const base = `/api/portal/design/listing-images/image?driveFileId=${encodeURIComponent(driveFileId)}`;
  return thumb ? `${base}&thumb=1` : base;
}

// ── Read-only building blocks ──────────────────────────────────────────

function SplitTitle({ title }: { title: string | null | undefined }) {
  if (!title) return <span className="text-muted-foreground/50">—</span>;
  const parts = title.split(" | ");
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      {parts.map((part, i) => (
        <span
          key={i}
          className={cn(
            "block break-words leading-snug",
            i === 0 ? "font-semibold text-foreground text-xs" : "text-[11px] text-muted-foreground"
          )}
        >
          {part}
        </span>
      ))}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const meta = getStatusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold whitespace-nowrap",
        meta.chipClass
      )}
    >
      <span className={cn("inline-block size-1.5 rounded-full shrink-0", meta.dotClass)} />
      {meta.label}
    </span>
  );
}

function ImageStatusDots({ product, images }: { product: ProductDto; images: ImageDto[] }) {
  const count = IMAGE_SLOTS.filter((slot) =>
    images.some((img) => img.productId === product.id && img.slot === slot)
  ).length;
  const total = IMAGE_SLOTS.length;

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="grid grid-cols-5 gap-[3px]">
        {IMAGE_SLOTS.map((slot) => {
          const hasImage = images.some(
            (img) => img.productId === product.id && img.slot === slot
          );
          return (
            <div
              key={slot}
              title={slot}
              className={cn(
                "size-2 rounded-sm",
                hasImage ? "bg-emerald-500" : "bg-stone-200 dark:bg-zinc-700"
              )}
            />
          );
        })}
      </div>
      <span className={cn(
        "text-[10px] font-mono font-bold tabular-nums",
        count === total ? "text-emerald-500" : count === 0 ? "text-muted-foreground/50" : "text-amber-500"
      )}>
        {count}/{total}
      </span>
    </div>
  );
}

function SlotCell({
  image,
  isParent,
  onPreview,
}: {
  image: ImageDto | undefined;
  isParent: boolean;
  onPreview: (image: ImageDto) => void;
}) {
  // Parent rows are header-only: they never hold images.
  if (isParent) return null;

  if (!image) {
    return (
      <div className="flex flex-col items-center gap-1 w-full">
        <div className="w-full aspect-square rounded-md border border-dashed border-stone-200 dark:border-zinc-700 bg-stone-50/50 dark:bg-zinc-800/30 flex items-center justify-center">
          <ImageIcon className="size-5 text-stone-300 dark:text-zinc-600" />
        </div>
      </div>
    );
  }

  const frameClass = getStatusMeta(image.status).frameClass;

  return (
    <div className="flex flex-col items-center gap-1 w-full">
      <div className={cn("relative w-full aspect-square rounded border-2 overflow-hidden bg-stone-100 dark:bg-zinc-900/40", frameClass)}>
        <button
          type="button"
          className="block size-full"
          onClick={() => onPreview(image)}
          aria-label={`Expand ${image.slot} image`}
        >
          <img
            src={imageUrl(image.driveFileId, true)}
            alt={image.displayName}
            loading="lazy"
            className="size-full object-cover"
          />
        </button>
        <span className="absolute bottom-1 left-1 z-10 inline-flex items-center rounded bg-black/65 px-1 py-px text-[9px] font-bold text-white font-mono leading-none pointer-events-none">
          {`V${image.versionNumber.toString().padStart(2, "0")}`}
        </span>
      </div>
      <StatusChip status={image.status} />
    </div>
  );
}

// ── Variation card ─────────────────────────────────────────────────────

type VariationGroup = {
  key: string;
  kind: "hub" | "standalone";
  label: string;
  products: ProductDto[];
};

function VariationCard({
  group,
  images,
  onPreview,
}: {
  group: VariationGroup;
  images: ImageDto[];
  onPreview: (image: ImageDto) => void;
}) {
  const variationId = group.products.find((p) => p.variationId)?.variationId ?? null;
  return (
    <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-card overflow-hidden">
      <div className="px-5 py-3 bg-stone-50 dark:bg-zinc-800/50 border-b border-stone-200 dark:border-zinc-700">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-portal-accent">
            {group.kind === "hub" ? "Variation" : "Standalone"}
          </span>
          {group.kind === "hub" && (
            <span className="text-xs font-semibold text-foreground truncate max-w-[280px]">
              {group.label}
            </span>
          )}
          {group.kind === "hub" && variationId && (
            <code className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
              {variationId}
            </code>
          )}
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] text-muted-foreground">
            {group.products.length} product{group.products.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col className="w-[120px]" />
            <col className="w-[80px]" />
            <col className="w-[200px]" />
            <col className="w-[88px]" />
            {IMAGE_SLOTS.map((slot) => (
              <col key={slot} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-stone-100 dark:border-zinc-800 text-left">
              <th className="px-3 py-2.5 font-bold text-portal-accent whitespace-nowrap">
                <div className="flex flex-col items-start gap-0.5">
                  <span>ASIN</span>
                  <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">SKU</span>
                </div>
              </th>
              <th className="px-3 py-2.5 font-bold text-portal-accent whitespace-nowrap">
                <div className="flex flex-col items-start gap-0.5">
                  <span>Status</span>
                  <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">Parentage</span>
                </div>
              </th>
              <th className="px-3 py-2.5 font-bold text-portal-accent whitespace-nowrap">Summarized Title</th>
              <th className="px-3 py-2.5 font-bold text-portal-accent whitespace-nowrap">Images Status</th>
              {IMAGE_SLOTS.map((slot) => (
                <th
                  key={slot}
                  className="px-3 py-2.5 font-bold text-portal-accent whitespace-nowrap text-center"
                >
                  {slot}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.products.map((product) => {
              const isParent = (product.parentageLevel || "").toLowerCase() === "parent";
              return (
                <tr
                  key={product.id}
                  className={cn(
                    "border-b border-stone-50 dark:border-zinc-800/50",
                    isParent && "bg-blue-500/[0.04] dark:bg-blue-400/[0.04]"
                  )}
                >
                  <td className="px-3 py-2 align-top min-w-0">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="flex items-center gap-1 min-w-0">
                        <span className="font-mono font-bold text-xs text-portal-accent whitespace-nowrap">
                          {product.asin || "—"}
                        </span>
                        <AmazonPdpLink asin={product.asin} />
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground line-clamp-2 break-words block">
                        {product.sku || "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top min-w-0">
                    <div className="flex flex-col items-start gap-1 min-w-0">
                      {product.status ? (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium whitespace-nowrap",
                            PRODUCT_STATUS_STYLES[product.status.toLowerCase()] ??
                              "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {product.status}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {product.parentageLevel ? (
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap",
                          isParent
                            ? "bg-blue-500/10 text-blue-400"
                            : (product.parentageLevel || "").toLowerCase() === "child"
                            ? "bg-purple-500/10 text-purple-400"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {product.parentageLevel}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top" title={product.summarizedTitle || product.itemName || undefined}>
                    <SplitTitle title={product.summarizedTitle || product.itemName} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    {!isParent && <ImageStatusDots product={product} images={images} />}
                  </td>
                  {IMAGE_SLOTS.map((slot) => (
                    <td key={slot} className="px-1.5 py-2 align-top text-center">
                      <SlotCell
                        image={images.find((img) => img.productId === product.id && img.slot === slot)}
                        isParent={isParent}
                        onPreview={onPreview}
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

// ── Page ───────────────────────────────────────────────────────────────

function ListingImagesContent() {
  const { label, codes, showHeaders } = usePortalStackedClients();
  const clientParam = usePortalClientParam();
  // The status filter is page chrome, shared by every stacked client block.
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-8 -mt-6 lg:-mt-8">
      {/* Page heading portaled into TopNav row 3 (page-meta-slot) */}
      <PageMetaSlot>
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <Link
            href={`/portal/design${clientParam}`}
            className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
            aria-label="Back to Design Hub"
            title="Back to Design Hub"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex items-baseline gap-3 min-w-0">
            <h1
              className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
              aria-label="Listing Images"
            >
              <span className="font-bold text-sidebar-foreground">Listing</span>
              <span className="font-normal text-portal-accent">Images</span>
            </h1>
            {codes.length > 0 && (
              <div className="flex items-baseline gap-2 text-xs whitespace-nowrap min-w-0">
                <span className="text-portal-accent font-bold truncate">{label}</span>
                {!showHeaders && (
                  <span className="font-mono text-[10px] text-muted-foreground">{codes[0]}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-0">
          <span className="text-[10px] text-muted-foreground mr-1">Status:</span>
          {STATUS_CHIPS.map((opt) => {
            const isActive = activeStatuses.has(opt.value);
            const colors = STATUS_COLORS[opt.value] || STATUS_COLORS.Active;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => {
                  setActiveStatuses((prev) => {
                    const next = new Set(prev);
                    if (isActive) next.delete(opt.value);
                    else next.add(opt.value);
                    return next;
                  });
                }}
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer select-none ${isActive ? colors.on : colors.off}`}
              >
                {opt.label}
              </button>
            );
          })}
          {activeStatuses.size > 0 && (
            <button
              type="button"
              onClick={() => setActiveStatuses(new Set())}
              className="text-[10px] text-muted-foreground hover:text-foreground ml-1 underline"
            >
              Clear
            </button>
          )}
        </div>
      </PageMetaSlot>

      {/* One block per visible client, stacked in assignment order. */}
      <PortalStackedClients>
        {(code) => <ListingImagesForClient clientCode={code} activeStatuses={activeStatuses} />}
      </PortalStackedClients>
    </div>
  );
}

function ListingImagesForClient({
  clientCode,
  activeStatuses,
}: {
  clientCode: string;
  activeStatuses: Set<string>;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-listing-images", clientCode],
    queryFn: () => fetchListingImages(portalClientQuery(clientCode)),
    staleTime: 60_000,
  });

  const [expandedImage, setExpandedImage] = useState<ImageDto | null>(null);

  const variationGroups = useMemo<VariationGroup[]>(() => {
    if (!data?.products) return [];
    const filtered =
      activeStatuses.size === 0
        ? data.products
        : data.products.filter((p) => p.status && activeStatuses.has(p.status));

    // Variations first (catalog order), then a single Standalone bucket.
    const groups = new Map<string, VariationGroup>();
    for (const row of filtered) {
      if (!row.variationName) continue;
      const key = `hub:${row.variationName}`;
      if (!groups.has(key)) {
        groups.set(key, { key, kind: "hub", label: row.variationName, products: [] });
      }
      groups.get(key)!.products.push(row);
    }
    const ordered: VariationGroup[] = Array.from(groups.values()).map((bucket) => {
      const parent = bucket.products.find((p) => (p.parentageLevel || "").toLowerCase() === "parent");
      const children = bucket.products.filter((p) => (p.parentageLevel || "").toLowerCase() === "child");
      return {
        ...bucket,
        products: parent ? [parent, ...children] : bucket.products,
      };
    });
    const standalone = filtered.filter((row) => !row.variationName);
    if (standalone.length > 0) {
      ordered.push({
        key: "standalone",
        kind: "standalone",
        label: "Standalone",
        products: standalone,
      });
    }
    return ordered;
  }, [data, activeStatuses]);

  const images = data?.images ?? [];

  return (
    <div className="space-y-8">
      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-8 w-64 rounded-lg" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : isError || !data ? (
        <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-card flex flex-col items-center justify-center py-24 gap-4">
          <ImageIcon className="size-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Failed to load your listing images. Please try again.
          </p>
        </div>
      ) : variationGroups.length === 0 ? (
        <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-card flex flex-col items-center justify-center py-24 gap-4">
          <ImageIcon className="size-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground max-w-md text-center">
            Your listing images are not started yet. They will appear here as soon as our design
            team uploads them.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {variationGroups.map((group) => (
            <VariationCard
              key={group.key}
              group={group}
              images={images}
              onPreview={setExpandedImage}
            />
          ))}
        </div>
      )}

      {expandedImage && (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
              event.preventDefault();
              setExpandedImage(null);
            }
          }}
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center"
          onClick={() => setExpandedImage(null)}
        >
          <div
            className="relative max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <img
              src={imageUrl(expandedImage.driveFileId, false)}
              alt={expandedImage.displayName}
              className="w-full h-auto rounded-lg shadow-2xl"
            />
            <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExpandedImage(null)}
                aria-label="Close"
                className="h-6 px-3 rounded-full bg-[#FF5F57] border border-[#E0443E] flex items-center justify-center gap-1 text-[#7a0000] text-[10px] font-bold hover:brightness-90 transition-all"
              >
                <X className="size-2.5" />
                Close
              </button>
              <span className="inline-flex items-center rounded-full bg-black/60 border border-white/20 px-2 py-0.5 text-[10px] font-bold text-white font-mono">
                {`V${expandedImage.versionNumber.toString().padStart(2, "0")}`}
              </span>
              <span className="inline-flex items-center rounded-full bg-black/60 border border-white/20 px-2 py-0.5 text-[10px] font-bold text-white font-mono">
                {expandedImage.slot}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortalListingImages() {
  return (
    <Suspense>
      <ListingImagesContent />
    </Suspense>
  );
}

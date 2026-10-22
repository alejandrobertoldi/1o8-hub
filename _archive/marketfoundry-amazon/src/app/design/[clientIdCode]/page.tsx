/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable @next/next/no-img-element */
"use client";

import { use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  BookOpen,
  Sparkles,
  ImageIcon,
  Store,
  ChevronRight,
  Monitor,
} from "lucide-react";
import { AplusPremiumThumbGrid } from "@/app/design/aplus2/[clientIdCode]/_components/aplus-premium-thumb-grid";
import { cn } from "@/lib/utils";
import {
  StatusDot,
  getStatusMeta,
  DESIGN_STATUS_ORDER_FULL,
  STATUS_TRIGGER_CLASS,
  STATUS_MENU_ITEM_CLASS,
  StatusCountChips,
} from "@/lib/design-status";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IMAGE_SLOTS } from "@/lib/listing-image-slots";

// ── Types ──────────────────────────────────────────────────────────────

type CategoryStatus = {
  category: string;
  status: string;
  notes: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  aplusTotal?: number;
  aplusApproved?: number;
  aplusLive?: number;
  statusCounts?: Partial<Record<string, number>>;
};

type ClientDesign = {
  clientIdCode: string;
  clientName: string;
  categories: CategoryStatus[];
};

// ── Constants ──────────────────────────────────────────────────────────

const CATEGORY_META: Record<
  string,
  {
    label: string;
    icon: typeof BookOpen;
    color: string;
    bgColor: string;
    clientHref: (code: string) => string;
  }
> = {
  brand_story: {
    label: "Brand Story",
    icon: BookOpen,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    clientHref: (code) => `/design/brand-story/${code}`,
  },
  aplus: {
    label: "A+ Content",
    icon: Sparkles,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    clientHref: (code) => `/design/aplus2/${code}`,
  },
  listing_images: {
    label: "Listing Images",
    icon: ImageIcon,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    clientHref: (code) => `/design/listing-images/${code}`,
  },
  storefront: {
    label: "Storefront",
    icon: Store,
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    clientHref: () => "/design/storefront",
  },
};

// Status palette + sizing live in @/lib/design-status (canonical source).

// ── Helpers ────────────────────────────────────────────────────────────

function getOverallProgress(categories: CategoryStatus[]) {
  const weights: Record<string, number> = {
    not_started: 0,
    in_progress: 1,
    in_review: 2,
    approved: 3,
    live: 4,
  };
  const total = categories.reduce(
    (sum, c) => sum + (weights[c.status] ?? 0),
    0
  );
  const max = categories.length * 4;
  return Math.round((total / max) * 100);
}

async function fetchDesignStatus(): Promise<ClientDesign[]> {
  const res = await fetch("/api/design-status");
  if (!res.ok) throw new Error("Failed to fetch design status");
  return res.json();
}

// ── Thumbnail fetchers ─────────────────────────────────────────────────

type BrandStoryVersionsResponse = {
  versions: Array<{
    id: string;
    versionNumber: number;
    screenview: { driveFileId: string } | null;
  }>;
};

async function fetchBrandStoryScreenview(clientIdCode: string): Promise<string | null> {
  const res = await fetch(
    `/api/design-status/brand-story-versions?clientIdCode=${encodeURIComponent(clientIdCode)}`
  );
  if (!res.ok) return null;
  const data: BrandStoryVersionsResponse = await res.json();
  const latest = (data.versions ?? []).reduce<
    BrandStoryVersionsResponse["versions"][number] | undefined
  >(
    (current, version) =>
      current && current.versionNumber >= version.versionNumber ? current : version,
    undefined
  );
  return latest?.screenview?.driveFileId ?? null;
}

type ListingImage = {
  id: string;
  driveFileId: string;
  displayName: string;
  productId: string;
  slot: string;
};

async function fetchListingImages(clientIdCode: string): Promise<ListingImage[]> {
  const res = await fetch(
    `/api/design/listing-images?clientIdCode=${encodeURIComponent(clientIdCode)}`
  );
  if (!res.ok) return [];
  return res.json();
}

type ProductRow = {
  id: string;
  asin: string | null;
  summarizedTitle: string | null;
  itemName: string | null;
  variationName: string | null;
  parentageLevel?: string | null;
};
type ProductsResponse = { data: ProductRow[] };

async function fetchProducts(clientIdCode: string): Promise<ProductRow[]> {
  const res = await fetch(`/api/products?client=${encodeURIComponent(clientIdCode)}&pageSize=200`);
  if (!res.ok) return [];
  const data: ProductsResponse = await res.json();
  return data.data ?? [];
}

// ── Thumbnail components ───────────────────────────────────────────────

function BrandStoryThumbnail({ clientIdCode }: { clientIdCode: string }) {
  const { data: driveFileId, isLoading } = useQuery({
    queryKey: ["brand-story-screenview", clientIdCode],
    queryFn: () => fetchBrandStoryScreenview(clientIdCode),
    staleTime: 120_000,
  });

  if (isLoading) {
    return <Skeleton className="w-full h-40 rounded-lg" />;
  }
  if (!driveFileId) {
    return (
      <div className="w-full h-40 rounded-lg bg-rose-500/5 border border-rose-500/10 flex items-center justify-center">
        <Monitor className="size-8 text-rose-500/20" />
      </div>
    );
  }
  return (
    <div className="w-full rounded-lg overflow-hidden border border-stone-200 dark:border-zinc-800 bg-stone-100 dark:bg-zinc-800/50">
      <img
        src={`/api/design-status/brand-story-image?driveFileId=${encodeURIComponent(driveFileId)}`}
        alt="Brand story screenview"
        className="w-full h-auto"
        loading="lazy"
      />
    </div>
  );
}

function ListingImagesThumbnails({ clientIdCode }: { clientIdCode: string }) {
  const { data: images = [], isLoading: imgsLoading } = useQuery({
    queryKey: ["listing-images-thumb", clientIdCode],
    queryFn: () => fetchListingImages(clientIdCode),
    staleTime: 120_000,
  });

  const { data: products = [], isLoading: prodsLoading } = useQuery({
    queryKey: ["listing-products-thumb", clientIdCode],
    queryFn: () => fetchProducts(clientIdCode),
    staleTime: 120_000,
  });

  const isLoading = imgsLoading || prodsLoading;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="w-20 h-8 rounded" />
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="size-12 rounded-md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="w-full h-20 rounded-lg bg-purple-500/5 border border-purple-500/10 flex items-center justify-center">
        <ImageIcon className="size-7 text-purple-500/20" />
      </div>
    );
  }

  // Match images by productId + slot (canonical), with ASIN filename fallback
  // for older rows where productId may be missing from the client cache.
  const imagesByProductSlot = new Map(
    images.map((image) => [`${image.productId}.${image.slot}`, image] as const)
  );
  const imagesByAsinSlot = new Map(
    images.map((image) => {
      const [asin, slot] = image.displayName.split(".");
      return [`${asin}.${slot}`, image] as const;
    })
  );

  type Row = { product: ProductRow; slotMap: Map<string, ListingImage> };
  const toRow = (product: ProductRow): Row => {
    const slotMap = new Map<string, ListingImage>();
    for (const slot of IMAGE_SLOTS) {
      const img =
        imagesByProductSlot.get(`${product.id}.${slot}`) ??
        (product.asin ? imagesByAsinSlot.get(`${product.asin}.${slot}`) : undefined);
      if (img) slotMap.set(slot, img);
    }
    return { product, slotMap };
  };

  // Catalog layout: variations first, then standalones. Include empty slots so
  // listings without uploads still appear (parents stay as header-only — no
  // slot row, matching the detail page).
  type Group = { key: string; kind: "hub" | "standalone"; label: string; rows: Row[] };
  const hubGroups = new Map<string, Group>();
  for (const product of products) {
    if (!product.variationName) continue;
    const key = `hub:${product.variationName}`;
    if (!hubGroups.has(key)) {
      hubGroups.set(key, { key, kind: "hub", label: product.variationName, rows: [] });
    }
    hubGroups.get(key)!.rows.push(toRow(product));
  }
  const groups: Group[] = Array.from(hubGroups.values()).map((group) => {
    const parent = group.rows.find((r) => (r.product.parentageLevel || "").toLowerCase() === "parent");
    const children = group.rows.filter((r) => (r.product.parentageLevel || "").toLowerCase() !== "parent");
    return { ...group, rows: parent ? [parent, ...children] : group.rows };
  });
  const standalone = products.filter((p) => !p.variationName).map(toRow);
  if (standalone.length > 0) {
    groups.push({ key: "standalone", kind: "standalone", label: "Standalone", rows: standalone });
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-brand">
              {group.kind === "hub" ? "Variation" : "Standalone"}
            </span>
            {group.kind === "hub" && (
              <span className="text-[10px] font-semibold text-foreground truncate max-w-[200px]">
                {group.label}
              </span>
            )}
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="flex items-center gap-3">
            <div className="w-[150px] shrink-0" />
            <div className="flex gap-1.5">
              {IMAGE_SLOTS.map((slot) => (
                <div key={slot} className="w-12 text-center text-[9px] font-bold text-brand uppercase tracking-wide">
                  {slot}
                </div>
              ))}
            </div>
          </div>

          {group.rows.map(({ product, slotMap }) => {
            const isParent = (product.parentageLevel || "").toLowerCase() === "parent";
            const filled = slotMap.size;
            const total = IMAGE_SLOTS.length;
            const complete = filled === total;
            return (
            <div key={product.id} className="flex items-center gap-3">
              <div className="w-[150px] shrink-0">
                <div className="flex items-center gap-1">
                  <p className="text-[10px] font-mono font-semibold text-brand truncate flex-1">
                    {product.asin ?? "—"}
                  </p>
                  {!isParent && (
                    <span className={cn("text-[8px] font-bold tabular-nums shrink-0", complete ? "text-emerald-500" : "text-muted-foreground")}>
                      {filled}/{total}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {(product.summarizedTitle ?? product.itemName ?? "")
                    .split(" | ")
                    .filter(Boolean)
                    .map((part, i) => (
                      <span
                        key={i}
                        className="text-[9px] text-foreground leading-tight break-words"
                      >
                        {part}
                      </span>
                    ))}
                </div>
              </div>

              {!isParent && (
                <div className="flex gap-1.5">
                  {IMAGE_SLOTS.map((slot) => {
                    const img = slotMap.get(slot);
                    return (
                      <div
                        key={slot}
                        className={cn(
                          "size-12 rounded-md overflow-hidden border shrink-0",
                          img
                            ? "border-stone-200 dark:border-zinc-700 bg-stone-100 dark:bg-zinc-800/50"
                            : "border-dashed border-stone-200 dark:border-zinc-800 bg-transparent"
                        )}
                      >
                        {img && (
                          <img
                            src={`/api/design/listing-images/image?driveFileId=${encodeURIComponent(img.driveFileId)}`}
                            alt={slot}
                            className="size-full object-cover"
                            loading="lazy"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function AplusThumbnails({ clientIdCode }: { clientIdCode: string }) {
  return <AplusPremiumThumbGrid clientIdCode={clientIdCode} />;
}

function StorefrontThumbnail() {
  return (
    <div className="w-full h-20 rounded-lg bg-teal-500/5 border border-teal-500/10 flex items-center justify-center">
      <Store className="size-7 text-teal-500/20" />
    </div>
  );
}

function SectionThumbnail({
  category,
  clientIdCode,
}: {
  category: string;
  clientIdCode: string;
}) {
  if (category === "brand_story")
    return <BrandStoryThumbnail clientIdCode={clientIdCode} />;
  if (category === "listing_images")
    return <ListingImagesThumbnails clientIdCode={clientIdCode} />;
  if (category === "aplus")
    return <AplusThumbnails clientIdCode={clientIdCode} />;
  return <StorefrontThumbnail />;
}

// ── Section card ───────────────────────────────────────────────────────

function SectionCard({
  cat,
  clientIdCode,
  onStatusChange,
  isPending,
}: {
  cat: CategoryStatus;
  clientIdCode: string;
  onStatusChange: (status: string) => void;
  isPending: boolean;
}) {
  const router = useRouter();
  const meta = CATEGORY_META[cat.category];
  const config = getStatusMeta(cat.status);
  if (!meta) return null;
  const Icon = meta.icon;
  const href = meta.clientHref(clientIdCode);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") router.push(href);
      }}
      className={cn(
        "rounded-xl border bg-card p-5 cursor-pointer",
        "border-stone-200 dark:border-zinc-800",
        "transition-all hover:shadow-md hover:border-stone-300 dark:hover:border-zinc-700 group"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("rounded-lg p-2.5 shrink-0", meta.bgColor)}>
            <Icon className={cn("size-4", meta.color)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{meta.label}</p>
          </div>
        </div>
        <ChevronRight className="size-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
      </div>

      {/* Thumbnail */}
      <div className="mb-4">
        <SectionThumbnail category={cat.category} clientIdCode={clientIdCode} />
      </div>

      {cat.category === "aplus" || cat.category === "listing_images" ? (
        <StatusCountChips counts={cat.statusCounts} fallbackStatus={cat.status} />
      ) : (
      <div
        className="flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span className="text-[11px] text-muted-foreground">Status</span>
        <Select
          value={cat.status}
          onValueChange={onStatusChange}
          disabled={isPending}
        >
          <SelectTrigger
            className={cn(
              STATUS_TRIGGER_CLASS,
              "w-[120px] border",
              config.chipClass
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DESIGN_STATUS_ORDER_FULL.map((s) => (
              <SelectItem key={s} value={s} className={STATUS_MENU_ITEM_CLASS}>
                <div className="flex items-center gap-2">
                  <StatusDot status={s} />
                  {getStatusMeta(s).label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      )}
    </div>
  );
}

// ── Page skeleton ──────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-1 w-48 rounded-full" />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-card p-5 space-y-4"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-lg" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="w-full h-40 rounded-lg" />
            <Skeleton className="h-6 w-28 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────

export default function ClientDesignPage({
  params,
}: {
  params: Promise<{ clientIdCode: string }>;
}) {
  const { clientIdCode } = use(params);
  const queryClient = useQueryClient();

  const { data: clients, isLoading, isError } = useQuery<ClientDesign[]>({
    queryKey: ["design-status"],
    queryFn: fetchDesignStatus,
    staleTime: 60_000,
  });

  const client = clients?.find((c) => c.clientIdCode === clientIdCode);

  const updateMutation = useMutation({
    mutationFn: async ({
      category,
      status,
    }: {
      category: string;
      status: string;
    }) => {
      const res = await fetch("/api/design-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIdCode, category, status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onMutate: async ({ category, status }) => {
      await queryClient.cancelQueries({ queryKey: ["design-status"] });
      const prev = queryClient.getQueryData<ClientDesign[]>(["design-status"]);
      if (prev) {
        queryClient.setQueryData<ClientDesign[]>(
          ["design-status"],
          prev.map((c) =>
            c.clientIdCode === clientIdCode
              ? {
                  ...c,
                  categories: c.categories.map((cat) =>
                    cat.category === category ? { ...cat, status } : cat
                  ),
                }
              : c
          )
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["design-status"], ctx.prev);
      }
      toast.error("Failed to update status");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["design-status"] });
    },
  });

  const progress = client ? getOverallProgress(client.categories) : 0;

  return (
    <div className="-mt-6 lg:-mt-8">
      <PageMetaSlot>
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <Link
            href="/design"
            className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
            aria-label="All clients"
            title="All clients"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Design Hub"
          >
            <span className="font-bold text-sidebar-foreground">Design</span>
            <span className="font-normal text-brand">Hub</span>
          </h1>
        </div>
      </PageMetaSlot>

      {isLoading ? (
        <PageSkeleton />
      ) : isError || !client ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            {isError ? "Failed to load design status." : "Client not found."}
          </p>
          <Link href="/design" className="text-xs text-brand hover:underline">
            Back to overview
          </Link>
        </div>
      ) : (
        <>
          {/* Client header */}
          <div className="flex items-center gap-4 mb-8">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative size-14 shrink-0">
                    <svg className="size-14 -rotate-90" viewBox="0 0 36 36">
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-stone-200 dark:text-zinc-800"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${(progress / 100) * 88} 88`}
                        strokeLinecap="round"
                        className={cn(
                          progress === 100
                            ? "text-emerald-500"
                            : progress > 0
                            ? "text-brand"
                            : "text-transparent"
                        )}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-muted-foreground">
                      {progress}%
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Overall design progress</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {client.clientName}
              </h2>
              <p className="text-xs font-bold font-mono text-muted-foreground mt-0.5">
                {client.clientIdCode}
              </p>
              <div className="h-1 w-48 rounded-full bg-stone-200 dark:bg-zinc-800 mt-2">
                <div
                  className={cn(
                    "h-1 rounded-full transition-all duration-500",
                    progress === 100 ? "bg-emerald-500" : "bg-brand"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Section cards */}
          <div className="flex flex-col gap-4">
            {client.categories.map((cat) => (
              <SectionCard
                key={cat.category}
                cat={cat}
                clientIdCode={clientIdCode}
                onStatusChange={(status) =>
                  updateMutation.mutate({ category: cat.category, status })
                }
                isPending={updateMutation.isPending}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

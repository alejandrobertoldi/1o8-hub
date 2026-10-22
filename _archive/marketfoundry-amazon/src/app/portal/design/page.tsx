"use client";
/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-doctor/nextjs-no-use-search-params-without-suspense */
/* eslint-disable react-doctor/react-compiler-destructure-method */

import { hasAdminPowers } from "@/lib/roles";
import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  BookOpen,
  Sparkles,
  ImageIcon,
  Store,
  Monitor,
  Eye,
  EyeOff,
} from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Skeleton } from "@/components/ui/skeleton";
import { canAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { IMAGE_SLOTS } from "@/lib/listing-image-slots";
import { toast } from "sonner";
import { AplusPremiumThumbGrid } from "@/app/design/aplus2/[clientIdCode]/_components/aplus-premium-thumb-grid";
import { usePortalVisibleClients, usePortalClientParam } from "@/components/portal/portal-visible-clients";

// ── Types ──────────────────────────────────────────────────────────────

type Category = {
  category: string;
  status: string;
  aplusTotal?: number;
  aplusApproved?: number;
};

type ListingImage = {
  url: string;
  slot: string;
  productId: string;
  asin: string | null;
  title: string | null;
  variationName: string | null;
};

type PortalDesign = {
  clientIdCode: string;
  clientName: string;
  categories: Category[];
  brandStoryScreenviewUrl: string | null;
  aplusThumbs: string[];
  listingImages: ListingImage[];
};

// ── Section meta ───────────────────────────────────────────────────────

const DESIGN_SECTIONS = [
  {
    id: "brandstory",
    category: "brand_story",
    title: "Brand Story",
    description: "Your brand narrative, positioning, and identity guidelines.",
    icon: BookOpen,
    href: "/portal/design/brandstory",
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    permission: "brandstory",
  },
  {
    id: "aplus",
    category: "aplus",
    title: "A+ Content",
    description: "Review and approve A+ content modules for your products.",
    icon: Sparkles,
    href: "/portal/design/aplus2",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    permission: "aplus",
  },
  {
    id: "listing-images",
    category: "listing_images",
    title: "Listing Images",
    description: "Review and approve product listing images for your catalog.",
    icon: ImageIcon,
    href: "/portal/design/listing-images",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    permission: "listing-images",
  },
  {
    id: "storefront",
    category: "storefront",
    title: "Storefront",
    description: "Your Amazon Storefront design and layout management.",
    icon: Store,
    href: "/portal/design/storefront",
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    permission: "storefront",
  },
] as const;

const STATUS_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  not_started: {
    label: "Not Started",
    dotClass: "bg-stone-400",
    badgeClass:
      "border-stone-300 bg-stone-100 text-stone-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-500",
  },
  in_progress: {
    label: "In Progress",
    dotClass: "bg-amber-500",
    badgeClass:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400",
  },
  in_review: {
    label: "In Review",
    dotClass: "bg-blue-500",
    badgeClass:
      "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400",
  },
  approved: {
    label: "Approved",
    dotClass: "bg-emerald-500",
    badgeClass:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  live: {
    label: "Live",
    dotClass: "bg-emerald-500",
    badgeClass:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
};

// ── Helpers ────────────────────────────────────────────────────────────

function getOverallProgress(categories: Category[]) {
  if (categories.length === 0) return 0;
  const weights: Record<string, number> = {
    not_started: 0,
    in_progress: 1,
    in_review: 2,
    approved: 3,
    live: 4,
  };
  const total = categories.reduce((sum, c) => sum + (weights[c.status] ?? 0), 0);
  const max = categories.length * 4;
  return Math.round((total / max) * 100);
}

async function fetchPortalDesign(clientParam: string): Promise<PortalDesign> {
  const res = await fetch(`/api/portal/design${clientParam}`);
  if (!res.ok) throw new Error("Failed to load design");
  return res.json();
}

// ── Thumbnails (data is pre-resolved by the endpoint) ──────────────────

function BrandStoryThumbnail({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="w-full h-40 rounded-lg bg-rose-500/5 border border-rose-500/10 flex items-center justify-center">
        <Monitor className="size-8 text-rose-500/20" />
      </div>
    );
  }
  return (
    <div className="w-full rounded-lg overflow-hidden border border-stone-200 dark:border-zinc-800 bg-stone-100 dark:bg-zinc-800/50">
      <img src={url} alt="Brand story screenview" className="w-full h-auto" loading="lazy" />
    </div>
  );
}

function AplusThumbnails({ clientIdCode }: { clientIdCode: string }) {
  return <AplusPremiumThumbGrid clientIdCode={clientIdCode} />;
}

function ListingImagesThumbnails({ images }: { images: ListingImage[] }) {
  if (images.length === 0) {
    return (
      <div className="w-full h-20 rounded-lg bg-purple-500/5 border border-purple-500/10 flex items-center justify-center">
        <ImageIcon className="size-7 text-purple-500/20" />
      </div>
    );
  }

  // Catalog layout: variations first, then Standalone. Mirrors Hub listing-images.
  type ProductBucket = { asin: string | null; title: string | null; slots: Map<string, ListingImage> };
  type Group = { key: string; kind: "hub" | "standalone"; label: string; products: Map<string, ProductBucket> };
  const hubGroups = new Map<string, Group>();
  const standalone: Group = {
    key: "standalone",
    kind: "standalone",
    label: "Standalone",
    products: new Map(),
  };

  for (const img of images) {
    const group = img.variationName
      ? (() => {
          const key = `hub:${img.variationName}`;
          if (!hubGroups.has(key)) {
            hubGroups.set(key, {
              key,
              kind: "hub",
              label: img.variationName,
              products: new Map(),
            });
          }
          return hubGroups.get(key)!;
        })()
      : standalone;
    if (!group.products.has(img.productId)) {
      group.products.set(img.productId, { asin: img.asin, title: img.title, slots: new Map() });
    }
    group.products.get(img.productId)!.slots.set(img.slot, img);
  }

  const groups = [
    ...hubGroups.values(),
    ...(standalone.products.size > 0 ? [standalone] : []),
  ];

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
                <div
                  key={slot}
                  className="w-12 text-center text-[9px] font-bold text-brand uppercase tracking-wide"
                >
                  {slot}
                </div>
              ))}
            </div>
          </div>

          {Array.from(group.products.entries()).map(([productId, { asin, title, slots }]) => (
            <div key={productId} className="flex items-center gap-3">
              <div className="w-[150px] shrink-0">
                <p className="text-[10px] font-mono font-semibold text-brand truncate">{asin ?? "—"}</p>
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {(title ?? "")
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

              <div className="flex gap-1.5">
                {IMAGE_SLOTS.map((slot) => {
                  const img = slots.get(slot);
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
                        <img src={img.url} alt={slot} className="size-full object-cover" loading="lazy" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function StorefrontThumbnail() {
  return (
    <div className="w-full h-20 rounded-lg bg-teal-500/5 border border-teal-500/10 flex items-center justify-center">
      <Store className="size-7 text-teal-500/20" />
    </div>
  );
}

// ── Section card (read-only — clients review, they don't edit status) ──

type Section = (typeof DESIGN_SECTIONS)[number];

function SectionCard({
  section,
  cat,
  design,
  href,
  enabled,
  isAdminPreview,
  clientName,
  onToggle,
  togglePending,
}: {
  section: Section;
  cat: Category | undefined;
  design: PortalDesign;
  href: string;
  enabled: boolean;
  isAdminPreview: boolean;
  clientName: string;
  onToggle: (sectionId: string) => void;
  togglePending: boolean;
}) {
  const Icon = section.icon;
  const status = cat?.status ?? "not_started";
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_started;

  const cardInner = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("rounded-lg p-2.5 shrink-0", section.bgColor)}>
            <Icon className={cn("size-4", section.color)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{section.title}</p>
            {section.category === "aplus" && cat?.aplusTotal !== undefined && cat.aplusTotal > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {cat.aplusApproved}/{cat.aplusTotal} approved
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground truncate">{section.description}</p>
            )}
          </div>
        </div>
        {enabled && (
          <ChevronRight className="size-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
        )}
      </div>

      {/* Thumbnail */}
      <div className="mb-4">
        {section.category === "brand_story" ? (
          <BrandStoryThumbnail url={design.brandStoryScreenviewUrl} />
        ) : section.category === "aplus" ? (
          <AplusThumbnails clientIdCode={design.clientIdCode} />
        ) : section.category === "listing_images" ? (
          <ListingImagesThumbnails images={design.listingImages} />
        ) : (
          <StorefrontThumbnail />
        )}
      </div>

      {/* Status — read-only badge */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Status</span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold",
            config.badgeClass
          )}
        >
          <span className={cn("inline-block size-2 rounded-full", config.dotClass)} />
          {enabled ? config.label : "Hidden from client"}
        </span>
      </div>
    </>
  );

  const cardClasses = cn(
    "block rounded-xl border bg-card p-5",
    "border-stone-200 dark:border-zinc-800",
    enabled
      ? "transition-all hover:shadow-md hover:border-stone-300 dark:hover:border-zinc-700"
      : "opacity-40 cursor-not-allowed",
  );

  return (
    <div className="relative group">
      {enabled ? (
        <Link href={href} className={cn(cardClasses, "group")}>
          {cardInner}
        </Link>
      ) : (
        <div className={cardClasses} aria-disabled="true">
          {cardInner}
        </div>
      )}

      {isAdminPreview && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle(section.permission);
          }}
          disabled={togglePending}
          aria-label={`${enabled ? "Hide" : "Show"} ${section.title} for ${clientName}`}
          title={`${enabled ? "Hide" : "Show"} for client`}
          className="absolute top-3 right-3 inline-flex items-center justify-center rounded-md border border-border/60 bg-background/80 backdrop-blur-sm p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:border-border transition-all disabled:opacity-50"
        >
          {enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>
      )}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────

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

// ── Content ────────────────────────────────────────────────────────────

type ClientLite = { clientIdCode: string; allowedSections: string[] };

function DesignClientBlock({
  clientIdCode,
  isAdminPreview,
}: {
  clientIdCode: string;
  isAdminPreview: boolean;
}) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const clientParam = `?client=${encodeURIComponent(clientIdCode)}`;

  const { data: assignedPayload } = useQuery<{
    clients: Array<{ clientIdCode: string; allowedSections: string[] }>;
  }>({
    queryKey: ["portal-me-clients", isAdminPreview ? clientIdCode : "self"],
    queryFn: async () => {
      const res = await fetch(`/api/portal/me/clients${isAdminPreview ? clientParam : ""}`);
      if (!res.ok) throw new Error("Failed to load clients");
      return res.json();
    },
    staleTime: 120_000,
  });

  const { data: previewedClient } = useQuery<ClientLite[], Error, ClientLite | undefined>({
    queryKey: ["portal-clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: isAdminPreview,
    select: (data) => data.find((c) => c.clientIdCode === clientIdCode),
  });

  const thisClient = assignedPayload?.clients.find((c) => c.clientIdCode === clientIdCode);
  const effectiveAllowedSections = isAdminPreview
    ? (previewedClient?.allowedSections ?? [])
    : (thisClient?.allowedSections ?? session?.user?.allowedSections ?? []);

  const {
    data: design,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["portal-design", clientIdCode],
    queryFn: () => fetchPortalDesign(clientParam),
    staleTime: 60_000,
  });

  const sectionsWithState = DESIGN_SECTIONS.map((section) => ({
    section,
    enabled: canAccess(section.permission, effectiveAllowedSections, false),
  }));
  const visibleSections = isAdminPreview
    ? sectionsWithState
    : sectionsWithState.filter((s) => s.enabled);

  const toggleSection = useMutation({
    mutationFn: async (sectionId: string) => {
      const enabled = !(previewedClient?.allowedSections ?? []).includes(sectionId);
      const res = await fetch(`/api/clients/${clientIdCode}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, enabled }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update visibility");
      }
      return res.json();
    },
    onSuccess: (updated: { clientIdCode: string; allowedSections: string[] }) => {
      qc.setQueryData(["portal-clients"], (prev: unknown) =>
        Array.isArray(prev)
          ? (prev as Array<{ clientIdCode: string; allowedSections: string[] }>).map((c) =>
              c.clientIdCode === updated.clientIdCode
                ? { ...c, allowedSections: updated.allowedSections }
                : c,
            )
          : prev,
      );
      toast.success("Section visibility updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const catByName = new Map((design?.categories ?? []).map((c) => [c.category, c]));
  const visibleCats = visibleSections
    .filter((s) => s.enabled)
    .map((s) => catByName.get(s.section.category))
    .filter((c): c is Category => !!c);
  const progress = getOverallProgress(visibleCats);

  if (isLoading) return <PageSkeleton />;
  if (isError || !design) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">
          {isError ? "Failed to load your design status." : "No design data available."}
        </p>
      </div>
    );
  }
  if (visibleSections.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">
          No design sections are enabled for {design.clientName}. Contact your account manager to request access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
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
                    ? "text-portal-accent"
                    : "text-transparent"
              )}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-muted-foreground">
            {progress}%
          </span>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">{design.clientName}</h2>
          <p className="text-xs font-bold font-mono text-muted-foreground mt-0.5">
            {design.clientIdCode}
          </p>
          <div className="h-1 w-48 rounded-full bg-stone-200 dark:bg-zinc-800 mt-2">
            <div
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                progress === 100 ? "bg-emerald-500" : "bg-portal-accent"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {visibleSections.map(({ section, enabled }) => (
          <SectionCard
            key={section.id}
            section={section}
            cat={catByName.get(section.category)}
            design={design}
            href={`${section.href}${clientParam}`}
            enabled={enabled}
            isAdminPreview={isAdminPreview}
            clientName={design.clientName}
            onToggle={(id) => toggleSection.mutate(id)}
            togglePending={toggleSection.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function DesignLandingContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const previewClient = isAdmin ? searchParams.get("client") : null;
  const isAdminPreview = !!(isAdmin && previewClient);
  const clientParam = usePortalClientParam();
  const { visible } = usePortalVisibleClients();
  const codes = isAdminPreview && previewClient ? [previewClient] : visible;

  return (
    <div className="space-y-10 -mt-6 lg:-mt-8">
      <PageMetaSlot>
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <Link
            href={`/portal${clientParam}`}
            className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
            aria-label="Back to portal"
            title="Back to portal"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Design Hub"
          >
            <span className="font-bold text-sidebar-foreground">Design</span>
            <span className="font-normal text-portal-accent">Hub</span>
          </h1>
        </div>
      </PageMetaSlot>

      {codes.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">No client assigned to your account yet.</p>
        </div>
      ) : (
        codes.map((code) => (
          <DesignClientBlock
            key={code}
            clientIdCode={code}
            isAdminPreview={isAdminPreview}
          />
        ))
      )}
    </div>
  );
}

export default function PortalDesign() {
  return (
    <Suspense>
      <DesignLandingContent />
    </Suspense>
  );
}

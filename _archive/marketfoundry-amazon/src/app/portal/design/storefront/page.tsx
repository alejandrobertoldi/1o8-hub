"use client";
/* eslint-disable @next/next/no-img-element */

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, ImageIcon, LayoutGrid, Video as VideoIcon } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePortalClientParam, portalClientQuery } from "@/components/portal/portal-visible-clients";
import { PortalStackedClients, usePortalStackedClients } from "@/components/portal/portal-stacked-clients";
import { getStatusMeta } from "@/lib/design-status";
import { STOREFRONT_FRAME_CLASS, STOREFRONT_GUTTER_GAP_CLASS } from "@/lib/storefront/layout";
import {
  STOREFRONT_MODULE_SPECS,
  isSingleRowSplit,
  type StorefrontModuleType,
} from "@/lib/storefront/module-specs";
import { SplitLayoutFrame } from "@/components/storefront/split-layout-tree";

// ── Wire types (match /api/portal/design/storefront GET) ──────────────

type TileDto = {
  id: string;
  position: number;
  title: string | null;
  assetUrl: string | null;
  assetFilename: string | null;
};

type ModuleDto = {
  id: string;
  position: number;
  moduleType: StorefrontModuleType;
  title: string | null;
  assetUrl: string | null;
  assetMimeType: string | null;
  assetFilename: string | null;
  sectionLayout: string | null;
  posterUrl: string | null;
  tiles: TileDto[];
};

type PageDto = {
  id: string;
  name: string;
  slug: string;
  isHomepage: boolean;
  position: number;
  modules: ModuleDto[];
};

type GetResponse = {
  clientIdCode: string;
  clientName: string;
  version: { versionNumber: number; status: string } | null;
  pages: PageDto[];
};

async function fetchStorefront(clientParam: string): Promise<GetResponse> {
  const res = await fetch(`/api/portal/design/storefront${clientParam}`);
  if (!res.ok) throw new Error("Failed to load storefront");
  return res.json();
}

// ── Read-only module preview ───────────────────────────────────────────

function ModulePreview({ module, index }: { module: ModuleDto; index: number }) {
  const spec = STOREFRONT_MODULE_SPECS[module.moduleType];
  const label = spec?.label ?? module.moduleType;
  const isVideo = spec?.kind === "video";
  const Icon = isVideo ? VideoIcon : ImageIcon;

  return (
    <div className="relative overflow-hidden bg-white dark:bg-zinc-900">
      {/* Position + type badge (top-left) */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-portal-accent text-white font-bold shadow-sm">
          {index + 1}
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white shadow-sm">
          {label}
        </span>
      </div>

      {module.moduleType === "split_section" ? (
        (() => {
          const tiles = module.tiles ?? [];
          const byPos = new Map(tiles.map((t) => [t.position, t]));
          const intrinsic =
            isSingleRowSplit(module.sectionLayout) &&
            tiles.length > 0 &&
            tiles.every((t) => !!t.assetUrl);
          return (
            <SplitLayoutFrame
              layoutKey={module.sectionLayout}
              intrinsic={intrinsic}
              className="bg-white"
              gapClassName={STOREFRONT_GUTTER_GAP_CLASS}
            >
              {(tileIndex) => {
                const tile = byPos.get(tileIndex);
                return (
                  <div
                    className={cn(
                      "relative flex w-full items-center justify-center overflow-hidden bg-white",
                      intrinsic ? "flex-col" : "h-full"
                    )}
                  >
                    {tile?.assetUrl ? (
                      <img
                        src={tile.assetUrl}
                        alt={tile.title ?? tile.assetFilename ?? `Tile ${tileIndex}`}
                        loading="lazy"
                        className={
                          intrinsic
                            ? "block h-auto w-full"
                            : "h-full w-full object-cover"
                        }
                      />
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground/70">
                        Tile pending
                      </span>
                    )}
                  </div>
                );
              }}
            </SplitLayoutFrame>
          );
        })()
      ) : isVideo && module.assetUrl ? (
        <video
          src={module.assetUrl}
          poster={module.posterUrl ?? undefined}
          className="w-full h-auto block bg-black"
          controls
          playsInline
          preload="metadata"
        />
      ) : !isVideo && module.assetUrl ? (
        <img
          src={module.assetUrl}
          alt={module.title ?? module.assetFilename ?? `${label} preview`}
          loading="lazy"
          className="w-full h-auto block object-contain"
        />
      ) : (
        <div
          className="flex w-full flex-col items-center justify-center gap-2 bg-stone-50 dark:bg-zinc-950 text-muted-foreground"
          style={{ aspectRatio: isVideo ? "16 / 9" : "5 / 1" }}
        >
          <Icon className="size-7 text-muted-foreground/40" />
          <span className="text-xs font-medium">{label}</span>
          <span className="text-[11px] text-muted-foreground/70">Design pending</span>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

function StorefrontContent() {
  const { label, codes, showHeaders } = usePortalStackedClients();
  const clientParam = usePortalClientParam();

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
              aria-label="Store Front"
            >
              <span className="font-bold text-sidebar-foreground">Store</span>
              <span className="font-normal text-portal-accent">Front</span>
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
      </PageMetaSlot>

      {/* One storefront per visible client, stacked in assignment order. */}
      <PortalStackedClients>{(code) => <StorefrontForClient clientCode={code} />}</PortalStackedClients>
    </div>
  );
}

function StorefrontForClient({ clientCode }: { clientCode: string }) {
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-storefront", clientCode],
    queryFn: () => fetchStorefront(portalClientQuery(clientCode)),
    staleTime: 60_000,
  });

  const pages = useMemo(() => data?.pages ?? [], [data]);

  // Active page: explicit selection, else Homepage, else first.
  const activePage = useMemo<PageDto | null>(() => {
    if (pages.length === 0) return null;
    if (selectedPageId) {
      const found = pages.find((p) => p.id === selectedPageId);
      if (found) return found;
    }
    return pages.find((p) => p.isHomepage) ?? pages[0];
  }, [pages, selectedPageId]);

  const status = data?.version ? getStatusMeta(data.version.status) : null;
  const hasContent = pages.some((p) => p.modules.length > 0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72 rounded-lg" />
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-card flex flex-col items-center justify-center py-24 gap-4">
        <LayoutGrid className="size-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Failed to load your storefront. Please try again.
        </p>
      </div>
    );
  }
  if (!data.version || !hasContent) {
    return (
      <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-card flex flex-col items-center justify-center py-24 gap-4">
        <LayoutGrid className="size-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground max-w-md text-center">
          Your storefront design is not started yet. Pages and modules will appear here as soon
          as our design team uploads them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Version + status + page selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-portal-accent/10 text-portal-accent font-bold shrink-0">
          V{String(data.version.versionNumber).padStart(2, "0")}
        </span>
        {status && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold shrink-0",
              status.chipClass
            )}
          >
            <span className={cn("inline-block size-2 rounded-full", status.dotClass)} />
            {status.label}
          </span>
        )}
        <div className="w-px h-5 bg-border/60 mx-1 hidden sm:block" />
        <div className="flex flex-wrap items-center gap-1.5">
          {pages.map((page) => {
            const active = activePage?.id === page.id;
            return (
              <button
                key={page.id}
                type="button"
                onClick={() => setSelectedPageId(page.id)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "bg-portal-accent/10 text-portal-accent ring-1 ring-portal-accent/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60 ring-1 ring-transparent"
                )}
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate max-w-[10rem]">{page.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stacked modules of the active page */}
      <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-200/80 dark:bg-zinc-950 overflow-hidden">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6">
          {activePage && activePage.modules.length > 0 ? (
            <div className={cn(STOREFRONT_FRAME_CLASS, "shadow-sm")}>
              {activePage.modules.map((module, i) => (
                <ModulePreview key={module.id} module={module} index={i} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <LayoutGrid className="size-8 text-muted-foreground/40" />
              <p className="text-xs">This page has no modules yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PortalStorefront() {
  return (
    <Suspense>
      <StorefrontContent />
    </Suspense>
  );
}

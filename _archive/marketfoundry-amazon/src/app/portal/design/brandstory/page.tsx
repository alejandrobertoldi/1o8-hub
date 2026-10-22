"use client";
/* eslint-disable @next/next/no-img-element */

import { Suspense } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ImageIcon } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getStatusMeta } from "@/lib/design-status";
import { usePortalClientParam, portalClientQuery } from "@/components/portal/portal-visible-clients";
import { PortalStackedClients, usePortalStackedClients } from "@/components/portal/portal-stacked-clients";

// ── Wire types (match /api/portal/design/brand-story GET) ─────────────

type AssetDto = { url: string; filename: string };

type AsinItemDto = {
  id: string;
  position: number;
  asin: string;
  asset: AssetDto | null;
};

type QaItemDto = {
  id: string;
  position: number;
  question: string;
  answer: string;
};

type ModuleDto = {
  id: string;
  position: number;
  type: "asin-showcase" | "focus-image" | "logo-description" | "qa";
  headline: string | null;
  body: string | null;
  focusAsset: AssetDto | null;
  logoAsset: AssetDto | null;
  asinItems: AsinItemDto[];
  qaItems: QaItemDto[];
};

type VersionDto = {
  id: string;
  versionNumber: number;
  status: string;
  screenview: AssetDto | null;
  bgDesktop: AssetDto | null;
  bgMobile: AssetDto | null;
  modules: ModuleDto[];
};

type GetResponse = {
  clientIdCode: string;
  clientName: string;
  versions: VersionDto[];
};

async function fetchBrandStory(clientParam: string): Promise<GetResponse> {
  const res = await fetch(`/api/portal/design/brand-story${clientParam}`);
  if (!res.ok) throw new Error("Failed to load brand story");
  return res.json();
}

// ── Read-only building blocks ──────────────────────────────────────────

function ReadOnlyImage({
  asset,
  className,
  emptyLabel,
}: {
  asset: AssetDto | null;
  className?: string;
  emptyLabel: string;
}) {
  if (!asset) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-stone-300 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-900/40 text-xs text-muted-foreground py-10 px-3 text-center",
          className
        )}
      >
        <ImageIcon className="size-5 text-muted-foreground/50" />
        <span>{emptyLabel}</span>
      </div>
    );
  }
  return (
    <img
      src={asset.url}
      alt={asset.filename}
      loading="lazy"
      className={cn("w-full h-auto object-contain block", className)}
    />
  );
}

function SubcardHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-stone-50 dark:bg-zinc-800/40">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {right}
    </div>
  );
}

// ── Version card ───────────────────────────────────────────────────────

function VersionCard({ v, clientIdCode }: { v: VersionDto; clientIdCode: string }) {
  const slug = `${clientIdCode}_Brandstory_V${String(v.versionNumber).padStart(2, "0")}`;
  const status = getStatusMeta(v.status);

  return (
    <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-card">
      <div className="sticky top-[-24px] lg:top-[-32px] z-10 flex items-center justify-between gap-4 px-6 py-3 bg-stone-50 dark:bg-zinc-800 border-b border-stone-200 dark:border-zinc-800 rounded-t-xl">
        <div className="flex items-center gap-3 truncate">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-portal-accent/10 text-portal-accent font-bold">
            V{String(v.versionNumber).padStart(2, "0")}
          </span>
          <span className="text-xs font-mono font-bold text-portal-accent truncate">{slug}</span>
        </div>
        {/* Status — read-only chip (clients review, they don't edit) */}
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold shrink-0",
            status.chipClass
          )}
        >
          <span className={cn("inline-block size-2 rounded-full", status.dotClass)} />
          {status.label}
        </span>
      </div>

      <div className="p-6 space-y-4">
        {/* Screenview subcard */}
        <div className="rounded-md border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 overflow-hidden">
          <SubcardHeader title="Screenview" />
          <div className="bg-stone-100 dark:bg-zinc-950">
            <ReadOnlyImage asset={v.screenview} emptyLabel="Screenview pending" />
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

function BrandstoryContent() {
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
              aria-label="Brand Story"
            >
              <span className="font-bold text-sidebar-foreground">Brand</span>
              <span className="font-normal text-portal-accent">Story</span>
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

      {/* One brand story per visible client, stacked in assignment order. */}
      <PortalStackedClients>{(code) => <BrandstoryForClient clientCode={code} />}</PortalStackedClients>
    </div>
  );
}

function BrandstoryForClient({ clientCode }: { clientCode: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-brand-story", clientCode],
    queryFn: () => fetchBrandStory(portalClientQuery(clientCode)),
    staleTime: 60_000,
  });

  const versions = [...(data?.versions ?? [])].sort(
    (a, b) => b.versionNumber - a.versionNumber
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-card flex flex-col items-center justify-center py-24 gap-4">
        <ImageIcon className="size-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Failed to load your brand story. Please try again.
        </p>
      </div>
    );
  }
  if (versions.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-card flex flex-col items-center justify-center py-24 gap-4">
        <ImageIcon className="size-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground max-w-md text-center">
          Your brand story is not started yet. Versions will appear here as soon as our design
          team uploads them.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {versions.map((v) => (
        <VersionCard key={v.id} v={v} clientIdCode={data.clientIdCode} />
      ))}
    </div>
  );
}

export default function PortalBrandstory() {
  return (
    <Suspense>
      <BrandstoryContent />
    </Suspense>
  );
}

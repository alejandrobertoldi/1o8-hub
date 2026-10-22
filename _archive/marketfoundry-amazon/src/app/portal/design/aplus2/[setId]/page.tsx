"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Loader2, ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalClientParam } from "@/components/portal/portal-visible-clients";
import { Aplus2ContentPreview } from "@/app/design/aplus2/[clientIdCode]/_components/aplus2-content-preview";
import type { ModuleDto } from "@/app/design/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-module-editor";
import { aplus2VersionTier } from "@/lib/aplus2/set-path";

// ── Types (mirror /api/aplus2/sets/[setId]/versions) ─────────────────────

type VersionDto = { id: string; versionNumber: number; status: string; contentType?: string; modules: ModuleDto[] };
type SetDto = {
  id: string;
  scopeType: "ASIN" | "PARENT";
  scopeIdentifier: string;
  marketplace: string;
  contentType: string;
  asin: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
};
type SnapshotResponse = { set: SetDto; versions: VersionDto[] };

const STATUS_META: Record<string, { label: string; cls: string }> = {
  not_started: { label: "Not Started", cls: "border-zinc-400/40 bg-zinc-400/10 text-zinc-500" },
  in_progress: { label: "In Progress", cls: "border-amber-500/40 bg-amber-500/10 text-amber-600" },
  in_review:   { label: "In Review",   cls: "border-sky-500/40 bg-sky-500/10 text-sky-600" },
  approved:    { label: "Approved",    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" },
  live:        { label: "Live",        cls: "border-emerald-600/40 bg-emerald-600/10 text-emerald-600" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: "border-border bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={cn("text-xs", meta.cls)}>{meta.label}</Badge>;
}

/** Scales the full-width A+ stack down to fit the container (same as the hub). */
function FittedPreview({ modules, contentWidth, variant }: {
  modules: ModuleDto[];
  contentWidth: number;
  variant: "desktop" | "mobile";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.3);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setZoom(el.clientWidth / contentWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [contentWidth]);

  return (
    <div ref={containerRef} className="w-full overflow-hidden bg-card">
      <div style={{ zoom, width: contentWidth }}>
        <Aplus2ContentPreview modules={modules} variant={variant} />
      </div>
    </div>
  );
}

/** One version's stacked A+ preview with a Desktop/Mobile toggle, hub-style. */
function VersionPreview({ modules, contentType }: { modules: ModuleDto[]; contentType: string }) {
  const [variant, setVariant] = useState<"desktop" | "mobile">("desktop");

  return (
    <div className="rounded-xl overflow-hidden border border-stone-200 dark:border-zinc-800">
      {/* Desktop / Mobile toggle */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900">
        <div className="flex gap-1">
          {(["desktop", "mobile"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariant(v)}
              className={`text-xs px-3 py-1 rounded capitalize font-medium transition-colors ${
                variant === v
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {variant === "desktop" ? (
        <FittedPreview
          modules={modules}
          contentWidth={contentType === "BA+" ? 970 : 1464}
          variant="desktop"
        />
      ) : (
        <div className="bg-card overflow-hidden p-3">
          <div className="w-[390px] max-w-full mx-auto">
            <Aplus2ContentPreview modules={modules} variant="mobile" />
          </div>
        </div>
      )}
    </div>
  );
}

function summarize(set: SetDto): string {
  return set.summarizedTitle ?? set.itemName?.split("|")[0].replace(/[™®]/g, "").trim() ?? "A+ Content";
}

// ── Content ─────────────────────────────────────────────────────────────

function PortalAplus2SetContent() {
  const { setId } = useParams<{ setId: string }>();
  const clientParam = usePortalClientParam();

  const { data, isLoading, isError } = useQuery<SnapshotResponse>({
    queryKey: ["portal-aplus2-set", setId],
    queryFn: async () => {
      const res = await fetch(`/api/aplus2/sets/${setId}/versions`);
      if (!res.ok) throw new Error("Failed to load A+ content");
      return res.json();
    },
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-6 text-muted-foreground animate-spin" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-sm text-red-500">
        Failed to load A+ content. Please refresh.
      </div>
    );
  }

  const { set, versions } = data;
  // Show the most recent version first.
  const ordered = versions.slice().sort((a, b) => b.versionNumber - a.versionNumber);

  return (
    <div className="space-y-6">
      <Link
        href={`/portal/design/aplus2${clientParam}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3" />
        Back to A+ content
      </Link>

      <div className="border-b border-border/60 pb-3">
        <h2 className="text-lg font-semibold tracking-tight">{summarize(set)}</h2>
        <p className="text-xs font-mono text-muted-foreground mt-0.5">
          {set.scopeType === "PARENT" ? "PARENT" : "ASIN"} {set.scopeIdentifier} · {set.marketplace}
        </p>
      </div>

      {ordered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <div className="rounded-full bg-muted/40 p-6"><ImageIcon className="size-8 text-muted-foreground/50" /></div>
          <p className="text-sm text-muted-foreground">No A+ content has been created yet.</p>
        </div>
      ) : (
        ordered.map((v) => (
          <div key={v.id} className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#008296]/10 text-[#008296] font-bold">
                V{String(v.versionNumber).padStart(2, "0")}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                aplus2VersionTier(v.contentType, set.contentType) === "BA+"
                  ? "bg-zinc-600 text-zinc-200"
                  : "bg-violet-600/30 text-violet-700 dark:text-violet-300"
              }`}>
                {aplus2VersionTier(v.contentType, set.contentType) === "BA+" ? "Basic" : "Premium"}
              </span>
              <StatusBadge status={v.status} />
            </div>
            {v.modules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No modules in this version yet.</p>
            ) : (
              <VersionPreview modules={v.modules} contentType={aplus2VersionTier(v.contentType, set.contentType)} />
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default function PortalAplus2SetPage() {
  return (
    <>
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="A+ Content"
          >
            <span className="font-bold text-sidebar-foreground">A+</span>
            <span className="font-normal text-portal-accent">Content</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Review the A+ content for your product.</p>
        </div>
      </PageMetaSlot>
      <Suspense>
        <PortalAplus2SetContent />
      </Suspense>
    </>
  );
}

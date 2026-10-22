"use client";
import { useMemo, useState, useRef, useEffect } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ChevronLeft, Plus } from "lucide-react";
import { NewSetDialog } from "./_components/new-set-dialog";
import { Aplus2ContentPreview } from "./_components/aplus2-content-preview";
import { Aplus2VersionStatusSelect } from "./_components/aplus2-version-status-select";
import type { ModuleDto } from "./[marketplace]/[setIdentifier]/_components/aplus2-module-editor";
import { aplus2SetHref, aplus2VersionTier, aplusProductDetailHref } from "@/lib/aplus2/set-path";

type SetRow = {
  id: string;
  contentType: string;
  scopeType: "ASIN" | "PARENT";
  scopeIdentifier: string;
  marketplace: string;
  parentAsin: string | null;
  coveredAsins: string[] | null;
  productId: string;
  asin: string | null;
  sku: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
  variationId: string | null;
  variationName: string | null;
  versionCount: number;
  latestStatus: string | null;
  latestVersionNumber: number | null;
  latestContentType: string | null;
};

type VersionSnapshot = {
  id: string;
  versionNumber: number;
  status: string;
  contentType?: string;
  modules: ModuleDto[];
};

async function fetchSnapshot(setId: string): Promise<{ versions: VersionSnapshot[] }> {
  const r = await fetch(`/api/aplus2/sets/${setId}/versions`);
  if (!r.ok) throw new Error("Failed to load set");
  return r.json();
}

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

export default function Aplus2ClientSetsPage() {
  const params = useParams();
  const router = useRouter();
  const clientIdCode = typeof params.clientIdCode === "string" ? params.clientIdCode : "";
  const [dialog, setDialog] = useState(false);
  const [previewVariants, setPreviewVariants] = useState<Map<string, "desktop" | "mobile">>(new Map());
  const variantFor = (id: string): "desktop" | "mobile" => previewVariants.get(id) ?? "desktop";
  const [selectedVersions, setSelectedVersions] = useState<Map<string, number>>(new Map());
  const selectedVersionFor = (setId: string, allVersions: VersionSnapshot[]) => {
    const stored = selectedVersions.get(setId);
    if (stored !== undefined) return stored;
    return allVersions.reduce((max, v) => v.versionNumber > max ? v.versionNumber : max, 0);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["aplus2-sets", clientIdCode],
    queryFn: async (): Promise<{ clientName: string; sets: SetRow[] }> => {
      const r = await fetch(`/api/aplus2/sets?clientIdCode=${encodeURIComponent(clientIdCode)}`);
      if (!r.ok) throw new Error("Failed to load sets");
      return r.json();
    },
    enabled: !!clientIdCode,
  });

  const sets = useMemo(() => data?.sets ?? [], [data]);

  // One snapshot query per set — pulls the latest version's modules to preview.
  const snapshotResults = useQueries({
    queries: sets.map((s) => ({
      queryKey: ["aplus2-set", s.id],
      queryFn: () => fetchSnapshot(s.id),
      enabled: !!s.id,
      staleTime: 30_000,
    })),
  });

  const snapshotBySetId = useMemo(() => {
    const map = new Map<
      string,
      { isLoading: boolean; isError: boolean; allVersions: VersionSnapshot[] }
    >();
    sets.forEach((s, i) => {
      const q = snapshotResults[i];
      const allVersions = (q?.data?.versions ?? []).slice().sort((a, b) => a.versionNumber - b.versionNumber);
      map.set(s.id, {
        isLoading: q?.isLoading ?? true,
        isError: q?.isError ?? false,
        allVersions,
      });
    });
    return map;
  }, [sets, snapshotResults]);

  const groupedByMarket = useMemo(
    () =>
      sets.reduce<Record<string, SetRow[]>>((acc, s) => {
        (acc[s.marketplace] ??= []).push(s);
        return acc;
      }, {}),
    [sets],
  );

  const openEditor = (s: SetRow) =>
    router.push(
      aplus2SetHref({
        clientIdCode,
        marketplace: s.marketplace,
        scopeIdentifier: s.scopeIdentifier,
        contentType: s.contentType,
      })
    );

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <button
            type="button"
            onClick={() => router.push("/design/aplus2")}
            className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
            aria-label="Back to A+ Content v2"
            title="Back to A+ Content v2"
          >
            <ChevronLeft className="size-4" />
          </button>
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="A+ Sets"
          >
            <span className="font-bold text-sidebar-foreground">A+</span>
            <span className="font-normal text-brand">Sets</span>
          </h1>
          <div className="flex items-baseline gap-2 text-xs whitespace-nowrap min-w-0">
            <span className="text-brand font-bold truncate">{data?.clientName ?? clientIdCode}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{clientIdCode}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1.5 min-w-0">
          <Button size="sm" onClick={() => setDialog(true)}>
            <Plus className="size-3 mr-1" /> New A+ Set
          </Button>
        </div>
      </PageMetaSlot>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600 dark:text-red-400">Failed to load sets.</p>
      ) : sets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sets yet — create one to get started.</p>
      ) : (
        <div className="space-y-10">
          {Object.entries(groupedByMarket).map(([mkt, list]) => (
            <div key={mkt}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{mkt}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map((s) => {
                  const snap = snapshotBySetId.get(s.id);
                  const allVersions = snap?.allVersions ?? [];
                  const selectedVN = selectedVersionFor(s.id, allVersions);
                  const activeVersion = allVersions.find((v) => v.versionNumber === selectedVN) ?? allVersions[allVersions.length - 1];
                  const activeType = aplus2VersionTier(activeVersion?.contentType, s.latestContentType ?? s.contentType);
                  return (
                    <section key={s.id} className="rounded-xl overflow-hidden border border-stone-200 dark:border-zinc-800">
                      {/* Card header — dark bg so brand gold + white SKU pop */}
                      <div className="bg-zinc-900 px-4 py-3 flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-brand/20 text-brand font-bold shrink-0 uppercase tracking-wider">
                              {s.scopeType === "PARENT" ? "VARIATION" : s.scopeType}
                            </span>
                            <span className="text-sm font-bold text-brand font-mono">
                              {s.productId ? (
                                <Link href={aplusProductDetailHref(s.productId)} className="hover:underline">
                                  {s.scopeIdentifier}
                                </Link>
                              ) : (
                                s.scopeIdentifier
                              )}
                              {s.scopeType === "PARENT" && (s.coveredAsins?.length ?? 0) > 0 && (
                                <span className="text-xs font-normal text-zinc-500 ml-1">· {s.coveredAsins!.length} ASINs</span>
                              )}
                            </span>
                          </div>
                          {(s.variationId || s.variationName) && (
                            <div className="flex items-center gap-2 min-w-0">
                              {s.variationId && (
                                <span className="text-xs font-mono text-white shrink-0">{s.variationId}</span>
                              )}
                              {s.variationName && (
                                <span className="text-xs text-zinc-400 truncate">{s.variationName}</span>
                              )}
                            </div>
                          )}
                          {s.sku && (
                            <div className="text-xs text-white font-mono">{s.sku}</div>
                          )}
                          {(s.summarizedTitle ?? s.itemName) && (
                            <div className="text-sm text-zinc-400 truncate" title={s.summarizedTitle ?? s.itemName ?? undefined}>
                              {s.summarizedTitle ?? s.itemName}
                            </div>
                          )}
                          {(() => {
                            const statusKey = activeVersion?.status ?? s.latestStatus ?? "not_started";
                            const versionLabel = (n: number) => `V${String(n).padStart(2, "0")}`;
                            return (
                              <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                                <Aplus2VersionStatusSelect
                                  versionId={activeVersion?.id}
                                  value={statusKey}
                                  setId={s.id}
                                  clientIdCode={clientIdCode}
                                />
                                {allVersions.length > 1 ? (
                                  <div className="flex items-center gap-1 ml-1">
                                    {allVersions.map((v) => (
                                      <button
                                        key={v.versionNumber}
                                        type="button"
                                        onClick={() => setSelectedVersions((prev) => new Map(prev).set(s.id, v.versionNumber))}
                                        className={`font-mono font-bold text-sm px-2 py-0.5 rounded transition-colors ${
                                          selectedVN === v.versionNumber
                                            ? "bg-brand/20 text-brand"
                                            : "text-brand/50 hover:text-brand hover:bg-brand/10"
                                        }`}
                                      >
                                        {versionLabel(v.versionNumber)}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="font-mono font-bold text-sm text-brand ml-1">
                                    {versionLabel(activeVersion?.versionNumber ?? s.latestVersionNumber ?? 1)}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex flex-col items-end justify-between gap-3 shrink-0 self-stretch">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs shrink-0 border-zinc-300 bg-zinc-300 text-black hover:border-black hover:bg-black hover:text-zinc-300 dark:border-zinc-300 dark:bg-zinc-300 dark:text-black dark:hover:border-black dark:hover:bg-black dark:hover:text-zinc-300"
                            onClick={() => openEditor(s)}
                          >
                            Open editor <ArrowUpRight className="size-3 ml-1" />
                          </Button>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            activeType === "BA+"
                              ? "bg-zinc-600 text-zinc-200"
                              : "bg-violet-600/30 text-violet-300"
                          }`}>
                            {activeType === "BA+" ? "Basic" : "Premium"}
                          </span>
                        </div>
                      </div>

                      {/* Desktop | Mobile preview */}
                      {snap?.isLoading ? (
                        <Skeleton className="h-72 w-full" />
                      ) : snap?.isError ? (
                        <p className="text-xs text-red-600 dark:text-red-400 p-4">Failed to load this set&apos;s content.</p>
                      ) : (
                        <>
                          {/* Toggle bar — version picker + desktop/mobile */}
                          <div className="flex items-center justify-end gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900">
                            <div className="flex gap-1">
                              {(["desktop", "mobile"] as const).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => setPreviewVariants((prev) => new Map(prev).set(s.id, v))}
                                  className={`text-xs px-3 py-1 rounded capitalize font-medium transition-colors ${
                                    variantFor(s.id) === v
                                      ? "bg-zinc-700 text-white"
                                      : "text-zinc-400 hover:text-zinc-200"
                                  }`}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Preview */}
                          {variantFor(s.id) === "desktop" ? (
                            <FittedPreview
                              modules={activeVersion?.modules ?? []}
                              contentWidth={activeType === "BA+" ? 970 : 1464}
                              variant="desktop"
                            />
                          ) : (
                            <div className="bg-card overflow-hidden p-3">
                              <div className="w-[390px] max-w-full mx-auto">
                                <Aplus2ContentPreview modules={activeVersion?.modules ?? []} variant="mobile" />
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <NewSetDialog open={dialog} onOpenChange={setDialog} clientIdCode={clientIdCode} />
    </div>
  );
}

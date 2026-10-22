"use client";
import { useMemo, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ChevronLeft, Plus } from "lucide-react";
import { NewSetDialog } from "./new-set-dialog";
import { Aplus2ContentPreview, ScaledAplusPreview } from "./aplus2-content-preview";
import { Aplus2VersionStatusSelect } from "./aplus2-version-status-select";
import { AplusAsinRow, ParentageBadge } from "./aplus-asin-row";
import { AplusCoveredAsinList } from "./aplus-covered-asin-list";
import { AplusSetDeleteButton, aplusSetDisplayLabel } from "./aplus-set-delete-button";
import type { ModuleDto } from "../[marketplace]/[setIdentifier]/_components/aplus2-module-editor";
import { aplus2SetHref, aplus2VersionTier } from "@/lib/aplus2/set-path";
import { firstTwoModules } from "@/lib/aplus2/premium-preview";
import { cn } from "@/lib/utils";

type SetRow = {
  id: string;
  contentType: string;
  scopeType: "ASIN" | "PARENT" | "GROUP";
  scopeIdentifier: string;
  marketplace: string;
  parentAsin: string | null;
  coveredAsins: string[] | null;
  coveredProducts?: {
    id: string;
    asin: string;
    parentageLevel?: string | null;
    summarizedTitle?: string | null;
    itemName?: string | null;
  }[];
  parentProduct?: {
    id: string;
    asin: string;
    parentageLevel?: string | null;
    summarizedTitle?: string | null;
    itemName?: string | null;
  } | null;
  parentageLevel?: string | null;
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

export function Aplus2ClientSetsView({
  clientIdCode,
  mode,
  backHref,
  backLabel,
  pageHeader = true,
}: {
  clientIdCode: string;
  mode: "hub" | "portal";
  backHref: string;
  backLabel: string;
  /** False when a parent renders the page heading once for several stacked
   *  clients — the nav slot is last-writer-wins, so two mounts would fight. */
  pageHeader?: boolean;
}) {
  const router = useRouter();
  const isPortal = mode === "portal";
  const accent = isPortal ? "portal" : "brand";
  const [dialog, setDialog] = useState(false);
  const [previewVariants, setPreviewVariants] = useState<Map<string, "desktop" | "mobile">>(new Map());
  const variantFor = (id: string): "desktop" | "mobile" => previewVariants.get(id) ?? "desktop";
  const [selectedVersions, setSelectedVersions] = useState<Map<string, number>>(new Map());
  const selectedVersionFor = (setId: string, allVersions: VersionSnapshot[]) => {
    const stored = selectedVersions.get(setId);
    if (stored !== undefined && allVersions.some((v) => v.versionNumber === stored)) return stored;
    return allVersions.reduce((max, v) => (v.versionNumber > max ? v.versionNumber : max), 0);
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
      const allVersions = (q?.data?.versions ?? [])
        .slice()
        .sort((a, b) => a.versionNumber - b.versionNumber);
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
      }),
    );

  const headingSecond = isPortal ? "Content" : "Sets";
  const headingAccent = isPortal ? "text-portal-accent" : "text-brand";
  const nameAccent = isPortal ? "text-portal-accent" : "text-brand";
  const pillAccent = isPortal ? "bg-portal-accent/20 text-portal-accent" : "bg-brand/20 text-brand";
  const versionActive = isPortal
    ? "bg-portal-accent/20 text-portal-accent"
    : "bg-brand/20 text-brand";
  const versionIdle = isPortal
    ? "text-portal-accent/50 hover:text-portal-accent hover:bg-portal-accent/10"
    : "text-brand/50 hover:text-brand hover:bg-brand/10";

  return (
    <div className={isPortal ? cn("space-y-8", pageHeader && "-mt-6 lg:-mt-8") : undefined}>
      {pageHeader && (
      <PageMetaSlot>
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
            aria-label={backLabel}
            title={backLabel}
          >
            <ChevronLeft className="size-4" />
          </button>
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label={`A+ ${headingSecond}`}
          >
            <span className="font-bold text-sidebar-foreground">A+</span>
            <span className={cn("font-normal", headingAccent)}>{headingSecond}</span>
          </h1>
          <div className="flex items-baseline gap-2 text-xs whitespace-nowrap min-w-0">
            <span className={cn("font-bold truncate", nameAccent)}>{data?.clientName ?? clientIdCode}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{clientIdCode}</span>
          </div>
        </div>
        {mode === "hub" && (
          <div className="flex items-center justify-end gap-1.5 min-w-0">
            <Button
              size="sm"
              variant="brand"
              className="h-7 text-xs shrink-0 rounded-full bg-brand hover:bg-brand-hover"
              onClick={() => setDialog(true)}
            >
              <Plus className="size-3 mr-1" /> New A+ Set
            </Button>
          </div>
        )}
      </PageMetaSlot>
      )}

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600 dark:text-red-400">Failed to load sets.</p>
      ) : sets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isPortal
            ? "A+ content will appear here once our team starts creating it."
            : "No sets yet — create one to get started."}
        </p>
      ) : (
        <div className="space-y-10">
          {Object.entries(groupedByMarket).map(([mkt, list]) => (
            <div key={mkt}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{mkt}</h2>
              <div className="grid grid-cols-3 gap-4">
                {list.map((s) => {
                  const snap = snapshotBySetId.get(s.id);
                  const allVersions = snap?.allVersions ?? [];
                  const selectedVN = selectedVersionFor(s.id, allVersions);
                  const activeVersion =
                    allVersions.find((v) => v.versionNumber === selectedVN) ??
                    allVersions[allVersions.length - 1];
                  const statusKey = activeVersion?.status ?? s.latestStatus ?? "not_started";
                  const versionLabel = (n: number) => `V${String(n).padStart(2, "0")}`;
                  const activeType = aplus2VersionTier(activeVersion?.contentType, s.latestContentType ?? s.contentType);
                  const previewModules = firstTwoModules(activeVersion?.modules ?? []);
                  return (
                    <section key={s.id} className="rounded-xl overflow-hidden border border-stone-200 dark:border-zinc-800">
                      <div className="bg-zinc-900 px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className={`text-xs font-mono px-1.5 py-0.5 rounded font-bold shrink-0 uppercase tracking-wider ${
                              s.scopeType === "PARENT"
                                ? "bg-blue-500/20 text-blue-400"
                                : s.scopeType === "GROUP"
                                  ? "bg-teal-500/20 text-teal-400"
                                  : pillAccent
                            }`}>
                              {s.scopeType === "PARENT" ? "VARIATION" : s.scopeType}
                            </span>
                            {s.scopeType !== "ASIN" && (
                              <span className="text-sm text-white truncate">
                                {s.scopeType === "GROUP"
                                  ? `${s.scopeIdentifier.replaceAll("_", " ")} · ${s.coveredProducts?.length ?? 0} ASINs`
                                  : [s.variationId, s.variationName].filter(Boolean).join(" ")}
                              </span>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                              activeType === "BA+"
                                ? "bg-zinc-600 text-zinc-200"
                                : "bg-violet-600/30 text-violet-300"
                            }`}>
                              {activeType === "BA+" ? "Basic" : "Premium"}
                            </span>
                            <Aplus2VersionStatusSelect
                              versionId={activeVersion?.id}
                              value={statusKey}
                              setId={s.id}
                              clientIdCode={clientIdCode}
                              readOnly={isPortal}
                            />
                            {allVersions.length > 1 ? (
                              <div className="flex items-center gap-1">
                                {allVersions.map((v) => (
                                  <button
                                    key={v.versionNumber}
                                    type="button"
                                    onClick={() =>
                                      setSelectedVersions((prev) => new Map(prev).set(s.id, v.versionNumber))
                                    }
                                    className={`font-mono font-bold text-sm px-2 py-0.5 rounded transition-colors ${
                                      selectedVN === v.versionNumber ? versionActive : versionIdle
                                    }`}
                                  >
                                    {versionLabel(v.versionNumber)}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className={cn("font-mono font-bold text-sm", nameAccent)}>
                                {versionLabel(activeVersion?.versionNumber ?? s.latestVersionNumber ?? 1)}
                              </span>
                            )}
                          </div>
                          {mode === "hub" && (
                            <Button
                              size="sm"
                              variant="brand"
                              className="h-7 text-xs shrink-0 rounded-full bg-brand hover:bg-brand-hover"
                              onClick={() => openEditor(s)}
                            >
                              Open editor <ArrowUpRight className="size-3 ml-1" />
                            </Button>
                          )}
                        </div>

                        {s.scopeType === "ASIN" && (
                          <div className="flex items-start justify-between gap-3">
                            <AplusAsinRow
                              product={{
                                id: s.productId,
                                asin: s.asin ?? s.scopeIdentifier,
                                parentageLevel: s.parentageLevel,
                                summarizedTitle: s.summarizedTitle,
                                itemName: s.itemName,
                              }}
                              from="aplus"
                              smileVariant="on-dark"
                              emphasized
                              linkToProduct={!isPortal}
                              accent={accent}
                              className="flex-1 min-w-0"
                            />
                            {(s.variationId || s.parentProduct) && (
                              <div className="grid grid-cols-[auto_auto] gap-x-2 gap-y-1 items-center shrink-0 min-w-0">
                                {(s.variationId || s.variationName) && (
                                  <>
                                    <span className="justify-self-end text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400">
                                      VARIATION
                                    </span>
                                    <div className="justify-self-start flex items-baseline gap-1.5 min-w-0">
                                      {s.variationId && (
                                        <span className="text-[11px] font-mono text-white shrink-0">{s.variationId}</span>
                                      )}
                                      {s.variationName && (
                                        <span className="text-[11px] text-zinc-400 truncate">{s.variationName}</span>
                                      )}
                                    </div>
                                  </>
                                )}
                                {s.parentProduct && (
                                  <>
                                    <span className="justify-self-end">
                                      <ParentageBadge value={s.parentProduct.parentageLevel ?? "Parent"} />
                                    </span>
                                    <AplusAsinRow
                                      product={s.parentProduct}
                                      from="aplus"
                                      smileVariant="on-dark"
                                      showParentage={false}
                                      emphasized={false}
                                      linkToProduct={!isPortal}
                                      accent={accent}
                                      className="justify-self-start"
                                    />
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {s.scopeType !== "ASIN" && (s.coveredProducts?.length ?? 0) > 0 && (
                          <AplusCoveredAsinList
                            products={s.coveredProducts!}
                            from="aplus"
                            smileVariant="on-dark"
                            linkToProduct={!isPortal}
                            accent={accent}
                          />
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900">
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
                        {mode === "hub" && (
                          <AplusSetDeleteButton
                            setId={s.id}
                            label={aplusSetDisplayLabel(s)}
                            clientIdCode={clientIdCode}
                          />
                        )}
                      </div>

                      {snap?.isLoading ? (
                        <Skeleton className="h-72 w-full" />
                      ) : snap?.isError ? (
                        <p className="text-xs text-red-600 dark:text-red-400 p-4">Failed to load this set&apos;s content.</p>
                      ) : (
                        <div className="bg-card overflow-hidden">
                          {variantFor(s.id) === "desktop" ? (
                            <ScaledAplusPreview
                              modules={previewModules}
                              contentWidth={activeType === "BA+" ? 970 : 1464}
                            />
                          ) : (
                            <div className="w-full p-3">
                              <div className="pointer-events-none">
                                <Aplus2ContentPreview modules={previewModules} variant="mobile" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === "hub" && (
        <NewSetDialog open={dialog} onOpenChange={setDialog} clientIdCode={clientIdCode} />
      )}
    </div>
  );
}

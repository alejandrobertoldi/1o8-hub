"use client";
import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ModuleDto } from "./_components/aplus2-module-editor";
import { GenerateAllAltTextsBtn } from "./_components/generate-all-alt-texts-btn";
import { Aplus2VersionModules } from "./_components/aplus2-version-modules";
import { Aplus2AddModule } from "./_components/aplus2-add-module";
import { Aplus2BulkAddModules } from "./_components/aplus2-bulk-add-modules";
import { Aplus2VersionStatusSelect } from "../../_components/aplus2-version-status-select";
import { AplusAsinRow } from "../../_components/aplus-asin-row";
import { AplusCoveredAsinList } from "../../_components/aplus-covered-asin-list";
import { AplusSetDeleteButton, aplusSetDisplayLabel } from "../../_components/aplus-set-delete-button";
import { maxModulesForTier } from "@/lib/aplus2/module-specs";
import { aplus2VersionDisplayName } from "@/lib/aplus2/drive-naming";
import { aplus2VersionTier, findAplus2SetId } from "@/lib/aplus2/set-path";
type VersionDto = {
  id: string;
  versionNumber: number;
  status: string;
  contentType?: "PA+" | "BA+";
  driveFolderUrl: string | null;
  createdAt: string;
  updatedAt: string;
  modules: ModuleDto[];
};
type SetDto = {
  id: string; clientIdCode: string; scopeType: "ASIN" | "PARENT" | "GROUP"; scopeIdentifier: string;
  marketplace: string; contentType: "PA+" | "BA+"; parentAsin: string | null; coveredAsins: string[] | null;
  productId: string; asin: string | null; sku: string | null; itemName: string | null;
  summarizedTitle: string | null; variationId?: string | null; variationName?: string | null;
  parentageLevel?: string | null;
  coveredProducts?: {
    id: string; asin: string; parentageLevel?: string | null;
    summarizedTitle?: string | null; itemName?: string | null;
  }[];
};

async function fetchSetSnapshot(setId: string) {
  const r = await fetch(`/api/aplus2/sets/${setId}/versions`);
  if (!r.ok) throw new Error("Failed to load set");
  return r.json() as Promise<{ set: SetDto; versions: VersionDto[] }>;
}

async function fetchSetIdByTriple(
  clientIdCode: string,
  marketplace: string,
  scopeIdentifier: string,
): Promise<string | null> {
  const r = await fetch(`/api/aplus2/sets?clientIdCode=${encodeURIComponent(clientIdCode)}`);
  if (!r.ok) throw new Error(`Failed to load sets (${r.status})`);
  const d = await r.json() as {
    sets: { id: string; marketplace: string; scopeIdentifier: string; contentType: string }[];
  };
  return findAplus2SetId(d.sets, { marketplace, scopeIdentifier });
}

export default function Aplus2SetPage() {
  const params = useParams();
  const router = useRouter();
  const clientIdCode = String(params.clientIdCode);
  const marketplace = String(params.marketplace);
  const setIdentifier = String(params.setIdentifier);

  const idQ = useQuery({
    queryKey: ["aplus2-set-id", clientIdCode, marketplace, setIdentifier],
    queryFn: () => fetchSetIdByTriple(clientIdCode, marketplace, setIdentifier),
  });
  const setId = idQ.data ?? null;

  const dataQ = useQuery({
    queryKey: ["aplus2-set", setId],
    queryFn: () => fetchSetSnapshot(setId!),
    enabled: !!setId,
  });

  const qc = useQueryClient();

  const newVersionMut = useMutation({
    mutationFn: async (copyFrom: string | undefined) => {
      const r = await fetch(`/api/aplus2/sets/${setId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ copyFrom }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set", setId] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });
  const deleteVersionMut = useMutation({
    mutationFn: async (versionId: string) => {
      const r = await fetch(`/api/aplus2/versions/${versionId}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set", setId] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const set = dataQ.data?.set;
  const versions = useMemo(() => (dataQ.data?.versions ?? []).slice().sort((a, b) => b.versionNumber - a.versionNumber), [dataQ.data]);

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center gap-4 min-w-0">
          <button type="button" onClick={() => router.push(`/design/aplus2/${clientIdCode}`)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0">
            <ArrowLeft className="size-3.5" /> {clientIdCode}
          </button>
          <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none">
            <span className="font-bold text-sidebar-foreground">A+</span>
            <span className="font-normal text-brand">Set</span>
          </h1>
          {set && (
            <span className="text-xs font-mono text-muted-foreground shrink-0">{marketplace}</span>
          )}
          </div>
        </div>
      </PageMetaSlot>
      {set && (
        <div className="mb-4 rounded-[23px] overflow-hidden border border-stone-200 dark:border-zinc-800 bg-zinc-900 p-[5px] space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full px-3 text-[13px] font-mono font-bold leading-none uppercase tracking-wider ${
                set.scopeType === "PARENT"
                  ? "bg-blue-500/20 text-blue-400"
                  : set.scopeType === "GROUP"
                    ? "bg-teal-500/20 text-teal-400"
                    : "bg-brand/20 text-brand"
              }`}>
                {set.scopeType === "PARENT" ? "VARIATION" : set.scopeType}
              </span>
              {set.scopeType === "ASIN" && set.asin && (
                <AplusAsinRow
                  product={{
                    id: set.productId,
                    asin: set.asin,
                    parentageLevel: set.parentageLevel,
                    summarizedTitle: set.summarizedTitle,
                    itemName: set.itemName,
                  }}
                  from="aplus-editor"
                  marketplace={marketplace}
                  setIdentifier={setIdentifier}
                  smileVariant="on-dark"
                  emphasized
                  pillParentage
                  className="flex-1"
                />
              )}
              {set.scopeType !== "ASIN" && (
                <span className="text-sm text-white truncate">
                  {set.scopeType === "GROUP"
                    ? `${set.scopeIdentifier.replaceAll("_", " ")} · ${set.coveredProducts?.length ?? 0} ASINs`
                    : [set.variationId, set.variationName].filter(Boolean).join(" ")}
                </span>
              )}
            </div>
            {setId && (
              <AplusSetDeleteButton
                setId={setId}
                label={aplusSetDisplayLabel(set)}
                clientIdCode={clientIdCode}
                onDeleted={() => router.push(`/design/aplus2/${clientIdCode}`)}
              />
            )}
          </div>
          {set.scopeType !== "ASIN" && (set.coveredProducts?.length ?? 0) > 0 && (
            <AplusCoveredAsinList
              products={set.coveredProducts!}
              from="aplus-editor"
              marketplace={marketplace}
              setIdentifier={setIdentifier}
              smileVariant="on-dark"
              sectionCount={3}
            />
          )}
        </div>
      )}


      {idQ.isPending || (!!setId && dataQ.isPending) ? (
        <div className="space-y-4">{Array.from({length:2}).map((_,i) => <Skeleton key={i} className="h-48 w-full rounded-[18px]" />)}</div>
      ) : idQ.isError || dataQ.isError ? (
        <div className="rounded-[18px] border border-red-200 bg-red-50 dark:bg-red-950/30 p-6">
          <p className="text-sm font-bold text-red-700 dark:text-red-300">Failed to load set</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
            {idQ.isError ? (idQ.error instanceof Error ? idQ.error.message : "Unknown error") : dataQ.error instanceof Error ? dataQ.error.message : "Unknown error"}
          </p>
        </div>
      ) : !setId ? (
        <p className="text-sm text-red-600 dark:text-red-400">Set not found.</p>
      ) : versions.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-stone-300 dark:border-zinc-700 bg-white/40 dark:bg-zinc-900/30 p-12 text-center text-sm text-muted-foreground">
          No versions yet — this should not happen (V01 is auto-created).
        </div>
      ) : (
        <div className="space-y-6">
          {versions.map((v) => {
            const contentType = aplus2VersionTier(v.contentType, set!.contentType);
            return (
            <div key={v.id} className="rounded-[23px] border border-stone-200 dark:border-zinc-800 bg-card">
              <div className="sticky top-[-24px] lg:top-[-32px] z-10 flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-[5px] p-[5px] bg-stone-50 dark:bg-zinc-800 border-b border-stone-200 dark:border-zinc-800 rounded-t-[23px]">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-brand/10 px-3 text-[13px] font-mono font-bold leading-none text-brand">V{String(v.versionNumber).padStart(2, "0")}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                    contentType === "BA+"
                      ? "bg-zinc-600 text-zinc-200"
                      : "bg-violet-600/30 text-violet-700 dark:text-violet-300"
                  }`}>
                    {contentType === "BA+" ? "Basic" : "Premium"}
                  </span>
                  <span className="text-xs font-mono font-bold text-brand-orange truncate">
                    {aplus2VersionDisplayName({
                      clientIdCode,
                      marketplace,
                      scopeIdentifier: set!.scopeIdentifier,
                      scopeType: set!.scopeType,
                      variationId: set!.variationId,
                      contentType,
                      versionNumber: v.versionNumber,
                    })}
                  </span>
                  <Aplus2VersionStatusSelect
                    versionId={v.id}
                    value={v.status}
                    setId={setId!}
                    clientIdCode={clientIdCode}
                  />
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-2 flex-wrap">
                  <GenerateAllAltTextsBtn v={v} setId={setId!} />
                  {v.driveFolderUrl && (
                    <a href={v.driveFolderUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-brand/10 px-3 text-[13px] font-medium leading-none text-brand whitespace-nowrap">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/drive.png" alt="" className="size-3.5 object-contain" /> Link to Drive folder
                    </a>
                  )}
                  <Button size="sm" className="h-9 shrink-0 rounded-full border-0 bg-brand-red px-3 text-[13px] font-medium text-white hover:bg-brand-red/90" onClick={() => {
                    if (confirm(`Remove V${String(v.versionNumber).padStart(2,"0")}? This deletes the version + Drive subfolder.`)) deleteVersionMut.mutate(v.id);
                  }} disabled={deleteVersionMut.isPending}>
                    <Trash2 className="size-3.5" strokeWidth={1.75} /> Remove version
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {v.modules.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    No modules yet — pick categories in bulk, or add one below.
                  </p>
                ) : (
                  <Aplus2VersionModules versionId={v.id} modules={v.modules} />
                )}
                <Aplus2BulkAddModules
                  versionId={v.id}
                  contentType={contentType}
                  currentModuleCount={v.modules.length}
                />
                <Aplus2AddModule
                  versionId={v.id}
                  contentType={contentType}
                  disabled={v.modules.length >= maxModulesForTier(contentType)}
                />
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

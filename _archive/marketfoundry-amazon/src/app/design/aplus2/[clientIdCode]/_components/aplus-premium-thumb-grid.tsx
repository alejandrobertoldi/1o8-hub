"use client";
import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { firstTwoPremiumModules } from "@/lib/aplus2/premium-preview";
import { ScaledAplusPreview } from "./aplus2-content-preview";
import type { ModuleDto } from "../[marketplace]/[setIdentifier]/_components/aplus2-module-editor";

type SetRow = { id: string };
type VersionSnapshot = {
  versionNumber: number;
  contentType?: string | null;
  modules: ModuleDto[];
};

async function fetchSets(clientIdCode: string): Promise<SetRow[]> {
  const res = await fetch(`/api/aplus2/sets?clientIdCode=${encodeURIComponent(clientIdCode)}`);
  if (!res.ok) return [];
  const data: { sets: SetRow[] } = await res.json();
  return data.sets ?? [];
}

async function fetchVersions(setId: string): Promise<VersionSnapshot[]> {
  const res = await fetch(`/api/aplus2/sets/${encodeURIComponent(setId)}/versions`);
  if (!res.ok) return [];
  const data: { versions: VersionSnapshot[] } = await res.json();
  return data.versions ?? [];
}

/** 3-column Design Hub grid: each cell is modules 1–2 of a Premium A+. */
export function AplusPremiumThumbGrid({ clientIdCode }: { clientIdCode: string }) {
  const { data: sets = [], isLoading: setsLoading } = useQuery({
    queryKey: ["aplus-sets-design", clientIdCode],
    queryFn: () => fetchSets(clientIdCode),
    enabled: !!clientIdCode,
    staleTime: 120_000,
  });

  const versionResults = useQueries({
    queries: sets.map((s) => ({
      queryKey: ["aplus-set-versions-design", s.id],
      queryFn: () => fetchVersions(s.id),
      enabled: !!s.id,
      staleTime: 120_000,
    })),
  });

  const thumbs = useMemo(
    () =>
      sets
        .map((s, i) => {
          const versions: VersionSnapshot[] = versionResults[i]?.data ?? [];
          return {
            id: s.id,
            modules: firstTwoPremiumModules(versions),
          };
        })
        .filter((t) => t.modules.length > 0),
    [sets, versionResults],
  );

  const versionsLoading = versionResults.some((r) => r.isLoading);

  if (setsLoading || versionsLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (thumbs.length === 0) {
    return (
      <div className="w-full h-20 rounded-lg bg-amber-500/5 border border-amber-500/10 flex items-center justify-center">
        <Sparkles className="size-7 text-amber-500/20" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {thumbs.map((t) => (
        <div
          key={t.id}
          className="overflow-hidden rounded-md border border-stone-200 dark:border-zinc-800 bg-card"
        >
          <ScaledAplusPreview modules={t.modules} />
        </div>
      ))}
    </div>
  );
}

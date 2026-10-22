"use client";
/* eslint-disable react-doctor/nextjs-missing-metadata */

// Case Studies tracker: every active client's High-Level and Detailed case study,
// one row per client, filterable by stage/format/owner/blockers. Hub-staff only.

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { TrackerTable } from "@/components/case-study/kit/tracker-table";
import type { TrackerRow } from "@/lib/case-study/kit/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `Request failed (${res.status})`);
  return res.json();
}

export default function CaseStudiesPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["case-studies", "tracker"],
    queryFn: () => getJson<TrackerRow[]>("/api/case-studies"),
  });

  return (
    <div className="space-y-4">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Case Studies">
          <span className="font-bold text-sidebar-foreground">Case</span>
          <span className="font-normal text-brand">Studies</span>
        </h1>
      </PageMetaSlot>
      <p className="text-xs text-muted-foreground">Every active client · High-Level and Detailed</p>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isError ? (
        <div className="rounded-[18px] border border-red-300 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {(error as Error).message}
        </div>
      ) : (
        <TrackerTable rows={data ?? []} />
      )}
    </div>
  );
}

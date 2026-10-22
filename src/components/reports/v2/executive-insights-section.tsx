"use client";
import type { OverviewResponse } from "./primitives/kpi-derivations";
import { computeInsights } from "./primitives/insights";
import { ExecutiveInsightGrid } from "./executive-insight-grid";
import { Surface } from "./primitives/surface";

export function ExecutiveInsightsSection({
  overview,
  loading,
  requestKey,
}: {
  overview: OverviewResponse | null;
  loading: boolean;
  requestKey: string;
}) {
  if (!requestKey) {
    return <Surface><div className="p-[18px] text-mf-muted">Select a client and date range to surface insights.</div></Surface>;
  }
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="min-h-[132px] animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
        ))}
      </div>
    );
  }
  if (!overview || typeof overview.totalSales !== "number") {
    return <Surface><div className="p-[18px] text-mf-muted">Insights are unavailable for this period.</div></Surface>;
  }
  return <ExecutiveInsightGrid insights={computeInsights(overview)} />;
}

"use client";
import type { ReactNode } from "react";
import { getSurfacePalette, type Surface as SurfaceKind } from "./primitives/palette";
import { Surface } from "./primitives/surface";
import { HeadlinePerformanceSection } from "./headline-performance-section";
import { ExecutiveInsightsSection } from "./executive-insights-section";
import { BusinessPerformanceSection } from "./business-performance-section";
import { KeywordAnalysisSection } from "./keyword-analysis-section";
import { CampaignDetailSection } from "./campaign-detail-section";
import { DecisionSupportSection } from "./decision-support-section";
import { useOverview } from "./use-overview";
import { useCampaigns } from "./use-campaigns";
import { useKeywords } from "./use-keywords";
import { useProducts } from "./use-products";

const SECTIONS: { id: string; title: string; blurb: string }[] = [
  { id: "insights", title: "Executive insights", blurb: "Immediate context before charts or tables. (phase 3)" },
  { id: "kpi", title: "Headline performance", blurb: "3 hero + 4 supporting KPIs. (phase 2)" },
  { id: "performance", title: "Business performance", blurb: "Combined chart + supporting charts + funnel + ROAS rank + scatter. (phase 4)" },
  { id: "keywords", title: "Keyword analysis", blurb: "Sponsored Products keywords table. (phase 5)" },
  { id: "campaigns", title: "Campaign & product detail", blurb: "Campaign and advertised ASIN performance." },
  { id: "actions", title: "Decision support", blurb: "Top performers · Efficiency risks · Recommended actions." },
];

export function PerformanceOverviewV2({
  surface,
  accountId,
  start,
  end,
  refreshKey,
  printMode = false,
  embedded = false,
}: {
  surface: SurfaceKind;
  accountId?: string;
  start?: string;
  end?: string;
  refreshKey?: number;
  /** Print routes supply their own paper shell and cover block, so the page
   *  chrome this component normally renders (viewport canvas, H1, standfirst)
   *  would duplicate it. Mirrors monthly-report/Report.tsx's printMode. */
  printMode?: boolean;
  /** The portal's stacked multi-client report renders the canvas, H1 and
   *  standfirst ONCE above several clients, so each embedded copy must skip
   *  its own chrome. Unlike printMode, section spacing stays the screen value. */
  embedded?: boolean;
}) {
  const palette = getSurfacePalette(surface);
  // One fetch per surface — shared by the KPI grid and the Executive Insights strip.
  const { data: overview, loading, requestKey } = useOverview(accountId, start, end, refreshKey);
  // Second fetch per surface: campaigns (ROAS ranking + scatter). One per endpoint.
  const { data: campaigns, loading: campaignsLoading } = useCampaigns(accountId, start, end, refreshKey);
  // Third fetch per surface: keywords (Keyword analysis table + later decision support).
  const { data: keywords, loading: keywordsLoading } = useKeywords(accountId, start, end, refreshKey);
  const { data: products, loading: productsLoading } = useProducts(accountId, start, end, refreshKey);
  // Both surfaces now render on the light ghost canvas, so page-level headings use
  // company ink; only the accent (orange hub / teal portal) still differs.
  const headingText = "text-mf-ink";
  const subText = "text-mf-muted";
  // Sections filled by this phase; the rest keep their scaffold blurb.
  // Decision support stays hub-only — not shown to portal clients.
  const visibleSections =
    surface === "portal"
      ? SECTIONS.filter((s) => s.id !== "actions")
      : SECTIONS;

  const sectionContent: Partial<Record<string, ReactNode>> = {
    insights: <ExecutiveInsightsSection overview={overview} loading={loading} requestKey={requestKey} />,
    kpi: <HeadlinePerformanceSection surface={surface} overview={overview} loading={loading} requestKey={requestKey} />,
    performance: (
      <BusinessPerformanceSection
        surface={surface}
        overview={overview}
        overviewLoading={loading}
        campaigns={campaigns}
        campaignsLoading={campaignsLoading}
        requestKey={requestKey}
      />
    ),
    keywords: <KeywordAnalysisSection surface={surface} keywords={keywords} loading={keywordsLoading} requestKey={requestKey} />,
    campaigns: (
      <CampaignDetailSection
        surface={surface}
        campaigns={campaigns}
        campaignsLoading={campaignsLoading}
        products={products}
        productsLoading={productsLoading}
        requestKey={requestKey}
      />
    ),
    ...(surface === "portal"
      ? {}
      : {
          actions: (
            <DecisionSupportSection
              surface={surface}
              keywords={keywords}
              campaigns={campaigns}
              loading={keywordsLoading || campaignsLoading}
              requestKey={requestKey}
            />
          ),
        }),
  };
  const body = visibleSections.map((s) => (
    <section key={s.id} aria-labelledby={`${s.id}-title`} className={printMode ? "mt-6" : "mt-10"}>
      <div className={`mb-3.5 ${headingText}`}>
        <h2 id={`${s.id}-title`} className={`m-0 text-[18px] font-bold tracking-tight ${palette.eyebrowClass}`}>{s.title}</h2>
      </div>
      {sectionContent[s.id] ?? (
        <Surface><div className="p-[18px] text-mf-muted">{s.blurb}</div></Surface>
      )}
    </section>
  ));

  if (printMode || embedded) return <>{body}</>;

  return (
    <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
      <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
        <div className={`mb-5 flex items-end justify-between gap-6 ${headingText}`}>
          <div>
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">Performance overview</h1>
            <p className={`mt-2.5 max-w-[760px] ${subText}`}>An executive-first reporting layout that separates headline performance, diagnostics, and detailed analysis.</p>
          </div>
        </div>
        {body}
      </main>
    </div>
  );
}

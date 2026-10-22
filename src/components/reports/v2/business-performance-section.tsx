"use client";
import type { ReactNode } from "react";
import type { OverviewResponse } from "./primitives/kpi-derivations";
import type { CampaignsResponse } from "./primitives/campaigns";
import type { Surface as SurfaceKind } from "./primitives/palette";
import { Surface } from "./primitives/surface";
import { CombinedPerformanceChart } from "./combined-performance-chart";
import { CpcCvrChartV2 } from "./cpc-cvr-chart-v2";
import { TrafficChart } from "./traffic-chart";
import { ConversionFunnel } from "./conversion-funnel";
import { RoasRankingChart } from "./roas-ranking-chart";
import { SpendRoasScatter } from "./spend-roas-scatter";

function Panel({ span, children }: { span: string; children: ReactNode }) {
  return <div className={span}>{children}</div>;
}
function Skeleton({ span, h = 280 }: { span: string; h?: number }) {
  return <div className={`${span} animate-pulse rounded-[18px] border border-mf-line bg-white/60`} style={{ minHeight: h }} />;
}
function Unavailable({ span, label }: { span: string; label: string }) {
  return (
    <div className={span}>
      <Surface title={label}>
        <div className="p-[18px] text-mf-muted">Data unavailable for this period.</div>
      </Surface>
    </div>
  );
}

export function BusinessPerformanceSection({
  surface,
  overview,
  overviewLoading,
  campaigns,
  campaignsLoading,
  requestKey,
}: {
  surface: SurfaceKind;
  overview: OverviewResponse | null;
  overviewLoading: boolean;
  campaigns: CampaignsResponse | null;
  campaignsLoading: boolean;
  requestKey: string;
}) {
  if (!requestKey) {
    return <Surface><div className="p-[18px] text-mf-muted">Select a client and date range to load charts.</div></Surface>;
  }

  const overviewReady = overview != null && typeof overview.totalSales === "number";
  const campaignsReady = campaigns != null && Array.isArray(campaigns.rows);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Combined — span-12 */}
      {overviewLoading ? <Skeleton span="col-span-12" h={340} />
        : overviewReady ? <Panel span="col-span-12"><CombinedPerformanceChart overview={overview} surface={surface} /></Panel>
        : <Unavailable span="col-span-12" label="Combined performance" />}

      {/* CPC/CVR + Traffic — span-6 each */}
      {overviewLoading ? <Skeleton span="col-span-12 lg:col-span-6" />
        : overviewReady ? <Panel span="col-span-12 lg:col-span-6"><CpcCvrChartV2 overview={overview} surface={surface} /></Panel>
        : <Unavailable span="col-span-12 lg:col-span-6" label="CPC & conversion rate" />}

      {overviewLoading ? <Skeleton span="col-span-12 lg:col-span-6" />
        : overviewReady ? <Panel span="col-span-12 lg:col-span-6"><TrafficChart overview={overview} surface={surface} /></Panel>
        : <Unavailable span="col-span-12 lg:col-span-6" label="Clicks, impressions & CTR" />}

      {/* Funnel (overview) + ROAS ranking (campaigns) + Scatter (campaigns) — span-4 each */}
      {overviewLoading ? <Skeleton span="col-span-12 lg:col-span-4" />
        : overviewReady ? <Panel span="col-span-12 lg:col-span-4"><ConversionFunnel overview={overview} surface={surface} /></Panel>
        : <Unavailable span="col-span-12 lg:col-span-4" label="Conversion funnel" />}

      {campaignsLoading ? <Skeleton span="col-span-12 lg:col-span-4" />
        : campaignsReady ? <Panel span="col-span-12 lg:col-span-4"><RoasRankingChart campaigns={campaigns} /></Panel>
        : <Unavailable span="col-span-12 lg:col-span-4" label="ROAS by campaign" />}

      {campaignsLoading ? <Skeleton span="col-span-12 lg:col-span-4" />
        : campaignsReady ? <Panel span="col-span-12 lg:col-span-4"><SpendRoasScatter campaigns={campaigns} /></Panel>
        : <Unavailable span="col-span-12 lg:col-span-4" label="Spend vs ROAS" />}
    </div>
  );
}

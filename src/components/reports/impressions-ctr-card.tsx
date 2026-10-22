/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
"use client";

import { useEffect, useState } from "react";

interface OverviewData {
  clicks: number;
  clicksPY: number;
  clicksYoY: number;
  clicksYoYPct: number;
  impressions: number;
  impressionsPY: number;
  impressionsYoY: number;
  impressionsYoYPct: number;
  ctr: number;
  ctrPY: number;
  ctrYoY: number;
  ctrYoYPct: number;
}

function fmtInt(n?: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "0";
  return Math.round(n).toLocaleString();
}

function fmtPct(n?: number | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "0.00%";
  return `${n.toFixed(2)}%`;
}

function fmtLarge(n?: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "0";
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(2)} M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)} K`;
  return Math.round(n).toLocaleString();
}

function LeftMetric({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center border-b border-white/25 px-3 py-2 text-center last:border-b-0">
      <div className="text-[10px] leading-none font-semibold text-black">
        {title}
      </div>
      <div className="mt-1 text-[25px] font-bold leading-none text-white whitespace-nowrap">
        {value}
      </div>
    </div>
  );
}

function RightMetric({
  title,
  value,
  delta,
  deltaPct,
  positive,
  arrowUp,
}: {
  title: string;
  value: string;
  delta: string;
  deltaPct: string;
  positive: boolean;
  arrowUp: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center border-b border-white/10 px-3 py-2 text-center last:border-b-0">
      <div className="text-[10px] leading-none font-semibold text-[#F7BF1D]">
        {title}
      </div>

      <div className="mt-1 text-[14px] font-bold leading-none text-white whitespace-nowrap">
        {value}
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
        <span
          className={`rounded px-1 py-[1px] text-[8px] font-bold text-white ${
            positive ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {arrowUp ? "▲" : "▼"} {delta}
        </span>
        <span
          className={`rounded px-1 py-[1px] text-[8px] font-bold text-white ${
            positive ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {arrowUp ? "▲" : "▼"} {deltaPct}
        </span>
      </div>
    </div>
  );
}

export function ImpressionsCtrCard({
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
  const requestKey = accountId && start && end ? `${accountId}:${start}:${end}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: OverviewData | null } | null>(null);

  useEffect(() => {
    if (!accountId || !start || !end) return;

    let ignore = false;
    fetch(`/api/reports/overview?accountId=${accountId}&start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => {
        if (!ignore) setResult({ key: requestKey, data: d });
      })
      .catch(() => {
        if (!ignore) setResult({ key: requestKey, data: null });
      });
    return () => {
      ignore = true;
    };
  }, [accountId, start, end, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;

  if (loading) {
    return <div className="h-[190px] rounded-lg border border-[#6f7275] bg-white animate-pulse" />;
  }

  if (!data) return null;

  const safeClicks = data.clicks ?? 0;
  const safeClicksPY = data.clicksPY ?? 0;
  const safeClicksYoY = data.clicksYoY ?? 0;
  const safeClicksYoYPct = data.clicksYoYPct ?? 0;

  const safeImpressions = data.impressions ?? 0;
  const safeImpressionsPY = data.impressionsPY ?? 0;
  const safeImpressionsYoY = data.impressionsYoY ?? 0;
  const safeImpressionsYoYPct = data.impressionsYoYPct ?? 0;

  const safeCtr = data.ctr ?? 0;
  const safeCtrPY = data.ctrPY ?? 0;
  const safeCtrYoY = data.ctrYoY ?? 0;
  const safeCtrYoYPct = data.ctrYoYPct ?? 0;

  return (
    <div className="h-[190px] w-full rounded-lg border border-[#6f7275] bg-white p-1 shadow-sm">
      <div className="grid h-full grid-cols-2 gap-1">
        <div className="flex h-full flex-col overflow-hidden rounded-md bg-[#2C2B35]">
          <LeftMetric title="Clicks" value={fmtInt(safeClicks)} />
          <LeftMetric title="Impressions" value={fmtLarge(safeImpressions)} />
          <LeftMetric title="CTR" value={fmtPct(safeCtr)} />
        </div>

        <div className="flex h-full flex-col overflow-hidden rounded-md bg-[#3C4043]">
          <RightMetric
            title="Clicks PY"
            value={fmtInt(safeClicksPY)}
            delta={fmtInt(Math.abs(safeClicksYoY))}
            deltaPct={`${Math.abs(safeClicksYoYPct).toFixed(2)}%`}
            positive={safeClicksYoY >= 0}
            arrowUp={safeClicksYoY >= 0}
          />

          <RightMetric
            title="Impressions PY"
            value={fmtLarge(safeImpressionsPY)}
            delta={fmtLarge(Math.abs(safeImpressionsYoY))}
            deltaPct={`${Math.abs(safeImpressionsYoYPct).toFixed(2)}%`}
            positive={safeImpressionsYoY >= 0}
            arrowUp={safeImpressionsYoY >= 0}
          />

          <RightMetric
            title="CTR PY"
            value={fmtPct(safeCtrPY)}
            delta={fmtPct(Math.abs(safeCtrYoY))}
            deltaPct={`${Math.abs(safeCtrYoYPct).toFixed(2)}%`}
            positive={safeCtrYoY >= 0}
            arrowUp={safeCtrYoY >= 0}
          />
        </div>
      </div>
    </div>
  );
}

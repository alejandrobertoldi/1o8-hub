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
  conversions: number;
  conversionsPY: number;
  conversionsYoY: number;
  conversionsYoYPct: number;
  cvr: number;
  cvrPY: number;
  cvrYoY: number;
  cvrYoYPct: number;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "0.00%";
  return `${n.toFixed(2)}%`;
}

function LeftMetric({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center items-center border-b border-white/25 px-3 py-2 last:border-b-0 text-center">
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
    <div className="flex flex-1 flex-col justify-center items-center border-b border-white/10 px-3 py-2 last:border-b-0 text-center">
      <div className="text-[10px] leading-none font-semibold text-[#F7BF1D]">
        {title}
      </div>

      <div className="mt-1 text-[16px] font-bold leading-none text-white whitespace-nowrap">
        {value}
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
        <span className={`rounded px-1 py-[1px] text-[8px] font-bold text-white ${positive ? "bg-green-600" : "bg-red-600"}`}>
          {arrowUp ? "▲" : "▼"} {delta}
        </span>
        <span className={`rounded px-1 py-[1px] text-[8px] font-bold text-white ${positive ? "bg-green-600" : "bg-red-600"}`}>
          {arrowUp ? "▲" : "▼"} {deltaPct}
        </span>
      </div>
    </div>
  );
}

export function ClicksConversionsCard({
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
    return <div className="h-[200px] rounded-lg border border-[#6f7275] bg-white animate-pulse" />;
  }
  if (!data) return null;

  return (
    <div className="h-[200px] w-full rounded-lg border border-[#6f7275] bg-white p-1 shadow-sm">
      <div className="grid h-full grid-cols-2 gap-1">
        <div className="flex h-full flex-col overflow-hidden rounded-md bg-[#2C2B35]">
          <LeftMetric title="Clicks" value={fmtInt(data.clicks)} />
          <LeftMetric title="Conversions" value={fmtInt(data.conversions)} />
          <LeftMetric title="CVR" value={fmtPct(data.cvr)} />
        </div>

        <div className="flex h-full flex-col overflow-hidden rounded-md bg-[#3C4043]">
          <RightMetric
            title="Clicks PY"
            value={fmtInt(data.clicksPY)}
            delta={fmtInt(Math.abs(data.clicksYoY))}
            deltaPct={`${Math.abs(data.clicksYoYPct).toFixed(2)}%`}
            positive={data.clicksYoY >= 0}
            arrowUp={data.clicksYoY >= 0}
          />

          <RightMetric
            title="Conversions PY"
            value={fmtInt(data.conversionsPY)}
            delta={fmtInt(Math.abs(data.conversionsYoY))}
            deltaPct={`${Math.abs(data.conversionsYoYPct).toFixed(2)}%`}
            positive={data.conversionsYoY >= 0}
            arrowUp={data.conversionsYoY >= 0}
          />

          <RightMetric
            title="CVR PY"
            value={fmtPct(data.cvrPY)}
            delta={fmtPct(Math.abs(data.cvrYoY))}
            deltaPct={`${Math.abs(data.cvrYoYPct).toFixed(2)}%`}
            positive={data.cvrYoY >= 0}
            arrowUp={data.cvrYoY >= 0}
          />
        </div>
      </div>
    </div>
  );
}

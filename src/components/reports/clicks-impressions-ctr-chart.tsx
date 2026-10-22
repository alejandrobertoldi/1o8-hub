"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

interface DailyRow {
  report_date: string;
  ad_clicks: number | null;
  ad_impressions: number | null;
}

interface OverviewData {
  clicks: number;
  impressions: number;
  ctr: number;
  daily: DailyRow[];
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}
function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}
function fmtLarge(n: number): string {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(2)} M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)}K`;
  return fmtInt(n);
}
function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ClicksImpressionsCtrChart({
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
    return <div className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse h-64" />;
  }
  if (!data) return null;

  const chartData = data.daily.map((d) => {
    const clicks = d.ad_clicks ?? 0;
    const impressions = d.ad_impressions ?? 0;

    return {
      date: fmtDate(d.report_date),
      CTR: impressions !== 0 ? (clicks / impressions) * 100 : 0,
      Clicks: clicks,
      Impressions: impressions,
    };
  });

  return (
    <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
      <div className="bg-[#3C4043] px-4 py-2">
        <h3 className="text-sm font-semibold text-[#F7BF1D] text-center">
          Clicks, Impressions & CTR
        </h3>
      </div>

      <div className="p-4">
        <div className="flex gap-4">
          <div className="flex flex-col gap-2 shrink-0">
            <div className="border border-[#F7BF1D] rounded px-3 py-2 min-w-[90px] bg-white">
              <p className="text-xs font-semibold text-[#F7BF1D] uppercase">Clicks</p>
              <p className="text-lg font-bold text-black">{fmtInt(data.clicks)}</p>
            </div>
            <div className="border border-[#F7BF1D] rounded px-3 py-2 min-w-[90px] bg-white">
              <p className="text-xs font-semibold text-[#F7BF1D] uppercase">Impressions</p>
              <p className="text-lg font-bold text-black">{fmtLarge(data.impressions)}</p>
            </div>
            <div className="border border-[#F7BF1D] rounded px-3 py-2 min-w-[90px] bg-white">
              <p className="text-xs font-semibold text-[#F7BF1D] uppercase">CTR</p>
              <p className="text-lg font-bold text-black">{fmtPct(data.ctr)}</p>
            </div>
          </div>

          <div className="flex-1">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 40, left: 0, bottom: 10 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#000000" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: "#000000" }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: "CTR",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#000000",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={fmtLarge}
                  tick={{ fontSize: 10, fill: "#000000" }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: "Clicks & Impressions",
                    angle: 90,
                    position: "insideRight",
                    fill: "#000000",
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    fontSize: "11px",
                    color: "#000000",
                  }}
                  formatter={(value, name) => {
                    const n = Number(value);
                    if (name === "CTR") return [fmtPct(n), String(name)];
                    if (name === "Impressions") return [fmtLarge(n), String(name)];
                    return [fmtInt(n), String(name)];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px", color: "#000000" }} />
                <Bar yAxisId="left" dataKey="CTR" fill="#f5a623" opacity={0.9} barSize={35}/>
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="Clicks"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#6366f1" }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="Impressions"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#94a3b8" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

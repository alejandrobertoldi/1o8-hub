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
  ad_spend: number | null;
  ad_clicks: number | null;
  ad_conversions: number | null;
}

interface OverviewData {
  cpc: number;
  cvr: number;
  daily: DailyRow[];
}

function fmtCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}
function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}
function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CpcCvrChart({
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
    const spend = d.ad_spend ?? 0;
    const clicks = d.ad_clicks ?? 0;
    const conversions = d.ad_conversions ?? 0;

    return {
      date: fmtDate(d.report_date),
      CPC: clicks !== 0 ? spend / clicks : 0,
      CVR: clicks !== 0 ? (conversions / clicks) * 100 : 0,
    };
  });

  return (
    <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
      <div className="bg-[#3C4043] px-4 py-2">
        <h3 className="text-sm font-semibold text-[#F7BF1D] text-center">CPC & CVR</h3>
      </div>

      <div className="p-4">
        <div className="flex gap-4">
          <div className="flex flex-col gap-2 shrink-0">
            <div className="border border-[#F7BF1D] rounded px-3 py-2 min-w-[90px] bg-white">
              <p className="text-xs font-semibold text-[#F7BF1D] uppercase">CPC</p>
              <p className="text-lg font-bold text-black">{fmtCurrency(data.cpc)}</p>
            </div>
            <div className="border border-[#F7BF1D] rounded px-3 py-2 min-w-[90px] bg-white">
              <p className="text-xs font-semibold text-[#F7BF1D] uppercase">CVR</p>
              <p className="text-lg font-bold text-black">{fmtPct(data.cvr)}</p>
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
                  tickFormatter={fmtCurrency}
                  tick={{ fontSize: 10, fill: "#000000" }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: "CPC",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#000000",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: "#000000" }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: "CVR",
                    angle: 90,
                    position: "insideRight",
                    fill: "#000000",
                    fontSize: 11,
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
                    if (name === "CVR") return [fmtPct(n), String(name)];
                    return [fmtCurrency(n), String(name)];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "12px", color: "#000000" }} />
                <Bar yAxisId="left" dataKey="CPC" fill="#f5a623" opacity={0.9} barSize={35}/>
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="CVR"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#6366f1" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

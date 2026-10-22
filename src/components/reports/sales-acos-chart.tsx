"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/no-array-index-as-key */

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

interface DailyRow {
  report_date: string;
  product_sales: number | null;
  ad_spend: number | null;
  ad_revenue: number | null;
}

interface OverviewData {
  daily: DailyRow[];
  acosGoal: number;
}

function fmtCurrency(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CustomLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[11px] text-black">
      <div className="flex items-center gap-1">
        <span className="size-3 bg-[#ef4444]" />
        <span>ACoS &gt; ACoSGoal1D</span>
      </div>

      <div className="flex items-center gap-1">
        <span className="size-3 bg-[#22c55e]" />
        <span>ACoS &lt; ACoSGoal1D</span>
      </div>

      <div className="flex items-center gap-1">
        <span className="inline-block w-6 border-t border-dashed border-black" />
        <span>ACoSGoal1D</span>
      </div>

      <div className="flex items-center gap-1">
        <span className="size-2 rounded-full bg-[#2C2B35]" />
        <span>Total Sales</span>
      </div>

      <div className="flex items-center gap-1">
        <span className="size-2 rounded-full bg-[#4c1d5a]" />
        <span>Ad Spend</span>
      </div>

      <div className="flex items-center gap-1">
        <span className="size-2 rounded-full bg-[#118a1a]" />
        <span>Ad Revenue</span>
      </div>
    </div>
  );
}

export function SalesAcosChart({
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

  const acosGoalValue = (data.acosGoal ?? 0) * 100;

  const chartData = data.daily.map((d) => {
  const sales = d.product_sales ?? 0;
  const spend = d.ad_spend ?? 0;
  const revenue = d.ad_revenue ?? 0;
  const acos = revenue !== 0 ? (spend / revenue) * 100 : 0;

  return {
    date: fmtDate(d.report_date),
    ACoS: acos,
    "Total Sales": sales,
    "Ad Spend": spend,
    "Ad Revenue": revenue,
  };
});

  return (
    <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
      <div className="bg-[#3C4043] px-4 py-2">
        <h3 className="text-sm font-semibold text-[#F7BF1D] text-center">
          Total Sales, Ad Spend, Ad Revenue, & ACoS
        </h3>
      </div>

      <div className="relative p-4">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData}
          margin={{ top: 10, right: 60, left: 10, bottom: 10 }}
          barCategoryGap="8%"
          barGap={0}
          >
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
              domain={[0, 150]}
              label={{
                value: "ACoS",
                angle: -90,
                position: "insideLeft",
                fill: "#000000",
                fontSize: 11,
              }}
            />

            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={fmtCurrency}
              tick={{ fontSize: 10, fill: "#000000" }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "Total Sales, Ad Spend & Ad Revenue",
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
                if (name === "ACoS") return [fmtPct(n), String(name)];
                return [fmtCurrency(n), String(name)];
              }}
            />

            <Legend content={<CustomLegend />} />

            <ReferenceLine
              yAxisId="left"
              y={acosGoalValue}
              stroke="#000000"
              strokeDasharray="5 5"
            />

            <Bar yAxisId="left" dataKey="ACoS" opacity={0.9} barSize={56}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.ACoS <= acosGoalValue ? "#22c55e" : "#ef4444"}
                />
              ))}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="Total Sales" stroke="#F7BF1D" strokeWidth={2} dot={{ r: 4, fill: "#F7BF1D" }} />
            <Line yAxisId="right" type="monotone" dataKey="Ad Spend" stroke="#4c1d5a" strokeWidth={2.5} dot={{ r: 4, fill: "#4c1d5a" }} />
            <Line yAxisId="right" type="monotone" dataKey="Ad Revenue" stroke="#118a1a" strokeWidth={2.5} dot={{ r: 4, fill: "#118a1a" }} />
          </ComposedChart>
        </ResponsiveContainer>
        

  <div className="absolute bottom-4 right-4 rounded-md bg-[#3C4043] px-3 py-2 text-xs shadow-md">
  <div className="font-bold text-[#F7BF1D]">ACOSGoal1D</div>
  <div className="text-white">{fmtPct(acosGoalValue)}</div>
</div>
</div>
      </div>
    
  );
}

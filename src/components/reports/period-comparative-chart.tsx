"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend, 
} from "recharts";

interface DailyRow {
  report_date: string;
  ad_revenue: number;
  ad_revenue_pm: number;
  ad_revenue_py: number;
  ad_spend: number;
  ad_spend_pm: number;
  ad_spend_py: number;
  organic_sales: number;
  organic_sales_pm: number;
  organic_sales_py: number;
  product_sales: number;
  product_sales_pm: number;
  product_sales_py: number;
  acos: number;
  acos_pm: number;
  acos_py: number;
  roas: number;
  roas_pm: number;
  roas_py: number;
  tacos: number;
  tacos_pm: number;
  tacos_py: number;
}

interface ApiResponse {
  daily: DailyRow[];
}

type MetricKey =
  | "ad_revenue" | "ad_revenue_pm" | "ad_revenue_py"
  | "ad_spend" | "ad_spend_pm" | "ad_spend_py"
  | "organic_sales" | "organic_sales_pm" | "organic_sales_py"
  | "product_sales" | "product_sales_pm" | "product_sales_py"
  | "acos" | "acos_pm" | "acos_py"
  | "roas" | "roas_pm" | "roas_py"
  | "tacos" | "tacos_pm" | "tacos_py";

type FmtType = "currency" | "pct" | "ratio";

interface MetricDef {
  key: MetricKey;
  label: string;
  color: string;
  fmt: FmtType;
}

const METRICS: MetricDef[] = [
  { key: "ad_revenue", label: "Ad Revenue", color: "#f5a623", fmt: "currency" },
  { key: "ad_revenue_pm", label: "Ad Revenue PM", color: "#fbbf24", fmt: "currency" },
  { key: "ad_revenue_py", label: "Ad Revenue PY", color: "#22d3ee", fmt: "currency" },

  { key: "ad_spend", label: "Ad Spend", color: "#6366f1", fmt: "currency" },
  { key: "ad_spend_pm", label: "Ad Spend PM", color: "#7c3aed", fmt: "currency" },
  { key: "ad_spend_py", label: "Ad Spend PY", color: "#ff4d4f", fmt: "currency" },

  { key: "organic_sales", label: "Organic Sales", color: "#1f8f3a", fmt: "currency" },
  { key: "organic_sales_pm", label: "Organic Sales PM", color: "#e56a1f", fmt: "currency" },
  { key: "organic_sales_py", label: "Organic Sales PY", color: "#1f77b4", fmt: "currency" },

  { key: "product_sales", label: "Product Sales", color: "#111111", fmt: "currency" },
  { key: "product_sales_pm", label: "Product Sales PM", color: "#7b7f82", fmt: "currency" },
  { key: "product_sales_py", label: "Product Sales PY", color: "#d6d6d6", fmt: "currency" },

  { key: "acos", label: "ACoS", color: "#ff5a5a", fmt: "pct" },
  { key: "acos_pm", label: "ACoS PM", color: "#c3c3c3", fmt: "pct" },
  { key: "acos_py", label: "ACoS PY", color: "#8f9499", fmt: "pct" },

  { key: "roas", label: "RoAS", color: "#4fc3f7", fmt: "ratio" },
  { key: "roas_pm", label: "RoAS PM", color: "#f7b29c", fmt: "ratio" },
  { key: "roas_py", label: "RoAS PY", color: "#d5a6bd", fmt: "ratio" },

  { key: "tacos", label: "TACoS", color: "#2c97c9", fmt: "pct" },
  { key: "tacos_pm", label: "TACoS PM", color: "#2f2f2f", fmt: "pct" },
  { key: "tacos_py", label: "TACoS PY", color: "#00796b", fmt: "pct" },
];

function fmtCurrency(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number) {
  return `${n.toFixed(0)}%`;
}

function fmtRatio(n: number) {
  return n.toFixed(2);
}

function applyFmt(n: number, fmt: FmtType) {
  if (fmt === "currency") return fmtCurrency(n);
  if (fmt === "pct") return fmtPct(n);
  return fmtRatio(n);
}

function fmtDate(s: string) {
  return new Date(`${s}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

export function PeriodComparativeChart({
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
  const [result, setResult] = useState<{ key: string; data: ApiResponse | null } | null>(null);
  const [selected, setSelected] = useState<Set<MetricKey>>(
    new Set(["ad_revenue", "ad_revenue_pm", "ad_revenue_py"])
  );

  useEffect(() => {
    if (!accountId || !start || !end) return;

    let ignore = false;
    fetch(`/api/reports/period-comparative?accountId=${accountId}&start=${start}&end=${end}`)
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

  const toggle = (key: MetricKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(METRICS.map((m) => m.key)));
  };

  const activeDefs = METRICS.filter((m) => selected.has(m.key));

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.daily.map((row) => {
      const point: Record<string, number | string> = {
        date: fmtDate(row.report_date),
      };
      METRICS.forEach((m) => {
        point[m.key] = row[m.key] ?? 0;
      });
      return point;
    });
  }, [data]);

  const axisFmt: FmtType = useMemo(() => {
    if (activeDefs.some((m) => m.fmt === "currency")) return "currency";
    if (activeDefs.some((m) => m.fmt === "pct")) return "pct";
    return "ratio";
  }, [activeDefs]);

  if (loading) {
    return <div className="rounded-b-xl border border-[#F7BF1D] border-t-0 bg-[#3C4043] animate-pulse h-[620px]" />;
  }

  if (!data) return null;

  return (
    <div className="rounded-b-xl border border-[#F7BF1D] border-t-0 bg-[#2C2B35] p-3">
      <div className="grid grid-cols-[165px_1fr] gap-3">
        {/* Selector lateral */}
        <div className="rounded-xl bg-[#3C4043] p-3 min-h-[560px]">
          

          <button
            onClick={selectAll}
            className="flex items-center gap-2 text-left text-[11px] font-semibold text-[#F7BF1D] mb-3"
          >
            <span className="inline-block size-3 bg-[#202124] border border-[#202124]" />
            Select All 
          </button>

          <div className="flex flex-col gap-2">
            {METRICS.map((m) => (
              <label
                key={m.key}
                className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-[#F7BF1D]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.key)}
                  onChange={() => toggle(m.key)}
                  className="accent-[#F7BF1D] size-3.5"
                />
                <span>{m.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Gráfica */}
        <div className="rounded-[18px] overflow-hidden border border-[#3C4043] bg-[#efefef]">
          <div className="bg-[#3C4043] px-4 py-2">
            <h3 className="text-sm font-semibold text-[#F7BF1D] text-center">Sales</h3>
          </div>

          <div className="p-4">
            {activeDefs.length === 0 ? (
              <div className="flex items-center justify-center h-[500px] text-sm text-black">
                Selecciona al menos una métrica
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={500}>
                <LineChart data={chartData} margin={{ top: 12, right: 180, left: 10, bottom: 20 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#000000" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(v) => fmtCurrency(Number(v))}
                    tick={{ fontSize: 10, fill: "#000000" }}
                    tickLine={false}
                    axisLine={false}
                  />

                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                    tick={{ fontSize: 10, fill: "#000000" }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, "auto"]}
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
                      const def = METRICS.find((m) => m.key === name);
                      return [
                        def ? applyFmt(Number(value), def.fmt) : value,
                        def?.label ?? String(name),
                      ];
                    }}
                  />

                  <Legend
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{
                      fontSize: "12px",
                      color: "#000000",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      lineHeight: "18px",
                    }}
                    formatter={(value) => {
                      const def = METRICS.find((m) => m.key === value);
                      return <span style={{ color: "#000000" }}>{def?.label ?? value}</span>;
                    }}
                  />

                  {activeDefs.map((m) => {
                    const useRightAxis = m.fmt === "pct";

                    return (
                      <Line
                        key={m.key}
                        yAxisId={useRightAxis ? "right" : "left"}
                        type="monotone"
                        dataKey={m.key}
                        name={m.key}
                        stroke={m.color}
                        strokeWidth={2.2}
                        dot={{ r: 4, fill: m.color }}
                        activeDot={{ r: 5 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

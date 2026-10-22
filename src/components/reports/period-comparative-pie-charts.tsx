"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/no-array-index-as-key */

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface Totals {
  product_sales: number;
  ad_spend: number;
  ad_revenue: number;
  total_order_items: number;
  product_quantity: number;
  organic_sales: number;
  acos: number;
  roas: number;
  tacos: number;
  avg_units_per_order: number;
  avg_sales_per_order: number;
}

interface ApiResponse {
  summary: {
    current: Totals;
    pm: Totals;
    py: Totals;
  };
}

const ORANGE = "#F7BF1D";
const DARK = "#3C4043";
const PIE_COLORS = [ORANGE, DARK];

function fmtCurrency(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)} M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(2)} K`;
  return `$${n.toFixed(2)}`;
}

function fmtNum(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPct(n: number) {
  return `${n.toFixed(2)}%`;
}

function fmtRatio(n: number) {
  return n.toFixed(2);
}

type MetricCard = {
  title: string;
  key: keyof Totals;
  fmt: (n: number) => string;
  lowerIsBetter?: boolean;
};

const PIE_CARDS: MetricCard[] = [
  { title: "Units Ordered", key: "product_quantity", fmt: fmtNum },
  { title: "Sales", key: "product_sales", fmt: fmtCurrency },
  { title: "Organic Sales", key: "organic_sales", fmt: fmtCurrency },
  { title: "Ad Revenue", key: "ad_revenue", fmt: fmtCurrency },
  { title: "Ad Spend", key: "ad_spend", fmt: fmtCurrency },
  { title: "ACoS", key: "acos", fmt: fmtPct, lowerIsBetter: true },
  { title: "RoAS", key: "roas", fmt: fmtRatio },
  { title: "TACoS", key: "tacos", fmt: fmtPct, lowerIsBetter: true },
];

function MetricDelta({
  current,
  pm,
  fmt,
  lowerIsBetter,
}: {
  current: number;
  pm: number;
  fmt: (n: number) => string;
  lowerIsBetter?: boolean;
}) {
  const delta = current - pm;
  const positive = lowerIsBetter ? delta <= 0 : delta >= 0;

  return (
    <div className={`mt-2 text-[12px] font-bold ${positive ? "text-green-700" : "text-red-500"}`}>
      {delta >= 0 ? "▲" : "▼"} {fmt(Math.abs(delta))}
    </div>
  );
}

function PieMetricCard({
  title,
  current,
  pm,
  fmt,
  lowerIsBetter,
}: {
  title: string;
  current: number;
  pm: number;
  fmt: (n: number) => string;
  lowerIsBetter?: boolean;
}) {
  const pieData = [
    { name: title, value: Math.abs(current) },
    { name: `${title} PM`, value: Math.abs(pm) },
  ];

  const total = pieData[0].value + pieData[1].value || 1;

  return (
    <div className="rounded-2xl border border-[#F7BF1D] bg-[#2C2B35] overflow-hidden">
      <div className="grid grid-cols-[105px_1fr] min-h-[235px]">
        <div className="p-3">
          <div className="text-[12px] font-semibold text-black leading-none">{title}</div>
          <div className="mt-1 text-[18px] font-bold text-white whitespace-nowrap">{fmt(current)}</div>

          <div className="mt-4 text-[12px] font-semibold text-black leading-none">
            {title} PM
          </div>
          <div className="mt-1 text-[18px] font-bold text-white whitespace-nowrap">{fmt(pm)}</div>

          <div className="mt-4 text-[12px] font-semibold text-black leading-none">
            {title} MoM
          </div>
          <MetricDelta current={current} pm={pm} fmt={fmt} lowerIsBetter={lowerIsBetter} />
        </div>

        <div className="p-2 pl-1">
          <div className="rounded-2xl overflow-hidden border border-[#3C4043] bg-white h-full">
            <div className="bg-[#3C4043] px-3 py-1.5">
              <h3 className="text-sm font-semibold text-[#F7BF1D] text-center">{title}</h3>
            </div>

            <div className="h-[205px] p-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    outerRadius={57}
                    innerRadius={0}
                    label={({ value, x, y, cx }) => {
                      const pct = (Number(value) / total) * 100;
                      const display = fmt(Number(value));
                      return (
                        <text
                          x={x}
                          y={y}
                          fill="#374151"
                          textAnchor={x > cx ? "start" : "end"}
                          dominantBaseline="central"
                          fontSize={9}
                        >
                          {`${display} (${pct.toFixed(2)}%)`}
                        </text>
                      );
                    }}
                    labelLine
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    layout="horizontal"
                    align="center"
                    iconSize={8}
                    wrapperStyle={{
                      fontSize: "9px",
                      color: "#000000",
                      paddingTop: "0px",
                      display: "flex",
                      justifyContent: "center",
                      width: "100%",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PeriodComparativePieCharts({
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

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-4 animate-pulse">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[235px] rounded-2xl bg-[#2C2B35]" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const { current, pm } = data.summary;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {PIE_CARDS.map((card) => (
        <PieMetricCard
          key={card.key}
          title={card.title}
          current={current[card.key] ?? 0}
          pm={pm[card.key] ?? 0}
          fmt={card.fmt}
          lowerIsBetter={card.lowerIsBetter}
        />
      ))}
    </div>
  );
}

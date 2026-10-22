/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
"use client";

import { useEffect, useState } from "react";

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
  summary: { current: Totals };
}

function fmtCurrency(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)} M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(2)} K`;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtNum(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const HEADER_METRICS = [
  { label: "Total order items", key: "total_order_items" as keyof Totals, fmt: fmtNum },
  { label: "Units ordered", key: "product_quantity" as keyof Totals, fmt: fmtNum },
  { label: "Ordered product sales", key: "product_sales" as keyof Totals, fmt: fmtCurrency },
  { label: "Avg. units/order item", key: "avg_units_per_order" as keyof Totals, fmt: (n: number) => n.toFixed(2) },
  { label: "Avg. sales/order item", key: "avg_sales_per_order" as keyof Totals, fmt: fmtCurrency },
];

export function PeriodComparativeHeader({
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
    return <div className="rounded-xl bg-[#2C2B35] animate-pulse h-16 mb-3" />;
  }

  if (!data) return null;

  const { current } = data.summary;

  return (
    <div className="rounded-t-xl overflow-hidden border border-[#F7BF1D] border-b-0">
      <div className="grid grid-cols-5 bg-[#2C2B35]">
        {HEADER_METRICS.map((m, i) => (
          <div
            key={m.key}
            className={`flex flex-col items-center justify-center px-4 py-3 ${
              i < HEADER_METRICS.length - 1 ? "border-r border-[#d9a315]" : ""
            }`}
          >
            <span className="text-[14px] lg:text-[15px] font-semibold text-black text-center leading-tight mb-1">
              {m.label}
            </span>
            <span className="text-[20px] lg:text-[22px] font-bold text-white tracking-tight whitespace-nowrap">
              {m.fmt(current[m.key] ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

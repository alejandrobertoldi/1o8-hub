/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
"use client";

import { useEffect, useState } from "react";

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
  daily: DailyRow[];
  summary: { current: Totals; pm: Totals; py: Totals };
}

type FmtType = "currency" | "pct" | "ratio";

function fmtCurrency(n: number) {
  if (n === 0) return "";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(n: number) {
  return n === 0 ? "" : `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function fmtRatio(n: number) {
  return n === 0 ? "" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function applyFmt(n: number, fmt: FmtType) {
  if (fmt === "currency") return fmtCurrency(n);
  if (fmt === "pct") return fmtPct(n);
  return fmtRatio(n);
}

function fmtDate(s: string) {
  const d = new Date(`${s}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface ColDef {
  key: keyof DailyRow;
  label: string;
  fmt: FmtType;
}

const COLUMNS: ColDef[] = [
  { key: "ad_revenue", label: "Ad Revenue", fmt: "currency" },
  { key: "ad_revenue_pm", label: "Ad Revenue PM", fmt: "currency" },
  { key: "ad_revenue_py", label: "Ad Revenue PY", fmt: "currency" },

  { key: "ad_spend", label: "Ad Spend", fmt: "currency" },
  { key: "ad_spend_pm", label: "Ad Spend PM", fmt: "currency" },
  { key: "ad_spend_py", label: "Ad Spend PY", fmt: "currency" },

  { key: "organic_sales", label: "Organic Sales", fmt: "currency" },
  { key: "organic_sales_pm", label: "Organic Sales PM", fmt: "currency" },
  { key: "organic_sales_py", label: "Organic Sales PY", fmt: "currency" },

  { key: "product_sales", label: "Product Sales", fmt: "currency" },
  { key: "product_sales_pm", label: "Product Sales PM", fmt: "currency" },
  { key: "product_sales_py", label: "Product Sales PY", fmt: "currency" },

  { key: "acos", label: "ACoS", fmt: "pct" },
  { key: "acos_pm", label: "ACoS PM", fmt: "pct" },
  { key: "acos_py", label: "ACoS PY", fmt: "pct" },

  { key: "roas", label: "RoAS", fmt: "ratio" },
  { key: "roas_pm", label: "RoAS PM", fmt: "ratio" },
  { key: "roas_py", label: "RoAS PY", fmt: "ratio" },

  { key: "tacos", label: "TACoS", fmt: "pct" },
  { key: "tacos_pm", label: "TACoS PM", fmt: "pct" },
  { key: "tacos_py", label: "TACoS PY", fmt: "pct" },
];

export function PeriodComparativeTable({
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
    return <div className="rounded-xl border border-[#F7BF1D] bg-white animate-pulse h-64" />;
  }

  if (!data) return null;

  const rows = data.daily.toSorted(
    (a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime()
  );

  const totals = COLUMNS.reduce((acc, col) => {
    if (col.fmt === "pct" || col.fmt === "ratio") {
      acc[col.key] = 0;
    } else {
      acc[col.key] = rows.reduce((sum, r) => sum + ((r[col.key] as number) ?? 0), 0);
    }
    return acc;
  }, {} as Record<string, number>);

  const sumSpend = totals["ad_spend"] as number;
  const sumRev = totals["ad_revenue"] as number;
  const sumSales = totals["product_sales"] as number;

  const sumSpendPm = totals["ad_spend_pm"] as number;
  const sumRevPm = totals["ad_revenue_pm"] as number;
  const sumSalesPm = totals["product_sales_pm"] as number;

  const sumSpendPy = totals["ad_spend_py"] as number;
  const sumRevPy = totals["ad_revenue_py"] as number;
  const sumSalesPy = totals["product_sales_py"] as number;

  totals["acos"] = sumRev !== 0 ? (sumSpend / sumRev) * 100 : 0;
  totals["acos_pm"] = sumRevPm !== 0 ? (sumSpendPm / sumRevPm) * 100 : 0;
  totals["acos_py"] = sumRevPy !== 0 ? (sumSpendPy / sumRevPy) * 100 : 0;

  totals["roas"] = sumSpend !== 0 ? sumRev / sumSpend : 0;
  totals["roas_pm"] = sumSpendPm !== 0 ? sumRevPm / sumSpendPm : 0;
  totals["roas_py"] = sumSpendPy !== 0 ? sumRevPy / sumSpendPy : 0;

  totals["tacos"] = sumSales !== 0 ? (sumSpend / sumSales) * 100 : 0;
  totals["tacos_pm"] = sumSalesPm !== 0 ? (sumSpendPm / sumSalesPm) * 100 : 0;
  totals["tacos_py"] = sumSalesPy !== 0 ? (sumSpendPy / sumSalesPy) * 100 : 0;

  return (
    <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
      <div className="overflow-auto max-h-[500px] custom-scroll">
        <table
          className="text-xs border-collapse"
          style={{ minWidth: "max-content", width: "100%" }}
        >
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#3C4043] border-b border-[#F7BF1D]">
              <th
                className="sticky left-0 z-30 px-4 py-2.5 text-center font-bold text-[#F7BF1D] whitespace-nowrap border-r border-white/10"
                style={{ minWidth: "110px" }}
              >
                Date
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-2.5 text-center font-semibold text-[#F7BF1D] whitespace-nowrap border-r border-white/10"
                  style={{ minWidth: "120px" }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.report_date}
                className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                  i % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                }`}
              >
                <td
                  className="sticky left-0 z-10 px-4 py-2 text-center font-bold text-black whitespace-nowrap border-r border-gray-200"
                  style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}
                >
                  {fmtDate(row.report_date)}
                </td>

                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className="px-4 py-2 text-right text-black tabular-nums whitespace-nowrap border-r border-gray-100"
                  >
                    {applyFmt((row[col.key] as number) ?? 0, col.fmt)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>

          <tfoot className="sticky bottom-0 z-20">
            <tr className="bg-[#3C4043] border-t border-[#F7BF1D]">
              <td
                className="sticky left-0 z-30 px-4 py-2.5 text-center font-bold text-[#F7BF1D] whitespace-nowrap border-r border-white/10"
              >
                Total
              </td>
              {COLUMNS.map((col) => (
                <td
                  key={col.key}
                  className="px-4 py-2.5 text-right font-bold text-[#F7BF1D] tabular-nums whitespace-nowrap border-r border-white/10"
                >
                  {applyFmt(totals[col.key] ?? 0, col.fmt)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

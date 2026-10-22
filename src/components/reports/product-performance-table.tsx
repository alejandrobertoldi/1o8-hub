/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useEffect, useState } from "react";

interface ProductRow {
  asin: string;
  productTitle: string;
  adSpend: number;
  adRevenue: number;
  acos: number;
  roas: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cvr: number;
  orders: number;
  units: number;
}

interface ProductPerformanceData {
  products: ProductRow[];
}

type SortKey = keyof Omit<ProductRow, "asin" | "productTitle">;
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 opacity-50">↕</span>;
  return <span className="ml-1 text-[#F7BF1D]">{sortDir === "desc" ? "↓" : "↑"}</span>;
}

function fmtCurrency(n: number) {
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number) {
  return `${n.toFixed(2)}%`;
}

function fmtLarge(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function fmtRoas(n: number) {
  return n.toFixed(2);
}

const COLUMNS: { key: SortKey; label: string; fmt: (n: number) => string }[] = [
  { key: "adSpend", label: "Ad Spend", fmt: fmtCurrency },
  { key: "adRevenue", label: "Attributed Sales", fmt: fmtCurrency },
  { key: "orders", label: "Orders", fmt: fmtLarge },
  { key: "units", label: "Units", fmt: fmtLarge },
  { key: "acos", label: "ACoS", fmt: fmtPct },
  { key: "roas", label: "RoAS", fmt: fmtRoas },
  { key: "impressions", label: "Impressions", fmt: fmtLarge },
  { key: "clicks", label: "Clicks", fmt: fmtLarge },
  { key: "cvr", label: "CVR", fmt: fmtPct },
];

export function ProductPerformanceTable({
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
  const [result, setResult] = useState<{ key: string; data: ProductPerformanceData | null } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("adSpend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    if (!accountId || !start || !end) return;

    let ignore = false;
    fetch(`/api/reports/product-performance?accountId=${accountId}&start=${start}&end=${end}`)
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
    return <div className="rounded-xl border border-[#F7BF1D] bg-white p-4 animate-pulse h-64" />;
  }

  if (!data || !data.products) return null;

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = data.products.toSorted((a, b) => {
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const totals = COLUMNS.reduce((acc, col) => {
    if (col.key === "acos" || col.key === "roas" || col.key === "cvr") {
      acc[col.key] = 0;
    } else {
      acc[col.key] = sorted.reduce((sum, r) => sum + Number(r[col.key] ?? 0), 0);
    }
    return acc;
  }, {} as Record<string, number>);

  totals.acos = totals.adRevenue !== 0 ? (totals.adSpend / totals.adRevenue) * 100 : 0;
  totals.roas = totals.adSpend !== 0 ? totals.adRevenue / totals.adSpend : 0;
  totals.cvr = totals.clicks !== 0 ? ((totals.orders ?? 0) / totals.clicks) * 100 : 0;

  return (
    <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
      <div className="px-4 py-3 bg-[#3C4043] grid grid-cols-[180px_1fr_180px] items-center gap-4">
        <span className="text-xs font-semibold text-[#F7BF1D] whitespace-nowrap">
          {sorted.length} products
        </span>

        <h3 className="text-sm font-semibold text-[#F7BF1D] text-center">
          Product Performance
        </h3>

        <div />
      </div>

      <div className="overflow-auto max-h-[500px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#3C4043] border-b border-[#F7BF1D]">
              <th className="text-left px-4 py-2 font-semibold text-[#F7BF1D] whitespace-nowrap">
                ASIN
              </th>
              <th className="text-left px-4 py-2 font-semibold text-[#F7BF1D] whitespace-nowrap">
                Product Title
              </th>

              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="text-right px-4 py-2 font-semibold text-[#F7BF1D]
                             whitespace-nowrap cursor-pointer select-none"
                >
                  {col.label}
                  <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={`${row.asin}-${i}`}
                className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-2 text-black font-bold whitespace-nowrap">
                  {row.asin}
                </td>

                <td className="px-4 py-2 text-black font-bold max-w-[420px] truncate">
                  {row.productTitle}
                </td>

                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className="px-4 py-2 text-right text-black tabular-nums whitespace-nowrap"
                  >
                    {col.fmt(row[col.key] as number)}
                  </td>
                ))}
              </tr>
            ))}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="px-4 py-8 text-center text-black">
                  No products found
                </td>
              </tr>
            )}
          </tbody>

          <tfoot className="sticky bottom-0 z-10">
            <tr className="bg-[#3C4043] border-t border-[#F7BF1D] font-bold">
              <td className="px-4 py-2 text-[#F7BF1D] whitespace-nowrap">Total</td>
              <td className="px-4 py-2 text-[#F7BF1D]" />

              {COLUMNS.map((col) => (
                <td
                  key={col.key}
                  className="px-4 py-2 text-right text-[#F7BF1D] tabular-nums whitespace-nowrap"
                >
                  {col.fmt(totals[col.key])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useEffect, useState } from "react";

interface KeywordRow {
  keyword: string;
  adSpend: number;
  adRevenue: number;
  acos: number;
  roas: number;
  cpc: number;
  adImpressions: number;
  adClicks: number;
  adConversions: number;
  cvr: number;
}

interface KeywordsData {
  keywords: KeywordRow[];
}

type SortKey = keyof Omit<KeywordRow, "keyword">;
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

const COLUMNS: { key: keyof KeywordRow; label: string; fmt: (n: number) => string }[] = [
  { key: "adSpend", label: "Ad Spend", fmt: fmtCurrency },
  { key: "adRevenue", label: "Ad Revenue", fmt: fmtCurrency },
  { key: "acos", label: "ACOS", fmt: fmtPct },
  { key: "roas", label: "RoAS", fmt: fmtRoas },
  { key: "cpc", label: "Avg. CPC", fmt: fmtCurrency },
  { key: "adImpressions", label: "Impressions", fmt: fmtLarge },
  { key: "adClicks", label: "Clicks", fmt: fmtLarge },
  { key: "adConversions", label: "Conversions", fmt: fmtLarge },
  { key: "cvr", label: "CVR", fmt: fmtPct },
];

export function KeywordsTable({
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
  const [result, setResult] = useState<{ key: string; data: KeywordsData | null } | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("adSpend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    if (!accountId || !start || !end) return;
    let ignore = false;
    fetch(`/api/reports/keywords?accountId=${accountId}&start=${start}&end=${end}`)
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

  if (loading) return <div className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse h-64" />;
  if (!data || !data.keywords) return null;

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = data.keywords.filter((r) =>
    r.keyword.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = filtered.toSorted((a, b) => {
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const totals = COLUMNS.reduce((acc, col) => {
    if (col.key === "acos" || col.key === "roas" || col.key === "cpc" || col.key === "cvr") {
      acc[col.key] = 0;
    } else {
      acc[col.key] = sorted.reduce((sum, r) => sum + (r[col.key] as number), 0);
    }
    return acc;
  }, {} as Record<string, number>);

  totals.acos = totals.adRevenue !== 0 ? (totals.adSpend / totals.adRevenue) * 100 : 0;
  totals.roas = totals.adSpend !== 0 ? totals.adRevenue / totals.adSpend : 0;
  totals.cpc = totals.adClicks !== 0 ? totals.adSpend / totals.adClicks : 0;
  totals.cvr = totals.adClicks !== 0 ? (totals.adConversions / totals.adClicks) * 100 : 0;

  return (
  <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
    <div className="px-4 py-3 bg-[#3C4043] grid grid-cols-[180px_1fr_224px] items-center gap-4">
      <span className="text-xs font-semibold text-[#F7BF1D] whitespace-nowrap">
        {sorted.length} keywords
      </span>

      <h3 className="text-sm font-semibold text-[#F7BF1D] text-center">
        Sponsored Products Keywords
      </h3>

      <input
        type="text"
        placeholder="Search keyword…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="text-xs rounded-lg border border-[#F7BF1D] bg-white text-black
                   placeholder:text-gray-400 px-3 py-1.5 w-56 outline-none
                   focus:ring-1 focus:ring-[#F7BF1D]"
      />
    </div>

    <div className="overflow-auto max-h-[500px]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[#3C4043] border-b border-[#F7BF1D]">
            <th className="text-left px-4 py-2 font-semibold text-[#F7BF1D] whitespace-nowrap">
              Keyword
            </th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key as SortKey)}
                className="text-right px-4 py-2 font-semibold text-[#F7BF1D]
                           whitespace-nowrap cursor-pointer select-none"
              >
                {col.label}
                <SortIcon col={col.key as SortKey} sortKey={sortKey} sortDir={sortDir} />
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={`${row.keyword}-${i}`}
              className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <td className="px-4 py-2 text-black font-bold max-w-[220px] truncate">
                {row.keyword}
              </td>
              {COLUMNS.map((col) => (
                <td key={col.key} className="px-4 py-2 text-right text-black tabular-nums">
                  {col.fmt(row[col.key] as number)}
                </td>
              ))}
            </tr>
          ))}

          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-4 py-8 text-center text-black">
                No keywords found
              </td>
            </tr>
          )}
        </tbody>

        <tfoot className="sticky bottom-0 z-10">
          <tr className="bg-[#3C4043] border-t border-[#F7BF1D] font-bold">
            <td className="px-4 py-2 text-[#F7BF1D] whitespace-nowrap">Total</td>
            {COLUMNS.map((col) => (
              <td key={col.key} className="px-4 py-2 text-right text-[#F7BF1D] tabular-nums">
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

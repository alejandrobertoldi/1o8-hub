"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ComposedChart,
  Line,
  CartesianGrid,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrandRow {
  seller_company: string;
  count: number;
}

interface KeywordRow {
  keyword: string;
  asin_count: number;
  best_position: number | null;
}

interface SovData {
  topOrganic: BrandRow[];
  topSponsored: BrandRow[];
  brandOrganic: BrandRow[];
  brandAd: BrandRow[];
  brandKeywords: KeywordRow[];
  competitorKeywords: KeywordRow[];
  keywords: string[];
}

interface BrandDayRow {
  day: string;
  brand_asin_count: number;
  brand_sov_pct: number;
  brand_best_position: number | null;
}

interface CompDayRow {
  day: string;
  competitor_asin_count: number;
  competitor_sov_pct: number;
  competitor_best_position: number | null;
}

interface KeywordSeriesData {
  brandSeries: BrandDayRow[];
  competitorSeries: CompDayRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function fmtDate(s: string) {
  return new Date(`${s}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
      <div className="bg-[#3C4043] px-4 py-2">
        <h3 className="text-sm font-semibold text-[#F7BF1D] text-center">
          {title}
        </h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Horizontal Bar Chart ──────────────────────────────────────────────────────

function HBarChart({
  title,
  data,
  xLabel,
  color,
}: {
  title: string;
  data: BrandRow[];
  xLabel: string;
  color: string;
}) {
  const sorted = data.toSorted((a, b) => a.count - b.count);

  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={Math.max(260, sorted.length * 32)}>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 5, right: 40, left: 10, bottom: 20 }}
        >
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: "#000000" }}
            tickLine={false}
            axisLine={false}
            label={{
              value: xLabel,
              position: "insideBottom",
              offset: -10,
              fill: "#000000",
              fontSize: 10,
            }}
          />
          <YAxis
            type="category"
            dataKey="seller_company"
            tick={{ fontSize: 10, fill: "#000000" }}
            tickLine={false}
            axisLine={false}
            width={130}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              fontSize: "11px",
              color: "#000000",
            }}
            formatter={(v) => [fmtNum(Number(v)), xLabel]}
          />
          <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Keyword Table ─────────────────────────────────────────────────────────────

function KeywordTable({
  title,
  data,
  positionLabel,
}: {
  title: string;
  data: KeywordRow[];
  positionLabel: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = data.filter((r) =>
    r.keyword.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
      <div className="px-4 py-3 bg-[#3C4043] flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-[#F7BF1D] flex-1 text-center">
          {title}
        </h3>
        <input
          type="text"
          placeholder="Search keyword…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs rounded-lg border border-[#F7BF1D] bg-white text-black
                     placeholder:text-gray-400 px-3 py-1.5 w-48 outline-none
                     focus:ring-1 focus:ring-[#F7BF1D]"
        />
      </div>

      <div className="overflow-auto max-h-[400px] custom-scroll">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#3C4043] border-b border-[#F7BF1D]">
              <th className="text-left px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap">
                Keyword
              </th>
              <th className="text-right px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap">
                ASIN(s) in Search Results
              </th>
              <th className="text-right px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap">
                {positionLabel}
              </th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((row, i) => (
              <tr
                key={row.keyword}
                className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                  i % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                }`}
              >
                <td className="px-4 py-2 text-black font-bold">{row.keyword}</td>
                <td className="px-4 py-2 text-right text-black tabular-nums">
                  {fmtNum(row.asin_count)}
                </td>
                <td className="px-4 py-2 text-right text-black tabular-nums">
                  {row.best_position !== null ? fmtNum(row.best_position) : "—"}
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-black">
                  No keywords found
                </td>
              </tr>
            )}
          </tbody>

          <tfoot className="sticky bottom-0 z-10">
            <tr className="bg-[#3C4043] border-t border-[#F7BF1D] font-bold">
              <td className="px-4 py-2.5 text-[#F7BF1D]">Total</td>
              <td className="px-4 py-2.5 text-right text-[#F7BF1D] tabular-nums">
                {fmtNum(filtered.reduce((s, r) => s + r.asin_count, 0))}
              </td>
              <td className="px-4 py-2.5" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-gray-200 bg-white">
        <span className="text-xs text-black">{filtered.length} keywords</span>
      </div>
    </div>
  );
}

// ── Keyword Series Charts ─────────────────────────────────────────────────────

function KeywordSeriesCharts({
  accountId,
  start,
  end,
  keyword,
  refreshKey = 0,
}: {
  accountId: string;
  start: string;
  end: string;
  keyword: string;
  refreshKey?: number;
}) {
  const [data, setData] = useState<KeywordSeriesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId || !start || !end || !keyword) return;

    setLoading(true);
    fetch(
      `/api/reports/share-of-voice-keyword?accountId=${accountId}&start=${start}&end=${end}&keyword=${encodeURIComponent(
        keyword
      )}`
    )
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [accountId, start, end, keyword, refreshKey]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-[#F7BF1D] bg-white animate-pulse h-64" />
        <div className="rounded-xl border border-[#F7BF1D] bg-white animate-pulse h-64" />
      </div>
    );
  }

  if (!data) return null;

  const brandData = data.brandSeries.map((r) => ({
    date: fmtDate(r.day),
    "Brand SOV %": Number(r.brand_sov_pct.toFixed(2)),
    "Brand ASINs": r.brand_asin_count,
    "Brand Best Pos.": r.brand_best_position ?? 0,
  }));

  const compData = data.competitorSeries.map((r) => ({
    date: fmtDate(r.day),
    "Competitor SOV %": Number(r.competitor_sov_pct.toFixed(2)),
    "Competitor ASINs": r.competitor_asin_count,
    "Competitor Best Pos.": r.competitor_best_position ?? 0,
  }));

  return (
    <div className="grid grid-cols-2 gap-4">
      <ChartCard title="Brand Organic Share of Voice by Keyword">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={brandData} margin={{ top: 10, right: 50, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "#000000" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 10, fill: "#000000" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "#000000" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "11px",
                color: "#000000",
              }}
              formatter={(v, n) => [
                String(n).includes("%") ? fmtPct(Number(v)) : fmtNum(Number(v)),
                String(n),
              ]}
            />
            <Legend wrapperStyle={{ fontSize: "11px", color: "#000000" }} />
            <Bar yAxisId="left" dataKey="Brand SOV %" fill="#F7BF1D" opacity={0.85} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="Brand ASINs"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="Brand Best Pos."
              stroke="#22d3ee"
              strokeWidth={2}
              dot={{ r: 3 }}
              strokeDasharray="4 3"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Competitor Organic Share of Voice by Keyword">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={compData} margin={{ top: 10, right: 50, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "#000000" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 10, fill: "#000000" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "#000000" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "11px",
                color: "#000000",
              }}
              formatter={(v, n) => [
                String(n).includes("%") ? fmtPct(Number(v)) : fmtNum(Number(v)),
                String(n),
              ]}
            />
            <Legend wrapperStyle={{ fontSize: "11px", color: "#000000" }} />
            <Bar yAxisId="left" dataKey="Competitor SOV %" fill="#dc2626" opacity={0.85} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="Competitor ASINs"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="Competitor Best Pos."
              stroke="#22d3ee"
              strokeWidth={2}
              dot={{ r: 3 }}
              strokeDasharray="4 3"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ShareOfVoice({
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
  const [data, setData] = useState<SovData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKeyword, setSelectedKeyword] = useState<string>("");

  useEffect(() => {
    if (!accountId || !start || !end) return;

    setLoading(true);
    fetch(`/api/reports/share-of-voice?accountId=${accountId}&start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d.keywords?.length > 0) setSelectedKeyword(d.keywords[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [accountId, start, end, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[#F7BF1D] bg-white animate-pulse h-64"
          />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <HBarChart
          title="Top 10 Brands by Organic Share of Voice"
          data={data.topOrganic}
          xLabel="Count of Organic ASIN(s) in Search Results"
          color="#F7BF1D"
        />
        <HBarChart
          title="Top 10 Brands by Ad Share of Voice"
          data={data.topSponsored}
          xLabel="Count of Advertised ASIN in Search Results"
          color="#3b82f6"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <HBarChart
          title="Brand Organic Share of Voice"
          data={data.brandOrganic}
          xLabel="Count of Organic ASIN(s) in Search Results"
          color="#F7BF1D"
        />
        <HBarChart
          title="Brand Ad Share of Voice"
          data={data.brandAd}
          xLabel="Count of Advertised ASIN in Search Results"
          color="#3b82f6"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <KeywordTable
          title="Brand Keyword Summary"
          data={data.brandKeywords}
          positionLabel="Brand Best Position"
        />
        <KeywordTable
          title="Competitor Keyword Summary"
          data={data.competitorKeywords}
          positionLabel="Competitor Best Position"
        />
      </div>

      <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
        <div className="bg-[#3C4043] px-4 py-3 flex items-center gap-3">
          <span className="text-xs font-semibold text-[#F7BF1D] whitespace-nowrap">
            Filter by keyword:
          </span>
          <select
            value={selectedKeyword}
            onChange={(e) => setSelectedKeyword(e.target.value)}
            className="text-xs rounded-lg border border-[#F7BF1D] bg-white text-black px-3 py-1.5 outline-none focus:ring-1 focus:ring-[#F7BF1D] flex-1 max-w-xs"
          >
            {data.keywords.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedKeyword && (
        <KeywordSeriesCharts
          accountId={accountId}
          start={start}
          end={end}
          keyword={selectedKeyword}
          refreshKey={refreshKey}
        />
      )}
    </div>
  );
}
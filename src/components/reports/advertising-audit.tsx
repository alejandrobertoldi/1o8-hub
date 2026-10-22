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
  Tooltip,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { KeywordsGaps } from "@/components/reports/keywords-gaps";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CampaignTypeRow {
  campaign_type: string;
  campaign_type_name: string;
  ad_spend: number;
  ad_spend_pct: number;
  ad_revenue: number;
  ad_revenue_pct: number;
  acos: number;
  roas: number;
  clicks: number;
  impressions: number;
  ctr: number;
  conversions: number;
  cvr: number;
  orders: number;
  ntb_orders: number;
  ntb_units: number;
  ntb_revenue: number;
}

interface CampaignNameRow {
  campaign_name: string;
  campaign_type: string;
  ad_spend: number;
  ad_spend_pct: number;
  ad_revenue: number;
  ad_revenue_pct: number;
  acos: number;
  roas: number;
  clicks: number;
  impressions: number;
  ctr: number;
  conversions: number;
  cvr: number;
  orders: number;
  ntb_orders: number;
  ntb_units: number;
  ntb_revenue: number;
}

interface DailyRow {
  day: string;
  ad_spend: number;
  ad_revenue: number;
  acos: number;
}

interface SegRow {
  key: string;
  ad_spend: number;
  ad_spend_pct: number;
  ad_revenue: number;
  ad_revenue_pct: number;
  acos: number;
  roas: number;
  clicks: number;
  impressions: number;
  ctr: number;
  conversions: number;
  cvr: number;
  orders: number;
}

interface GapByAsinRow {
  product: string;
  title: string;
  sd_a: number;
  sd_pt: number;
  sp_a: number;
  sp_m_kt: number;
  sp_m_kt_pt: number;
  sp_m_pt: number;
}

interface SummaryTotals {
  ad_spend: number;
  ad_revenue: number;
  acos: number;
}

interface AuditData {
  acosGoal: number;
  campaignTypes: CampaignTypeRow[];
  campaignNames: CampaignNameRow[];
  daily: DailyRow[];
  summaryTotals: SummaryTotals;
  spBrandType: SegRow[];
  spMatchType: SegRow[];
  sbBrandType: SegRow[];
  sbMatchType: SegRow[];
  gapsByAsin: GapByAsinRow[];
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  if (!n) return "$0.00";
  return Number(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtNum(n: number) {
  if (!n) return "0";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPct(n: number) {
  return `${Number(n || 0).toFixed(2)}%`;
}

function fmtRatio(n: number) {
  return Number(n || 0).toFixed(2);
}

function fmtDate(s: string) {
  const d = new Date(`${s}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Colors ────────────────────────────────────────────────────────────────────

const ORANGE = "#F7BF1D";
const DARK = "#3C4043";

const PIE_COLORS = [
  "#F7BF1D",
  "#3C4043",
  "#d9d9d9",
  "#3b4f8a",
  "#7c3aed",
  "#ff5a5a",
  "#16a34a",
  "#0ea5e9",
  "#ea580c",
  "#22d3ee",
];

// ── Shared Wrappers ───────────────────────────────────────────────────────────

function HeaderCard({
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

function YellowFrame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#F7BF1D] bg-[#2C2B35] p-4">
      <h2 className="text-[16px] font-medium text-black text-center mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Donut Chart Large ─────────────────────────────────────────────────────────

const RADIAN = Math.PI / 180;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderOuterLabel = (props: any) => {
  const { cx, cy, midAngle, outerRadius, value, percent } = props;
  if (percent < 0.05) return null;

  const radius = outerRadius + 30;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
        <text
          x={x}
          y={y}
          fill="#000000"
          textAnchor={x > cx ? "start" : "end"}
          dominantBaseline="central"
          fontSize={9}
        >
          <tspan x={x} dy="-0.4em">
            {fmtCurrency(value)}
          </tspan>
          <tspan x={x} dy="1.1em">
            ({(percent * 100).toFixed(2)}%)
          </tspan>
        </text>
      );
};

function DonutChartLarge({
  title,
  data,
}: {
  title: string;
  data: { name: string; value: number }[];
}) {
  return (
    <HeaderCard title={title}>
      <div className="flex gap-6 items-center">
        <div className="flex flex-col gap-2 min-w-[240px]">
          {data.map((d, i) => (
            <div
              key={d.name}
              className="flex items-center gap-1.5 text-[12px] text-black"
            >
              <span
                className="size-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
              />
              <span className="truncate max-w-[220px]">{d.name}</span>
            </div>
          ))}
        </div>

        <div className="flex-1">
          <ResponsiveContainer width="100%" height={320}>
            <PieChart margin={{ top: 35, right: 130, bottom: 35, left: 80 }}>
              <Pie
                data={data}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={105}
                startAngle={90}
                endAngle={-270}
                labelLine={(props: any) => {
                  if (props.percent < 0.05) return <></>;
                  const { cx, cy, midAngle, outerRadius } = props;
                  const r1 = outerRadius + 2;
                  const r2 = outerRadius + 16;
                  const x1 = cx + r1 * Math.cos(-midAngle * RADIAN);
                  const y1 = cy + r1 * Math.sin(-midAngle * RADIAN);
                  const x2 = cx + r2 * Math.cos(-midAngle * RADIAN);
                  const y2 = cy + r2 * Math.sin(-midAngle * RADIAN);
                  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6b7280" strokeWidth={1} />;
                }}
                label={renderOuterLabel}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>

              <Tooltip
                contentStyle={{
                  fontSize: "11px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  color: "#000000",
                }}
                formatter={(v, n) => [fmtCurrency(Number(v)), String(n)]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </HeaderCard>
  );
}

// ── Donut Chart Small ─────────────────────────────────────────────────────────

function DonutChart({
  title,
  data,
}: {
  title: string;
  data: { name: string; value: number }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-2xl overflow-hidden border border-[#3C4043] bg-white">
      <div className="bg-[#3C4043] px-4 py-2">
        <h3 className="text-sm font-semibold text-[#F7BF1D] text-center">
          {title}
        </h3>
      </div>

      <div className="p-4 flex flex-col">
        <ResponsiveContainer width="100%" height={170}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              startAngle={90}
              endAngle={-270}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                fontSize: "10px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                color: "#000000",
              }}
              formatter={(v, n) => [fmtCurrency(Number(v)), String(n)]}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="flex flex-col gap-1 mt-2">
          {data.map((d, i) => (
            <div
              key={d.name}
              className="flex items-center justify-between gap-2 text-[10px] text-black"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                <span className="truncate max-w-[90px]">{d.name}</span>
              </div>
              <span className="tabular-nums text-[10px]">
                {fmtCurrency(d.value)} ({total !== 0 ? ((d.value / total) * 100).toFixed(1) : 0}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Campaign Table ────────────────────────────────────────────────────────────

function CampaignTable({
  title,
  rows,
  nameLabel,
  nameKey,
}: {
  title: string;
  rows: CampaignTypeRow[] | CampaignNameRow[];
  nameLabel: string;
  nameKey: "campaign_type_name" | "campaign_name";
}) {
  const [search, setSearch] = useState("");

  const filtered = rows.filter((r) => {
    const val =
      nameKey === "campaign_type_name"
        ? (r as CampaignTypeRow).campaign_type_name
        : (r as CampaignNameRow).campaign_name;
    return val.toLowerCase().includes(search.toLowerCase());
  });

  const totals = {
    ad_spend: filtered.reduce((s, r) => s + r.ad_spend, 0),
    ad_revenue: filtered.reduce((s, r) => s + r.ad_revenue, 0),
    clicks: filtered.reduce((s, r) => s + r.clicks, 0),
    impressions: filtered.reduce((s, r) => s + r.impressions, 0),
    conversions: filtered.reduce((s, r) => s + r.conversions, 0),
    orders: filtered.reduce((s, r) => s + r.orders, 0),
    ntb_orders: filtered.reduce((s, r) => s + r.ntb_orders, 0),
    ntb_units: filtered.reduce((s, r) => s + r.ntb_units, 0),
    ntb_revenue: filtered.reduce((s, r) => s + r.ntb_revenue, 0),
  };

  const totalAcos =
    totals.ad_revenue !== 0 ? (totals.ad_spend / totals.ad_revenue) * 100 : 0;
  const totalRoas =
    totals.ad_spend !== 0 ? totals.ad_revenue / totals.ad_spend : 0;
  const totalCtr =
    totals.impressions !== 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const totalCvr =
    totals.clicks !== 0 ? (totals.conversions / totals.clicks) * 100 : 0;

  return (
    <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
      <div className="px-4 py-3 bg-[#3C4043] flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-[#F7BF1D] flex-1 text-center">
          {title}
        </h3>

        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs rounded-lg border border-[#F7BF1D] bg-white text-black
                     placeholder:text-gray-400 px-3 py-1.5 w-48 outline-none
                     focus:ring-1 focus:ring-[#F7BF1D]"
        />
      </div>

      <div className="overflow-auto max-h-[400px] custom-scroll">
        <table
          className="text-xs border-collapse"
          style={{ minWidth: "max-content", width: "100%" }}
        >
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#3C4043] border-b border-[#F7BF1D]">
              <th
                className="sticky left-0 z-20 text-left px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap bg-[#3C4043] border-r border-white/10"
                style={{ minWidth: "380px" }}
              >
                {nameLabel}
              </th>

              {[
                "Ad Spend",
                "Ad Spend %",
                "Ad Revenue",
                "Ad Revenue %",
                "ACoS",
                "RoAS",
                "Clicks",
                "Impressions",
                "CTR",
                "Conversions",
                "CVR",
                "Orders",
                "NTB Orders",
                "NTB Units",
                "NTB Revenue",
              ].map((h) => (
                <th
                  key={h}
                  className="text-right px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap border-r border-white/10"
                  style={{ minWidth: "100px" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((row, i) => {
              const name =
                nameKey === "campaign_type_name"
                  ? (row as CampaignTypeRow).campaign_type_name
                  : (row as CampaignNameRow).campaign_name;

              return (
                <tr
                  key={i}
                  className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                    i % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                  }`}
                >
                  <td
                    className="sticky left-0 z-10 px-4 py-2 text-black font-bold border-r border-gray-200"
                    style={{
                      backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb",
                      maxWidth: "380px",
                    }}
                  >
                    <span className="line-clamp-2 leading-tight">{name}</span>
                  </td>

                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtCurrency(row.ad_spend)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtPct(row.ad_spend_pct)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtCurrency(row.ad_revenue)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtPct(row.ad_revenue_pct)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtPct(row.acos)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtRatio(row.roas)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtNum(row.clicks)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtNum(row.impressions)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtPct(row.ctr)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtNum(row.conversions)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtPct(row.cvr)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtNum(row.orders)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtNum(row.ntb_orders)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtNum(row.ntb_units)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-black whitespace-nowrap">{fmtCurrency(row.ntb_revenue)}</td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={16} className="px-4 py-8 text-center text-black">
                  No data found
                </td>
              </tr>
            )}
          </tbody>

          <tfoot className="sticky bottom-0 z-10">
            <tr className="bg-[#3C4043] border-t border-[#F7BF1D] font-bold">
              <td className="sticky left-0 z-20 px-4 py-2.5 text-[#F7BF1D] font-bold border-r border-white/10 bg-[#3C4043]">
                Total
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">{fmtCurrency(totals.ad_spend)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">100.00%</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">{fmtCurrency(totals.ad_revenue)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">100.00%</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">{fmtPct(totalAcos)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">{fmtRatio(totalRoas)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">{fmtNum(totals.clicks)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">{fmtNum(totals.impressions)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">{fmtPct(totalCtr)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">{fmtNum(totals.conversions)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">{fmtPct(totalCvr)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">{fmtNum(totals.orders)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">{fmtNum(totals.ntb_orders)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">{fmtNum(totals.ntb_units)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#F7BF1D] whitespace-nowrap">{fmtCurrency(totals.ntb_revenue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-gray-200 bg-white">
        <span className="text-xs text-black">{filtered.length} rows</span>
      </div>
    </div>
  );
}

// ── Daily Chart ───────────────────────────────────────────────────────────────

function DailyChart({
  data,
  totals,
  acosGoal,
}: {
  data: DailyRow[];
  totals: SummaryTotals;
  acosGoal: number;
}) {
  const chartData = data.map((r) => ({
    ...r,
    date: fmtDate(r.day),
    acos_goal: acosGoal,
  }));

  return (
    <HeaderCard title="Total Sales, Ad Spend, Ad Revenue & ACoS">
      <div className="flex gap-3 mb-4">
        <div className="flex-1 rounded-lg bg-[#3C4043] px-4 py-2.5 text-center">
          <p className="text-[10px] text-[#F7BF1D]">Ad Spend</p>
          <p className="text-sm font-bold text-white">
            {fmtCurrency(totals.ad_spend)}
          </p>
        </div>

        <div className="flex-1 rounded-lg bg-[#3C4043] px-4 py-2.5 text-center">
          <p className="text-[10px] text-[#F7BF1D]">Ad Revenue</p>
          <p className="text-sm font-bold text-white">
            {fmtCurrency(totals.ad_revenue)}
          </p>
        </div>

        <div className="flex-1 rounded-lg bg-[#3C4043] px-4 py-2.5 text-center">
          <p className="text-[10px] text-[#F7BF1D]">ACoS</p>
          <p
            className={`text-sm font-bold ${
              totals.acos <= acosGoal ? "text-green-400" : "text-red-400"
            }`}
          >
            {fmtPct(totals.acos)}
          </p>
        </div>

        <div className="flex-1 rounded-lg bg-[#3C4043] px-4 py-2.5 text-center">
          <p className="text-[10px] text-[#F7BF1D]">ACoS Goal</p>
          <p className="text-sm font-bold text-white">
            {fmtPct(acosGoal)}
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 60, left: 10, bottom: 10 }}
          barCategoryGap="10%"
          barSize={80}
        >
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
            tickFormatter={(v) => fmtCurrency(Number(v))}
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
            formatter={(v, n) => {
              const name = String(n);

              if (name.includes("ACoS")) {
                return [fmtPct(Number(v)), name];
              }

              return [fmtCurrency(Number(v)), name];
            }}
          />

          <Legend
  wrapperStyle={{
    fontSize: "11px",
    paddingTop: "8px",
    color: "#000000",
  }}
  content={() => (
    <div className="flex items-center justify-center gap-5 text-[11px] pt-2">
      <div className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-[#22c55e]" />
        <span className="text-[#22c55e]">ACoS (&lt;= Goal)</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-[#ef4444]" />
        <span className="text-[#ef4444]">ACoS (&gt; Goal)</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="w-5 border-t-2 border-dashed border-[#F7BF1D]" />
        <span className="text-[#F7BF1D]">ACoS Goal ({fmtPct(acosGoal)})</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="w-5 border-t-2 border-[#94a3b8]" />
        <span className="text-[#94a3b8]">Ad Revenue</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="w-5 border-t-2 border-[#3C4043]" />
        <span className="text-[#3C4043]">Ad Spend</span>
      </div>
    </div>
  )}
/>

          <Bar
            yAxisId="left"
            dataKey="acos"
            name="ACoS"
            radius={[3, 3, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`acos-cell-${index}`}
                fill={Number(entry.acos) <= acosGoal ? "#22c55e" : "#ef4444"}
              />
            ))}
          </Bar>

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="acos_goal"
            name={`ACoS Goal (${fmtPct(acosGoal)})`}
            stroke="#F7BF1D"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
          />

          <Line
            yAxisId="right"
            type="monotone"
            dataKey="ad_revenue"
            name="Ad Revenue"
            stroke="#94a3b8"
            strokeWidth={2}
            dot={{ r: 3 }}
          />

          <Line
            yAxisId="right"
            type="monotone"
            dataKey="ad_spend"
            name="Ad Spend"
            stroke="#3C4043"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </HeaderCard>
  );
}

// ── Segmentation Table ────────────────────────────────────────────────────────

function SegmentationTable({
  title,
  rows,
}: {
  title: string;
  rows: SegRow[];
}) {
  const totals = {
    ad_spend: rows.reduce((s, r) => s + r.ad_spend, 0),
    ad_revenue: rows.reduce((s, r) => s + r.ad_revenue, 0),
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    conversions: rows.reduce((s, r) => s + r.conversions, 0),
    orders: rows.reduce((s, r) => s + r.orders, 0),
  };

  const totalAcos =
    totals.ad_revenue !== 0 ? (totals.ad_spend / totals.ad_revenue) * 100 : 0;
  const totalRoas =
    totals.ad_spend !== 0 ? totals.ad_revenue / totals.ad_spend : 0;
  const totalCtr =
    totals.impressions !== 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const totalCvr =
    totals.clicks !== 0 ? (totals.conversions / totals.clicks) * 100 : 0;

  return (
    <div className="rounded-2xl overflow-hidden border border-[#3C4043] bg-white">
      <div className="bg-[#3C4043] px-4 py-2">
        <h3 className="text-sm font-semibold text-[#F7BF1D] text-center">
          {title}
        </h3>
      </div>

      <div className="overflow-auto custom-scroll">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#3C4043] border-b border-[#F7BF1D]">
              {[
                "",
                "Ad Spend",
                "Ad Spend %",
                "Ad Revenue",
                "Ad Revenue %",
                "ACOS",
                "RoAS",
                "Clicks",
                "Impressions",
                "CTR",
                "Conversions",
                "CVR",
                "Orders",
              ].map((h, i) => (
                <th
                  key={i}
                  className={`px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap border-r border-white/10 ${
                    i === 0 ? "text-left" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={`border-b border-gray-200 hover:bg-gray-50 ${
                  i % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                }`}
              >
                <td className="px-4 py-2 text-black font-bold whitespace-nowrap">
                  {row.key}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-black">{fmtCurrency(row.ad_spend)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-black">{fmtPct(row.ad_spend_pct)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-black">{fmtCurrency(row.ad_revenue)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-black">{fmtPct(row.ad_revenue_pct)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-black">{fmtPct(row.acos)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-black">{fmtRatio(row.roas)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-black">{fmtNum(row.clicks)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-black">{fmtNum(row.impressions)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-black">{fmtPct(row.ctr)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-black">{fmtNum(row.conversions)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-black">{fmtPct(row.cvr)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-black">{fmtNum(row.orders)}</td>
              </tr>
            ))}
          </tbody>

          <tfoot className="sticky bottom-0 z-10">
            <tr className="bg-[#3C4043] border-t border-[#F7BF1D] font-bold">
              <td className="px-4 py-2.5 text-[#F7BF1D]">Total</td>
              <td className="px-4 py-2.5 text-right text-[#F7BF1D] tabular-nums">{fmtCurrency(totals.ad_spend)}</td>
              <td className="px-4 py-2.5 text-right text-[#F7BF1D]">100.00%</td>
              <td className="px-4 py-2.5 text-right text-[#F7BF1D] tabular-nums">{fmtCurrency(totals.ad_revenue)}</td>
              <td className="px-4 py-2.5 text-right text-[#F7BF1D]">100.00%</td>
              <td className="px-4 py-2.5 text-right text-[#F7BF1D] tabular-nums">{fmtPct(totalAcos)}</td>
              <td className="px-4 py-2.5 text-right text-[#F7BF1D] tabular-nums">{fmtRatio(totalRoas)}</td>
              <td className="px-4 py-2.5 text-right text-[#F7BF1D] tabular-nums">{fmtNum(totals.clicks)}</td>
              <td className="px-4 py-2.5 text-right text-[#F7BF1D] tabular-nums">{fmtNum(totals.impressions)}</td>
              <td className="px-4 py-2.5 text-right text-[#F7BF1D] tabular-nums">{fmtPct(totalCtr)}</td>
              <td className="px-4 py-2.5 text-right text-[#F7BF1D] tabular-nums">{fmtNum(totals.conversions)}</td>
              <td className="px-4 py-2.5 text-right text-[#F7BF1D] tabular-nums">{fmtPct(totalCvr)}</td>
              <td className="px-4 py-2.5 text-right text-[#F7BF1D] tabular-nums">{fmtNum(totals.orders)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Segmentation Block ────────────────────────────────────────────────────────

function SegmentationBlock({
  title,
  brandRows,
  matchRows,
}: {
  title: string;
  brandRows: SegRow[];
  matchRows: SegRow[];
}) {
  const spendByBrand = brandRows.map((r) => ({ name: r.key, value: r.ad_spend }));
  const revByBrand = brandRows.map((r) => ({ name: r.key, value: r.ad_revenue }));
  const spendByMatch = matchRows.map((r) => ({ name: r.key, value: r.ad_spend }));
  const revByMatch = matchRows.map((r) => ({ name: r.key, value: r.ad_revenue }));

  return (
    <YellowFrame title={title}>
      <div className="grid grid-cols-[280px_280px_1fr] gap-4 items-start">
        <DonutChart title="Ad Spend by Brand Type" data={spendByBrand} />
        <DonutChart title="Ad Revenue by Brand Type" data={revByBrand} />
        <SegmentationTable title="Segmentation by Brand Type" rows={brandRows} />
      </div>

      <div className="grid grid-cols-[280px_280px_1fr] gap-4 items-start mt-6">
        <DonutChart title="Ad Spend by Match Type" data={spendByMatch} />
        <DonutChart title="Ad Revenue by Match Type" data={revByMatch} />
        <SegmentationTable title="Segmentation by Match Type" rows={matchRows} />
      </div>
    </YellowFrame>
  );
}

// ── Gaps by ASIN Table ────────────────────────────────────────────────────────

const GAPS_COLS: { key: keyof GapByAsinRow; label: string }[] = [
  { key: "sd_a", label: "SD A" },
  { key: "sd_pt", label: "SD PT" },
  { key: "sp_a", label: "SP A" },
  { key: "sp_m_kt", label: "SP M KT" },
  { key: "sp_m_kt_pt", label: "SP M KT + SP M PT" },
  { key: "sp_m_pt", label: "SP M PT" },
];

function GapsByAsinTable({ rows }: { rows: GapByAsinRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = rows.filter(
    (r) =>
      r.product.toLowerCase().includes(search.toLowerCase()) ||
      r.title.toLowerCase().includes(search.toLowerCase())
  );

  const totals = GAPS_COLS.reduce((acc, col) => {
    acc[col.key as string] = filtered.reduce((s, r) => s + (r[col.key] as number), 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
      <div className="px-4 py-3 bg-[#3C4043] grid grid-cols-[160px_1fr_240px] items-center gap-4">
        <span className="text-xs font-semibold text-[#F7BF1D] whitespace-nowrap">
          {filtered.length} products
        </span>

        <h3 className="text-sm font-semibold text-[#F7BF1D] text-center">
          Keywords Gaps by ASIN
        </h3>

        <input
          type="text"
          placeholder="Search ASIN or title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs rounded-lg border border-[#F7BF1D] bg-white text-black
                     placeholder:text-gray-400 px-3 py-1.5 w-full outline-none
                     focus:ring-1 focus:ring-[#F7BF1D]"
        />
      </div>

      <div className="overflow-auto max-h-[500px] custom-scroll">
        <table className="w-full text-xs border-collapse table-fixed">
          <colgroup>
            <col style={{ width: "130px" }} />
            <col />
            {GAPS_COLS.map((col) => (
              <col key={col.key as string} style={{ width: "88px" }} />
            ))}
          </colgroup>

          <thead className="sticky top-0 z-10">
            <tr className="bg-[#3C4043] border-b border-[#F7BF1D]">
              <th className="sticky left-0 z-20 text-center px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap bg-[#3C4043] border-r border-white/10">
                ASIN
              </th>

              <th className="text-center px-4 py-2.5 font-semibold text-[#F7BF1D] whitespace-nowrap border-r border-white/10">
                Title
              </th>

              {GAPS_COLS.map((col) => (
                <th
                  key={col.key as string}
                  className="text-center px-1 py-2.5 font-semibold text-[#F7BF1D] whitespace-normal leading-tight border-r border-white/10"
                >
                  {col.label === "SP M KT + SP M PT" ? (
                    <>
                      SP M KT +
                      <br />
                      SP M PT
                    </>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((row, i) => (
              <tr
                key={`${row.product}-${i}`}
                className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                  i % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                }`}
              >
                <td
                  className="sticky left-0 z-10 px-4 py-2 font-bold text-black whitespace-nowrap border-r border-gray-200"
                  style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}
                >
                  {row.product}
                </td>

                <td className="px-4 py-2 text-black">
                  <span className="block leading-tight text-[11px]">
                    {row.title}
                  </span>
                </td>

                {GAPS_COLS.map((col) => (
                  <td
                    key={col.key as string}
                    className="px-1 py-2 text-right tabular-nums text-black whitespace-nowrap"
                  >
                    {fmtCurrency(row[col.key] as number)}
                  </td>
                ))}
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-black">
                  No data found
                </td>
              </tr>
            )}
          </tbody>

          <tfoot className="sticky bottom-0 z-10">
            <tr className="bg-[#3C4043] border-t border-[#F7BF1D] font-bold">
              <td className="sticky left-0 z-20 px-4 py-2.5 text-[#F7BF1D] font-bold border-r border-white/10 bg-[#3C4043]">
                Total
              </td>

              <td className="px-4 py-2.5 bg-[#3C4043]" />

              {GAPS_COLS.map((col) => (
                <td
                  key={col.key as string}
                  className="px-1 py-2.5 text-right text-[#F7BF1D] tabular-nums whitespace-nowrap"
                >
                  {fmtCurrency(totals[col.key as string])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AdvertisingAudit({
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
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId || !start || !end) return;
    setLoading(true);

    fetch(`/api/reports/advertising-audit?accountId=${accountId}&start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [accountId, start, end, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[#F7BF1D] bg-white animate-pulse h-64"
          />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const spendByType = data.campaignTypes.map((r) => ({
    name: r.campaign_type_name,
    value: r.ad_spend,
  }));

  const revenueByType = data.campaignTypes.map((r) => ({
    name: r.campaign_type_name,
    value: r.ad_revenue,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <DonutChartLarge
          title="Ad Spend por Campaign Type Name"
          data={spendByType}
        />
        <DonutChartLarge
          title="Ad Revenue por Campaign Type Name"
          data={revenueByType}
        />
      </div>

      <CampaignTable
        title="Campaign Performance by Campaign Type"
        rows={data.campaignTypes}
        nameLabel="Campaign Type Name"
        nameKey="campaign_type_name"
      />

      <CampaignTable
        title="Campaign Performance by Campaign Name"
        rows={data.campaignNames}
        nameLabel="Campaign Name"
        nameKey="campaign_name"
      />

      <DailyChart
  data={data.daily}
  totals={data.summaryTotals}
  acosGoal={data.acosGoal}
/>

      <SegmentationBlock
        title="Sponsored Products - Segmentation"
        brandRows={data.spBrandType}
        matchRows={data.spMatchType}
      />

      <SegmentationBlock
        title="Sponsored Brands - Segmentation"
        brandRows={data.sbBrandType}
        matchRows={data.sbMatchType}
      />

      {/* Wrapper visual para Keywords Gaps */}
      <YellowFrame title="Sponsored Products - Keywords Gaps">
        <KeywordsGaps accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
      </YellowFrame>

      <GapsByAsinTable rows={data.gapsByAsin} />
    </div>
  );
}
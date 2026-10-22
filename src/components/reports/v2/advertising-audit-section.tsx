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
  ReferenceLine,
} from "recharts";
import { KeywordsGapsV2 } from "./keywords-gaps-v2";
import { Surface } from "./primitives/surface";
import { ChartFrame } from "./primitives/chart-frame";
import { getSurfacePalette, type Surface as SurfaceKind } from "./primitives/palette";

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

type CampaignNameRow = Omit<CampaignTypeRow, "campaign_type_name"> & { campaign_name: string };

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
  return new Date(`${s}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Palette: validated categorical slots (dataviz validator, white surface),
//    slate for any tail past slot 4; band colors for ACoS vs goal; a 2px
//    surface-color stroke separates pie segments. ──
const SLOT_COLORS = ["#F7BF1D", "#006BBB", "#05893E", "#653CBD"];
const TAIL_COLOR = "#94A3B8";
const GOOD = "#18864B";
const BAD = "#C73737";
const SPEND_LINE = "#65418A";
const AXIS_TICK = { fontSize: 10, fill: "#6E6C77" };
const TOOLTIP_STYLE = { borderRadius: 8, border: "1px solid #D8D7DC", fontSize: 11 };

function sliceColor(i: number): string {
  return i < SLOT_COLORS.length ? SLOT_COLORS[i] : TAIL_COLOR;
}

// eyebrowClass comes from getSurfacePalette(surface).eyebrowClass — the hub brand
// class on hub, "text-portal-accent" on portal. primitives/palette.test.ts bans
// the hub brand class from the portal palette, so it must never be inlined here.
//
// NB: this comment deliberately does not spell that class name, because Task 5's
// guard scans this file's source for that literal.
function SectionHeading({ eyebrowClass, children }: { eyebrowClass: string; children: React.ReactNode }) {
  return <h2 className={`m-0 mb-3.5 text-[18px] font-bold tracking-tight ${eyebrowClass}`}>{children}</h2>;
}

// ── Donuts ────────────────────────────────────────────────────────────────────
const RADIAN = Math.PI / 180;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderOuterLabel = (props: any) => {
  const { cx, cy, midAngle, outerRadius, value, percent } = props;
  if (percent < 0.05) return null;
  const radius = outerRadius + 28;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#2C2B35" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={9}>
      <tspan x={x} dy="-0.4em">{fmtCurrency(value)}</tspan>
      <tspan x={x} dy="1.1em">({(percent * 100).toFixed(1)}%)</tspan>
    </text>
  );
};

function DonutChartLarge({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  if (data.length === 0) {
    return (
      <Surface title={title} subtitle="Share of total in the selected range">
        <div className="p-[18px] text-xs text-mf-muted">No available data for the period.</div>
      </Surface>
    );
  }

  return (
    <ChartFrame title={title} subtitle="Share of total in the selected range">
      <div className="flex items-center gap-6">
        <div className="flex min-w-[220px] flex-col gap-2">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center gap-1.5 text-[12px] text-mf-ink">
              <span className="size-3 flex-shrink-0 rounded-full" style={{ backgroundColor: sliceColor(i) }} />
              <span className="max-w-[210px] truncate">{d.name}</span>
            </div>
          ))}
        </div>
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart margin={{ top: 32, right: 110, bottom: 32, left: 70 }}>
              <Pie
                data={data}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={100}
                startAngle={90}
                endAngle={-270}
                stroke="#FEFEFE"
                strokeWidth={2}
                label={renderOuterLabel}
                isAnimationActive={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={sliceColor(i)} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "#2C2B35" }} formatter={(v, n) => [fmtCurrency(Number(v)), String(n)]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartFrame>
  );
}

function DonutChartSmall({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);

  if (data.length === 0) {
    return (
      <Surface title={title}>
        <div className="p-[18px] text-xs text-mf-muted">No available data for the period.</div>
      </Surface>
    );
  }

  return (
    <Surface title={title}>
      <div className="flex flex-col p-[18px] pt-3">
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={66}
              startAngle={90}
              endAngle={-270}
              stroke="#FEFEFE"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={sliceColor(i)} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ ...TOOLTIP_STYLE, fontSize: 10 }} itemStyle={{ color: "#2C2B35" }} formatter={(v, n) => [fmtCurrency(Number(v)), String(n)]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-2 flex flex-col gap-1">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center justify-between gap-2 text-[10px] text-mf-ink">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: sliceColor(i) }} />
                <span className="max-w-[90px] truncate">{d.name}</span>
              </div>
              <span className="tabular-nums text-mf-muted">
                {fmtCurrency(d.value)} ({total !== 0 ? ((d.value / total) * 100).toFixed(1) : 0}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </Surface>
  );
}

// ── Campaign tables ───────────────────────────────────────────────────────────
const CAMPAIGN_HEADERS = [
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
];

function campaignCells(row: CampaignTypeRow | CampaignNameRow): string[] {
  return [
    fmtCurrency(row.ad_spend),
    fmtPct(row.ad_spend_pct),
    fmtCurrency(row.ad_revenue),
    fmtPct(row.ad_revenue_pct),
    fmtPct(row.acos),
    fmtRatio(row.roas),
    fmtNum(row.clicks),
    fmtNum(row.impressions),
    fmtPct(row.ctr),
    fmtNum(row.conversions),
    fmtPct(row.cvr),
    fmtNum(row.orders),
    fmtNum(row.ntb_orders),
    fmtNum(row.ntb_units),
    fmtCurrency(row.ntb_revenue),
  ];
}

function CampaignTable({
  title,
  rows,
  nameLabel,
  nameKey,
}: {
  title: string;
  rows: (CampaignTypeRow | CampaignNameRow)[];
  nameLabel: string;
  nameKey: "campaign_type_name" | "campaign_name";
}) {
  const [search, setSearch] = useState("");

  const nameOf = (r: CampaignTypeRow | CampaignNameRow) =>
    nameKey === "campaign_type_name" ? (r as CampaignTypeRow).campaign_type_name : (r as CampaignNameRow).campaign_name;

  const filtered = rows.filter((r) => nameOf(r).toLowerCase().includes(search.toLowerCase()));

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
  const totalCells = [
    fmtCurrency(totals.ad_spend),
    "100.00%",
    fmtCurrency(totals.ad_revenue),
    "100.00%",
    fmtPct(totals.ad_revenue !== 0 ? (totals.ad_spend / totals.ad_revenue) * 100 : 0),
    fmtRatio(totals.ad_spend !== 0 ? totals.ad_revenue / totals.ad_spend : 0),
    fmtNum(totals.clicks),
    fmtNum(totals.impressions),
    fmtPct(totals.impressions !== 0 ? (totals.clicks / totals.impressions) * 100 : 0),
    fmtNum(totals.conversions),
    fmtPct(totals.clicks !== 0 ? (totals.conversions / totals.clicks) * 100 : 0),
    fmtNum(totals.orders),
    fmtNum(totals.ntb_orders),
    fmtNum(totals.ntb_units),
    fmtCurrency(totals.ntb_revenue),
  ];

  return (
    <Surface
      title={title}
      subtitle={`${filtered.length} rows`}
      tools={
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48 rounded-lg border border-mf-line bg-white px-3 py-1.5 text-xs text-mf-ink outline-none placeholder:text-mf-muted focus:border-brand"
        />
      }
    >
      <div className="custom-scroll max-h-[400px] overflow-auto">
        <table className="border-collapse text-xs" style={{ minWidth: "max-content", width: "100%" }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 border-b border-r border-mf-line bg-mf-ghost px-4 py-2.5 text-left font-bold text-mf-ink" style={{ minWidth: "380px" }}>
                {nameLabel}
              </th>
              {CAMPAIGN_HEADERS.map((h) => (
                <th key={h} className="border-b border-mf-line bg-mf-ghost px-4 py-2.5 text-right font-bold text-mf-ink" style={{ minWidth: "100px" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={i} className="border-b border-mf-line/60 transition-colors hover:bg-mf-ghost/60">
                <td
                  className="sticky left-0 z-10 border-r border-mf-line px-4 py-2 font-semibold text-mf-ink"
                  style={{ backgroundColor: i % 2 === 0 ? "#FEFEFE" : "#F7F6FB", maxWidth: "380px" }}
                >
                  <span className="line-clamp-2 leading-tight">{nameOf(row)}</span>
                </td>
                {campaignCells(row).map((cell, j) => (
                  <td key={j} className={`whitespace-nowrap px-4 py-2 text-right tabular-nums text-mf-ink ${i % 2 === 0 ? "bg-white" : "bg-[#F7F6FB]"}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={16} className="px-4 py-8 text-center text-mf-muted">No data found</td>
              </tr>
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            <tr>
              <td className="sticky left-0 z-20 border-r border-t border-mf-line bg-mf-ghost px-4 py-2.5 font-bold text-mf-ink">Total</td>
              {totalCells.map((cell, j) => (
                <td key={j} className="whitespace-nowrap border-t border-mf-line bg-mf-ghost px-4 py-2.5 text-right font-bold tabular-nums text-mf-ink">
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Surface>
  );
}

// ── Daily chart (matches the overview combined chart conventions) ────────────
function DailyChart({ data, totals, acosGoal }: { data: DailyRow[]; totals: SummaryTotals; acosGoal: number }) {
  const chartData = data.map((r) => ({ ...r, date: fmtDate(r.day) }));

  if (chartData.length === 0) {
    return (
      <Surface title="Ad spend, ad revenue & ACoS" subtitle="Daily performance against the ACoS goal">
        <div className="p-[18px] text-xs text-mf-muted">No available data for the period.</div>
      </Surface>
    );
  }

  const acosOk = totals.acos <= acosGoal;

  const summary = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: "Ad Spend", value: fmtCurrency(totals.ad_spend), tone: "text-mf-ink" },
        { label: "Ad Revenue", value: fmtCurrency(totals.ad_revenue), tone: "text-mf-ink" },
        { label: "ACoS", value: fmtPct(totals.acos), tone: acosOk ? "text-mf-positive" : "text-[#C73737]" },
        { label: "ACoS Goal", value: fmtPct(acosGoal), tone: "text-mf-ink" },
      ].map((s) => (
        <div key={s.label}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-mf-muted">{s.label}</div>
          <div className={`text-lg font-extrabold ${s.tone}`}>{s.value}</div>
        </div>
      ))}
    </div>
  );

  const legend = (
    <>
      <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-[2px]" style={{ background: GOOD }} />ACoS ≤ goal</span>
      <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-[2px]" style={{ background: BAD }} />ACoS &gt; goal</span>
      <span className="flex items-center gap-1.5"><span className="inline-block w-6 border-t border-dashed border-mf-muted" />ACoS goal ({fmtPct(acosGoal)})</span>
      <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full" style={{ background: GOOD }} />Ad Revenue</span>
      <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full" style={{ background: SPEND_LINE }} />Ad Spend</span>
    </>
  );

  return (
    <ChartFrame title="Ad spend, ad revenue & ACoS" subtitle="Daily performance against the ACoS goal" summary={summary} legend={legend}>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 6 }} barCategoryGap="12%">
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6E6C77" }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis yAxisId="left" tickFormatter={(v) => `${v}%`} tick={AXIS_TICK} tickLine={false} axisLine={false} domain={[0, "auto"]} width={40} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => fmtCurrency(Number(v))} tick={AXIS_TICK} tickLine={false} axisLine={false} width={70} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            itemStyle={{ color: "#2C2B35" }}
            formatter={(v, n) => (String(n).includes("ACoS") ? [fmtPct(Number(v)), String(n)] : [fmtCurrency(Number(v)), String(n)])}
          />
          <ReferenceLine yAxisId="left" y={acosGoal} stroke="#6E6C77" strokeDasharray="5 5" />
          <Bar yAxisId="left" dataKey="acos" name="ACoS" barSize={26} opacity={0.85} isAnimationActive={false}>
            {chartData.map((entry, index) => (
              <Cell key={`acos-cell-${index}`} fill={Number(entry.acos) <= acosGoal ? GOOD : BAD} />
            ))}
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey="ad_revenue" name="Ad Revenue" stroke={GOOD} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line yAxisId="right" type="monotone" dataKey="ad_spend" name="Ad Spend" stroke={SPEND_LINE} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ── Segmentation ──────────────────────────────────────────────────────────────
const SEG_HEADERS = ["", "Ad Spend", "Ad Spend %", "Ad Revenue", "Ad Revenue %", "ACoS", "RoAS", "Clicks", "Impressions", "CTR", "Conversions", "CVR", "Orders"];

function segCells(row: SegRow): string[] {
  return [
    fmtCurrency(row.ad_spend),
    fmtPct(row.ad_spend_pct),
    fmtCurrency(row.ad_revenue),
    fmtPct(row.ad_revenue_pct),
    fmtPct(row.acos),
    fmtRatio(row.roas),
    fmtNum(row.clicks),
    fmtNum(row.impressions),
    fmtPct(row.ctr),
    fmtNum(row.conversions),
    fmtPct(row.cvr),
    fmtNum(row.orders),
  ];
}

function SegmentationTable({ title, rows }: { title: string; rows: SegRow[] }) {
  const totals = {
    ad_spend: rows.reduce((s, r) => s + r.ad_spend, 0),
    ad_revenue: rows.reduce((s, r) => s + r.ad_revenue, 0),
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    conversions: rows.reduce((s, r) => s + r.conversions, 0),
    orders: rows.reduce((s, r) => s + r.orders, 0),
  };
  const totalCells = [
    fmtCurrency(totals.ad_spend),
    "100.00%",
    fmtCurrency(totals.ad_revenue),
    "100.00%",
    fmtPct(totals.ad_revenue !== 0 ? (totals.ad_spend / totals.ad_revenue) * 100 : 0),
    fmtRatio(totals.ad_spend !== 0 ? totals.ad_revenue / totals.ad_spend : 0),
    fmtNum(totals.clicks),
    fmtNum(totals.impressions),
    fmtPct(totals.impressions !== 0 ? (totals.clicks / totals.impressions) * 100 : 0),
    fmtNum(totals.conversions),
    fmtPct(totals.clicks !== 0 ? (totals.conversions / totals.clicks) * 100 : 0),
    fmtNum(totals.orders),
  ];

  return (
    <Surface title={title}>
      <div className="custom-scroll overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              {SEG_HEADERS.map((h, i) => (
                <th key={i} className={`whitespace-nowrap border-b border-mf-line bg-mf-ghost px-4 py-2.5 font-bold text-mf-ink ${i === 0 ? "text-left" : "text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={`border-b border-mf-line/60 hover:bg-mf-ghost/60 ${i % 2 === 0 ? "bg-white" : "bg-[#F7F6FB]"}`}>
                <td className="whitespace-nowrap px-4 py-2 font-semibold text-mf-ink">{row.key}</td>
                {segCells(row).map((cell, j) => (
                  <td key={j} className="px-4 py-2 text-right tabular-nums text-mf-ink">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            <tr>
              <td className="border-t border-mf-line bg-mf-ghost px-4 py-2.5 font-bold text-mf-ink">Total</td>
              {totalCells.map((cell, j) => (
                <td key={j} className="border-t border-mf-line bg-mf-ghost px-4 py-2.5 text-right font-bold tabular-nums text-mf-ink">{cell}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Surface>
  );
}

function SegmentationBlock({
  title,
  brandRows,
  matchRows,
  eyebrowClass,
}: {
  title: string;
  brandRows: SegRow[];
  matchRows: SegRow[];
  eyebrowClass: string;
}) {
  return (
    <section>
      <SectionHeading eyebrowClass={eyebrowClass}>{title}</SectionHeading>
      <div className="grid items-start gap-4 xl:grid-cols-[260px_260px_1fr]">
        <DonutChartSmall title="Ad spend by brand type" data={brandRows.map((r) => ({ name: r.key, value: r.ad_spend }))} />
        <DonutChartSmall title="Ad revenue by brand type" data={brandRows.map((r) => ({ name: r.key, value: r.ad_revenue }))} />
        <SegmentationTable title="Segmentation by brand type" rows={brandRows} />
      </div>
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[260px_260px_1fr]">
        <DonutChartSmall title="Ad spend by match type" data={matchRows.map((r) => ({ name: r.key, value: r.ad_spend }))} />
        <DonutChartSmall title="Ad revenue by match type" data={matchRows.map((r) => ({ name: r.key, value: r.ad_revenue }))} />
        <SegmentationTable title="Segmentation by match type" rows={matchRows} />
      </div>
    </section>
  );
}

// ── Gaps by ASIN ──────────────────────────────────────────────────────────────
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
    (r) => r.product.toLowerCase().includes(search.toLowerCase()) || r.title.toLowerCase().includes(search.toLowerCase())
  );

  const totals = GAPS_COLS.reduce((acc, col) => {
    acc[col.key as string] = filtered.reduce((s, r) => s + (r[col.key] as number), 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <Surface
      title="Keywords gaps by ASIN"
      subtitle={`${filtered.length} products`}
      tools={
        <input
          type="text"
          placeholder="Search ASIN or title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-lg border border-mf-line bg-white px-3 py-1.5 text-xs text-mf-ink outline-none placeholder:text-mf-muted focus:border-brand"
        />
      }
    >
      <div className="custom-scroll max-h-[500px] overflow-auto">
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: "130px" }} />
            <col />
            {GAPS_COLS.map((col) => (
              <col key={col.key as string} style={{ width: "88px" }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 border-b border-r border-mf-line bg-mf-ghost px-4 py-2.5 text-left font-bold text-mf-ink">ASIN</th>
              <th className="border-b border-mf-line bg-mf-ghost px-4 py-2.5 text-left font-bold text-mf-ink">Title</th>
              {GAPS_COLS.map((col) => (
                <th key={col.key as string} className="whitespace-normal border-b border-mf-line bg-mf-ghost px-1 py-2.5 text-right text-[10px] font-bold uppercase leading-tight tracking-wide text-mf-muted">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={`${row.product}-${i}`} className="border-b border-mf-line/60 transition-colors hover:bg-mf-ghost/60">
                <td
                  className="sticky left-0 z-10 whitespace-nowrap border-r border-mf-line px-4 py-2 font-semibold text-mf-ink"
                  style={{ backgroundColor: i % 2 === 0 ? "#FEFEFE" : "#F7F6FB" }}
                >
                  {row.product}
                </td>
                <td className={`px-4 py-2 text-mf-ink ${i % 2 === 0 ? "bg-white" : "bg-[#F7F6FB]"}`}>
                  <span className="block text-[11px] leading-tight">{row.title}</span>
                </td>
                {GAPS_COLS.map((col) => (
                  <td key={col.key as string} className={`whitespace-nowrap px-1 py-2 text-right tabular-nums text-mf-ink ${i % 2 === 0 ? "bg-white" : "bg-[#F7F6FB]"}`}>
                    {fmtCurrency(row[col.key] as number)}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-mf-muted">No data found</td>
              </tr>
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            <tr>
              <td className="sticky left-0 z-20 border-r border-t border-mf-line bg-mf-ghost px-4 py-2.5 font-bold text-mf-ink">Total</td>
              <td className="border-t border-mf-line bg-mf-ghost" />
              {GAPS_COLS.map((col) => (
                <td key={col.key as string} className="whitespace-nowrap border-t border-mf-line bg-mf-ghost px-1 py-2.5 text-right font-bold tabular-nums text-mf-ink">
                  {fmtCurrency(totals[col.key as string])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Surface>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
export function AdvertisingAuditSection({
  surface,
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  surface: SurfaceKind;
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
  const { eyebrowClass } = getSurfacePalette(surface);
  const requestKey = accountId && start && end ? `${accountId}:${start}:${end}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: AuditData | null } | null>(null);

  useEffect(() => {
    if (!accountId || !start || !end) return;

    let ignore = false;
    fetch(`/api/reports/advertising-audit?accountId=${accountId}&start=${start}&end=${end}`)
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
  }, [accountId, start, end, refreshKey, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;

  if (!requestKey) {
    return (
      <Surface>
        <div className="p-[18px] text-mf-muted">Select a client and date range to load the advertising audit.</div>
      </Surface>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={`sk-${i}`} className="h-64 animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <Surface>
        <div className="p-[18px] text-mf-muted">Advertising audit data is unavailable for this range.</div>
      </Surface>
    );
  }

  const spendByType = data.campaignTypes.map((r) => ({ name: r.campaign_type_name, value: r.ad_spend }));
  const revenueByType = data.campaignTypes.map((r) => ({ name: r.campaign_type_name, value: r.ad_revenue }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-2">
        <DonutChartLarge title="Ad spend by campaign type" data={spendByType} />
        <DonutChartLarge title="Ad revenue by campaign type" data={revenueByType} />
      </div>

      <CampaignTable title="Campaign performance by campaign type" rows={data.campaignTypes} nameLabel="Campaign Type Name" nameKey="campaign_type_name" />
      <CampaignTable title="Campaign performance by campaign name" rows={data.campaignNames} nameLabel="Campaign Name" nameKey="campaign_name" />

      <DailyChart data={data.daily} totals={data.summaryTotals} acosGoal={data.acosGoal} />

      <SegmentationBlock title="Sponsored Products — segmentation" brandRows={data.spBrandType} matchRows={data.spMatchType} eyebrowClass={eyebrowClass} />
      <SegmentationBlock title="Sponsored Brands — segmentation" brandRows={data.sbBrandType} matchRows={data.sbMatchType} eyebrowClass={eyebrowClass} />

      <section>
        <SectionHeading eyebrowClass={eyebrowClass}>Keywords gaps</SectionHeading>
        <KeywordsGapsV2 surface={surface} accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
      </section>

      <GapsByAsinTable rows={data.gapsByAsin} />
    </div>
  );
}

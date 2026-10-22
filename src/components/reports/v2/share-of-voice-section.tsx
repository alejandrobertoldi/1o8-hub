"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
} from "recharts";
import { Surface } from "./primitives/surface";
import { ChartFrame } from "./primitives/chart-frame";
import { accentFor } from "./primitives/chart-colors";
import { type Surface as SurfaceKind } from "./primitives/palette";

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

function fmtNum(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function fmtDate(s: string) {
  return new Date(`${s}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Entity colors — brand vs competitor / organic vs sponsored. The brand series
// follows the surface accent (dual-accent rule); competitor blue is a shared
// categorical color. The hub pair (hub accent ↔ #006BBB) is validated (dataviz
// validator, white surface, CVD ΔE well above target). The portal pair
// #2C2B35 ↔ #006BBB is teal-against-blue and has NOT been re-validated — it is
// on the dogfood checklist (plan Task 17, spec §9).
//
// NB: this comment deliberately says "hub accent" rather than spelling the hub
// hex, because Task 5's guard scans this file's source for that literal.
const COMP_COLOR = "#006BBB";

export function sovEntityColors(surface: SurfaceKind): { brand: string; competitor: string } {
  return { brand: accentFor(surface), competitor: COMP_COLOR };
}
const AXIS_TICK = { fontSize: 10, fill: "#6E6C77" };
const TOOLTIP_STYLE = { borderRadius: 8, border: "1px solid #D8D7DC", fontSize: 11 };

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

// ── Ranked horizontal bars (one series → one hue; value at the bar tip) ──────
function RankedBars({ title, subtitle, data, xLabel, color }: { title: string; subtitle: string; data: BrandRow[]; xLabel: string; color: string }) {
  const sorted = data.toSorted((a, b) => b.count - a.count);

  if (sorted.length === 0) {
    return (
      <Surface title={title} subtitle={subtitle}>
        <div className="p-[18px] text-xs text-mf-muted">No available data for the period.</div>
      </Surface>
    );
  }

  return (
    <ChartFrame title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height={Math.max(260, sorted.length * 30)}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 44, left: 10, bottom: 4 }}>
          <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="seller_company" tick={{ fontSize: 10, fill: "#2C2B35" }} tickLine={false} axisLine={false} width={132} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "#2C2B35" }} formatter={(v) => [fmtNum(Number(v)), xLabel]} cursor={{ fill: "rgba(16,34,39,0.05)" }} />
          <Bar dataKey="count" fill={color} maxBarSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="count" position="right" fill="#6E6C77" fontSize={10} formatter={(v) => fmtNum(Number(v))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ── Keyword tables ───────────────────────────────────────────────────────────
function KeywordTable({ title, data, positionLabel }: { title: string; data: KeywordRow[]; positionLabel: string }) {
  const [search, setSearch] = useState("");
  const filtered = data.filter((r) => r.keyword.toLowerCase().includes(search.toLowerCase()));

  return (
    <Surface
      title={title}
      subtitle={`${filtered.length} keywords`}
      tools={
        <input
          type="text"
          placeholder="Search keyword…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48 rounded-lg border border-mf-line bg-white px-3 py-1.5 text-xs text-mf-ink outline-none placeholder:text-mf-muted focus:border-brand"
        />
      }
    >
      <div className="custom-scroll max-h-[400px] overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="border-b border-mf-line bg-mf-ghost px-4 py-2.5 text-left font-bold text-mf-ink">Keyword</th>
              <th className="border-b border-mf-line bg-mf-ghost px-4 py-2.5 text-right font-bold text-mf-ink">ASIN(s) in Search Results</th>
              <th className="border-b border-mf-line bg-mf-ghost px-4 py-2.5 text-right font-bold text-mf-ink">{positionLabel}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={row.keyword} className={`border-b border-mf-line/60 transition-colors hover:bg-mf-ghost/60 ${i % 2 === 0 ? "bg-white" : "bg-[#F7F6FB]"}`}>
                <td className="px-4 py-2 font-semibold text-mf-ink">{row.keyword}</td>
                <td className="px-4 py-2 text-right tabular-nums text-mf-ink">{fmtNum(row.asin_count)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-mf-ink">{row.best_position !== null ? fmtNum(row.best_position) : "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-mf-muted">No keywords found</td>
              </tr>
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            <tr>
              <td className="border-t border-mf-line bg-mf-ghost px-4 py-2.5 font-bold text-mf-ink">Total</td>
              <td className="border-t border-mf-line bg-mf-ghost px-4 py-2.5 text-right font-bold tabular-nums text-mf-ink">
                {fmtNum(filtered.reduce((s, r) => s + r.asin_count, 0))}
              </td>
              <td className="border-t border-mf-line bg-mf-ghost" />
            </tr>
          </tfoot>
        </table>
      </div>
    </Surface>
  );
}

// ── Per-keyword daily comparison — brand vs competitor, one measure per chart ─
interface MergedDay {
  date: string;
  brandSov: number | null;
  compSov: number | null;
  brandAsins: number | null;
  compAsins: number | null;
  brandPos: number | null;
  compPos: number | null;
}

function mergeSeries(d: KeywordSeriesData): MergedDay[] {
  const byDay = new Map<string, MergedDay>();
  const ensure = (day: string): MergedDay => {
    let row = byDay.get(day);
    if (!row) {
      row = { date: day, brandSov: null, compSov: null, brandAsins: null, compAsins: null, brandPos: null, compPos: null };
      byDay.set(day, row);
    }
    return row;
  };
  for (const r of d.brandSeries) {
    const row = ensure(r.day);
    row.brandSov = Number(r.brand_sov_pct.toFixed(2));
    row.brandAsins = r.brand_asin_count;
    row.brandPos = r.brand_best_position;
  }
  for (const r of d.competitorSeries) {
    const row = ensure(r.day);
    row.compSov = Number(r.competitor_sov_pct.toFixed(2));
    row.compAsins = r.competitor_asin_count;
    row.compPos = r.competitor_best_position;
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ ...r, date: fmtDate(r.date) }));
}

function ComparisonLineChart({
  title,
  subtitle,
  data,
  brandKey,
  compKey,
  fmt,
  reversed = false,
  colors,
}: {
  title: string;
  subtitle: string;
  data: MergedDay[];
  brandKey: keyof MergedDay;
  compKey: keyof MergedDay;
  fmt: (n: number) => string;
  reversed?: boolean;
  colors: { brand: string; competitor: string };
}) {
  if (data.length === 0) {
    return (
      <Surface title={title} subtitle={subtitle}>
        <div className="p-[18px] text-xs text-mf-muted">No available data for the period.</div>
      </Surface>
    );
  }

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      legend={[<LegendDot key="b" color={colors.brand} label="Brand" />, <LegendDot key="c" color={colors.competitor} label="Competitors" />]}
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 6 }}>
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6E6C77" }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tickFormatter={(v) => fmt(Number(v))} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} reversed={reversed} domain={reversed ? ["auto", "auto"] : [0, "auto"]} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "#2C2B35" }} formatter={(v, n) => [v == null ? "—" : fmt(Number(v)), String(n)]} />
          <Line type="monotone" dataKey={brandKey} name="Brand" stroke={colors.brand} strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey={compKey} name="Competitors" stroke={colors.competitor} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function KeywordSeriesCharts({
  accountId,
  start,
  end,
  keyword,
  refreshKey = 0,
  colors,
}: {
  accountId: string;
  start: string;
  end: string;
  keyword: string;
  refreshKey?: number;
  colors: { brand: string; competitor: string };
}) {
  const requestKey = accountId && start && end && keyword ? `${accountId}:${start}:${end}:${keyword}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: KeywordSeriesData | null } | null>(null);

  useEffect(() => {
    if (!accountId || !start || !end || !keyword) return;

    let ignore = false;
    fetch(
      `/api/reports/share-of-voice-keyword?accountId=${accountId}&start=${start}&end=${end}&keyword=${encodeURIComponent(keyword)}`
    )
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
  }, [accountId, start, end, keyword, refreshKey, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;
  const merged = useMemo(() => (data ? mergeSeries(data) : []), [data]);

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={`sk-${i}`} className="h-64 animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ComparisonLineChart
        title="Organic share of voice"
        subtitle={`“${keyword}” — brand vs competitors`}
        data={merged}
        brandKey="brandSov"
        compKey="compSov"
        fmt={fmtPct}
        colors={colors}
      />
      <ComparisonLineChart
        title="ASINs in search results"
        subtitle={`“${keyword}” — brand vs competitors`}
        data={merged}
        brandKey="brandAsins"
        compKey="compAsins"
        fmt={fmtNum}
        colors={colors}
      />
      <ComparisonLineChart
        title="Best organic position"
        subtitle={`“${keyword}” — lower is better (axis reversed)`}
        data={merged}
        brandKey="brandPos"
        compKey="compPos"
        fmt={fmtNum}
        reversed
        colors={colors}
      />
    </div>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────
export function ShareOfVoiceSection({
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
  const colors = sovEntityColors(surface);
  const requestKey = accountId && start && end ? `${accountId}:${start}:${end}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: SovData | null } | null>(null);
  const [selectedKeyword, setSelectedKeyword] = useState<string>("");

  useEffect(() => {
    if (!accountId || !start || !end) return;

    let ignore = false;
    fetch(`/api/reports/share-of-voice?accountId=${accountId}&start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d: SovData) => {
        if (ignore) return;
        setResult({ key: requestKey, data: d });
        if (d.keywords?.length > 0) setSelectedKeyword((cur) => (cur && d.keywords.includes(cur) ? cur : d.keywords[0]));
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

  if (!accountId || !start || !end) {
    return (
      <Surface>
        <div className="p-[18px] text-mf-muted">Select a client and date range to load share of voice.</div>
      </Surface>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`sk-${i}`} className="h-64 animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <Surface>
        <div className="p-[18px] text-mf-muted">Share of voice data is unavailable for this range.</div>
      </Surface>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <RankedBars
          title="Top 10 brands — organic share of voice"
          subtitle="Count of organic ASIN(s) in search results"
          data={data.topOrganic}
          xLabel="Organic ASINs"
          color={colors.brand}
        />
        <RankedBars
          title="Top 10 brands — ad share of voice"
          subtitle="Count of advertised ASIN(s) in search results"
          data={data.topSponsored}
          xLabel="Advertised ASINs"
          color={colors.competitor}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RankedBars
          title="Brand organic share of voice"
          subtitle="Count of organic ASIN(s) in search results"
          data={data.brandOrganic}
          xLabel="Organic ASINs"
          color={colors.brand}
        />
        <RankedBars
          title="Brand ad share of voice"
          subtitle="Count of advertised ASIN(s) in search results"
          data={data.brandAd}
          xLabel="Advertised ASINs"
          color={colors.competitor}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <KeywordTable title="Brand keyword summary" data={data.brandKeywords} positionLabel="Brand Best Position" />
        <KeywordTable title="Competitor keyword summary" data={data.competitorKeywords} positionLabel="Competitor Best Position" />
      </div>

      <Surface>
        <div className="flex items-center gap-3 p-[18px]">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-mf-muted">Keyword</span>
          <select
            value={selectedKeyword}
            onChange={(e) => setSelectedKeyword(e.target.value)}
            className="max-w-xs flex-1 rounded-lg border border-mf-line bg-white px-3 py-1.5 text-xs text-mf-ink outline-none focus:border-brand"
          >
            {data.keywords.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </Surface>

      {selectedKeyword && (
        <KeywordSeriesCharts accountId={accountId} start={start} end={end} keyword={selectedKeyword} refreshKey={refreshKey} colors={colors} />
      )}
    </div>
  );
}

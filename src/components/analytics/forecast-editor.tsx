"use client";
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/no-array-index-as-key */

/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from "recharts";

// ─── Types ──────────────────────────────────────────────────────

export interface ForecastChannel {
  key: string;
  label: string;
  clientIdCode: string | null;
  accountId: string | null;
  sales: Record<string, number>;
  adSpend: Record<string, number>;
}

export interface ForecastData {
  brand: string;
  primaryClientIdCode: string;
  marketplace: string;
  country: string;
  latestDate: string;
  months: string[];
  daysIncluded: Record<string, { included: number; total: number }>;
  channels: ForecastChannel[];
  forecasts: {
    product_sales: Record<string, number>;
    ad_spend: Record<string, number>;
  };
  goals?: {
    acosGoal: number | null;
    roasGoal: number | null;
    adSpendBudget: number | null;
    salesForecast: number | null;
  };
}

interface ForecastEditorProps {
  data: ForecastData;
  readOnly?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────

function formatMonthHeader(month: string): string {
  const [y, m] = month.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[parseInt(m, 10) - 1]}/${y}`;
}

function makeStepLabel(color: string, pos: "top" | "bottom") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (props: any) => {
    const { x, y, value, index, viewBox } = props;
    if (!value) return null;
    // Recharts passes viewBox.width = full plot area width
    const plotW = viewBox?.width || props.width || 800;
    const total = props.offset !== undefined ? Math.round(plotW / (props.offset || 1)) : 24;
    // Use bandwidth: plotWidth / (n-1) for point spacing
    const points = props.points;
    let stepW: number;
    if (points && points.length > 1 && index < points.length - 1) {
      stepW = points[index + 1].x - points[index].x;
    } else if (points && points.length > 1 && index > 0) {
      stepW = points[index].x - points[index - 1].x;
    } else {
      stepW = 40;
    }
    const cx = x + stepW / 2;
    const cy = pos === "bottom" ? y + 14 : y - 6;
    return (
      <text x={cx} y={cy} textAnchor="middle" fontSize={9} fill={color}>
        ${Math.round(value).toLocaleString()}
      </text>
    );
  };
}

function fmtCell(n: number | null | undefined): string {
  if (n == null || n === 0) return "";
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtBalance(n: number | null | undefined): string {
  if (n == null) return "";
  if (n === 0) return "";
  const abs = Math.abs(Math.round(n)).toLocaleString();
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

function parseCurrencyInput(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ─── Row definitions ────────────────────────────────────────────

type RowKind = "channel_sales" | "channel_adspend" | "global" | "forecast" | "balance" | "acos" | "roas";

interface RowDef {
  kind: RowKind;
  label: string;
  metric?: "product_sales" | "ad_spend";
  channelKey?: string;
  accountId?: string | null;
}

function buildRows(channels: ForecastChannel[]): RowDef[] {
  const rows: RowDef[] = [];
  // Only show channels that actually exist (have a sibling in AAC)
  const active = channels.filter((ch) => ch.clientIdCode != null);

  const multiChannel = active.length > 1;

  // Sales channel rows
  for (const ch of active) {
    rows.push({
      kind: "channel_sales",
      label: multiChannel ? `Sales ${ch.label}` : "Sales",
      metric: "product_sales",
      channelKey: ch.key,
      accountId: ch.accountId,
    });
  }
  if (multiChannel) rows.push({ kind: "global", label: "Sales Global", metric: "product_sales" });
  rows.push({ kind: "forecast", label: "Sales Forecast", metric: "product_sales" });
  rows.push({ kind: "balance", label: "Sales Balance", metric: "product_sales" });

  // Ad Spend channel rows
  for (const ch of active) {
    rows.push({
      kind: "channel_adspend",
      label: multiChannel ? `Ad Spend ${ch.label}` : "Ad Spend",
      metric: "ad_spend",
      channelKey: ch.key,
      accountId: ch.accountId,
    });
  }
  if (multiChannel) rows.push({ kind: "global", label: "Ad Spend Global", metric: "ad_spend" });
  rows.push({ kind: "forecast", label: "Ad Spend Forecast", metric: "ad_spend" });
  rows.push({ kind: "balance", label: "Ad Spend Balance", metric: "ad_spend" });

  // ACOS + ROAS
  rows.push({ kind: "acos", label: "ACoS" });
  rows.push({ kind: "roas", label: "RoAS" });

  return rows;
}

// ─── Component ──────────────────────────────────────────────────

export function ForecastEditor({ data, readOnly = false }: ForecastEditorProps) {
  const { brand, primaryClientIdCode, marketplace, country, latestDate, months, daysIncluded, channels, forecasts, goals } = data;
  const queryClient = useQueryClient();
  const rows = useMemo(() => buildRows(channels), [channels]);
  const [visibleMetrics, setVisibleMetrics] = useState<Record<string, boolean>>({
    salesForecast: true,
    salesActual: true,
    spendForecast: true,
    spendActual: true,
    acos: true,
    roas: true,
  });

  // Local forecast state (editable cells)
  const [localForecasts, setLocalForecasts] = useState(() => {
    const m = new Map<string, number>();
    for (const [month, val] of Object.entries(forecasts.product_sales)) {
      m.set(`product_sales:${month}`, val);
    }
    for (const [month, val] of Object.entries(forecasts.ad_spend)) {
      m.set(`ad_spend:${month}`, val);
    }
    return m;
  });

  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

  const saveMutation = useMutation({
    mutationFn: async (params: { month: string; metric: string; value: number }) => {
      const res = await fetch("/api/forecasts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIdCode: primaryClientIdCode,
          month: params.month,
          metric: params.metric,
          forecastValue: params.value,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ppc-forecast"] });
    },
  });

  const handleBlur = useCallback(
    (month: string, metric: string, rawValue: string) => {
      const key = `${metric}:${month}`;
      const value = parseCurrencyInput(rawValue);
      setLocalForecasts((prev) => new Map(prev).set(key, value));
      setEditingCell(null);
      setSavingCells((prev) => new Set(prev).add(key));
      saveMutation.mutate(
        { month, metric, value },
        { onSettled: () => setSavingCells((prev) => { const n = new Set(prev); n.delete(key); return n; }) },
      );
    },
    [saveMutation],
  );

  // ─── Compute cell values ────────────────────────────────────

  function getChannelValue(channelKey: string, month: string, metric: "product_sales" | "ad_spend"): number | null {
    const ch = channels.find((c) => c.key === channelKey);
    if (!ch) return null;
    const map = metric === "product_sales" ? ch.sales : ch.adSpend;
    const val = map[month];
    return val != null && val > 0 ? val : null;
  }

  function getGlobal(month: string, metric: "product_sales" | "ad_spend"): number {
    let sum = 0;
    for (const ch of channels) {
      const map = metric === "product_sales" ? ch.sales : ch.adSpend;
      sum += map[month] || 0;
    }
    return sum;
  }

  function getForecast(month: string, metric: "product_sales" | "ad_spend"): number | null {
    return localForecasts.get(`${metric}:${month}`) ?? null;
  }

  function getBalance(month: string, metric: "product_sales" | "ad_spend"): number | null {
    const forecast = getForecast(month, metric);
    if (forecast == null) return null;
    const global = getGlobal(month, metric);
    if (global === 0 && forecast > 0) return forecast;
    if (global === 0) return null;
    return forecast - global;
  }

  function getAcos(month: string): number | null {
    const revenue = getGlobal(month, "product_sales");
    const spend = getGlobal(month, "ad_spend");
    if (revenue === 0) return null;
    return (spend / revenue) * 100;
  }

  function getRoas(month: string): number | null {
    const sales = getGlobal(month, "product_sales");
    const spend = getGlobal(month, "ad_spend");
    if (spend === 0) return null;
    return sales / spend;
  }

  function getCellValue(row: RowDef, month: string): number | null {
    switch (row.kind) {
      case "channel_sales":
        return getChannelValue(row.channelKey!, month, "product_sales");
      case "channel_adspend":
        return getChannelValue(row.channelKey!, month, "ad_spend");
      case "global":
        return getGlobal(month, row.metric!) || null;
      case "forecast":
        return getForecast(month, row.metric!);
      case "balance":
        return getBalance(month, row.metric!);
      case "acos":
        return getAcos(month);
      case "roas":
        return getRoas(month);
      default:
        return null;
    }
  }

  // ─── Row styles ─────────────────────────────────────────────

  function rowClassName(row: RowDef): string {
    if (row.kind === "balance") return "font-bold bg-[#2C2B37]";
    return "font-bold";
  }

  function cellText(row: RowDef, value: number | null): string {
    if (row.kind === "balance") return fmtBalance(value);
    if (row.kind === "acos") return value != null ? `${value.toFixed(2)}%` : "";
    if (row.kind === "roas") return value != null ? value.toFixed(2) : "";
    return fmtCell(value);
  }

  function cellColor(row: RowDef, value: number | null): string {
    if (row.kind === "balance" && value != null) {
      return value > 0 ? "text-[#FF5C5F]" : "text-[#34C759]";
    }
    if (!goals || value == null) return "";
    // ACOS: lower is better
    if (row.kind === "acos" && goals.acosGoal != null) {
      return value <= goals.acosGoal ? "text-[#34C759]" : "text-[#FF5C5F]";
    }
    // ROAS: higher is better
    if (row.kind === "roas" && goals.roasGoal != null) {
      return value >= goals.roasGoal ? "text-[#34C759]" : "text-[#FF5C5F]";
    }
    return "";
  }

  // ─── Goal per row ───────────────────────────────────────────

  function getRowGoal(row: RowDef): string {
    if (!goals) return "";
    if ((row.kind === "channel_sales" || row.kind === "global") && row.metric === "product_sales" && goals.salesForecast != null) return fmtCell(goals.salesForecast);
    if ((row.kind === "channel_adspend" || row.kind === "global") && row.metric === "ad_spend" && goals.adSpendBudget != null) return fmtCell(goals.adSpendBudget);
    if (row.kind === "acos" && goals.acosGoal != null) return `${goals.acosGoal.toFixed(2)}%`;
    if (row.kind === "roas" && goals.roasGoal != null) return goals.roasGoal.toFixed(2);
    return "";
  }

  // ─── Header ─────────────────────────────────────────────────

  const latestFormatted = latestDate
    ? new Date(latestDate).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })
    : "";

  // ─── Chart data ───────────────────────────────────────────────

  const chartData = useMemo(() => {
    const pts = months.map((month) => {
      const salesActual = getGlobal(month, "product_sales");
      const salesForecast = getForecast(month, "product_sales");
      const spendActual = getGlobal(month, "ad_spend");
      const spendForecast = getForecast(month, "ad_spend");
      const acos = salesActual > 0 ? (spendActual / salesActual) * 100 : null;
      const roas = spendActual > 0 ? salesActual / spendActual : null;
      return {
        month: formatMonthHeader(month),
        salesForecast: salesForecast || null,
        salesActual: salesActual || null,
        spendForecast: spendForecast || null,
        spendActual: spendActual || null,
        acos,
        roas,
      };
    });
    // Drop trailing months with no data and no forecast
    return pts.filter((p) => p.salesActual || p.salesForecast || p.spendActual || p.spendForecast);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, channels, localForecasts]);

  // ─── YTD summary ────────────────────────────────────────────

  const ytd = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const currentMonth = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const ytdMonths = months.filter((m) => m.startsWith(String(year)) && m <= currentMonth);
    let sales = 0, spend = 0;
    for (const m of ytdMonths) {
      sales += getGlobal(m, "product_sales");
      spend += getGlobal(m, "ad_spend");
    }
    const acos = sales > 0 ? (spend / sales) * 100 : 0;
    const roas = spend > 0 ? sales / spend : 0;
    let salesFc = 0, spendFc = 0;
    for (const m of ytdMonths) {
      salesFc += getForecast(m, "product_sales") || 0;
      spendFc += getForecast(m, "ad_spend") || 0;
    }
    // Full year totals (all months in the year)
    const allYearMonths = months.filter((m) => m.startsWith(String(year)));
    let salesAll = 0, spendAll = 0, salesFcAll = 0, spendFcAll = 0;
    for (const m of allYearMonths) {
      salesAll += getGlobal(m, "product_sales");
      spendAll += getGlobal(m, "ad_spend");
      salesFcAll += getForecast(m, "product_sales") || 0;
      spendFcAll += getForecast(m, "ad_spend") || 0;
    }
    const acosAll = salesAll > 0 ? (spendAll / salesAll) * 100 : 0;
    const roasAll = spendAll > 0 ? salesAll / spendAll : 0;
    return { year, sales, spend, acos, roas, salesFc, spendFc, salesAll, spendAll, salesFcAll, spendFcAll, acosAll, roasAll };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, channels, localForecasts]);

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* YTD Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Sales */}
        <div className="rounded-lg bg-[#2C2B37] p-4">
          <p className="text-sm font-bold text-[#F7BF1D] mb-2">Sales {ytd.year}</p>
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="text-[10px] text-[#F7BF1D] uppercase"><th className="text-left font-medium pb-1"></th><th className="text-right font-medium pb-1">{ytd.year}</th><th className="text-right font-medium pb-1">YTD</th></tr></thead>
            <tbody className="text-white font-bold">
              <tr><td className="py-0.5"><span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#dc2626]" />Sales</span></td><td className="text-right">{fmtCell(ytd.salesAll) || "—"}</td><td className="text-right">{fmtCell(ytd.sales) || "—"}</td></tr>
              <tr><td className="py-0.5"><span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#F7BF1D]" />Forecast</span></td><td className="text-right">{fmtCell(ytd.salesFcAll) || "—"}</td><td className="text-right">{fmtCell(ytd.salesFc) || "—"}</td></tr>
              <tr className="border-t border-zinc-600"><td className="py-0.5 text-zinc-400">Balance</td><td className={`text-right ${(ytd.salesFcAll - ytd.salesAll) > 0 ? "text-[#FF5C5F]" : "text-[#34C759]"}`}>{fmtBalance(ytd.salesFcAll - ytd.salesAll) || "—"}</td><td className={`text-right ${(ytd.salesFc - ytd.sales) > 0 ? "text-[#FF5C5F]" : "text-[#34C759]"}`}>{fmtBalance(ytd.salesFc - ytd.sales) || "—"}</td></tr>
            </tbody>
          </table>
          {goals?.salesForecast != null && <p className="text-[10px] text-zinc-500 mt-2 border-t border-zinc-600 pt-1">Goal: <span className="text-blue-400 font-semibold">{fmtCell(goals.salesForecast)}</span></p>}
        </div>
        {/* Ad Spend */}
        <div className="rounded-lg bg-[#2C2B37] p-4">
          <p className="text-sm font-bold text-[#F7BF1D] mb-2">Ad Spend {ytd.year}</p>
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="text-[10px] text-[#F7BF1D] uppercase"><th className="text-left font-medium pb-1"></th><th className="text-right font-medium pb-1">{ytd.year}</th><th className="text-right font-medium pb-1">YTD</th></tr></thead>
            <tbody className="text-white font-bold">
              <tr><td className="py-0.5"><span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#2563eb]" />Spend</span></td><td className="text-right">{fmtCell(ytd.spendAll) || "—"}</td><td className="text-right">{fmtCell(ytd.spend) || "—"}</td></tr>
              <tr><td className="py-0.5"><span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#166534]" />Forecast</span></td><td className="text-right">{fmtCell(ytd.spendFcAll) || "—"}</td><td className="text-right">{fmtCell(ytd.spendFc) || "—"}</td></tr>
              <tr className="border-t border-zinc-600"><td className="py-0.5 text-zinc-400">Balance</td><td className={`text-right ${(ytd.spendFcAll - ytd.spendAll) > 0 ? "text-[#FF5C5F]" : "text-[#34C759]"}`}>{fmtBalance(ytd.spendFcAll - ytd.spendAll) || "—"}</td><td className={`text-right ${(ytd.spendFc - ytd.spend) > 0 ? "text-[#FF5C5F]" : "text-[#34C759]"}`}>{fmtBalance(ytd.spendFc - ytd.spend) || "—"}</td></tr>
            </tbody>
          </table>
          {goals?.adSpendBudget != null && <p className="text-[10px] text-zinc-500 mt-2 border-t border-zinc-600 pt-1">Goal: <span className="text-blue-400 font-semibold">{fmtCell(goals.adSpendBudget)}</span></p>}
        </div>
        {/* ACoS */}
        <div className="rounded-lg bg-[#2C2B37] p-4">
          <p className="text-sm font-bold text-[#F7BF1D] mb-2">ACoS {ytd.year}</p>
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="text-[10px] text-[#F7BF1D] uppercase"><th className="text-left font-medium pb-1"></th><th className="text-right font-medium pb-1">{ytd.year}</th><th className="text-right font-medium pb-1">YTD</th></tr></thead>
            <tbody className="text-white font-bold">
              <tr><td className="py-0.5"><span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#ec4899]" />ACoS</span></td><td className="text-right">{ytd.acosAll > 0 ? `${ytd.acosAll.toFixed(2)}%` : "—"}</td><td className="text-right">{ytd.acos > 0 ? `${ytd.acos.toFixed(2)}%` : "—"}</td></tr>
            </tbody>
          </table>
          {goals?.acosGoal != null && <p className="text-[10px] text-zinc-500 mt-2 border-t border-zinc-600 pt-1">Goal: <span className="text-blue-400 font-semibold">{goals.acosGoal.toFixed(2)}%</span></p>}
        </div>
        {/* RoAS */}
        <div className="rounded-lg bg-[#2C2B37] p-4">
          <p className="text-sm font-bold text-[#F7BF1D] mb-2">RoAS {ytd.year}</p>
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="text-[10px] text-[#F7BF1D] uppercase"><th className="text-left font-medium pb-1"></th><th className="text-right font-medium pb-1">{ytd.year}</th><th className="text-right font-medium pb-1">YTD</th></tr></thead>
            <tbody className="text-white font-bold">
              <tr><td className="py-0.5"><span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#8b5cf6]" />RoAS</span></td><td className="text-right">{ytd.roasAll > 0 ? ytd.roasAll.toFixed(2) : "—"}</td><td className="text-right">{ytd.roas > 0 ? ytd.roas.toFixed(2) : "—"}</td></tr>
            </tbody>
          </table>
          {goals?.roasGoal != null && <p className="text-[10px] text-zinc-500 mt-2 border-t border-zinc-600 pt-1">Goal: <span className="text-blue-400 font-semibold">{goals.roasGoal.toFixed(2)}</span></p>}
        </div>
      </div>

      <div className="space-y-0">
      {/* Status bar */}
      {(!readOnly || latestFormatted) && (
        <div className="rounded-t-lg border border-zinc-300 bg-[#05070B] text-white px-5 py-2 flex items-center justify-end gap-6">
          {!readOnly && savingCells.size > 0 && (
            <span className="text-[10px] text-amber-400 animate-pulse">Saving…</span>
          )}
          {!readOnly && savingCells.size === 0 && saveMutation.isSuccess && (
            <span className="text-[10px] text-emerald-400">Saved</span>
          )}
          {latestFormatted && (
            <p className="text-xs text-zinc-400">Latest Included Date: <span className="text-white font-medium">{latestFormatted}</span></p>
          )}
        </div>
      )}

      {/* Table */}
      <div className={`overflow-x-auto border border-zinc-300 bg-white ${(!readOnly || latestFormatted) ? "rounded-b-lg border-t-0" : "rounded-lg"}`}>
        <table className="w-full text-xs tabular-nums text-zinc-900">
          <thead>
            <tr className="bg-[#05070B] text-white border-b-2 border-zinc-600">
              <th className="sticky left-0 z-20 bg-[#05070B] px-2 py-1.5 text-left align-top w-[100px] min-w-[100px] font-bold">Metric</th>
              <th className="sticky left-[100px] z-20 bg-[#05070B] p-1.5 text-center align-top w-[56px] min-w-[56px] border-l border-zinc-600 font-bold">Goal</th>
              {months.map((m) => {
                const di = daysIncluded[m];
                const [y, mo] = m.split("-").map(Number);
                const total = new Date(y, mo, 0).getDate();
                const included = di ? di.included : 0;
                const isPartial = included > 0 && included < total;
                return (
                  <th key={m} className="border-l border-zinc-600 p-1.5 text-right whitespace-nowrap min-w-[58px] align-top">
                    <div className="text-[10px] font-bold text-white">{formatMonthHeader(m)}</div>
                    <div className={`text-[9px] font-normal ${isPartial ? "text-amber-400" : "text-zinc-500"}`}>
                      {included}/{total}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={`${row.kind === "balance" || row.label === "RoAS" ? "border-b-2 border-zinc-400" : "border-b border-zinc-200"} ${rowClassName(row)}`}>
                {/* Metric label (sticky) */}
                <td className={`sticky left-0 z-10 p-1 whitespace-nowrap w-[100px] min-w-[100px] border-r ${row.kind === "balance" ? "border-[#3A3948] bg-[#2C2B37]" : "border-zinc-300 bg-white"}`}>
                  {(() => {
                    if (row.kind === "balance") {
                      return <span className="text-[10px] font-semibold text-white px-1">{row.label}</span>;
                    }
                    const dotColor =
                      row.kind === "channel_sales" ? "#dc2626" :
                      row.kind === "channel_adspend" ? "#2563eb" :
                      row.kind === "global" && row.metric === "product_sales" ? "#dc2626" :
                      row.kind === "global" && row.metric === "ad_spend" ? "#2563eb" :
                      row.kind === "forecast" && row.metric === "product_sales" ? "#F7BF1D" :
                      row.kind === "forecast" && row.metric === "ad_spend" ? "#166534" :
                      row.kind === "acos" ? "#ec4899" :
                      row.kind === "roas" ? "#8b5cf6" :
                      null;
                    if (dotColor) {
                      return (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#05070B] px-2 py-0.5 text-[10px] font-medium text-white">
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
                          {row.label}
                        </span>
                      );
                    }
                    return <span className="text-[10px] font-medium text-zinc-700 px-1">{row.label}</span>;
                  })()}
                </td>
                {/* Goal column (sticky) */}
                <td className={`sticky left-[100px] z-10 p-1.5 text-right whitespace-nowrap w-[56px] min-w-[56px] border-r font-semibold text-[10px] ${
                  row.kind === "balance" ? "border-[#3A3948] bg-[#2C2B37] text-blue-400" : "border-zinc-300 bg-white text-blue-600"
                }`}>
                  {getRowGoal(row)}
                </td>
                {/* Monthly value cells */}
                {months.map((month) => {
                  const value = getCellValue(row, month);
                  const cellKey = `${row.metric}:${month}`;
                  const isSaving = savingCells.has(cellKey);
                  const isEditing = editingCell === `${row.label}:${month}`;
                  const color = cellColor(row, value);

                  // Editable forecast cell
                  if (row.kind === "forecast" && !readOnly) {
                    if (isEditing) {
                      return (
                        <td key={month} className="border-l border-zinc-200 bg-white p-0">
                          <input
                            autoFocus
                            type="text"
                            defaultValue={value != null ? value.toString() : ""}
                            className="w-full bg-transparent p-1 text-right text-xs text-zinc-900 outline-none ring-2 ring-blue-500 rounded-none"
                            onBlur={(e) => handleBlur(month, row.metric!, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                          />
                        </td>
                      );
                    }

                    return (
                      <td
                        key={month}
                        className={`border-l border-zinc-200 bg-white p-1 text-right cursor-pointer hover:ring-1 hover:ring-blue-500 ${isSaving ? "opacity-50" : ""}`}
                        onClick={() => setEditingCell(`${row.label}:${month}`)}
                      >
                        {fmtCell(value)}
                      </td>
                    );
                  }

                  // Read-only cells
                  return (
                    <td
                      key={month}
                      className={`border-l p-1 text-right ${color} ${
                        row.kind === "forecast" ? "bg-white border-zinc-200" : ""
                      } ${row.kind === "balance" ? "border-[#3A3948]" : "border-zinc-200"} ${row.kind === "balance" && !color ? "text-white" : ""}`}
                    >
                      {cellText(row, value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>

      {/* Chart */}
      <div className="mt-6 rounded-lg border border-zinc-300 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mr-1">Show:</span>
          {[
            { key: "salesForecast", label: "Sales Forecast", color: "#F7BF1D" },
            { key: "salesActual", label: "Sales Amazon SC", color: "#dc2626" },
            { key: "spendForecast", label: "Ad Spend Forecast", color: "#166534" },
            { key: "spendActual", label: "Ad Spend Amazon SC", color: "#2563eb" },
            { key: "acos", label: "ACoS", color: "#ec4899" },
            { key: "roas", label: "RoAS", color: "#8b5cf6" },
          ].map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setVisibleMetrics((prev) => ({ ...prev, [m.key]: !prev[m.key] }))}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                visibleMetrics[m.key]
                  ? "bg-[#05070B] text-white"
                  : "bg-[#05070B]/30 text-zinc-400 line-through"
              }`}
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: m.color, opacity: visibleMetrics[m.key] ? 1 : 0.3 }} />
              {m.label}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={600}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "#374151" }}
              axisLine={{ stroke: "#9ca3af" }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: "#374151" }}
              axisLine={{ stroke: "#9ca3af" }}
              tickLine={false}
              tickFormatter={(v: number) => `$${v.toLocaleString()}`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "#ec4899" }}
              axisLine={{ stroke: "#ec4899" }}
              tickLine={false}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              width={50}
              domain={[0, "auto"]}
            />
            <YAxis
              yAxisId="roas"
              orientation="right"
              tick={{ fontSize: 10, fill: "#8b5cf6" }}
              axisLine={{ stroke: "#8b5cf6" }}
              tickLine={false}
              tickFormatter={(v: number) => v.toFixed(1)}
              width={35}
              domain={[0, 10]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#2C2B37",
                border: "1px solid #3f3e4a",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#fff",
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => {
                const v = Number(value) || 0;
                const n = String(name ?? "");
                if (n === "ACoS") return [`${v.toFixed(2)}%`, n];
                if (n === "RoAS") return [v.toFixed(2), n];
                return [`$${Math.round(v).toLocaleString()}`, n];
              }}
            />
            {/* Goal reference lines */}
            {goals?.acosGoal != null && <ReferenceLine yAxisId="right" y={goals.acosGoal} stroke="#ec4899" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `ACoS Goal ${goals.acosGoal.toFixed(0)}%`, fill: "#be185d", fontSize: 10, position: "insideTopRight" }} />}
            {goals?.roasGoal != null && <ReferenceLine yAxisId="roas" y={goals.roasGoal} stroke="#8b5cf6" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `RoAS Goal ${goals.roasGoal.toFixed(2)}`, fill: "#5b21b6", fontSize: 10, position: "insideBottomRight" }} />}
            {visibleMetrics.salesForecast && <Area yAxisId="left" type="stepBefore" dataKey="salesForecast" name="Sales Forecast" fill="#F7BF1D" fillOpacity={0.4} stroke="#F7BF1D" strokeWidth={1.5} label={makeStepLabel("#92400e", "top")} />}
            {visibleMetrics.salesActual && <Area yAxisId="left" type="stepBefore" dataKey="salesActual" name="Sales Amazon SC" fill="#dc2626" fillOpacity={0.15} stroke="#dc2626" strokeWidth={2} label={makeStepLabel("#991b1b", "top")} />}
            {visibleMetrics.spendForecast && <Area yAxisId="left" type="stepBefore" dataKey="spendForecast" name="Ad Spend Forecast" fill="#166534" fillOpacity={0.35} stroke="#166534" strokeWidth={1.5} label={makeStepLabel("#14532d", "bottom")} />}
            {visibleMetrics.spendActual && <Area yAxisId="left" type="stepBefore" dataKey="spendActual" name="Ad Spend Amazon SC" fill="#2563eb" fillOpacity={0.25} stroke="#2563eb" strokeWidth={2} label={makeStepLabel("#1e40af", "bottom")} />}
            {visibleMetrics.acos && <Line yAxisId="right" type="monotone" dataKey="acos" name="ACoS" stroke="#ec4899" strokeWidth={2} dot={{ r: 3, fill: "#ec4899" }} label={{ fontSize: 9, fill: "#be185d", position: "top", formatter: (v: any) => v ? `${Number(v).toFixed(1)}%` : "" }} />}
            {visibleMetrics.roas && <Line yAxisId="roas" type="monotone" dataKey="roas" name="RoAS" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6" }} label={{ fontSize: 9, fill: "#5b21b6", position: "bottom", formatter: (v: any) => v ? Number(v).toFixed(2) : "" }} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

"use client";
/* eslint-disable react-doctor/js-batch-dom-css */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */

import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/nextjs-no-img-element */
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { createPortal } from "react-dom";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef, useCallback, useEffect, Fragment, type ReactNode } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Settings,
} from "lucide-react";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { DatePicker } from "@/components/ui/date-picker";
import { SalesSparkline } from "@/components/clients/sales-sparkline";
import { hiResAmazonImg } from "@/lib/utils";
import { WeeklyRankCard } from "./weekly-rank-card";
import { AvatarCircle } from "@/components/seo/avatar-circle";
import { dataLagDays, isDataStale, teamOrgLevel, ppcDirectorLink, type ClientTeamMember } from "@/lib/sales-summary-header";

type SparklinePoint = { date: string; sales: number };
type SparklineData = {
  dates: string[];
  clients: Record<string, { points: SparklinePoint[]; total: number; latest: number }>;
};

async function fetchSalesSparklines(): Promise<SparklineData> {
  const res = await fetch("/api/clients/sales-sparklines");
  if (!res.ok) return { dates: [], clients: {} };
  return res.json();
}

interface Metrics {
  ad_impressions: number;
  ad_clicks: number;
  ad_spend: number;
  ad_revenue: number;
  ad_orders: number;
  product_sales: number;
  product_quantity: number;
  shipped_units: number;
  shipped_revenue: number;
  ordered_units: number;
  ordered_revenue: number;
  total_order_items: number;
  mobile_app_sessions: number;
  browser_session: number;
  glance_view_byasin: number;
  ntb_orders: number;
  ntb_revenue: number;
  ntb_ordered_units: number;
  former_active_sns_subscriptions: number;
  new_active_sns_subscriptions: number;
  new_sns_subscriptions_revenue: number;
}

interface Computed {
  acos: number | null;
  roas: number | null;
  tacos: number | null;
  ctr: number | null;
  totalSessions: number;
  pctOrgRevenue: number | null;
  pctPpcRevenue: number | null;
  unitSessionPct: number | null;
}

interface DailyMetrics {
  report_date: string;
  ad_impressions: number;
  ad_clicks: number;
  ad_spend: number;
  ad_revenue: number;
  ad_orders: number;
  product_sales: number;
  product_quantity: number;
  shipped_units: number;
  shipped_revenue: number;
  ordered_units: number;
  ordered_revenue: number;
  total_order_items: number;
  mobile_app_sessions: number;
  browser_session: number;
  glance_view_byasin: number;
  ntb_orders: number;
  ntb_revenue: number;
  ntb_ordered_units: number;
  new_active_sns_subscriptions: number;
  new_sns_subscriptions_revenue: number;
}

interface ClientSales {
  clientIdCode: string;
  clientName: string;
  brandName: string | null;
  clientLogoUrl: string | null;
  tier: string | null;
  marketplace: string | null;
  ppcManager: string | null;
  accountManager: string | null;
  accountIds: string[];
  /** Newest day with sales data for this client; absent on pre-2026-09-29 cache entries. */
  latestSalesDate?: string | null;
  team?: ClientTeamMember[];
  goals: {
    acosGoal: number | null;
    roasGoal: number | null;
    tacosGoal: number | null;
    adSpendBudget: number | null;
    salesForecast: number | null;
    orgRevGoal: number | null;
  };
  current: Metrics;
  previous: Metrics | null;
  yoy: Metrics | null;
  mtd: Metrics | null;
  ytd: Metrics | null;
  computed: Computed;
  prevComputed: Computed | null;
  yoyComputed: Computed | null;
  mtdComputed: Computed | null;
  ytdComputed: Computed | null;
}

/** The API sets this only when the client has a logo in Drive (1o8 Hub_Backend/Client Logos). */
function clientLogoSrc(client: Pick<ClientSales, "clientIdCode" | "clientLogoUrl">): string | null {
  return client.clientLogoUrl;
}

interface SalesSummaryResponse {
  period: string;
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  yoyStart: string;
  yoyEnd: string;
  mtdStart: string;
  mtdEnd: string;
  ytdStart: string;
  ytdEnd: string;
  latestDataDate: string | null;
  lastRefreshedAt: string | null;
  clients: ClientSales[];
  fromCache?: boolean;
}

// ── Formatters ──────────────────────────────────────────────────
import { fmtCurrency, fmtInt, fmtPct, fmtDec } from "@/lib/formatters";
import type { WeeklyRankMetricKind } from "@/lib/sales-weekly-rank";

// ── Week helpers ────────────────────────────────────────────────
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getWeekNumber(d: Date | string): number {
  // Parse YYYY-MM-DD strings as local dates to avoid timezone shifts
  let year: number, month: number, day: number;
  if (typeof d === "string") {
    const [y, m, dd] = d.split("-").map(Number);
    year = y; month = m - 1; day = dd;
  } else {
    year = d.getFullYear(); month = d.getMonth(); day = d.getDate();
  }
  const date = new Date(Date.UTC(year, month, day));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
// ── Metric row definition ───────────────────────────────────────
interface MetricRowDef {
  label: string;
  getCurrent: (c: ClientSales) => number | null;
  getPrevious: (c: ClientSales) => number | null;
  getYoY: (c: ClientSales) => number | null;
  getMtd: (c: ClientSales) => number | null;
  getYtd: (c: ClientSales) => number | null;
  getGoal?: (c: ClientSales) => number | null;
  getDailyValue: (d: DailyMetrics) => number | null;
  format: (n: number | null) => string;
  lowerIsBetter?: boolean;
  customChart?: "sns";
}

// ── Trend arrow ─────────────────────────────────────────────────
function Trend({ current, previous, lowerIsBetter = false, row, format, compact }: {
  current: number | null;
  previous: number | null;
  lowerIsBetter?: boolean;
  row?: MetricRowDef;
  format?: (n: number | null | undefined) => string;
  compact?: boolean;
}) {
  if (current == null || previous == null || previous === 0) {
    return <Minus className="size-3.5 text-muted-foreground/30 inline" />;
  }
  const pctChange = ((current - previous) / Math.abs(previous)) * 100;
  const isUp = pctChange > 0;
  const isGood = lowerIsBetter ? !isUp : isUp;
  const color = isGood ? "text-[#34C759]" : "text-[#FF5C5F]";

  const diff = current - previous;
  const formatFn = format ?? row?.format ?? fmtDec;

  if (diff === 0) {
    return <Minus className="size-3.5 text-muted-foreground/30 inline" />;
  }

  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      <Icon className={`${compact ? "size-2.5" : "size-3.5"} shrink-0`} />
      <span className={`tabular-nums ${compact ? "text-[10px] font-normal" : "text-sm font-bold"}`}>{formatFn(diff)}</span>
    </span>
  );
}

const METRIC_ROWS: MetricRowDef[] = [
  {
    label: "Sales",
    getCurrent: (c) => c.current.product_sales,
    getPrevious: (c) => c.previous?.product_sales ?? null,
    getYoY: (c) => c.yoy?.product_sales ?? null,
    getMtd: (c) => c.mtd?.product_sales ?? null,
    getYtd: (c) => c.ytd?.product_sales ?? null,
    getGoal: (c) => c.goals.salesForecast,
    getDailyValue: (d) => d.product_sales,
    format: fmtCurrency,
  },
  {
    label: "Organic Revenue (%)",
    getCurrent: (c) => c.computed.pctOrgRevenue,
    getPrevious: (c) => c.prevComputed?.pctOrgRevenue ?? null,
    getYoY: (c) => c.yoyComputed?.pctOrgRevenue ?? null,
    getMtd: (c) => c.mtdComputed?.pctOrgRevenue ?? null,
    getYtd: (c) => c.ytdComputed?.pctOrgRevenue ?? null,
    getDailyValue: (d) => d.product_sales > 0 ? ((d.product_sales - d.ad_revenue) / d.product_sales) * 100 : null,
    format: fmtPct,
  },
  {
    label: "Paid Revenue (%)",
    getCurrent: (c) => c.computed.pctPpcRevenue,
    getPrevious: (c) => c.prevComputed?.pctPpcRevenue ?? null,
    getYoY: (c) => c.yoyComputed?.pctPpcRevenue ?? null,
    getMtd: (c) => c.mtdComputed?.pctPpcRevenue ?? null,
    getYtd: (c) => c.ytdComputed?.pctPpcRevenue ?? null,
    getDailyValue: (d) => d.product_sales > 0 ? (d.ad_revenue / d.product_sales) * 100 : null,
    format: fmtPct,
  },
  {
    label: "Sessions (Mobile)",
    getCurrent: (c) => c.current.mobile_app_sessions,
    getPrevious: (c) => c.previous?.mobile_app_sessions ?? null,
    getYoY: (c) => c.yoy?.mobile_app_sessions ?? null,
    getMtd: (c) => c.mtd?.mobile_app_sessions ?? null,
    getYtd: (c) => c.ytd?.mobile_app_sessions ?? null,
    getDailyValue: (d) => d.mobile_app_sessions,
    format: fmtInt,
  },
  {
    label: "Sessions (Desktop)",
    getCurrent: (c) => c.current.browser_session,
    getPrevious: (c) => c.previous?.browser_session ?? null,
    getYoY: (c) => c.yoy?.browser_session ?? null,
    getMtd: (c) => c.mtd?.browser_session ?? null,
    getYtd: (c) => c.ytd?.browser_session ?? null,
    getDailyValue: (d) => d.browser_session,
    format: fmtInt,
  },
  {
    label: "Orders",
    getCurrent: (c) => c.current.total_order_items,
    getPrevious: (c) => c.previous?.total_order_items ?? null,
    getYoY: (c) => c.yoy?.total_order_items ?? null,
    getMtd: (c) => c.mtd?.total_order_items ?? null,
    getYtd: (c) => c.ytd?.total_order_items ?? null,
    getDailyValue: (d) => d.total_order_items,
    format: fmtInt,
  },
  {
    label: "Units",
    getCurrent: (c) => c.current.product_quantity,
    getPrevious: (c) => c.previous?.product_quantity ?? null,
    getYoY: (c) => c.yoy?.product_quantity ?? null,
    getMtd: (c) => c.mtd?.product_quantity ?? null,
    getYtd: (c) => c.ytd?.product_quantity ?? null,
    getDailyValue: (d) => d.product_quantity,
    format: fmtInt,
  },
  {
    label: "Ad Spend",
    getCurrent: (c) => c.current.ad_spend,
    getPrevious: (c) => c.previous?.ad_spend ?? null,
    getYoY: (c) => c.yoy?.ad_spend ?? null,
    getMtd: (c) => c.mtd?.ad_spend ?? null,
    getYtd: (c) => c.ytd?.ad_spend ?? null,
    getGoal: (c) => c.goals.adSpendBudget,
    getDailyValue: (d) => d.ad_spend,
    format: fmtCurrency,
    lowerIsBetter: true,
  },
  {
    label: "Ad Revenue",
    getCurrent: (c) => c.current.ad_revenue,
    getPrevious: (c) => c.previous?.ad_revenue ?? null,
    getYoY: (c) => c.yoy?.ad_revenue ?? null,
    getMtd: (c) => c.mtd?.ad_revenue ?? null,
    getYtd: (c) => c.ytd?.ad_revenue ?? null,
    getDailyValue: (d) => d.ad_revenue,
    format: fmtCurrency,
  },
  {
    label: "Clicks",
    getCurrent: (c) => c.current.ad_clicks,
    getPrevious: (c) => c.previous?.ad_clicks ?? null,
    getYoY: (c) => c.yoy?.ad_clicks ?? null,
    getMtd: (c) => c.mtd?.ad_clicks ?? null,
    getYtd: (c) => c.ytd?.ad_clicks ?? null,
    getDailyValue: (d) => d.ad_clicks,
    format: fmtInt,
  },
  {
    label: "Impressions",
    getCurrent: (c) => c.current.ad_impressions,
    getPrevious: (c) => c.previous?.ad_impressions ?? null,
    getYoY: (c) => c.yoy?.ad_impressions ?? null,
    getMtd: (c) => c.mtd?.ad_impressions ?? null,
    getYtd: (c) => c.ytd?.ad_impressions ?? null,
    getDailyValue: (d) => d.ad_impressions,
    format: fmtInt,
  },
  {
    label: "CTR",
    getCurrent: (c) => c.computed.ctr,
    getPrevious: (c) => c.prevComputed?.ctr ?? null,
    getYoY: (c) => c.yoyComputed?.ctr ?? null,
    getMtd: (c) => c.mtdComputed?.ctr ?? null,
    getYtd: (c) => c.ytdComputed?.ctr ?? null,
    getDailyValue: (d) => d.ad_impressions > 0 ? (d.ad_clicks / d.ad_impressions) * 100 : null,
    format: fmtPct,
  },
  {
    label: "ACoS",
    getCurrent: (c) => c.computed.acos,
    getPrevious: (c) => c.prevComputed?.acos ?? null,
    getYoY: (c) => c.yoyComputed?.acos ?? null,
    getMtd: (c) => c.mtdComputed?.acos ?? null,
    getYtd: (c) => c.ytdComputed?.acos ?? null,
    getGoal: (c) => c.goals.acosGoal,
    getDailyValue: (d) => d.ad_revenue > 0 ? (d.ad_spend / d.ad_revenue) * 100 : null,
    format: fmtPct,
    lowerIsBetter: true,
  },
  {
    label: "TACoS",
    getCurrent: (c) => c.computed.tacos,
    getPrevious: (c) => c.prevComputed?.tacos ?? null,
    getYoY: (c) => c.yoyComputed?.tacos ?? null,
    getMtd: (c) => c.mtdComputed?.tacos ?? null,
    getYtd: (c) => c.ytdComputed?.tacos ?? null,
    getGoal: (c) => c.goals.tacosGoal,
    getDailyValue: (d) => d.product_sales > 0 ? (d.ad_spend / d.product_sales) * 100 : null,
    format: fmtPct,
    lowerIsBetter: true,
  },
  {
    label: "RoAS",
    getCurrent: (c) => c.computed.roas,
    getPrevious: (c) => c.prevComputed?.roas ?? null,
    getYoY: (c) => c.yoyComputed?.roas ?? null,
    getMtd: (c) => c.mtdComputed?.roas ?? null,
    getYtd: (c) => c.ytdComputed?.roas ?? null,
    getGoal: (c) => c.goals.roasGoal,
    getDailyValue: (d) => d.ad_spend > 0 ? d.ad_revenue / d.ad_spend : null,
    format: fmtDec,
  },
  {
    label: "NTB Orders",
    getCurrent: (c) => c.current.ntb_ordered_units,
    getPrevious: (c) => c.previous?.ntb_ordered_units ?? null,
    getYoY: (c) => c.yoy?.ntb_ordered_units ?? null,
    getMtd: (c) => c.mtd?.ntb_ordered_units ?? null,
    getYtd: (c) => c.ytd?.ntb_ordered_units ?? null,
    getDailyValue: (d) => d.ntb_ordered_units,
    format: fmtInt,
  },
  {
    label: "SNS Subscriptions",
    getCurrent: (c) => c.current.new_active_sns_subscriptions,
    getPrevious: (c) => c.previous?.new_active_sns_subscriptions ?? null,
    getYoY: (c) => c.yoy?.new_active_sns_subscriptions ?? null,
    getMtd: (c) => c.mtd?.new_active_sns_subscriptions ?? null,
    getYtd: (c) => c.ytd?.new_active_sns_subscriptions ?? null,
    getDailyValue: (d) => d.new_active_sns_subscriptions,
    format: fmtInt,
    customChart: "sns",
  },
];

function weeklyRankKind(format: MetricRowDef["format"]): WeeklyRankMetricKind {
  if (format === fmtCurrency) return "currency";
  if (format === fmtPct) return "pct";
  if (format === fmtDec) return "dec";
  return "int";
}

// ── SVG Sparkline Chart ─────────────────────────────────────────
function SparklineChart({ data, format, label, goal, lowerIsBetter }: {
  data: { date: string; value: number | null }[];
  format: (n: number | null) => string;
  label: string;
  goal?: number | null;
  lowerIsBetter?: boolean;
}) {
  const valid = data.filter((d) => d.value != null) as { date: string; value: number }[];
  if (valid.length < 2) {
    return (
      <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
        Not enough data
      </div>
    );
  }

  const colW = 56;
  const W = Math.max(360, valid.length * colW + 40);
  const H = 220;
  const PAD = { top: 60, right: 20, bottom: 36, left: 20 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const values = valid.map((d) => d.value);
  // Include goal in range so the goal line is always visible
  const allVals = goal != null ? [...values, goal] : values;
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = maxVal - minVal || 1;

  const points = valid.map((d, i) => {
    const x = PAD.left + (i / (valid.length - 1)) * chartW;
    const y = PAD.top + chartH - ((d.value - minVal) / range) * chartH;
    return { x, y, date: d.date, value: d.value };
  });

  // Monotone cubic bezier — no overshoot beyond data points
  const smoothLine = (pts: typeof points): string => {
    if (pts.length < 2) return "";
    if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const midX = (p1.x + p2.x) / 2;
      d += ` C${midX},${p1.y} ${midX},${p2.y} ${p2.x},${p2.y}`;
    }
    return d;
  };
  const linePath = smoothLine(points);
  const areaPath = `${linePath} L${points[points.length - 1].x},${PAD.top + chartH} L${points[0].x},${PAD.top + chartH} Z`;

  return (
    <svg width={W} height={H} className="block">
      {/* Title */}
      <text x={W / 2} y={14} textAnchor="middle" className="fill-foreground text-[11px] font-bold">{label}</text>
      {/* Gradient fill */}
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkGrad)" />
      <path d={linePath} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* Goal line */}
      {goal != null && (() => {
        const goalY = PAD.top + chartH - ((goal - minVal) / range) * chartH;
        return (
          <g>
            <line
              x1={PAD.left}
              y1={goalY}
              x2={W - PAD.right}
              y2={goalY}
              stroke="var(--color-destructive)"
              strokeWidth="1"
              strokeDasharray="6 3"
              opacity="0.6"
            />
            <text
              x={W - PAD.right}
              y={goalY - 4}
              textAnchor="end"
              className="fill-[#FF5C5F] text-[8px] font-bold tabular-nums"
            >
              Goal: {format(goal)}
            </text>
          </g>
        );
      })()}
      {/* Data points with all values and dates */}
      {points.map((p, i) => {
        const meetsGoal = goal != null
          ? (lowerIsBetter ? p.value <= goal : p.value >= goal)
          : null;
        const dotColor = meetsGoal === true
          ? "#34C759"
          : meetsGoal === false
            ? "#FF5C5F"
            : "var(--color-brand)";
        const textClass = meetsGoal === true
          ? "fill-[#34C759]"
          : meetsGoal === false
            ? "fill-[#FF5C5F]"
            : "fill-foreground";
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3.5" fill={dotColor} stroke="var(--color-background)" strokeWidth="1.5" />
            {/* Value label */}
            <text
              x={p.x}
              y={p.y - 10}
              textAnchor="middle"
              className={`text-[9px] font-bold tabular-nums ${textClass}`}
            >
              {format(p.value)}
            </text>
            {/* Date label */}
            <text
              x={p.x}
              y={H - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[8px] tabular-nums"
            >
              {p.date.slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── SNS Continuous Timeline Chart ────────────────────────────────
function SnsYtdChart({ timeline }: {
  timeline: { date: string; value: number; yearAgo: number | null }[];
}) {
  // Filter outliers (data gaps where value drops to near zero)
  const filtered = useMemo(() => {
    if (timeline.length < 3) return timeline;
    const vals = timeline.map((d) => d.value).filter((v) => v > 0);
    if (vals.length < 3) return timeline;
    const sorted = vals.toSorted((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    // Drop any point below 30% of Q1 — catches zero/near-zero gaps
    const floor = q1 * 0.3;
    return timeline.filter((d) => d.value >= floor);
  }, [timeline]);

  const yaClean = useMemo(() => {
    const withYa = filtered.filter((d) => d.yearAgo != null && d.yearAgo > 0);
    if (withYa.length < 3) return withYa;
    const sorted = withYa.map((d) => d.yearAgo!).toSorted((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const floor = q1 * 0.3;
    return withYa.filter((d) => d.yearAgo! >= floor);
  }, [filtered]);

  if (filtered.length < 2) {
    return (
      <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
        Not enough data
      </div>
    );
  }

  const W = 560;
  const H = 240;
  const PAD = { top: 44, right: 20, bottom: 36, left: 45 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Timeline X: first date to last date
  const parseDate = (s: string) => { const p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const firstDate = parseDate(filtered[0].date);
  const lastDate = parseDate(filtered[filtered.length - 1].date);
  const totalMs = lastDate.getTime() - firstDate.getTime() || 1;

  const toX = (dateStr: string) => {
    const ms = parseDate(dateStr).getTime() - firstDate.getTime();
    return PAD.left + (ms / totalMs) * chartW;
  };

  // Value range from both current + yearAgo
  const allVals: number[] = [];
  for (const d of filtered) {
    allVals.push(d.value);
    if (d.yearAgo != null) allVals.push(d.yearAgo);
  }
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const pad5 = (maxVal - minVal) * 0.05;
  const rangeMin = minVal - pad5;
  const rangeMax = maxVal + pad5;
  const range = rangeMax - rangeMin || 1;

  const toY = (val: number) => PAD.top + chartH - ((val - rangeMin) / range) * chartH;

  const smoothLine = (pts: { x: number; y: number }[]): string => {
    if (pts.length < 2) return "";
    if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      d += ` C${midX},${pts[i].y} ${midX},${pts[i + 1].y} ${pts[i + 1].x},${pts[i + 1].y}`;
    }
    return d;
  };

  // Current value line
  const curPoints = filtered.map((d) => ({ x: toX(d.date), y: toY(d.value) }));
  const curPath = smoothLine(curPoints);

  // Year-ago line (only points that have yearAgo data, same gap filter)
  const yaPoints = yaClean.map((d) => ({ x: toX(d.date), y: toY(d.yearAgo!) }));
  const yaPath = smoothLine(yaPoints);

  // X-axis: month labels
  const months: { label: string; x: number }[] = [];
  const cur = new Date(firstDate);
  cur.setDate(1);
  if (cur < firstDate) cur.setMonth(cur.getMonth() + 1);
  while (cur <= lastDate) {
    const label = cur.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-01`;
    months.push({ label, x: toX(dateStr) });
    cur.setMonth(cur.getMonth() + 1);
  }

  // Y-axis
  const yTicks = 5;
  const yStep = range / yTicks;

  const latest = filtered[filtered.length - 1];

  return (
    <svg width={W} height={H} className="block">
      <text x={W / 2} y={14} textAnchor="middle" className="fill-foreground text-[11px] font-bold">
        Subscription Count
      </text>
      {/* Legend */}
      <line x1={PAD.left} y1={28} x2={PAD.left + 16} y2={28} stroke="var(--color-brand)" strokeWidth="2" />
      <text x={PAD.left + 20} y={31} className="fill-foreground text-[9px]">
        Active Subscriptions ({fmtInt(latest.value)})
      </text>
      <line x1={PAD.left + 180} y1={28} x2={PAD.left + 196} y2={28} stroke="#E97E05" strokeWidth="1.5" opacity="0.7" strokeDasharray="4 2" />
      <text x={PAD.left + 200} y={31} className="fill-[#E97E05]/80 text-[9px]">
        Last Year ({latest.yearAgo != null ? fmtInt(latest.yearAgo) : "—"})
      </text>

      {/* Y-axis grid */}
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const val = rangeMin + yStep * i;
        const y = toY(val);
        return (
          <g key={i}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--color-foreground)" strokeWidth="0.3" opacity="0.15" />
            <text x={PAD.left - 4} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[8px] tabular-nums">
              {Math.round(val)}
            </text>
          </g>
        );
      })}

      {/* Month labels */}
      {months.map((m) => (
        <text key={m.label} x={m.x} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[7px]">
          {m.label}
        </text>
      ))}

      {/* Year-ago line (behind) */}
      {yaPath && (
        <path d={yaPath} fill="none" stroke="#E97E05" strokeWidth="1.5" opacity="0.7" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 3" />
      )}

      {/* Current value line */}
      {curPath && (
        <>
          <defs>
            <linearGradient id="snsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path
            d={`${curPath} L${curPoints[curPoints.length - 1].x},${PAD.top + chartH} L${curPoints[0].x},${PAD.top + chartH} Z`}
            fill="url(#snsGrad)"
          />
          <path d={curPath} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </>
      )}

      {/* Endpoint dot */}
      {curPoints.length > 0 && (
        <circle cx={curPoints[curPoints.length - 1].x} cy={curPoints[curPoints.length - 1].y} r="3.5" fill="var(--color-brand)" stroke="var(--color-background)" strokeWidth="1.5" />
      )}
    </svg>
  );
}

// ── Metric Chart Popover (on hover) ────────────────────────────
function MetricChartPopover({ row, accountIds, start, end, goal }: {
  row: MetricRowDef;
  accountIds: string[];
  start: string;
  end: string;
  goal?: number | null;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const handleMouseEnter = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      setShouldFetch(true);
      setIsHovered(true);
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceRight = window.innerWidth - rect.left;
        const style: React.CSSProperties = { position: "fixed" };
        if (spaceBelow < 220) {
          style.top = rect.top - 4;
          style.transform = "translateY(-100%)";
        } else {
          style.top = rect.bottom + 4;
        }
        if (spaceRight > 400) {
          style.left = rect.left;
        } else {
          style.right = window.innerWidth - rect.right;
        }
        setPopoverStyle(style);
      }
    }, 300);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsHovered(false);
  }, []);

  const isSns = row.customChart === "sns";

  const { data: dailyData, isError: dailyError } = useQuery<{ days: DailyMetrics[] }>({
    queryKey: ["sales-daily", accountIds.join(","), start, end],
    queryFn: async () => {
      const res = await fetch(`/api/sales-summary/daily?start=${start}&end=${end}&accountIds=${accountIds.join(",")}`);
      if (!res.ok) throw new Error("Failed to fetch daily data");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
    enabled: shouldFetch && accountIds.length > 0 && !isSns,
  });

  const { data: snsData, isError: snsError } = useQuery<{
    timeline: { date: string; value: number; yearAgo: number | null }[];
  }>({
    queryKey: ["sales-sns", accountIds.join(",")],
    queryFn: async () => {
      const res = await fetch(`/api/sales-summary/sns?accountIds=${accountIds.join(",")}`);
      if (!res.ok) throw new Error("Failed to fetch SNS data");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
    enabled: shouldFetch && accountIds.length > 0 && isSns,
  });

  const chartData = useMemo(() => {
    if (!dailyData?.days) return [];
    return dailyData.days.map((d) => ({
      date: d.report_date,
      value: row.getDailyValue(d),
    }));
  }, [dailyData, row]);

  const chartLoading = isSns ? (!snsData && !snsError) : (!dailyData && !dailyError);

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="cursor-default border-b border-dashed border-foreground/30 hover:border-brand/50 transition-colors">
        {row.label}
      </span>
      {isHovered && createPortal(
        <div
          className="z-[9999] rounded-xl border border-border/60 shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-150 bg-background"
          style={popoverStyle}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={handleMouseLeave}
        >
          {chartLoading ? (
            <div className={`flex items-center justify-center ${isSns ? "w-[560px] h-[240px]" : "w-[360px] h-[220px]"}`}>
              <div className="size-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (dailyError || snsError) ? (
            <div className="flex items-center justify-center w-[360px] h-[220px] text-xs text-muted-foreground">
              Failed to load chart data
            </div>
          ) : isSns && snsData ? (
            <SnsYtdChart timeline={snsData.timeline} />
          ) : (
            <SparklineChart data={chartData} format={row.format} label={row.label} goal={goal} lowerIsBetter={row.lowerIsBetter} />
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Client card component ───────────────────────────────────────
// Maps client summary metric labels → product-level getValue functions
const LABEL_ALIASES: Record<string, string> = {
  "Organic Revenue (%)": "Organic Rev %",
  "Paid Revenue (%)": "Paid Rev %",
};

function getProductGetter(label: string): ((p: PeriodData) => number | null) | undefined {
  const key = LABEL_ALIASES[label] ?? label;
  return PRODUCT_METRICS.find((m) => m.label === key)?.getValue;
}

export function NotConnectedCard({ client }: { client: ClientSales }) {
  const label = client.brandName || client.clientName || client.clientIdCode;
  return (
    <div
      data-testid="not-connected-card"
      className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/5 px-5 py-4 flex items-center justify-between gap-4"
    >
      <div className="min-w-0">
        <div className="font-bold text-foreground truncate">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {client.clientIdCode}
          {client.tier ? ` · ${client.tier}` : ""}
          {client.marketplace ? ` · ${client.marketplace}` : ""}
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-300 text-xs font-semibold px-3 py-1">
        Not connected — no Intentwise data
      </span>
    </div>
  );
}

function fmtDataDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Per-client freshness: one stalled feed (TRT/TRS, 2026-09) must not hide behind the page-wide date. */
function ClientDataDate({ date, referenceDate }: { date: string | null | undefined; referenceDate: string | null }) {
  if (date === undefined) return null; // cached before per-client dates existed
  const stale = isDataStale(date, referenceDate);
  const lag = date && referenceDate ? dataLagDays(date, referenceDate) : null;
  return (
    <span
      data-testid="client-data-date"
      className={
        stale
          ? "rounded-md border px-1.5 py-0.5 text-[11px] font-medium bg-red-50 text-red-600 border-red-300"
          : "rounded-md border px-1.5 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 border-emerald-300"
      }
      title={referenceDate ? `Newest data on this page: ${fmtDataDate(referenceDate)}` : undefined}
    >
      {date ? <>Data through {fmtDataDate(date)}{stale && lag != null && <> · {lag}d behind</>}</> : "No sales data"}
    </span>
  );
}

function TeamChip({ m }: { m: ClientTeamMember }) {
  return (
    <span title={`${m.name} — ${m.roles.join(", ")}`} className="flex items-center gap-1.5 leading-tight">
      <AvatarCircle name={m.name} image={m.image} size={18} />
      <span className="flex flex-col">
        <span className="text-[11px] font-medium text-white whitespace-nowrap">{m.name}</span>
        <span className="text-[9px] text-white/75 whitespace-nowrap">{m.roles.join(" · ")}</span>
      </span>
    </span>
  );
}

const TeamConnector = () => <span aria-hidden className="h-1.5 w-px bg-white/60" />;

/** One org level. Several people sit side by side under a divider; a single person
 *  has the avatar in the centre column so L1-L3 avatars share one vertical axis. */
function TeamLevelRow({ row, divider = true }: { row: ClientTeamMember[]; divider?: boolean }) {
  if (row.length > 1) {
    return (
      <div data-testid="client-team-level" className={`flex gap-3 ${divider ? "border-t border-white/60 pt-1" : ""}`}>
        {row.map((m) => <TeamChip key={m.name} m={m} />)}
      </div>
    );
  }
  return (
    <div
      data-testid="client-team-level"
      title={`${row[0].name} — ${row[0].roles.join(", ")}`}
      className="grid w-full grid-cols-[1fr_18px_1fr] items-center gap-1.5 leading-tight"
    >
      <span />
      <AvatarCircle name={row[0].name} image={row[0].image} size={18} />
      <span className="flex flex-col">
        <span className="text-[11px] font-medium text-white whitespace-nowrap">{row[0].name}</span>
        <span className="text-[9px] text-white/75 whitespace-nowrap">{row[0].roles.join(" · ")}</span>
      </span>
    </div>
  );
}

/** Org chart: ES → AM → PM → specialists (PPC, SEO, Design, Catalog…) side by side.
 *  The PPC Lead sits on the AM row directly above the PPC manager (level 4),
 *  joined to them by a vertical line. */
function ClientTeam({ team }: { team: ClientTeamMember[] | undefined }) {
  if (!team?.length) return null;
  const link = ppcDirectorLink(team);
  const [l1, l2, l3, l4] = ([1, 2, 3, 4] as const).map((lvl) =>
    team.filter((m) => teamOrgLevel(m) === lvl && m !== link?.director && m !== link?.ppc),
  );

  if (!link) {
    const levels = [l1, l2, l3, l4].filter((row) => row.length > 0);
    return (
      <div className="flex flex-col items-center" data-testid="client-team">
        {levels.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <TeamConnector />}
            <TeamLevelRow row={row} />
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center" data-testid="client-team">
      {l1.length > 0 && <TeamLevelRow row={l1} />}
      {l1.length > 0 && <TeamConnector />}
      <div className="grid grid-cols-[auto_auto] border-t border-white/60 pt-1">
        {/* Level 2: PPC Lead beside the Account Manager */}
        <div className="pr-3" data-testid="client-team-level">
          <TeamChip m={link.director} />
        </div>
        <div>{l2.length > 0 && <TeamLevelRow row={l2} divider={false} />}</div>
        {/* Level 3: the director's line runs down past the PM row */}
        <div className="relative pr-3" data-testid="client-team-ppc-line">
          <span aria-hidden className="absolute left-[8.5px] top-0 bottom-0 w-px bg-white/60" />
        </div>
        <div className="flex flex-col items-center">
          {l2.length > 0 && l3.length > 0 && <TeamConnector />}
          {l3.length > 0 && <TeamLevelRow row={l3} />}
          <TeamConnector />
        </div>
        {/* Level 4: PPC manager first, under the director */}
        <div className="border-t border-white/60 pt-1 pr-3" data-testid="client-team-level">
          <TeamChip m={link.ppc} />
        </div>
        <div className="border-t border-white/60 pt-1">
          {l4.length > 0 && (
            <div className="flex gap-3">{l4.map((m) => <TeamChip key={m.name} m={m} />)}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClientCard({ client, currentLabel, previousLabel, yoyLabel, start, end, ranges, mode, sparklinePoints, latestDataDate, children }: { client: ClientSales; currentLabel: string; previousLabel: string; yoyLabel: string; start: string; end: string; ranges: DateRanges; mode: "week" | "custom"; sparklinePoints?: SparklinePoint[]; latestDataDate: string | null; children?: ReactNode }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const theadCloneRef = useRef<HTMLDivElement | null>(null);
  const isPinned = useRef(false);
  const isTheadPinned = useRef(false);

  useEffect(() => {
    const section = sectionRef.current;
    const header = headerRef.current;
    const thead = theadRef.current;
    const placeholder = placeholderRef.current;
    const scrollContainer = document.getElementById("main-content");
    if (!section || !header || !placeholder || !scrollContainer) return;

    const pageHeader = scrollContainer.querySelector<HTMLElement>(".sticky.top-0.z-30");
    const getOffset = () => (pageHeader ? pageHeader.getBoundingClientRect().bottom : scrollContainer.getBoundingClientRect().top);

    // Build a fixed clone of thead outside the overflow-hidden container
    const ensureClone = () => {
      if (theadCloneRef.current || !thead) return;
      const clone = document.createElement("div");
      clone.style.position = "fixed";
      clone.style.display = "none";
      clone.style.zIndex = "48";
      clone.style.pointerEvents = "none";
      document.body.appendChild(clone);
      theadCloneRef.current = clone;
    };

    const syncCloneContent = () => {
      if (!thead || !theadCloneRef.current) return;
      const table = thead.closest("table");
      if (!table) return;
      // Clone as a table to preserve column widths
      const tbl = document.createElement("table");
      tbl.className = table.className;
      tbl.style.tableLayout = "fixed";
      // Copy col widths from actual cells
      const cells = thead.querySelectorAll("th");
      const colgroup = document.createElement("colgroup");
      cells.forEach((cell) => {
        const col = document.createElement("col");
        col.style.width = `${cell.offsetWidth}px`;
        colgroup.appendChild(col);
      });
      tbl.appendChild(colgroup);
      tbl.appendChild(thead.cloneNode(true) as HTMLTableSectionElement);
      theadCloneRef.current.innerHTML = "";
      theadCloneRef.current.appendChild(tbl);
    };

    const onScroll = () => {
      const sectionRect = section.getBoundingClientRect();
      const pinTop = getOffset();
      const headerH = header.offsetHeight;
      const shouldPin = sectionRect.top < pinTop && sectionRect.bottom > pinTop + headerH + 10;

      // headerRef is now handled by native CSS position: sticky (no JS pin needed).

      // Pin thead clone below client header
      if (thead) {
        const theadPinTop = pinTop + headerH;
        const theadH = thead.offsetHeight;
        const shouldPinThead = shouldPin && sectionRect.bottom > theadPinTop + theadH + 10;
        if (shouldPinThead && !isTheadPinned.current) {
          isTheadPinned.current = true;
          ensureClone();
          syncCloneContent();
          const cl = theadCloneRef.current!;
          cl.style.display = "block";
          cl.style.top = `${theadPinTop}px`;
          cl.style.left = `${sectionRect.left}px`;
          cl.style.width = `${sectionRect.width}px`;
        } else if (shouldPinThead && isTheadPinned.current && theadCloneRef.current) {
          theadCloneRef.current.style.top = `${theadPinTop}px`;
          theadCloneRef.current.style.left = `${sectionRect.left}px`;
          theadCloneRef.current.style.width = `${sectionRect.width}px`;
        } else if (!shouldPinThead && isTheadPinned.current && theadCloneRef.current) {
          isTheadPinned.current = false;
          theadCloneRef.current.style.display = "none";
        }
      }
    };

    scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (theadCloneRef.current) {
        theadCloneRef.current.remove();
        theadCloneRef.current = null;
      }
    };
  }, []);

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((label: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  // Subscribed, not read once: a one-shot getQueryData() read here used to render an
  // empty breakdown whenever the row was expanded before the prefetch landed (or after
  // it failed), and never re-rendered when the data arrived.
  const products = useProductData(client.accountIds, ranges, expandedRows.size > 0);
  const cachedProducts = products.data?.products ?? [];

  return (
    <div ref={sectionRef}>
      {/* Client header — CSS sticky right below top-nav (compensates for main's pt-6/pt-8) */}
      <div
        ref={headerRef}
        className="sticky -top-6 lg:-top-8 z-[49] px-5 pt-3 pb-2 border-b border-black/40 dark:border-white/10 border-b-[0.5px] flex items-start justify-between bg-[#F7BF1D] rounded-t-xl"
        style={{ boxShadow: "0 0 0 2px black" }}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="grid grid-flow-col auto-cols-max items-stretch gap-3 shrink-0">
            {clientLogoSrc(client) && (
              <div className="relative aspect-square h-full min-h-0 w-auto overflow-hidden rounded-md bg-[#F7BF1D]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={clientLogoSrc(client)!}
                  alt={`${client.clientName} logo`}
                  className="absolute inset-0 h-full w-full object-contain p-1"
                />
              </div>
            )}
            {sparklinePoints && sparklinePoints.length >= 2 && (
              <SalesSparkline points={sparklinePoints} detailed />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-2xl font-bold text-white font-[family-name:var(--font-outfit)] tracking-tight leading-tight">
              {client.clientName}
            </h3>
            <p className="text-[11px] text-white/70 font-mono mt-0.5 leading-tight">
              {client.clientIdCode}
              {client.tier && <span className="ml-2 text-white font-bold">T{client.tier}</span>}
              {client.marketplace && <span className="ml-2">{client.marketplace}</span>}
            </p>
            <div className="mt-1">
              <ClientDataDate date={client.latestSalesDate} referenceDate={latestDataDate} />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-xs text-white/80 pt-0.5 shrink-0">
          {client.team ? (
            <ClientTeam team={client.team} />
          ) : (
            <>
              {client.ppcManager && (
                <span>PPC: <span className="font-medium">{client.ppcManager}</span></span>
              )}
              {client.accountManager && (
                <span>AM: <span className="font-medium">{client.accountManager}</span></span>
              )}
            </>
          )}
        </div>
      </div>
      <div ref={placeholderRef} style={{ display: "none" }} />

      {/* Metrics table */}
      <div className="rounded-b-xl glass-card text-card-foreground animate-card-enter overflow-hidden" style={{ boxShadow: "0 0 0 2px black", border: "none" }}>
        <table className="w-full border-collapse [&_td]:align-top">
          <thead ref={theadRef}>
            <tr className="bg-black/80 dark:bg-white/10 backdrop-blur-sm">
              <th className="px-5 py-1 text-left text-xs font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                Metric
              </th>
              <th className="px-3 py-1 text-right text-xs font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                {mode === "week" ? "Week Goal" : "Period Goal"}
              </th>
              <th className="px-3 py-1 text-right text-xs font-medium text-brand border border-black/40 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                {currentLabel}
              </th>
              <th className="px-3 py-1 text-center text-sm font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                Trend
              </th>
              <th className="px-3 py-1 text-right text-xs font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                {previousLabel}
              </th>
              <th className="px-3 py-1 text-center text-sm font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 border-l-2 border-l-black/40 dark:border-l-white/30 whitespace-nowrap overflow-hidden text-ellipsis">
                YoY Trend
              </th>
              <th className="px-3 py-1 text-right text-xs font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                {yoyLabel}
              </th>
              <th className="px-3 py-1 text-right text-xs font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                MTD
              </th>
              <th className="px-3 py-1 text-right text-xs font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                YTD
              </th>
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map((row) => {
              const cur = row.getCurrent(client);
              const prev = row.getPrevious(client);
              const yoy = row.getYoY(client);
              const mtd = row.getMtd(client);
              const ytd = row.getYtd(client);
              const goal = row.getGoal?.(client) ?? null;
              const isExpanded = expandedRows.has(row.label);
              const productGetValue = getProductGetter(row.label);
              const hasBreakdown = !!productGetValue;

              function goalChip(value: number | null): string {
                if (value == null || goal == null) return "";
                const meetsGoal = row.lowerIsBetter
                  ? value <= goal
                  : value >= goal;
                return meetsGoal
                  ? "rounded-full px-2.5 py-0.5 bg-[#34C759]/20 text-[#34C759] font-bold inline-block"
                  : "rounded-full px-2.5 py-0.5 bg-[#FF5C5F]/20 text-[#FF5C5F] font-bold inline-block";
              }

              // Get sorted products for this metric when expanded
              const subRows = isExpanded && productGetValue ? cachedProducts
                .map((p) => {
                  const variantParts = [p.flavor || p.color || p.style, p.size].filter(Boolean);
                  return {
                    name: p.product_name || p.asin,
                    asin: p.asin,
                    variantParts,
                    imageUrl: p.main_image_url || "",
                    cur: p.current ? productGetValue(p.current) : null,
                    prev: p.previous ? productGetValue(p.previous) : null,
                    yoy: p.yoy ? productGetValue(p.yoy) : null,
                    mtd: p.mtd ? productGetValue(p.mtd) : null,
                    ytd: p.ytd ? productGetValue(p.ytd) : null,
                  };
                })
                .filter((p) => p.cur != null && p.cur !== 0)
                .sort((a, b) => Math.abs(b.cur!) - Math.abs(a.cur!))
                : [];

              return (
                <Fragment key={row.label}>
                  <tr className={`hover:bg-brand/[0.02] transition-colors ${hasBreakdown ? "cursor-pointer" : ""}`} onClick={hasBreakdown ? () => toggleRow(row.label) : undefined}>
                    <td className="px-5 py-0.5 text-xs text-foreground font-medium border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                      <span className="inline-flex items-center gap-1">
                        {hasBreakdown && (
                          isExpanded
                            ? <ChevronDown className="size-3 text-foreground/40 shrink-0" />
                            : <ChevronRight className="size-3 text-foreground/40 shrink-0" />
                        )}
                        <MetricChartPopover row={row} accountIds={client.accountIds} start={start} end={end} goal={goal} />
                      </span>
                    </td>
                    <td className="px-3 py-0.5 text-xs text-right tabular-nums text-foreground border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                      {row.getGoal ? row.format(goal) : ""}
                    </td>
                    <td className="px-3 py-0.5 text-xs text-right font-bold tabular-nums text-foreground border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                      <span className={goalChip(cur)}>{row.format(cur)}</span>
                    </td>
                    <td className="px-3 py-1 text-center whitespace-nowrap border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                      <Trend current={cur} previous={prev} lowerIsBetter={row.lowerIsBetter} row={row} />
                    </td>
                    <td className="px-3 py-0.5 text-xs text-right tabular-nums text-foreground border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                      <span className={goalChip(prev)}>{row.format(prev)}</span>
                    </td>
                    <td className="px-3 py-1 text-center whitespace-nowrap border border-black/40 dark:border-white/10 border-[0.5px] border-l-2 border-l-black/40 dark:border-l-white/30 whitespace-nowrap overflow-hidden text-ellipsis">
                      <Trend current={cur} previous={yoy} lowerIsBetter={row.lowerIsBetter} row={row} />
                    </td>
                    <td className="px-3 py-0.5 text-xs text-right tabular-nums text-foreground border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                      {row.format(yoy)}
                    </td>
                    <td className="px-3 py-0.5 text-xs text-right tabular-nums text-foreground border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                      {row.format(mtd)}
                    </td>
                    <td className="px-3 py-0.5 text-xs text-right tabular-nums text-foreground border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                      {row.format(ytd)}
                    </td>
                  </tr>
                  {isExpanded && (subRows.length === 0 || products.data?.stale) && (
                    <tr className="bg-foreground/[0.03]">
                      <td colSpan={9} className="pl-10 pr-3 py-0.5 text-[10px] text-foreground/60 border border-black/40 dark:border-white/10 border-[0.5px]">
                        {subRows.length > 0 && products.data?.cachedAt
                          ? `ASIN detail as of ${new Date(products.data.cachedAt).toLocaleString()}`
                          : products.isLoading
                            ? "Loading ASIN detail…"
                            : products.isError
                              ? "Couldn't load ASIN detail — collapse and expand to retry."
                              : "No ASIN-level values for this metric in this period."}
                      </td>
                    </tr>
                  )}
                  {isExpanded && subRows.map((p) => (
                    <tr key={p.asin} className="bg-foreground/[0.03] hover:bg-foreground/[0.06] transition-colors">
                      <td className="pl-10 pr-3 py-0 text-[10px] text-foreground dark:text-foreground/60 border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis truncate max-w-[280px] font-mono group/asin relative" title={p.name}>
                        <span className="text-blue-600 dark:text-blue-400">{p.asin}</span>{p.variantParts.length > 0 && p.variantParts.map((part, i) => <span key={i}><span className="text-foreground/40 dark:text-foreground/60"> | </span><span className="text-amber-600 dark:text-brand-orange">{part}</span></span>)}
                        {p.imageUrl && (
                          <div className="hidden group-hover/asin:block absolute z-50 left-0 top-full mt-1 bg-popover rounded-lg shadow-xl border border-border p-1">
                            <img src={hiResAmazonImg(p.imageUrl)} alt={p.name} className="size-20 object-contain" />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-0 text-xs border border-black/40 dark:border-white/10 border-[0.5px]" />
                      <td className="px-3 py-0 text-xs text-right tabular-nums text-foreground dark:text-foreground/70 border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap">
                        {row.format(p.cur)}
                      </td>
                      <td className="px-3 py-0 text-center border border-black/40 dark:border-white/10 border-[0.5px]">
                        <Trend current={p.cur} previous={p.prev} lowerIsBetter={row.lowerIsBetter} row={row} compact />
                      </td>
                      <td className="px-3 py-0 text-xs text-right tabular-nums text-foreground dark:text-foreground/70 border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap">
                        {row.format(p.prev)}
                      </td>
                      <td className="px-3 py-0 text-center border border-black/40 dark:border-white/10 border-[0.5px] border-l-2 border-l-black/40 dark:border-l-white/30">
                        <Trend current={p.cur} previous={p.yoy} lowerIsBetter={row.lowerIsBetter} row={row} compact />
                      </td>
                      <td className="px-3 py-0 text-xs text-right tabular-nums text-foreground dark:text-foreground/70 border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap">
                        {row.format(p.yoy)}
                      </td>
                      <td className="px-3 py-0 text-xs text-right tabular-nums text-foreground dark:text-foreground/70 border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap">
                        {row.format(p.mtd)}
                      </td>
                      <td className="px-3 py-0 text-xs text-right tabular-nums text-foreground dark:text-foreground/70 border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap">
                        {row.format(p.ytd)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Content Impact Attribution — hidden, needs refinement */}
      {children}
    </div>
  );
}

// ── Shared: product data hook + grouping ────────────────────
type PeriodData = {
  product_sales: number;
  units_sold: number;
  ad_impressions: number;
  ad_clicks: number;
  ad_spend: number;
  ad_revenue: number;
  ad_orders: number;
  total_order_items: number;
  browser_session: number;
  mobile_app_session: number;
  available: number;
  inbound_quantity: number;
  reserved_quantity: number;
  reserved_customerorders: number;
  reserved_fc_transfers: number;
  reserved_fc_processing: number;
  unfulfillable_quantity: number;
};

type ProductGroup = {
  asin: string;
  sku: string;
  name: string;
  summarizedTitle: string;
  variationName: string;
  mainImageUrl: string;
  listingStatus: string;
  variationId: string;
  parentAsin: string;
  color: string;
  size: string;
  flavor: string;
  style: string;
  current: PeriodData | null;
  previous: PeriodData | null;
  yoy: PeriodData | null;
  mtd: PeriodData | null;
  ytd: PeriodData | null;
};

interface ProductApiItem {
  asin: string;
  sku: string;
  product_name: string;
  summarized_title: string;
  variation_name: string;
  main_image_url: string;
  listing_status: string;
  variation_id: string;
  parent_asin: string;
  color: string;
  size: string;
  flavor: string;
  style: string;
  current: PeriodData | null;
  previous: PeriodData | null;
  yoy: PeriodData | null;
  mtd: PeriodData | null;
  ytd: PeriodData | null;
}

interface DateRanges {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  yoyStart: string;
  yoyEnd: string;
  mtdStart: string;
  mtdEnd: string;
  ytdStart: string;
  ytdEnd: string;
}

// Module-level flag: set true by refresh button, consumed by next inventory fetch
let inventoryRefreshFlag = false;
export function triggerInventoryRefresh() { inventoryRefreshFlag = true; }

function useProductData(accountIds: string[], ranges: DateRanges, enabled: boolean) {
  const { data, isLoading, isFetching, isError } = useQuery<{ products: ProductApiItem[]; stale?: boolean; cachedAt?: string }>({
    queryKey: ["product-details", accountIds.join(","), ranges.start, ranges.end],
    queryFn: async () => {
      const isRefresh = inventoryRefreshFlag;
      inventoryRefreshFlag = false;
      const params = new URLSearchParams({
        start: ranges.start,
        end: ranges.end,
        accountIds: accountIds.join(","),
        prevStart: ranges.prevStart,
        prevEnd: ranges.prevEnd,
        yoyStart: ranges.yoyStart,
        yoyEnd: ranges.yoyEnd,
        mtdStart: ranges.mtdStart,
        mtdEnd: ranges.mtdEnd,
        ytdStart: ranges.ytdStart,
        ytdEnd: ranges.ytdEnd,
      });
      if (isRefresh) params.set("refresh", "true");
      const res = await fetch(`/api/sales-summary/inventory?${params}`);
      if (!res.ok) throw new Error("Failed to fetch product data");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    enabled: enabled && accountIds.length > 0,
    placeholderData: (prev) => prev,
  });

  const productGroups = useMemo(() => {
    if (!data?.products) return [];
    return data.products
      .map((p): ProductGroup => ({
        asin: p.asin,
        sku: p.sku,
        name: p.product_name,
        summarizedTitle: p.summarized_title || "",
        variationName: p.variation_name || "",
        mainImageUrl: p.main_image_url || "",
        listingStatus: p.listing_status || "",
        variationId: p.variation_id || "",
        parentAsin: p.parent_asin || "",
        color: p.color || "",
        size: p.size || "",
        flavor: p.flavor || "",
        style: p.style || "",
        current: p.current,
        previous: p.previous,
        yoy: p.yoy,
        mtd: p.mtd,
        ytd: p.ytd,
      }))
      .sort((a, b) => (b.current?.product_sales ?? 0) - (a.current?.product_sales ?? 0));
  }, [data]);

  return { data, isLoading, isFetching, isError, productGroups };
}

// ── Product cell (shared between both tables) ──────────────
function ProductCell({ product, rowSpan }: { product: ProductGroup; rowSpan: number }) {
  // Amazon listing status → colored dot (adapted from aplus2's design-status dot).
  const statusDot =
    product.listingStatus === "Active"
      ? "bg-emerald-500"
      : product.listingStatus === "Inactive"
        ? "bg-red-500"
        : "bg-stone-400";
  const displayTitle = product.summarizedTitle || product.name;
  return (
    <td
      rowSpan={rowSpan}
      className="px-4 py-1 border border-black/40 dark:border-white/10 align-top bg-background"
    >
      <div>
        {/* Identity header — mirrors the aplus2 set-card header (dark strip so brand gold + white SKU pop) */}
        <div className="bg-zinc-900 rounded-lg px-3 py-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-brand/20 text-brand font-bold shrink-0 uppercase tracking-wider">
              ASIN
            </span>
            <span className="text-sm font-bold text-brand font-mono">{product.asin}</span>
          </div>
          {product.sku && product.sku !== product.asin && (
            <div className="text-xs text-white font-mono">{product.sku}</div>
          )}
          {product.variationName && (
            <div className="text-xs text-zinc-300 truncate" title={product.variationName}>
              {product.variationName}
            </div>
          )}
          {displayTitle && (
            <div className="text-sm text-zinc-400 truncate" title={product.name}>
              {displayTitle}
            </div>
          )}
          {product.listingStatus && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className={`inline-block size-2 rounded-full shrink-0 ${statusDot}`} />
              <span className="text-[10px] text-zinc-400">{product.listingStatus}</span>
            </div>
          )}
        </div>

        {/* Variation hierarchy + attribute breakdown (hub-only detail, kept below the header) */}
        {product.variationId && (
          <div className="text-[10px] text-foreground/70 font-mono mt-1.5">
            <span className="text-foreground/40">VarID:</span> {product.variationId}
          </div>
        )}
        {product.parentAsin && (
          <div className="text-[10px] text-foreground/70 font-mono">
            <span className="text-foreground/40">Parent:</span> {product.parentAsin}
          </div>
        )}
        {product.color && (
          <div className="text-[10px] text-brand mt-0.5">
            <span className="text-foreground/40">Color:</span> {product.color}
          </div>
        )}
        {product.flavor && (
          <div className="text-[10px] text-brand">
            <span className="text-foreground/40">Flavor:</span> {product.flavor}
          </div>
        )}
        {product.style && (
          <div className="text-[10px] text-brand">
            <span className="text-foreground/40">Style:</span> {product.style}
          </div>
        )}
        {product.size && (
          <div className="text-[10px] text-brand">
            <span className="text-foreground/40">Size:</span> {product.size}
          </div>
        )}
        {product.mainImageUrl && (
          <img
            src={hiResAmazonImg(product.mainImageUrl)}
            alt=""
            className="size-48 rounded object-contain bg-white mt-1.5"
          />
        )}
      </div>
    </td>
  );
}

// ── Collapsible section wrapper ──────────────────────────────
function CollapsibleSection({
  icon: Icon,
  label,
  expanded,
  onToggle,
  skuCount,
  isLoading,
  isEmpty,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  expanded: boolean;
  onToggle: () => void;
  skuCount: number;
  isLoading: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
      >
        <Icon className="size-4" />
        <span>{label}</span>
        {expanded ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        {!expanded && skuCount > 0 && (
          <span className="text-xs text-foreground/40 ml-1">
            {skuCount} SKUs
          </span>
        )}
      </button>

      {expanded && (
        <div className="glass-card rounded-xl overflow-hidden mt-1" style={{ boxShadow: "0 0 0 2px black", border: "none" }}>
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="size-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {isEmpty && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No data for this period.
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

// ── Product Details: unified metric definitions ─────────────
type Goals = ClientSales["goals"];

type ProductMetricDef = {
  label: string;
  getValue: (p: PeriodData) => number | null;
  format: (n: number | null | undefined) => string;
  bgClass: string;
  bold?: boolean;
  lowerIsBetter?: boolean;
  goalKey?: keyof Goals;
  indent?: boolean;
  sectionStart?: string; // renders a separator row before this metric
};

const PRODUCT_METRICS: ProductMetricDef[] = [
  // Sales metrics
  { label: "Sales", getValue: (p) => p.product_sales, format: fmtCurrency, bgClass: "bg-purple-500/10", bold: true, goalKey: "salesForecast" },
  {
    label: "Organic Rev %",
    getValue: (p) => p.product_sales > 0 ? Math.max(0, Math.min(100, ((p.product_sales - p.ad_revenue) / p.product_sales) * 100)) : null,
    format: fmtPct,
    bgClass: "bg-purple-500/[0.06]",
  },
  {
    label: "Paid Rev %",
    getValue: (p) => p.product_sales > 0 ? Math.max(0, Math.min(100, (p.ad_revenue / p.product_sales) * 100)) : null,
    format: fmtPct,
    bgClass: "bg-purple-500/[0.06]",
  },
  { label: "Sessions (Mobile)", getValue: (p) => p.mobile_app_session, format: fmtInt, bgClass: "bg-sky-500/10" },
  { label: "Sessions (Desktop)", getValue: (p) => p.browser_session, format: fmtInt, bgClass: "bg-sky-500/10" },
  { label: "Orders", getValue: (p) => p.total_order_items, format: fmtInt, bgClass: "bg-indigo-500/10" },
  { label: "Units", getValue: (p) => p.units_sold, format: fmtInt, bgClass: "bg-indigo-500/10", bold: true },
  { label: "Ad Spend", getValue: (p) => p.ad_spend, format: fmtCurrency, bgClass: "bg-orange-500/10", bold: true, goalKey: "adSpendBudget", lowerIsBetter: true },
  { label: "Ad Revenue", getValue: (p) => p.ad_revenue, format: fmtCurrency, bgClass: "bg-orange-500/10" },
  { label: "Clicks", getValue: (p) => p.ad_clicks, format: fmtInt, bgClass: "bg-orange-500/[0.06]" },
  { label: "Impressions", getValue: (p) => p.ad_impressions, format: fmtInt, bgClass: "bg-orange-500/[0.06]" },
  {
    label: "CTR",
    getValue: (p) => p.ad_impressions > 0 ? (p.ad_clicks / p.ad_impressions) * 100 : null,
    format: fmtPct,
    bgClass: "bg-orange-500/[0.06]",
  },
  {
    label: "ACoS",
    getValue: (p) => p.ad_revenue > 0 ? (p.ad_spend / p.ad_revenue) * 100 : null,
    format: fmtPct,
    bgClass: "bg-rose-500/10",
    lowerIsBetter: true,
    goalKey: "acosGoal",
  },
  {
    label: "TACoS",
    getValue: (p) => p.product_sales > 0 ? (p.ad_spend / p.product_sales) * 100 : null,
    format: fmtPct,
    bgClass: "bg-rose-500/10",
    lowerIsBetter: true,
    goalKey: "tacosGoal",
  },
  {
    label: "RoAS",
    getValue: (p) => p.ad_spend > 0 ? p.ad_revenue / p.ad_spend : null,
    format: fmtDec,
    bgClass: "bg-rose-500/[0.06]",
    goalKey: "roasGoal",
  },
  // Inventory metrics (latest snapshot)
  { label: "Available", getValue: (p) => p.available, format: fmtInt, bgClass: "bg-emerald-500/10", bold: true, sectionStart: "Inventory" },
  { label: "Inbound", getValue: (p) => p.inbound_quantity, format: fmtInt, bgClass: "bg-blue-500/10", bold: true },
  { label: "Reserved", getValue: (p) => p.reserved_quantity, format: fmtInt, bgClass: "bg-amber-500/10", bold: true },
  { label: "Customer Orders", getValue: (p) => p.reserved_customerorders, format: fmtInt, bgClass: "bg-amber-500/[0.06]", indent: true },
  { label: "FC Transfer", getValue: (p) => p.reserved_fc_transfers, format: fmtInt, bgClass: "bg-amber-500/[0.06]", indent: true },
  { label: "FC Processing", getValue: (p) => p.reserved_fc_processing, format: fmtInt, bgClass: "bg-amber-500/[0.06]", indent: true },
  { label: "Unfulfillable", getValue: (p) => p.unfulfillable_quantity, format: fmtInt, bgClass: "bg-red-500/10", bold: true },
];

function ProductDetailRows({ product, goals, currentLabel, previousLabel, yoyLabel }: {
  product: ProductGroup;
  goals: Goals;
  currentLabel: string;
  previousLabel: string;
  yoyLabel: string;
}) {
  const rowCount = PRODUCT_METRICS.length;

  function goalChip(value: number | null, goal: number | null, lowerIsBetter?: boolean): string {
    if (value == null || goal == null) return "";
    const meets = lowerIsBetter ? value <= goal : value >= goal;
    return meets
      ? "rounded-full px-2 py-0.5 bg-[#34C759]/20 text-[#34C759] font-bold inline-block"
      : "rounded-full px-2 py-0.5 bg-[#FF5C5F]/20 text-[#FF5C5F] font-bold inline-block";
  }

  // Count separator rows for correct rowSpan
  const separatorCount = PRODUCT_METRICS.filter((m) => m.sectionStart).length;
  const totalRows = rowCount + separatorCount;

  return (
    <>
      {PRODUCT_METRICS.map((m, mi) => {
        const goal = m.goalKey ? goals[m.goalKey] : null;
        const cur = product.current ? m.getValue(product.current) : null;
        const prev = product.previous ? m.getValue(product.previous) : null;
        const yoy = product.yoy ? m.getValue(product.yoy) : null;
        const mtd = product.mtd ? m.getValue(product.mtd) : null;
        const ytd = product.ytd ? m.getValue(product.ytd) : null;

        return (
          <Fragment key={m.label}>
            {m.sectionStart && (
              <tr className="bg-black/80 dark:bg-white/10">
                <td colSpan={9} className="px-5 py-0.5 text-[10px] font-bold text-white dark:text-foreground uppercase tracking-wider border border-black/40 dark:border-white/10">
                  {m.sectionStart}
                </td>
              </tr>
            )}
            <tr className={`${m.bgClass} hover:bg-brand/[0.02] ${mi === 0 ? "border-t-2 border-t-black dark:border-t-white/30" : ""}`}>
              {mi === 0 && <ProductCell product={product} rowSpan={totalRows} />}
              <td className={`px-5 py-0 text-xs border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap ${m.bold ? "font-semibold" : ""} ${m.indent ? "pl-8" : ""}`}>
                {m.label}
              </td>
              <td className="px-3 py-0 text-right tabular-nums text-xs border border-black/40 dark:border-white/10 border-[0.5px] text-foreground whitespace-nowrap">
                {goal != null ? m.format(goal) : ""}
              </td>
              <td className="px-3 py-px text-right tabular-nums text-xs font-bold border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap">
                <span className={goalChip(cur, goal, m.lowerIsBetter)}>
                  {cur != null ? m.format(cur) : "—"}
                </span>
              </td>
              <td className="px-3 py-0 text-center whitespace-nowrap border border-black/40 dark:border-white/10 border-[0.5px]">
                <Trend current={cur} previous={prev} lowerIsBetter={m.lowerIsBetter} format={m.format} />
              </td>
              <td className="px-3 py-0 text-right tabular-nums text-xs border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap">
                <span className={goalChip(prev, goal, m.lowerIsBetter)}>
                  {prev != null ? m.format(prev) : "—"}
                </span>
              </td>
              <td className="px-3 py-0 text-center whitespace-nowrap border border-black/40 dark:border-white/10 border-[0.5px] border-l-2 border-l-black/40 dark:border-l-white/30">
                <Trend current={cur} previous={yoy} lowerIsBetter={m.lowerIsBetter} format={m.format} />
              </td>
              <td className="px-3 py-0 text-right tabular-nums text-xs border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap">
                {yoy != null ? m.format(yoy) : "—"}
              </td>
              <td className="px-3 py-0 text-right tabular-nums text-xs border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap">
                {mtd != null ? m.format(mtd) : "—"}
              </td>
              <td className="px-3 py-0 text-right tabular-nums text-xs border border-black/40 dark:border-white/10 border-[0.5px] whitespace-nowrap">
                {ytd != null ? m.format(ytd) : "—"}
              </td>
            </tr>
          </Fragment>
        );
      })}
    </>
  );
}

// ── Product Data Sections (per-client) ──────────────────────
function ProductDataSections({ accountIds, ranges, goals, currentLabel, previousLabel, yoyLabel, mode }: {
  accountIds: string[];
  ranges: DateRanges;
  goals: Goals;
  currentLabel: string;
  previousLabel: string;
  yoyLabel: string;
  mode: "week" | "custom";
}) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(10);

  const { data, isLoading, productGroups } = useProductData(accountIds, ranges, open);

  const hasData = !!data && productGroups.length > 0;
  const isEmpty = !!data && productGroups.length === 0;

  const visibleProducts = productGroups.slice(0, visible);

  return (
    <div className="mt-2 mb-4">
      <CollapsibleSection
        icon={BarChart3}
        label="Product Details"
        expanded={open}
        onToggle={() => setOpen(!open)}
        skuCount={productGroups.length}
        isLoading={isLoading}
        isEmpty={isEmpty && open}
      >
        {hasData && open && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm [&_td]:align-top">
                <thead>
                  <tr className="bg-black/80 dark:bg-white/10 sticky top-0 z-10 backdrop-blur-sm">
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 min-w-[240px] w-[240px]">
                      Product
                    </th>
                    <th className="px-5 py-1 text-left text-xs font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap">
                      Metric
                    </th>
                    <th className="px-3 py-1 text-right text-xs font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap">
                      {mode === "week" ? "Week Goal" : "Period Goal"}
                    </th>
                    <th className="px-3 py-1 text-right text-xs font-medium text-brand border border-black/40 dark:border-white/10 whitespace-nowrap">
                      {currentLabel}
                    </th>
                    <th className="px-3 py-1 text-center text-sm font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap">
                      Trend
                    </th>
                    <th className="px-3 py-1 text-right text-xs font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap">
                      {previousLabel}
                    </th>
                    <th className="px-3 py-1 text-center text-sm font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 border-l-2 border-l-black/40 dark:border-l-white/30 whitespace-nowrap">
                      YoY Trend
                    </th>
                    <th className="px-3 py-1 text-right text-xs font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap">
                      {yoyLabel}
                    </th>
                    <th className="px-3 py-1 text-right text-xs font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap">
                      MTD
                    </th>
                    <th className="px-3 py-1 text-right text-xs font-medium text-white dark:text-foreground border border-black/40 dark:border-white/10 whitespace-nowrap">
                      YTD
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((product) => (
                    <ProductDetailRows
                      key={`${product.asin}|${product.sku}`}
                      product={product}
                      goals={goals}
                      currentLabel={currentLabel}
                      previousLabel={previousLabel}
                      yoyLabel={yoyLabel}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {visible < productGroups.length && (
              <button type="button" onClick={() => setVisible((v) => v + 10)} className="w-full py-2 text-xs font-medium text-foreground/60 hover:text-foreground hover:bg-muted/30 transition-colors">
                Show more ({productGroups.length - visible} remaining)
              </button>
            )}
          </>
        )}
      </CollapsibleSection>
    </div>
  );
}

function getSundayOfWeek(year: number, week: number): Date {
  // ISO week: week 1 contains Jan 4th
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7; // Mon=1..Sun=7
  const mondayW1 = new Date(year, 0, 4 - jan4Day + 1);
  const monday = new Date(mondayW1);
  monday.setDate(mondayW1.getDate() + (week - 1) * 7);
  // Shift back 1 day: Sunday is start of week
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() - 1);
  return sunday;
}

function getMaxWeek(year: number): number {
  // Dec 28 is always in the last ISO week of the year
  return getWeekNumber(`${year}-12-28`);
}

export default function SalesSummaryPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const isAdmin = hasAdminPowers((session?.user as { role?: string } | undefined)?.role);
  const now = new Date();
  const currentWeek = getWeekNumber(formatDate(now));
  const currentYear = now.getFullYear();

  const [mode, setMode] = useState<"week" | "custom">("week");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedWeek, setSelectedWeek] = useState(currentWeek > 1 ? currentWeek - 1 : currentWeek);
  const [customStart, setCustomStart] = useState(() => formatDate(now));
  const [customEnd, setCustomEnd] = useState(() => formatDate(now));
  const refreshRef = useRef(false);

  const weekRange = useMemo(() => {
    const sunday = getSundayOfWeek(selectedYear, selectedWeek);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    return { sunday, saturday, start: formatDate(sunday), end: formatDate(saturday) };
  }, [selectedYear, selectedWeek]);

  const queryStart = mode === "week" ? weekRange.start : customStart;
  const queryEnd = mode === "week" ? weekRange.end : customEnd;

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<SalesSummaryResponse>({
    queryKey: ["sales-summary", mode, queryStart, queryEnd],
    queryFn: async () => {
      const isRefresh = refreshRef.current;
      refreshRef.current = false;
      const res = await fetch(`/api/sales-summary?period=7D&start=${queryStart}&end=${queryEnd}${isRefresh ? "&refresh=true" : ""}`);
      if (!res.ok) throw new Error("Failed to fetch sales summary");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
    enabled: mode === "week" || (!!customStart && !!customEnd && customStart <= customEnd),
  });

  const { data: sparklines } = useQuery<SparklineData>({
    queryKey: ["clients", "sales-sparklines"],
    queryFn: fetchSalesSparklines,
    staleTime: 10 * 60 * 1000,
  });

  const { data: layout } = useQuery<{ ordered: string[]; hidden: string[] }>({
    queryKey: ["sales-summary-layout"],
    queryFn: async () => {
      const res = await fetch("/api/sales-summary/config");
      if (!res.ok) return { ordered: [], hidden: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const displayClients = useMemo(() => {
    if (!data?.clients) return [];
    const hidden = new Set(layout?.hidden ?? []);
    const ordered = layout?.ordered ?? [];
    const visible = data.clients.filter((c) => !hidden.has(c.clientIdCode));
    if (ordered.length === 0) return visible;
    const posMap = new Map(ordered.map((id, i) => [id, i]));
    return visible.slice().sort((a, b) => {
      const pa = posMap.has(a.clientIdCode) ? posMap.get(a.clientIdCode)! : Infinity;
      const pb = posMap.has(b.clientIdCode) ? posMap.get(b.clientIdCode)! : Infinity;
      return pa - pb;
    });
  }, [data?.clients, layout]);

  // Prefetch product details for all clients as soon as main data arrives
  useEffect(() => {
    if (!data?.clients) return;
    for (const client of data.clients) {
      const params = new URLSearchParams({
        start: data.start, end: data.end,
        accountIds: client.accountIds.join(","),
        prevStart: data.prevStart, prevEnd: data.prevEnd,
        yoyStart: data.yoyStart, yoyEnd: data.yoyEnd,
        mtdStart: data.mtdStart, mtdEnd: data.mtdEnd,
        ytdStart: data.ytdStart, ytdEnd: data.ytdEnd,
      });
      queryClient.prefetchQuery({
        queryKey: ["product-details", client.accountIds.join(","), data.start, data.end],
        queryFn: async () => {
          // No refresh=true here: that forced a live Redshift scan for EVERY client at
          // once on page load (~80 queries), which is what pushed scans past the timeout.
          // Freshness is the cron's job; the Refresh button still forces one.
          const res = await fetch(`/api/sales-summary/inventory?${params}`);
          if (!res.ok) throw new Error("Failed to fetch product data");
          return res.json();
        },
        staleTime: 10 * 60 * 1000,
      });
    }
  }, [data, queryClient]);

  return (
    <div className="-mt-6 lg:-mt-8">
      {/* Title + data status + date slicer — portaled into top-nav row 3 */}
      <PageMetaSlot>
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none">
              <span className="font-bold text-sidebar-foreground">Sales</span><span className="font-normal text-brand">Summary</span>
            </h1>
            <button
              type="button"
              onClick={() => {
                refreshRef.current = true;
                triggerInventoryRefresh();
                queryClient.invalidateQueries({ queryKey: ["sales-summary"] });
                queryClient.invalidateQueries({ queryKey: ["sales-daily"], refetchType: "active" });
                queryClient.invalidateQueries({ queryKey: ["sales-sns"], refetchType: "active" });
                queryClient.invalidateQueries({ queryKey: ["product-details"] });
              }}
              disabled={isFetching}
              title="Refresh data"
              className="p-1 rounded-md text-brand hover:text-brand/80 hover:bg-brand/10 transition-colors disabled:opacity-30"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isFetching ? "animate-spin" : ""}>
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
            {isAdmin && (
              <Link
                href="/sales-summary/config"
                title="Configure client visibility & order"
                className="p-1 rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <Settings size={16} />
              </Link>
            )}
          </div>
          <div className="min-w-0">
            {(() => {
            const now = new Date();

            // Row 1: Latest Redshift data date
            let latestRow: React.ReactNode = null;
            if (data?.latestDataDate) {
              const parts = data.latestDataDate.split("-").map(Number);
              const latestDate = new Date(parts[0], parts[1] - 1, parts[2]);
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const daysAgo = Math.round((today.getTime() - latestDate.getTime()) / 86400000);
              const formatted = latestDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
              const relativeText = daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`;
              const isStale = daysAgo > 2;
              latestRow = (
                <p className="text-xs font-mono flex items-center gap-1.5 text-brand">
                  {isStale && <span className="inline-block size-1.5 rounded-full bg-brand animate-pulse" />}
                  Redshift data: {formatted} <span className="text-brand/40">·</span> {relativeText}
                </p>
              );
            }

            // Row 2: Last page refresh (when data was fetched)
            let pageRefreshRow: React.ReactNode = null;
            if (data) {
              const fetchedAt = data.lastRefreshedAt ? new Date(data.lastRefreshedAt) : null;
              if (fetchedAt && !isNaN(fetchedAt.getTime())) {
                const diffMs = now.getTime() - fetchedAt.getTime();
                const diffHrs = Math.floor(diffMs / 3600000);
                const diffMins = Math.floor((diffMs % 3600000) / 60000);
                const refreshFormatted = fetchedAt.toLocaleString("en-US", {
                  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC",
                }) + " UTC";
                const ago = diffHrs > 24
                  ? `${Math.floor(diffHrs / 24)}d ago`
                  : diffHrs > 0
                    ? `${diffHrs}h ${diffMins}m ago`
                    : `${diffMins}m ago`;
                pageRefreshRow = (
                  <p className="text-[10px] font-mono text-foreground/35">
                    DB refreshed: {refreshFormatted} ({ago})
                  </p>
                );
              }
            }

            // Row 3: Last page refresh (when frontend fetched data)
            let pageFetchRow: React.ReactNode = null;
            if (dataUpdatedAt) {
              const fetchedDate = new Date(dataUpdatedAt);
              const diffMs = now.getTime() - fetchedDate.getTime();
              const diffMins = Math.floor(diffMs / 60000);
              const diffSecs = Math.floor((diffMs % 60000) / 1000);
              const fetchFormatted = fetchedDate.toLocaleString("en-US", {
                hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "UTC",
              }) + " UTC";
              const fetchAgo = diffMins > 0 ? `${diffMins}m ${diffSecs}s ago` : `${diffSecs}s ago`;
              pageFetchRow = (
                <p className="text-[10px] font-mono text-foreground/35">
                  Page refreshed: {fetchFormatted} ({fetchAgo})
                </p>
              );
            }

            return (latestRow || pageRefreshRow || pageFetchRow) ? (
              <div className="mt-1 flex flex-col gap-0.5">
                {latestRow}
                {pageRefreshRow}
                {pageFetchRow}
              </div>
            ) : null;
          })()}
          </div>
        </div>

        {/* Date Slicer */}
        <div className="glass-card rounded-lg border border-border/60 px-3 py-1 text-sm w-fit shrink-0 flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex gap-0.5 p-0.5 rounded-lg bg-muted/30 border border-border/40">
            <button
              type="button"
              onClick={() => setMode("week")}
              className={`px-2 py-0.5 rounded-md text-xs font-bold transition-all ${mode === "week" ? "bg-brand text-white shadow-sm" : "text-foreground/70 hover:text-foreground"}`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`px-2 py-0.5 rounded-md text-xs font-bold transition-all ${mode === "custom" ? "bg-brand text-white shadow-sm" : "text-foreground/70 hover:text-foreground"}`}
            >
              Custom
            </button>
          </div>

          <div className="h-4 w-px bg-border/40" />

          {mode === "week" ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Calendar className="size-3.5 text-foreground/40" />
                <span className="text-foreground/70 text-xs font-medium">Year</span>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    const yr = Number(e.target.value);
                    setSelectedYear(yr);
                    if (yr === currentYear && selectedWeek > currentWeek) setSelectedWeek(currentWeek);
                  }}
                  className="bg-background border border-border/60 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {Array.from({ length: 6 }, (_, i) => currentYear - 5 + i).map((yr) => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-foreground/70 text-xs font-medium">Week</span>
                <select
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(Number(e.target.value))}
                  className="bg-background border border-border/60 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {Array.from({ length: getMaxWeek(selectedYear) }, (_, i) => i + 1)
                    .filter((w) => selectedYear < currentYear || w <= currentWeek)
                    .map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                </select>
              </div>
              <div className="h-4 w-px bg-border/40" />
              <span className="text-xs tabular-nums text-foreground/70">{weekRange.start}</span>
              <span className="text-foreground/40">–</span>
              <span className="text-xs tabular-nums text-foreground/70">{weekRange.end}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <DatePicker value={customStart} onChange={setCustomStart} className="h-6 text-xs font-bold" />
              <span className="text-muted-foreground/40">–</span>
              <DatePicker value={customEnd} onChange={setCustomEnd} className="h-6 text-xs font-bold" />
              {customStart && customEnd && customStart <= customEnd && (
                <span className="text-xs tabular-nums text-foreground/70 ml-1">
                  ({Math.round((new Date(customEnd + "T00:00:00").getTime() - new Date(customStart + "T00:00:00").getTime()) / 86400000) + 1}d)
                </span>
              )}
            </div>
          )}
        </div>
      </PageMetaSlot>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-6">
          <LoadingPlaceholder count={4} height="h-[500px]" />
        </div>
      )}

      {/* Client Cards */}
      {data && (
        <>
          {displayClients.length > 0 && (
            <WeeklyRankCard
              mode={mode}
              periodLabel={
                mode === "week"
                  ? `${selectedYear}W${String(selectedWeek).padStart(2, "0")}`
                  : `${data.start.slice(5).replace("-", "/")}–${data.end.slice(5).replace("-", "/")}`
              }
              previousPeriodLabel={
                mode === "week"
                  ? selectedWeek > 1
                    ? `${selectedYear}W${String(selectedWeek - 1).padStart(2, "0")}`
                    : `${selectedYear - 1}W${String(getMaxWeek(selectedYear - 1)).padStart(2, "0")}`
                  : `${data.prevStart.slice(5).replace("-", "/")}–${data.prevEnd.slice(5).replace("-", "/")}`
              }
              metrics={METRIC_ROWS.map((r) => ({
                label: r.label,
                kind: weeklyRankKind(r.format),
                lowerIsBetter: r.lowerIsBetter,
              }))}
              clients={displayClients.map((c) => ({
                clientIdCode: c.clientIdCode,
                clientName: c.clientName,
                brandName: c.brandName,
                accountIds: c.accountIds,
                logoSrc: clientLogoSrc(c),
                values: Object.fromEntries(
                  METRIC_ROWS.map((r) => [
                    r.label,
                    { current: r.getCurrent(c), previous: r.getPrevious(c) },
                  ]),
                ),
              }))}
            />
          )}
          {displayClients.map((client, i) => {
            if (client.accountIds.length === 0) {
              return (
                <Fragment key={client.clientIdCode}>
                  <NotConnectedCard client={client} />
                </Fragment>
              );
            }
            let curLabel: string, prevLabel: string, yoyLabel: string;
            if (mode === "week") {
              const addDay = (d: string) => {
                const dt = new Date(d + "T00:00:00");
                dt.setDate(dt.getDate() + 1);
                return formatDate(dt);
              };
              const curWk = getWeekNumber(addDay(data.start));
              const prevWk = getWeekNumber(addDay(data.prevStart));
              const yoyWk = getWeekNumber(addDay(data.yoyStart));
              curLabel = `${data.start.slice(0, 4)}W${String(curWk).padStart(2, "0")}`;
              prevLabel = `${data.prevStart.slice(0, 4)}W${String(prevWk).padStart(2, "0")}`;
              yoyLabel = `${data.yoyStart.slice(0, 4)}W${String(yoyWk).padStart(2, "0")}`;
            } else {
              const fmtShort = (d: string) => d.slice(5).replace("-", "/");
              curLabel = `${fmtShort(data.start)}–${fmtShort(data.end)}`;
              prevLabel = `${fmtShort(data.prevStart)}–${fmtShort(data.prevEnd)}`;
              yoyLabel = `${data.yoyStart.slice(0, 4)} ${fmtShort(data.yoyStart)}–${fmtShort(data.yoyEnd)}`;
            }
            const ranges: DateRanges = {
              start: data.start,
              end: data.end,
              prevStart: data.prevStart,
              prevEnd: data.prevEnd,
              yoyStart: data.yoyStart,
              yoyEnd: data.yoyEnd,
              mtdStart: data.mtdStart,
              mtdEnd: data.mtdEnd,
              ytdStart: data.ytdStart,
              ytdEnd: data.ytdEnd,
            };
            return (
              <Fragment key={client.clientIdCode}>
                <ClientCard client={client} currentLabel={curLabel} previousLabel={prevLabel} yoyLabel={yoyLabel} start={data.start} end={data.end} ranges={ranges} mode={mode} sparklinePoints={sparklines?.clients[client.clientIdCode]?.points} latestDataDate={data.latestDataDate}>
                  <ProductDataSections
                    accountIds={client.accountIds}
                    ranges={ranges}
                    goals={client.goals}
                    currentLabel={curLabel}
                    previousLabel={prevLabel}
                    yoyLabel={yoyLabel}
                    mode={mode}
                  />
                </ClientCard>
              </Fragment>
            );
          })}
        </>
      )}

      {data && displayClients.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          No Intentwise data found for this period.
        </div>
      )}
    </div>
  );
}

"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */

import { createPortal } from "react-dom";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useState, useMemo, useRef, useCallback } from "react";
import { TrendingUp, TrendingDown, Minus, Calendar, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CLIENT_NAMES } from "@/lib/constants";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { DatePicker } from "@/components/ui/date-picker";
import { PortalStackedClients } from "@/components/portal/portal-stacked-clients";

// ── Types ──────────────────────────────────────────────────────────

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
  tier: string | null;
  marketplace: string | null;
  ppcManager: string | null;
  accountManager: string | null;
  accountIds: string[];
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
  clients: ClientSales[];
  latestDataDate?: string;
  lastRefreshedAt?: string;
}

// ── Formatters ──────────────────────────────────────────────────

import { fmtCurrency, fmtInt, fmtPct, fmtDec } from "@/lib/formatters";

// ── Week helpers (Sunday-Saturday) ──────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekNumber(d: Date | string): number {
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

function getSundayOfWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const mondayW1 = new Date(year, 0, 4 - jan4Day + 1);
  const monday = new Date(mondayW1);
  monday.setDate(mondayW1.getDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() - 1);
  return sunday;
}

function getMaxWeek(year: number): number {
  return getWeekNumber(`${year}-12-28`);
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
}

// ── Trend arrow ─────────────────────────────────────────────────

function Trend({ current, previous, lowerIsBetter = false, row }: {
  current: number | null;
  previous: number | null;
  lowerIsBetter?: boolean;
  row?: MetricRowDef;
}) {
  if (current == null || previous == null || previous === 0) {
    return <Minus className="size-3.5 text-muted-foreground/30 inline" />;
  }
  const pctChange = ((current - previous) / Math.abs(previous)) * 100;
  const isUp = pctChange > 0;
  const isGood = lowerIsBetter ? !isUp : isUp;
  const color = Math.abs(pctChange) < 1
    ? "text-muted-foreground/50"
    : isGood
      ? "text-[#34C759]"
      : "text-[#FF5C5F]";

  const diff = current - previous;
  const formatFn = row?.format ?? fmtDec;

  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      <Icon className="size-3.5 shrink-0" />
      <span className="text-sm font-bold tabular-nums">{formatFn(diff)}</span>
    </span>
  );
}

// ── Metric rows ─────────────────────────────────────────────────

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
  },
];

// ── SVG Sparkline Chart (blue theme) ────────────────────────────

const BLUE = "#2563eb";

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
      <div className="flex items-center justify-center h-20 text-xs text-slate-400 dark:text-slate-500">
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
  const allVals = goal != null ? [...values, goal] : values;
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = maxVal - minVal || 1;

  const points = valid.map((d, i) => {
    const x = PAD.left + (i / (valid.length - 1)) * chartW;
    const y = PAD.top + chartH - ((d.value - minVal) / range) * chartH;
    return { x, y, date: d.date, value: d.value };
  });

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
      <text x={W / 2} y={14} textAnchor="middle" className="fill-slate-900 dark:fill-white text-[11px] font-bold">{label}</text>
      {/* Gradient fill */}
      <defs>
        <linearGradient id="sparkGradPortal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BLUE} stopOpacity="0.2" />
          <stop offset="100%" stopColor={BLUE} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkGradPortal)" />
      <path d={linePath} fill="none" stroke={BLUE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
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
              stroke="#ef4444"
              strokeWidth="1"
              strokeDasharray="6 3"
              opacity="0.6"
            />
            <text
              x={W - PAD.right}
              y={goalY - 4}
              textAnchor="end"
              className="fill-red-400 text-[8px] font-bold tabular-nums"
            >
              Goal: {format(goal)}
            </text>
          </g>
        );
      })()}
      {/* Data points */}
      {points.map((p, i) => {
        const meetsGoal = goal != null
          ? (lowerIsBetter ? p.value <= goal : p.value >= goal)
          : null;
        const dotColor = meetsGoal === true
          ? "#22c55e"
          : meetsGoal === false
            ? "#f87171"
            : BLUE;
        const textClass = meetsGoal === true
          ? "fill-emerald-500"
          : meetsGoal === false
            ? "fill-red-400"
            : "fill-slate-900 dark:fill-white";
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3.5" fill={dotColor} stroke="white" strokeWidth="1.5" />
            <text
              x={p.x}
              y={p.y - 10}
              textAnchor="middle"
              className={`text-[9px] font-bold tabular-nums ${textClass}`}
            >
              {format(p.value)}
            </text>
            <text
              x={p.x}
              y={H - 6}
              textAnchor="middle"
              className="fill-slate-400 dark:fill-slate-500 text-[8px] tabular-nums"
            >
              {p.date.slice(5)}
            </text>
          </g>
        );
      })}
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

  const { data: dailyData, isError: dailyError } = useQuery<{ days: DailyMetrics[] }>({
    queryKey: ["sales-daily", accountIds.join(","), start, end],
    queryFn: async () => {
      const res = await fetch(`/api/sales-summary/daily?start=${start}&end=${end}&accountIds=${accountIds.join(",")}`);
      if (!res.ok) throw new Error("Failed to fetch daily data");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
    enabled: shouldFetch && accountIds.length > 0,
  });

  const chartData = useMemo(() => {
    if (!dailyData?.days) return [];
    return dailyData.days.map((d) => ({
      date: d.report_date,
      value: row.getDailyValue(d),
    }));
  }, [dailyData, row]);

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="cursor-default border-b border-dashed border-slate-400/30 hover:border-portal-accent/50 transition-colors">
        {row.label}
      </span>
      {isHovered && createPortal(
        <div
          className="z-[9999] rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-150 bg-card"
          style={popoverStyle}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={handleMouseLeave}
        >
          {!dailyData && !dailyError ? (
            <div className="flex items-center justify-center w-[360px] h-[220px]">
              <div className="size-4 border-2 border-portal-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : dailyError ? (
            <div className="flex items-center justify-center w-[360px] h-[220px] text-xs text-muted-foreground">
              Failed to load chart data
            </div>
          ) : (
            <SparklineChart data={chartData} format={row.format} label={row.label} goal={goal} lowerIsBetter={row.lowerIsBetter} />
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Client card component (portal blue theme) ───────────────────

function ClientCard({ client, clientName, currentLabel, previousLabel, yoyLabel, start, end }: {
  client: ClientSales;
  clientName: string;
  currentLabel: string;
  previousLabel: string;
  yoyLabel: string;
  start: string;
  end: string;
}) {
  return (
    <div className="rounded-xl overflow-hidden glass-card text-card-foreground animate-card-enter border border-black/20 dark:border-white/10">
      {/* Header */}
      <div className="px-5 py-4 border-b border-black/20 dark:border-white/10 border-b-[0.5px] flex items-center justify-between bg-portal-accent rounded-t-xl">
        <div>
          <h3 className="text-xl font-bold text-white font-[family-name:var(--font-outfit)] tracking-tight">
            {clientName}
          </h3>
          <p className="text-[11px] text-white/70 font-mono mt-0.5">
            {client.clientIdCode}
            {client.marketplace && <span className="ml-2">{client.marketplace}</span>}
          </p>
        </div>
      </div>

      {/* Metrics table */}
      <div className="overflow-hidden rounded-b-xl">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-muted/20 sticky top-0 z-10 backdrop-blur-sm">
              <th className="px-5 py-1 text-left text-xs font-medium text-foreground border border-black/20 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                Metric
              </th>
              <th className="px-3 py-1 text-right text-xs font-medium text-foreground border border-black/20 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                Goal
              </th>
              <th className="px-3 py-1 text-right text-xs font-medium text-portal-accent border border-black/20 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                {currentLabel}
              </th>
              <th className="px-3 py-1 text-center text-sm font-medium text-foreground border border-black/20 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                Trend
              </th>
              <th className="px-3 py-1 text-right text-xs font-medium text-foreground border border-black/20 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                {previousLabel}
              </th>
              <th className="px-3 py-1 text-center text-sm font-medium text-foreground border border-black/20 dark:border-white/10 border-l-2 border-l-black/40 dark:border-l-white/30 whitespace-nowrap overflow-hidden text-ellipsis">
                YoY Trend
              </th>
              <th className="px-3 py-1 text-right text-xs font-medium text-foreground border border-black/20 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                {yoyLabel}
              </th>
              <th className="px-3 py-1 text-right text-xs font-medium text-foreground border border-black/20 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
                MTD
              </th>
              <th className="px-3 py-1 text-right text-xs font-medium text-foreground border border-black/20 dark:border-white/10 whitespace-nowrap overflow-hidden text-ellipsis">
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

              function goalChip(value: number | null): string {
                if (value == null || goal == null) return "";
                const meetsGoal = row.lowerIsBetter
                  ? value <= goal
                  : value >= goal;
                return meetsGoal
                  ? "rounded-full px-2.5 py-0.5 bg-[#34C759]/20 text-[#34C759] font-bold inline-block"
                  : "rounded-full px-2.5 py-0.5 bg-[#FF5C5F]/20 text-[#FF5C5F] font-bold inline-block";
              }

              return (
                <tr key={row.label} className="hover:bg-portal-accent/[0.02] transition-colors">
                  <td className="px-5 py-0.5 text-xs text-foreground font-medium border border-black/20 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                    <MetricChartPopover row={row} accountIds={client.accountIds} start={start} end={end} goal={goal} />
                  </td>
                  <td className="px-3 py-0.5 text-xs text-right tabular-nums text-foreground border border-black/20 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                    {row.getGoal ? row.format(goal) : ""}
                  </td>
                  <td className="px-3 py-0.5 text-xs text-right font-bold tabular-nums text-foreground border border-black/20 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                    <span className={goalChip(cur)}>{row.format(cur)}</span>
                  </td>
                  <td className="px-3 py-1 text-center whitespace-nowrap border border-black/20 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                    <Trend current={cur} previous={prev} lowerIsBetter={row.lowerIsBetter} row={row} />
                  </td>
                  <td className="px-3 py-0.5 text-xs text-right tabular-nums text-foreground border border-black/20 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                    <span className={goalChip(prev)}>{row.format(prev)}</span>
                  </td>
                  <td className="px-3 py-1 text-center whitespace-nowrap border border-black/20 dark:border-white/10 border-[0.5px] border-l-2 border-l-black/40 dark:border-l-white/30 whitespace-nowrap overflow-hidden text-ellipsis">
                    <Trend current={cur} previous={yoy} lowerIsBetter={row.lowerIsBetter} row={row} />
                  </td>
                  <td className="px-3 py-0.5 text-xs text-right tabular-nums text-foreground border border-black/20 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                    {row.format(yoy)}
                  </td>
                  <td className="px-3 py-0.5 text-xs text-right tabular-nums text-foreground border border-black/20 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                    {row.format(mtd)}
                  </td>
                  <td className="px-3 py-0.5 text-xs text-right tabular-nums text-foreground border border-black/20 dark:border-white/10 border-[0.5px] whitespace-nowrap overflow-hidden text-ellipsis">
                    {row.format(ytd)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Metrics Chart Panel (below table) ────────────────────────────

const DEFAULT_CHART_METRICS = new Set([
  "Sales", "Orders", "Units", "Ad Spend", "Ad Revenue", "ACoS", "TACoS", "RoAS",
]);

const LINE_COLORS = [
  "#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
  "#e11d48", "#84cc16", "#0ea5e9", "#a855f7", "#d946ef",
  "#78716c", "#64748b",
];

function MetricsChartPanel({ client, start, end }: {
  client: ClientSales;
  start: string;
  end: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const [enabledMetrics, setEnabledMetrics] = useState<Set<string>>(DEFAULT_CHART_METRICS);

  const { data: dailyData } = useQuery<{ days: DailyMetrics[] }>({
    queryKey: ["sales-daily", client.accountIds.join(","), start, end],
    queryFn: async () => {
      const res = await fetch(`/api/sales-summary/daily?start=${start}&end=${end}&accountIds=${client.accountIds.join(",")}`);
      if (!res.ok) throw new Error("Failed to fetch daily data");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
    enabled: expanded && client.accountIds.length > 0,
  });

  const toggleMetric = (label: string) => {
    setEnabledMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const visibleRows = METRIC_ROWS.filter((r) => enabledMetrics.has(r.label));

  // Build normalized series for each visible metric
  const series = useMemo(() => {
    if (!dailyData?.days?.length) return [];
    return visibleRows.map((row, idx) => {
      const rawPoints = dailyData.days.map((d) => ({
        date: d.report_date,
        value: row.getDailyValue(d),
      }));
      const validValues = rawPoints.filter((p) => p.value != null).map((p) => p.value as number);
      if (validValues.length < 2) return null;
      const goal = row.getGoal?.(client) ?? null;
      const allVals = goal != null ? [...validValues, goal] : validValues;
      const min = Math.min(...allVals);
      const max = Math.max(...allVals);
      const range = max - min || 1;
      // Keep ALL points (including nulls) so data table columns align
      const allPoints = rawPoints.map((p) => ({
        date: p.date,
        value: p.value,
        norm: p.value != null ? (p.value - min) / range : null,
      }));
      const colorIdx = METRIC_ROWS.findIndex((r) => r.label === row.label);
      const goalNorm = goal != null ? (goal - min) / range : null;
      return {
        label: row.label,
        format: row.format,
        color: LINE_COLORS[colorIdx % LINE_COLORS.length],
        points: allPoints,
        latest: validValues[validValues.length - 1],
        goal,
        goalNorm,
        lowerIsBetter: row.lowerIsBetter,
      };
    }).filter(Boolean) as {
      label: string;
      format: (n: number | null) => string;
      color: string;
      points: { date: string; value: number | null; norm: number | null }[];
      latest: number;
      goal: number | null;
      goalNorm: number | null;
      lowerIsBetter?: boolean;
    }[];
  }, [dailyData, visibleRows]);

  // Dates for the x-axis (from first series that has data)
  const dates = series[0]?.points.map((p) => p.date) ?? [];

  const W = 1100;
  const LEFT_LABEL_W = 140; // space for row headers on left
  // Bottom section: date row + one row per visible metric (12px each) + padding
  const ROW_H = 12;
  const dataTableH = 18 + visibleRows.length * ROW_H + 8;
  const H = 320 + dataTableH;
  const PAD = { top: 20, right: 20, bottom: dataTableH, left: LEFT_LABEL_W };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  return (
    <div className="rounded-xl overflow-hidden glass-card border border-black/20 dark:border-white/10">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-5 py-3 flex items-center justify-between bg-portal-accent/5 hover:bg-portal-accent/10 transition-colors"
      >
        <span className="text-sm font-bold text-foreground">Daily Trends</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 py-4">
          {/* Single unified chart with toggles on left */}
          {!dailyData ? (
            <div className="flex items-center justify-center h-60">
              <div className="size-5 border-2 border-portal-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : series.length === 0 ? (
            <div className="flex gap-3">
              <div className="flex flex-col gap-0.5 shrink-0 w-fit">
                {METRIC_ROWS.map((r, idx) => {
                  const isOn = enabledMetrics.has(r.label);
                  const color = LINE_COLORS[idx % LINE_COLORS.length];
                  return (
                    <button
                      key={r.label}
                      type="button"
                      onClick={() => toggleMetric(r.label)}
                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[9px] font-medium transition-colors cursor-pointer select-none text-left whitespace-nowrap ${
                        isOn
                          ? "border-current/30"
                          : "bg-muted text-muted-foreground border-transparent hover:border-border"
                      }`}
                      style={isOn ? { color, backgroundColor: `${color}15`, borderColor: `${color}40` } : undefined}
                    >
                      <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: isOn ? color : "transparent" }} />
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-center flex-1 h-60 text-sm text-muted-foreground">
                Select metrics to display chart
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              {/* Metric toggles — vertical list on left */}
              <div className="flex flex-col gap-0.5 shrink-0 w-fit pt-1">
                {METRIC_ROWS.map((r, idx) => {
                  const isOn = enabledMetrics.has(r.label);
                  const color = LINE_COLORS[idx % LINE_COLORS.length];
                  return (
                    <button
                      key={r.label}
                      type="button"
                      onClick={() => toggleMetric(r.label)}
                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[9px] font-medium transition-colors cursor-pointer select-none text-left whitespace-nowrap ${
                        isOn
                          ? "border-current/30"
                          : "bg-muted text-muted-foreground border-transparent hover:border-border"
                      }`}
                      style={isOn ? { color, backgroundColor: `${color}15`, borderColor: `${color}40` } : undefined}
                    >
                      <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: isOn ? color : "transparent" }} />
                      {r.label}
                    </button>
                  );
                })}
              </div>

              {/* Chart */}
              <div className="flex-1 min-w-0">
              <svg className="block w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
                <defs>
                  {series.map((s) => (
                    <linearGradient key={s.label} id={`grad_${s.label.replace(/[^a-zA-Z]/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity="0.08" />
                      <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                    </linearGradient>
                  ))}
                </defs>

                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                  const y = PAD.top + chartH * (1 - pct);
                  return (
                    <line key={pct} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="0.5" />
                  );
                })}

                {/* Separator line between chart and data table */}
                <line x1={0} y1={PAD.top + chartH + 2} x2={W} y2={PAD.top + chartH + 2} stroke="currentColor" className="text-slate-300 dark:text-slate-600" strokeWidth="0.5" />

                {/* Vertical dividers under each date (render first so text is on top) */}
                {dates.map((d, i) => {
                  const x = PAD.left + (i / Math.max(1, dates.length - 1)) * chartW;
                  return (
                    <line key={`vd-${d}`} x1={x} y1={PAD.top + chartH + 2} x2={x} y2={H} stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="0.3" />
                  );
                })}

                {/* Date headers */}
                {dates.map((d, i) => {
                  const x = PAD.left + (i / Math.max(1, dates.length - 1)) * chartW;
                  return (
                    <text key={d} x={x} y={PAD.top + chartH + 16} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500 text-[10px] font-bold tabular-nums">
                      {d.slice(5)}
                    </text>
                  );
                })}

                {/* Row headers on left */}
                {series.map((s, sIdx) => {
                  const y = PAD.top + chartH + 28 + sIdx * ROW_H;
                  return (
                    <text
                      key={`hdr-${s.label}`}
                      x={PAD.left - 8}
                      y={y}
                      textAnchor="end"
                      className="text-[8px] font-bold"
                      fill={s.color}
                    >
                      {s.label}
                    </text>
                  );
                })}

                {/* Per-date metric values */}
                {series.map((s, sIdx) => {
                  return s.points.map((p, i) => {
                    const x = PAD.left + (i / Math.max(1, s.points.length - 1)) * chartW;
                    const y = PAD.top + chartH + 28 + sIdx * ROW_H;
                    const isFirst = i === 0;
                    return (
                      <text
                        key={`${s.label}-${i}`}
                        x={isFirst ? x + 4 : x}
                        y={y}
                        textAnchor={isFirst ? "start" : "middle"}
                        className="text-[8px] font-medium tabular-nums"
                        fill={s.color}
                      >
                        {p.value != null ? s.format(p.value) : "—"}
                      </text>
                    );
                  });
                })}

                {/* Goal lines (rendered first so data lines are on top) */}
                {series.map((s) => {
                  if (s.goal == null || s.goalNorm == null) return null;
                  const goalY = PAD.top + chartH - Math.max(0, Math.min(1, s.goalNorm)) * chartH;
                  return (
                    <g key={`goal-${s.label}`}>
                      <line x1={PAD.left} y1={goalY} x2={W - PAD.right} y2={goalY} stroke={s.color} strokeWidth="1" strokeDasharray="6 3" opacity="0.4" />
                      <text x={PAD.left - 4} y={goalY + 3} textAnchor="end" className="text-[8px] font-bold" fill={s.color} opacity="0.7">
                        {s.label} Goal: {s.format(s.goal)}
                      </text>
                    </g>
                  );
                })}

                {/* Lines + areas + dots */}
                {series.map((s) => {
                  // Only include non-null points for drawing lines
                  const validPts = s.points
                    .map((p, i) => p.norm != null ? {
                      x: PAD.left + (i / Math.max(1, s.points.length - 1)) * chartW,
                      y: PAD.top + chartH - p.norm * chartH,
                    } : null)
                    .filter(Boolean) as { x: number; y: number }[];

                  if (validPts.length < 2) return null;

                  let pathD = `M${validPts[0].x},${validPts[0].y}`;
                  for (let i = 0; i < validPts.length - 1; i++) {
                    const midX = (validPts[i].x + validPts[i + 1].x) / 2;
                    pathD += ` C${midX},${validPts[i].y} ${midX},${validPts[i + 1].y} ${validPts[i + 1].x},${validPts[i + 1].y}`;
                  }
                  const areaD = `${pathD} L${validPts[validPts.length - 1].x},${PAD.top + chartH} L${validPts[0].x},${PAD.top + chartH} Z`;
                  const gradId = `grad_${s.label.replace(/[^a-zA-Z]/g, "")}`;

                  return (
                    <g key={s.label}>
                      <path d={areaD} fill={`url(#${gradId})`} />
                      <path d={pathD} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                      {validPts.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r="3" fill={s.color} stroke="white" strokeWidth="1" />
                      ))}
                    </g>
                  );
                })}

              </svg>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────

/** Date range chosen once in the nav slot and shared by every stacked client. */
type SalesRange = {
  mode: "week" | "custom";
  start: string;
  end: string;
  /** False while a custom range is incomplete or inverted. */
  enabled: boolean;
};

function PortalSalesContent() {
  const now = new Date();
  const currentWeek = getWeekNumber(formatDate(now));
  const currentYear = now.getFullYear();

  const [mode, setMode] = useState<"week" | "custom">("week");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedWeek, setSelectedWeek] = useState(currentWeek > 1 ? currentWeek - 1 : currentWeek);
  const [customStart, setCustomStart] = useState(() => formatDate(now));
  const [customEnd, setCustomEnd] = useState(() => formatDate(now));

  const weekRange = useMemo(() => {
    const sunday = getSundayOfWeek(selectedYear, selectedWeek);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    return { sunday, saturday, start: formatDate(sunday), end: formatDate(saturday) };
  }, [selectedYear, selectedWeek]);

  const range: SalesRange = {
    mode,
    start: mode === "week" ? weekRange.start : customStart,
    end: mode === "week" ? weekRange.end : customEnd,
    enabled: mode === "week" || (!!customStart && !!customEnd && customStart <= customEnd),
  };

  const portalQueryClient = useQueryClient();
  const isFetching = useIsFetching({ queryKey: ["portal-sales"] }) > 0;

  return (
    <div className="space-y-12 p-6">
      {/* Heading + refresh + date slicer → TopNav row 3, once for every client */}
      <PageMetaSlot>
        <div className="flex items-center gap-3 w-full min-w-0">
          <Link
            href="/portal/sales"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="size-3" />
            Back to sales
          </Link>
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0"
            aria-label="Sales Summary"
          >
            <span className="font-bold text-sidebar-foreground">Sales</span>
            <span className="font-normal text-portal-accent">Summary</span>
          </h1>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {/* Refresh button — blue */}
            <button
              type="button"
              onClick={() => portalQueryClient.invalidateQueries({ queryKey: ["portal-sales"] })}
              disabled={isFetching}
              title="Refresh data"
              className="p-1.5 rounded-lg text-[#2563eb] hover:text-[#1d4ed8] hover:bg-[#2563eb]/10 transition-colors disabled:opacity-30"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isFetching ? "animate-spin" : ""}>
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
            {/* Date Slicer */}
            <div className="rounded-lg border border-border/60 px-3 py-1.5 text-sm flex items-center gap-2 bg-card">
              <div className="flex gap-0.5 p-0.5 rounded-md bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <button type="button" onClick={() => setMode("week")} className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${mode === "week" ? "bg-portal-accent text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"}`}>Week</button>
                <button type="button" onClick={() => setMode("custom")} className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${mode === "custom" ? "bg-portal-accent text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"}`}>Custom</button>
              </div>
              <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
              {mode === "week" ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Calendar className="size-3 text-slate-400" />
                    <span className="text-slate-500 dark:text-slate-400 text-xs">Year</span>
                    <select value={selectedYear} onChange={(e) => { const yr = Number(e.target.value); setSelectedYear(yr); if (yr === currentYear && selectedWeek > currentWeek) setSelectedWeek(currentWeek); }} className="bg-card border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 text-xs font-bold tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-portal-accent">
                      {Array.from({ length: 6 }, (_, i) => currentYear - 5 + i).map((yr) => <option key={yr} value={yr}>{yr}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500 dark:text-slate-400 text-xs">Week</span>
                    <select value={selectedWeek} onChange={(e) => setSelectedWeek(Number(e.target.value))} className="bg-card border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 text-xs font-bold tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-portal-accent">
                      {Array.from({ length: getMaxWeek(selectedYear) }, (_, i) => i + 1).filter((w) => selectedYear < currentYear || w <= currentWeek).map((w) => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
                  <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{weekRange.start}</span>
                  <span className="text-slate-300 dark:text-slate-600">&ndash;</span>
                  <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{weekRange.end}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <DatePicker value={customStart} onChange={setCustomStart} className="h-6 text-xs font-bold" />
                  <span className="text-slate-300 dark:text-slate-600">&ndash;</span>
                  <DatePicker value={customEnd} onChange={setCustomEnd} className="h-6 text-xs font-bold" />
                  {customStart && customEnd && customStart <= customEnd && (
                    <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">({Math.round((new Date(customEnd + "T00:00:00").getTime() - new Date(customStart + "T00:00:00").getTime()) / 86400000) + 1}d)</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </PageMetaSlot>

      {/* One sales summary per visible client, stacked in assignment order. */}
      <PortalStackedClients>
        {(code) => <PortalSalesForClient clientCode={code} range={range} />}
      </PortalStackedClients>
    </div>
  );
}

function PortalSalesForClient({ clientCode, range }: { clientCode: string; range: SalesRange }) {
  const clientName = CLIENT_NAMES[clientCode] || clientCode;
  const now = new Date();
  const { mode, start: queryStart, end: queryEnd, enabled } = range;

  const portalQueryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<SalesSummaryResponse>({
    queryKey: ["portal-sales", mode, queryStart, queryEnd, clientCode],
    queryFn: async () => {
      const res = await fetch(`/api/sales-summary?period=7D&start=${queryStart}&end=${queryEnd}&client=${encodeURIComponent(clientCode)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch sales data (${res.status})`);
      }
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
    placeholderData: (prev) => prev,
    enabled,
  });

  const client = data?.clients?.[0] ?? null;

  return (
    <div className="space-y-4">
      {/* Redshift freshness — per client, next to its own data */}
      {data?.latestDataDate && (() => {
        const parts = data.latestDataDate.split("-").map(Number);
        const latestDate = new Date(parts[0], parts[1] - 1, parts[2]);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const daysAgo = Math.round((today.getTime() - latestDate.getTime()) / 86400000);
        const formatted = latestDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
        const relativeText = daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`;
        const isStale = daysAgo > 2;
        return (
          <span className={`text-[10px] font-mono whitespace-nowrap flex items-center gap-1 ${isStale ? "text-amber-400" : "text-foreground/40"}`}>
            {isStale && <span className="inline-block size-1.5 rounded-full bg-amber-400 animate-pulse" />}
            Redshift: {formatted} · {relativeText}
          </span>
        );
      })()}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[500px] rounded-xl border border-border/60 bg-card animate-pulse"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-8 text-center">
          <p className="text-red-600 dark:text-red-400 font-medium">Failed to load sales data</p>
          <p className="text-red-500/70 dark:text-red-400/60 text-sm mt-1">{(error as Error).message}</p>
          <button
            type="button"
            onClick={() => portalQueryClient.invalidateQueries({ queryKey: ["portal-sales"] })}
            className="mt-3 px-4 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Client Card */}
      {data && client && (() => {
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
          curLabel = `${fmtShort(data.start)}\u2013${fmtShort(data.end)}`;
          prevLabel = `${fmtShort(data.prevStart)}\u2013${fmtShort(data.prevEnd)}`;
          yoyLabel = `${data.yoyStart.slice(0, 4)} ${fmtShort(data.yoyStart)}\u2013${fmtShort(data.yoyEnd)}`;
        }
        return (
          <>
            <ClientCard
              client={client}
              clientName={clientName}
              currentLabel={curLabel}
              previousLabel={prevLabel}
              yoyLabel={yoyLabel}
              start={data.start}
              end={data.end}
            />
            <MetricsChartPanel
              client={client}
              start={data.start}
              end={data.end}
            />
          </>
        );
      })()}

      {!isLoading && !error && data && !client && (
        <div className="rounded-xl border border-border/60 glass-card p-12 text-center">
          <p className="text-muted-foreground">
            No sales data available for this period. Data will appear here once reporting is set up.
          </p>
        </div>
      )}
    </div>
  );
}

export default function PortalSalesPage() {
  return (
    <Suspense>
      <PortalSalesContent />
    </Suspense>
  );
}

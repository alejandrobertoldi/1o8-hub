"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/query-mutation-missing-invalidation */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/no-array-index-as-key */

/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { AreaChart, Area, LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip, LabelList, ReferenceLine } from "recharts";
import {
  ArrowLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  Clock,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import AIGeneratingButton from "@/components/seo/ai-generating-button";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import SalesMonitor from "@/components/ppc/sales-monitor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Types ───────────────────────────────────────────────────────────

interface Delta { absolute: number; pct: number }
interface Snapshot {
  id: string;
  snapshotDate: string;
  summary: Record<string, unknown>;
  deltas: Record<string, Delta> | null;
}
interface Approval {
  id: string;
  approvalType: string;
  description: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  approvedAt: string | null;
  rejectedAt: string | null;
}
interface Decision {
  id: string;
  decision: string;
  expectedOutcome: string | null;
  expectedMetric: string | null;
  expectedValue: string | null;
  actualOutcome: string | null;
  actualValue: string | null;
  decidedAt: string;
  measuredAt: string | null;
}
interface PpcAlert {
  id: string;
  alertType: string;
  severity: string;
  message: string;
  createdAt: string;
  acknowledgedAt: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function useDeltaStyle(value?: number | null, invertColor?: boolean) {
  if (value == null) return { isPositive: false, isNegative: false, Icon: Minus, color: "text-muted-foreground" };
  const display = invertColor ? -value : value;
  const isPositive = display > 0;
  const isNegative = display < 0;
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const color = isPositive ? "text-emerald-600" : isNegative ? "text-red-500" : "text-muted-foreground";
  return { isPositive, isNegative, Icon, color };
}

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function getISOWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TwoLineXTick({ x, y, payload }: any) {
  const d = new Date(String(payload.value));
  if (isNaN(d.getTime())) return <text x={x} y={y} textAnchor="middle" fontSize={9} fill="#94a3b8">{payload.value}</text>;
  const day = DAY_LETTERS[d.getUTCDay()];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return (
    <text x={x} y={y} textAnchor="middle" fill="#94a3b8">
      <tspan x={x} dy="0" fontSize={10} fontWeight={600}>{day}</tspan>
      <tspan x={x} dy="12" fontSize={8}>{mm}/{dd}</tspan>
    </text>
  );
}

function fmtDateMMDD(raw: unknown): string {
  const d = new Date(String(raw));
  if (isNaN(d.getTime())) return String(raw);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}

function fmtSnapshotWithWeek(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `W${String(getISOWeek(d)).padStart(2, "0")} — ${dateStr}`;
}

function fmtSparkValue(v: unknown, label: string): string {
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (["Spend", "Revenue", "CPC", "Ad Spend", "Ad Revenue"].includes(label)) return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (["ACOS", "CTR"].includes(label)) return `${n.toFixed(2)}%`;
  if (label === "ROAS") return n.toFixed(2);
  if (["Impressions", "Clicks", "Orders"].includes(label)) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const BRAND_ORANGE = "#F7BF1D";
const PREV_WEEK_COLOR = "#4b5563";

function MetricCard({ label, value, rawValue, delta, deltaAbsolute, invertColor, sparkline, goal }: {
  label: string; value: string; rawValue?: number; delta?: number | null; deltaAbsolute?: number | null; invertColor?: boolean;
  sparkline?: { date: string; value: number; prev?: number }[];
  goal?: number | null;
}) {
  const gradientId = `grad-${label.replace(/\s/g, "")}`;
  const hasPrev = sparkline?.some((p) => p.prev != null);

  const prevValue = rawValue != null && deltaAbsolute != null
    ? fmtSparkValue(rawValue - deltaAbsolute, label)
    : null;

  // Derive ISO week numbers from sparkline dates
  const currentWeekNum = sparkline?.length
    ? getISOWeek(new Date(sparkline[sparkline.length - 1].date))
    : null;
  const prevWeekNum = currentWeekNum != null ? currentWeekNum - 1 : null;

  const { isNegative, Icon: DeltaIcon, color: deltaColor } = useDeltaStyle(delta, invertColor);
  const absFmt = deltaAbsolute != null ? fmtSparkValue(Math.abs(deltaAbsolute), label) : null;

  // Goal achievement: for inverted metrics (ACOS, CPC) lower is better
  const goalMet = goal != null && rawValue != null
    ? invertColor ? rawValue <= goal : rawValue >= goal
    : null;
  const goalColor = goalMet === true ? "text-emerald-500" : goalMet === false ? "text-red-500" : "";
  const prevRaw = rawValue != null && deltaAbsolute != null ? rawValue - deltaAbsolute : null;
  const prevGoalMet = goal != null && prevRaw != null
    ? invertColor ? prevRaw <= goal : prevRaw >= goal
    : null;
  const prevGoalColor = prevGoalMet === true ? "text-emerald-500" : prevGoalMet === false ? "text-red-500" : "";

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xl font-bold text-brand">{label}</p>
        {goal != null && (
          <span className="text-sm font-semibold text-blue-500 tabular-nums">Goal: {fmtSparkValue(goal, label)}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xl tabular-nums">
          {currentWeekNum != null && <span>W{String(currentWeekNum).padStart(2, "0")}: </span>}<span className={`font-bold ${goalColor}`}>{value}</span>
        </span>
        {absFmt && (
          <span className={`inline-flex items-center gap-1 text-sm font-semibold ${deltaColor}`}>
            <DeltaIcon className="size-3.5" />
            {isNegative ? "-" : "+"}{absFmt}
          </span>
        )}
      </div>
      {prevValue != null && (
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xl text-muted-foreground tabular-nums">
            W{String(prevWeekNum).padStart(2, "0")}: <span className={`font-bold ${prevGoalColor}`}>{prevValue}</span>
          </span>
          {delta != null && (
            <span className={`inline-flex items-center gap-1 text-sm font-semibold ${deltaColor}`}>
              <DeltaIcon className="size-3.5" />
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
        </div>
      )}
      {sparkline && sparkline.length > 1 && (
        <div className="h-48 mt-3 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline} margin={{ top: 22, right: 32, bottom: 14, left: 32 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND_ORANGE} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={BRAND_ORANGE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={TwoLineXTick}
                axisLine={false}
                tickLine={false}
                interval={0}
                padding={{ left: 4, right: 4 }}
              />
              <YAxis domain={[(min: number) => { const pad = Math.max(1, min * 0.15); return Math.max(0, min - pad); }, (max: number) => max + Math.max(1, max * 0.15)]} hide />
              <Tooltip
                contentStyle={{ background: "#1c1917", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#94a3b8", fontSize: 11 }}
                labelFormatter={fmtDateMMDD}
                formatter={(v, name) => [
                  fmtSparkValue(v, label),
                  name === "prev" ? "Prev Week" : label,
                ]}
              />
              {/* Goal line — blue */}
              {goal != null && (
                <ReferenceLine
                  y={goal}
                  stroke="#3b82f6"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{ value: `Goal: ${fmtSparkValue(goal, label)}`, position: "insideTopLeft", fill: "#3b82f6", fontSize: 10, fontWeight: 600 }}
                />
              )}
              {/* Previous week — dashed line, no fill */}
              {hasPrev && (
                <Area
                  type="monotone"
                  dataKey="prev"
                  stroke={PREV_WEEK_COLOR}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  fill="none"
                  dot={{ r: 2, fill: PREV_WEEK_COLOR, strokeWidth: 0 }}
                  activeDot={{ r: 3, fill: PREV_WEEK_COLOR, strokeWidth: 1, stroke: "#fff" }}
                />
              )}
              {/* Current week — brand orange, gradient fill */}
              <Area
                type="monotone"
                dataKey="value"
                stroke={BRAND_ORANGE}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={{ r: 3.5, fill: BRAND_ORANGE, strokeWidth: 2, stroke: "#1c1917" }}
                activeDot={{ r: 5, fill: BRAND_ORANGE, strokeWidth: 2, stroke: "#fff" }}
              >
                <LabelList
                  dataKey="value"
                  position="top"
                  offset={8}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={(props: any) => {
                    const px = Number(props.x); const py = Number(props.y); const v = Number(props.value);
                    if (isNaN(px) || isNaN(py) || isNaN(v)) return null;
                    let fill = "#e2e8f0";
                    if (goal != null) {
                      const met = invertColor ? v <= goal : v >= goal;
                      fill = met ? "#10b981" : "#ef4444";
                    }
                    return (
                      <g key={`${px}-${py}`}>
                        <text x={px} y={py - 8} textAnchor="middle" stroke="#1c1917" strokeWidth={3} paintOrder="stroke" fill={fill} fontSize={10} fontWeight={600}>{fmtSparkValue(v, label)}</text>
                      </g>
                    );
                  }}
                />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function PpcSortIcon({ col, sortCol, sortDir }: { col: string; sortCol: string; sortDir: "asc" | "desc" }) {
  if (sortCol === col) {
    return sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
  }
  return <ArrowUpDown className="size-3 opacity-30" />;
}

// ─── Page ────────────────────────────────────────────────────────────

export default function PpcClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clientIdCode = params.clientIdCode as string;

  // Fetch client name from overview (shared cache with list page)
  const { data: clientName } = useQuery({
    queryKey: ["ppc-overview"],
    queryFn: async () => {
      const res = await fetch("/api/ppc/overview");
      if (!res.ok) return null;
      const data = await res.json();
      return data.clients;
    },
    select: (clients: { clientIdCode: string; clientName: string }[] | null) =>
      clients?.find((c) => c.clientIdCode === clientIdCode)?.clientName ?? null,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch all data in parallel
  const { data: compareData, isLoading: loadingCompare } = useQuery({
    queryKey: ["ppc-compare", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/compare?clientIdCode=${clientIdCode}&reportType=campaign`);
      return res.json();
    },
  });

  const { data: keywordCompare } = useQuery({
    queryKey: ["ppc-compare-keywords", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/compare?clientIdCode=${clientIdCode}&reportType=keyword`);
      return res.json();
    },
  });

  // Fetch current + previous week daily metrics from Redshift for sparklines
  const { data: sparklineRaw } = useQuery({
    queryKey: ["ppc-daily-metrics", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/daily-metrics?clientIdCode=${clientIdCode}`);
      if (!res.ok) return { days: [], prevDays: [] };
      return res.json() as Promise<{ days: Record<string, unknown>[]; prevDays: Record<string, unknown>[] }>;
    },
  });
  const sparklineData = sparklineRaw?.days;
  const prevSparklineData = sparklineRaw?.prevDays;

  const { data: approvalsData } = useQuery({
    queryKey: ["ppc-approvals", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/approvals?clientIdCode=${clientIdCode}`);
      return res.json();
    },
  });

  const { data: decisionsData } = useQuery({
    queryKey: ["ppc-decisions", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/decisions?clientIdCode=${clientIdCode}`);
      return res.json();
    },
  });

  const { data: alertsData } = useQuery({
    queryKey: ["ppc-alerts", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/alerts?clientIdCode=${clientIdCode}`);
      return res.json();
    },
  });

  // Analysis — persisted to DB via snapshot data field, localStorage as fast cache
  const cacheKey = `ppc-analysis-${clientIdCode}`;
  const dbAnalysis = ((compareData?.current as (Snapshot & { data?: { analysis?: string } }) | null)?.data?.analysis) ?? null;
  const [analysisOverride, setAnalysisOverride] = useState<string | null>(null);

  const resolvedAnalysis = analysisOverride ?? dbAnalysis ?? (() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem(cacheKey); } catch { return null; }
  })();

  const analysisMutation = useMutation({
    mutationFn: async () => {
      setAnalysisOverride(null);
      try { localStorage.removeItem(cacheKey); } catch {}
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 280_000);
      let res: Response;
      try {
        res = await fetch("/api/ppc/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ clientIdCode }),
        });
      } catch (fetchErr: unknown) {
        throw new Error(fetchErr instanceof Error && fetchErr.name === "AbortError"
          ? "PPC analysis timed out. Please try again."
          : "Network error during analysis. Check your connection and try again.");
      } finally { clearTimeout(timer); }
      if (!res.ok) throw new Error("Analysis failed");
      return res.json();
    },
    onSuccess: (data) => {
      setAnalysisOverride(data.analysis);
      try { localStorage.setItem(cacheKey, data.analysis); } catch {}
    },
    onError: () => {
      setAnalysisOverride(null);
    },
  });

  const [activeTab, setActiveTab] = useState("dashboard");
  const [campaignPage, setCampaignPage] = useState(0);
  const [campaignSortCol, setCampaignSortCol] = useState<string>("spend");
  const [campaignSortDir, setCampaignSortDir] = useState<"asc" | "desc">("desc");
  const CAMPAIGNS_PER_PAGE = 25;

  const [kwSortCol, setKwSortCol] = useState<string>("spend");
  const [kwSortDir, setKwSortDir] = useState<"asc" | "desc">("desc");
  const [kwPage, setKwPage] = useState(0);
  const KW_PER_PAGE = 25;

  function toggleCampaignSort(col: string) {
    if (campaignSortCol === col) {
      setCampaignSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setCampaignSortCol(col);
      setCampaignSortDir("desc");
    }
    setCampaignPage(0);
  }

  function toggleKwSort(col: string) {
    if (kwSortCol === col) {
      setKwSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setKwSortCol(col);
      setKwSortDir("desc");
    }
    setKwPage(0);
  }

  const current = compareData?.current as Snapshot | null;
  const summary = current?.summary;
  const deltas = current?.deltas;
  const goals = (compareData?.goals as Record<string, number> | null) ?? null;

  // Build sparkline series per metric — current week + aligned previous week
  const spark = useMemo(() => {
    const points = (sparklineData || []) as { date: string; [k: string]: unknown }[];
    const prevPoints = (prevSparklineData || []) as { date: string; [k: string]: unknown }[];
    const build = (key: string) =>
      points.map((p, i) => ({
        date: p.date as string,
        value: Number(p[key]) || 0,
        prev: prevPoints[i] ? Number(prevPoints[i][key]) || 0 : undefined,
      }));
    return {
      totalSpend: build("totalSpend"),
      totalRevenue: build("totalRevenue"),
      acos: build("acos"),
      roas: build("roas"),
      totalOrders: build("totalOrders"),
      totalImpressions: build("totalImpressions"),
      totalClicks: build("totalClicks"),
      cpc: build("cpc"),
      ctr: build("ctr"),
    };
  }, [sparklineData, prevSparklineData]);

  return (
    <Tabs defaultValue="dashboard" onValueChange={setActiveTab} className="space-y-0">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="PPC Dashboard"
        >
          <span className="font-bold text-sidebar-foreground">PPC</span>
          <span className="font-normal text-brand">Dashboard</span>
        </h1>
      </PageMetaSlot>
      {/* Sticky header + tabs */}
      <div className="sticky top-0 z-30 bg-background border-b px-6 pt-6 pb-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/ppc")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            {clientName && <p className="text-sm text-muted-foreground">{clientName}</p>}
            <p className="text-xs text-muted-foreground/60">{clientIdCode}</p>
          </div>
          {current && (
            <Badge variant="outline" className="ml-auto">
              Snapshot: {fmtSnapshotWithWeek(current.snapshotDate)}
            </Badge>
          )}
        </div>
        {summary && (
          <TabsList className="grid w-full grid-cols-7 mt-3">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="sales-monitor">Sales Monitor</TabsTrigger>
            <TabsTrigger value="analysis">Root Cause</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="competitor">Competitor</TabsTrigger>
            <TabsTrigger value="decisions">Decisions</TabsTrigger>
          </TabsList>
        )}
      </div>

      <div className="px-6 pt-4 space-y-6">
      {loadingCompare ? (
        <LoadingPlaceholder />
      ) : !summary ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No PPC data yet. Snapshots are captured daily at 02:00 UTC.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ─── Tab 1: Dashboard ─── */}
          <TabsContent value="dashboard" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricCard label="Ad Spend" value={fmtSparkValue(num(summary.totalSpend), "Spend")} rawValue={num(summary.totalSpend)} delta={deltas?.spend?.pct} deltaAbsolute={deltas?.spend?.absolute} sparkline={spark.totalSpend} goal={goals?.spend} />
              <MetricCard label="Ad Revenue" value={fmtSparkValue(num(summary.totalRevenue), "Revenue")} rawValue={num(summary.totalRevenue)} delta={deltas?.revenue?.pct} deltaAbsolute={deltas?.revenue?.absolute} sparkline={spark.totalRevenue} goal={goals?.revenue} />
              <MetricCard label="Orders" value={fmtSparkValue(num(summary.totalOrders), "Orders")} rawValue={num(summary.totalOrders)} delta={deltas?.orders?.pct} deltaAbsolute={deltas?.orders?.absolute} sparkline={spark.totalOrders} />
              <MetricCard label="ACOS" value={fmtSparkValue(num(summary.acos), "ACOS")} rawValue={num(summary.acos)} delta={deltas?.acos?.pct} deltaAbsolute={deltas?.acos?.absolute} invertColor sparkline={spark.acos} goal={goals?.acos} />
              <MetricCard label="ROAS" value={fmtSparkValue(num(summary.roas), "ROAS")} rawValue={num(summary.roas)} delta={deltas?.roas?.pct} deltaAbsolute={deltas?.roas?.absolute} sparkline={spark.roas} goal={goals?.roas} />
              <MetricCard label="CPC" value={fmtSparkValue(num(summary.cpc), "CPC")} rawValue={num(summary.cpc)} delta={deltas?.cpc?.pct} deltaAbsolute={deltas?.cpc?.absolute} invertColor sparkline={spark.cpc} />
              <MetricCard label="Impressions" value={fmtSparkValue(num(summary.totalImpressions), "Impressions")} rawValue={num(summary.totalImpressions)} delta={deltas?.impressions?.pct} deltaAbsolute={deltas?.impressions?.absolute} sparkline={spark.totalImpressions} />
              <MetricCard label="Clicks" value={fmtSparkValue(num(summary.totalClicks), "Clicks")} rawValue={num(summary.totalClicks)} delta={deltas?.clicks?.pct} deltaAbsolute={deltas?.clicks?.absolute} sparkline={spark.totalClicks} />
              <MetricCard label="CTR" value={fmtSparkValue(num(summary.ctr), "CTR")} rawValue={num(summary.ctr)} delta={deltas?.ctr?.pct} deltaAbsolute={deltas?.ctr?.absolute} sparkline={spark.ctr} />
            </div>

            {/* Campaigns Table */}
            {(() => {
              type CampaignItem = { name: string; spend: number; revenue: number; impressions: number; clicks: number; orders: number; acos: number; roas: number; cpc: number; ctr: number; cvr: number };
              const allCampaigns = (summary.topCampaigns as CampaignItem[]) || [];
              if (allCampaigns.length === 0) return null;
              const sorted = allCampaigns.toSorted((a, b) => {
                const aVal = campaignSortCol === "name" ? a.name.toLowerCase() : (a as Record<string, unknown>)[campaignSortCol] as number;
                const bVal = campaignSortCol === "name" ? b.name.toLowerCase() : (b as Record<string, unknown>)[campaignSortCol] as number;
                if (aVal < bVal) return campaignSortDir === "asc" ? -1 : 1;
                if (aVal > bVal) return campaignSortDir === "asc" ? 1 : -1;
                return 0;
              });
              const totalPages = Math.ceil(sorted.length / CAMPAIGNS_PER_PAGE);
              const paged = sorted.slice(campaignPage * CAMPAIGNS_PER_PAGE, (campaignPage + 1) * CAMPAIGNS_PER_PAGE);
              const cols: { key: string; label: string; align: "left" | "right" }[] = [
                { key: "name", label: "Campaign", align: "left" },
                { key: "spend", label: "Ad Spend", align: "right" },
                { key: "revenue", label: "Ad Revenue", align: "right" },
                { key: "acos", label: "ACOS", align: "right" },
                { key: "roas", label: "ROAS", align: "right" },
                { key: "orders", label: "Orders", align: "right" },
                { key: "cpc", label: "CPC", align: "right" },
                { key: "clicks", label: "Clicks", align: "right" },
                { key: "impressions", label: "Impressions", align: "right" },
                { key: "ctr", label: "CTR", align: "right" },
                { key: "cvr", label: "CVR", align: "right" },
              ];
              return (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">All Campaigns ({allCampaigns.length})</CardTitle>
                      {totalPages > 1 && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Button variant="ghost" size="icon" className="size-6" disabled={campaignPage === 0} onClick={() => setCampaignPage(p => p - 1)}>
                            <ChevronLeft className="size-3.5" />
                          </Button>
                          <span className="tabular-nums">{campaignPage + 1} / {totalPages}</span>
                          <Button variant="ghost" size="icon" className="size-6" disabled={campaignPage >= totalPages - 1} onClick={() => setCampaignPage(p => p + 1)}>
                            <ChevronRight className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-0">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow>
                          {cols.map((col) => (
                            <TableHead key={col.key} className={`${col.align === "right" ? "text-right" : "text-left"} ${col.key === "name" ? "sticky left-0 bg-card z-10 min-w-[200px]" : ""}`}>
                              <button onClick={() => toggleCampaignSort(col.key)} className="inline-flex items-center gap-1 text-brand hover:text-brand/80 transition-colors">
                                {col.label}
                                <PpcSortIcon col={col.key} sortCol={campaignSortCol} sortDir={campaignSortDir} />
                              </button>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paged.map((c, i) => (
                          <TableRow key={i}>
                            <TableCell className="max-w-[240px] truncate sticky left-0 bg-card z-10" title={c.name}>{c.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtUsd(c.spend ?? 0)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtUsd(c.revenue ?? 0)}</TableCell>
                            <TableCell className={`text-right tabular-nums ${(c.acos ?? 0) > 30 ? "text-red-500" : "text-emerald-600"}`}>{(c.acos ?? 0).toFixed(1)}%</TableCell>
                            <TableCell className="text-right tabular-nums">{(c.roas ?? 0).toFixed(2)}x</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtNum(c.orders ?? 0)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtUsd(c.cpc ?? 0)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtNum(c.clicks ?? 0)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtNum(c.impressions ?? 0)}</TableCell>
                            <TableCell className="text-right tabular-nums">{(c.ctr ?? 0).toFixed(2)}%</TableCell>
                            <TableCell className="text-right tabular-nums">{(c.cvr ?? 0).toFixed(2)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Keyword Detail */}
            {keywordCompare?.current?.summary && (() => {
              const kws = keywordCompare.current.summary;
              type KwItem = { text: string; spend: number; revenue: number; acos: number; impressions: number; isBrand?: boolean };
              const topKw = ((kws.topKeywords as KwItem[]) || []).toSorted((a, b) => {
                const aVal = kwSortCol === "text" ? a.text.toLowerCase() : kwSortCol === "isBrand" ? (a.isBrand ? 1 : 0) : (a as Record<string, unknown>)[kwSortCol] as number;
                const bVal = kwSortCol === "text" ? b.text.toLowerCase() : kwSortCol === "isBrand" ? (b.isBrand ? 1 : 0) : (b as Record<string, unknown>)[kwSortCol] as number;
                if (aVal < bVal) return kwSortDir === "asc" ? -1 : 1;
                if (aVal > bVal) return kwSortDir === "asc" ? 1 : -1;
                return 0;
              });
              const kwCols: { key: string; label: string; align: "left" | "right" | "center" }[] = [
                { key: "text", label: "Keyword", align: "left" },
                { key: "isBrand", label: "Type", align: "center" },
                { key: "spend", label: "Ad Spend", align: "right" },
                { key: "revenue", label: "Ad Revenue", align: "right" },
                { key: "acos", label: "ACOS", align: "right" },
                { key: "impressions", label: "Impressions", align: "right" },
              ];
              const kwTotalPages = Math.ceil(topKw.length / KW_PER_PAGE);
              const pagedKw = topKw.slice(kwPage * KW_PER_PAGE, (kwPage + 1) * KW_PER_PAGE);
              return (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Keywords ({topKw.length})</CardTitle>
                      {kwTotalPages > 1 && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Button variant="ghost" size="icon" className="size-6" disabled={kwPage === 0} onClick={() => setKwPage(p => p - 1)}>
                            <ChevronLeft className="size-3.5" />
                          </Button>
                          <span className="tabular-nums">{kwPage + 1} / {kwTotalPages}</span>
                          <Button variant="ghost" size="icon" className="size-6" disabled={kwPage >= kwTotalPages - 1} onClick={() => setKwPage(p => p + 1)}>
                            <ChevronRight className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Total</p>
                        <p className="font-semibold">{kws.totalKeywords}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Brand</p>
                        <p className="font-semibold">{kws.brandKeywords}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Non-Brand</p>
                        <p className="font-semibold">{kws.nonBrandKeywords}</p>
                      </div>
                    </div>
                    {pagedKw.length > 0 && (
                      <div className="overflow-x-auto -mx-6">
                        <Table className="text-xs">
                          <TableHeader>
                            <TableRow>
                              {kwCols.map((col) => (
                                <TableHead key={col.key} className={`${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${col.key === "text" ? "sticky left-0 bg-card z-10 min-w-[200px]" : ""}`}>
                                  <button onClick={() => toggleKwSort(col.key)} className="inline-flex items-center gap-1 text-brand hover:text-brand/80 transition-colors">
                                    {col.label}
                                    <PpcSortIcon col={col.key} sortCol={kwSortCol} sortDir={kwSortDir} />
                                  </button>
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pagedKw.map((k, i) => (
                              <TableRow key={i} className={k.isBrand ? "bg-brand/5" : ""}>
                                <TableCell className={`max-w-[240px] truncate sticky left-0 z-10 ${k.isBrand ? "bg-brand/5" : "bg-card"}`} title={k.text}>{k.text}</TableCell>
                                <TableCell className="text-center">{k.isBrand ? <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-brand/40 text-brand">Brand</Badge> : <Badge variant="outline" className="text-[10px] px-1.5 py-0 opacity-50">Non-Brand</Badge>}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtUsd(k.spend ?? 0)}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtUsd(k.revenue ?? 0)}</TableCell>
                                <TableCell className={`text-right tabular-nums ${(k.acos ?? 0) > 30 ? "text-red-500" : "text-emerald-600"}`}>{(k.acos ?? 0).toFixed(1)}%</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtNum(k.impressions ?? 0)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </TabsContent>

          {/* ─── Tab: Sales Monitor ─── */}
          <TabsContent value="sales-monitor" className="space-y-4">
            <SalesMonitor clientIdCode={clientIdCode} />
          </TabsContent>

          {/* ─── Tab 2: Root Cause Analysis ─── */}
          <TabsContent value="analysis" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Brain className="size-4" />
                  AI Root Cause Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!resolvedAnalysis && (
                  <div className="py-6 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {analysisMutation.isPending
                        ? "\u00A0"
                        : "Click below to analyze PPC performance changes and get AI-powered recommendations."}
                    </p>
                    <AIGeneratingButton
                      isGenerating={analysisMutation.isPending}
                      onClick={() => analysisMutation.mutate()}
                      label="Analyze Performance"
                      messages={[
                        "Gathering PPC snapshot data",
                        "Comparing period metrics",
                        "Evaluating ACOS & ROAS trends",
                        "Analyzing keyword performance",
                        "Checking budget utilization",
                        "Identifying root causes",
                        "Building recommendations",
                        "Finalizing analysis",
                      ]}
                    />
                  </div>
                )}
                {resolvedAnalysis && (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <div className="whitespace-pre-wrap text-sm">{resolvedAnalysis}</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => analysisMutation.mutate()}
                    >
                      Re-analyze
                    </Button>
                  </div>
                )}
                {analysisMutation.isError && (
                  <p className="text-sm text-red-500">Analysis failed. Try again later.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Tab 3: Approvals ─── */}
          <TabsContent value="approvals" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Approval Requests</h3>
              <NewApprovalDialog clientIdCode={clientIdCode} onCreated={() => queryClient.invalidateQueries({ queryKey: ["ppc-approvals", clientIdCode] })} />
            </div>
            {(approvalsData?.approvals as Approval[] | undefined)?.length ? (
              <div className="space-y-2">
                {(approvalsData.approvals as Approval[]).map((a) => {
                  const daysPending = a.status === "pending"
                    ? Math.floor((Date.now() - new Date(a.requestedAt).getTime()) / 86400000)
                    : null;
                  return (
                    <Card key={a.id}>
                      <CardContent className="py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{a.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.approvalType} &middot; {new Date(a.requestedAt).toLocaleDateString("en-US")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {daysPending != null && daysPending > 3 && (
                            <Badge variant="destructive" className="text-xs">
                              <Clock className="size-3 mr-1" />
                              {daysPending}d pending
                            </Badge>
                          )}
                          <StatusBadge status={a.status} />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  No approval requests yet.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ─── Tab 4: Alerts ─── */}
          <TabsContent value="alerts" className="space-y-4">
            {(alertsData?.alerts as PpcAlert[] | undefined)?.length ? (
              <div className="space-y-2">
                {(alertsData.alerts as PpcAlert[]).map((a) => (
                  <Card key={a.id}>
                    <CardContent className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`size-4 ${
                          a.severity === "critical" ? "text-red-500" :
                          a.severity === "warning" ? "text-amber-500" : "text-blue-500"
                        }`} />
                        <div>
                          <p className="text-sm">{a.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.alertType} &middot; {new Date(a.createdAt).toLocaleDateString("en-US")}
                          </p>
                        </div>
                      </div>
                      {!a.acknowledgedAt && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await fetch("/api/ppc/alerts", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: a.id }),
                            });
                            queryClient.invalidateQueries({ queryKey: ["ppc-alerts", clientIdCode] });
                          }}
                        >
                          Acknowledge
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  No active alerts.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ─── Tab 5: Competitor ─── */}
          <TabsContent value="competitor">
            <CompetitorPanel clientIdCode={clientIdCode} active={activeTab === "competitor"} />
          </TabsContent>

          {/* ─── Tab 6: Decisions ─── */}
          <TabsContent value="decisions" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Decision Tracker</h3>
              <NewDecisionDialog clientIdCode={clientIdCode} onCreated={() => queryClient.invalidateQueries({ queryKey: ["ppc-decisions", clientIdCode] })} />
            </div>
            {(decisionsData?.decisions as Decision[] | undefined)?.length ? (
              <div className="space-y-2">
                {(decisionsData.decisions as Decision[]).map((d) => (
                  <Card key={d.id}>
                    <CardContent className="py-3">
                      <p className="text-sm font-medium">{d.decision}</p>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Expected: </span>
                          {d.expectedOutcome || "—"}
                          {d.expectedMetric && ` (${d.expectedMetric}: ${d.expectedValue})`}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Actual: </span>
                          {d.measuredAt ? (
                            <>
                              {d.actualOutcome || "—"}
                              {d.actualValue && ` (${d.actualValue})`}
                            </>
                          ) : (
                            <span className="text-amber-500">Pending measurement</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(d.decidedAt).toLocaleDateString("en-US")}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  No decisions logged yet.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </>
      )}
      </div>
    </Tabs>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-800"><CheckCircle2 className="size-3 mr-1" />Approved</Badge>;
  if (status === "rejected") return <Badge variant="destructive"><XCircle className="size-3 mr-1" />Rejected</Badge>;
  return <Badge variant="outline"><Clock className="size-3 mr-1" />Pending</Badge>;
}

function CompetitorPanel({ clientIdCode, active }: { clientIdCode: string; active: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ppc-competitor", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/competitor?clientIdCode=${clientIdCode}`);
      return res.json();
    },
    enabled: active,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="size-4" />
          Competitor Benchmark
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingPlaceholder />
        ) : data?.products?.length ? (
          <div className="space-y-3">
            {data.products.map((p: { asin: string; title: string; price: number | null; rating: number | null; ratingsTotal: number | null }) => (
              <div key={p.asin} className="rounded border p-3">
                <p className="text-sm font-medium truncate">{p.title}</p>
                <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                  <span>ASIN: {p.asin}</span>
                  {p.price && <span>Price: ${p.price}</span>}
                  {p.rating && <span>Rating: {p.rating}/5</span>}
                  {p.ratingsTotal && <span>Reviews: {p.ratingsTotal}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No competitor data available. ASINs may not be configured for this client.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function NewApprovalDialog({ clientIdCode, onCreated }: { clientIdCode: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("budget_change");
  const [desc, setDesc] = useState("");

  const submit = async () => {
    await fetch("/api/ppc/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientIdCode, approvalType: type, description: desc }),
    });
    setOpen(false);
    setDesc("");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="size-3 mr-1" />New Request</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Approval Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="budget_change">Budget Change</SelectItem>
              <SelectItem value="campaign_launch">Campaign Launch</SelectItem>
              <SelectItem value="bid_strategy">Bid Strategy Change</SelectItem>
              <SelectItem value="keyword_update">Keyword Update</SelectItem>
            </SelectContent>
          </Select>
          <Textarea placeholder="Describe the change…" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Button onClick={submit} disabled={!desc.trim()}>Submit Request</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewDecisionDialog({ clientIdCode, onCreated }: { clientIdCode: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [expectedMetric, setExpectedMetric] = useState("");
  const [expectedValue, setExpectedValue] = useState("");

  const submit = async () => {
    await fetch("/api/ppc/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientIdCode,
        decision,
        expectedOutcome: expectedOutcome || undefined,
        expectedMetric: expectedMetric || undefined,
        expectedValue: expectedValue ? parseFloat(expectedValue) : undefined,
      }),
    });
    setOpen(false);
    setDecision("");
    setExpectedOutcome("");
    setExpectedMetric("");
    setExpectedValue("");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="size-3 mr-1" />Log Decision</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log PPC Decision</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea placeholder="What did you decide? (e.g., Increased daily budget to $150)" value={decision} onChange={(e) => setDecision(e.target.value)} />
          <Input placeholder="Expected outcome (optional)" value={expectedOutcome} onChange={(e) => setExpectedOutcome(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={expectedMetric} onValueChange={setExpectedMetric}>
              <SelectTrigger><SelectValue placeholder="Metric" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="impressions">Impressions</SelectItem>
                <SelectItem value="clicks">Clicks</SelectItem>
                <SelectItem value="acos">ACOS</SelectItem>
                <SelectItem value="roas">ROAS</SelectItem>
                <SelectItem value="spend">Spend</SelectItem>
                <SelectItem value="revenue">Revenue</SelectItem>
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Expected value" value={expectedValue} onChange={(e) => setExpectedValue(e.target.value)} />
          </div>
          <Button onClick={submit} disabled={!decision.trim()}>Log Decision</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

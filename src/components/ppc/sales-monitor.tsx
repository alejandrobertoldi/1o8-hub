"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/no-array-index-as-key */

/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Target,
  TrendingUp,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

// ─── Types ──────────────────────────────────────────────────────────

interface DayData {
  date: string;
  product_sales: number;
  ad_spend: number;
  ad_revenue: number;
  acos: number;
  tacos: number;
  roas: number;
}

interface Goals {
  salesForecast1M: number | null;
  adSpendBudget1M: number | null;
  acosGoal1M: number | null;
  tacosGoal1M: number | null;
  roasGoal1M: number | null;
}

interface ClientInfo {
  name: string;
  marketplace: string;
  country: string;
  intentwiseId: string;
}

interface ApiResponse {
  client: ClientInfo;
  goals: Goals;
  latestDate: string | null;
  days: DayData[];
}

interface SalesMonitorProps {
  clientIdCode: string;
  isPortal?: boolean;
  /** Portal only. False when the page renders the heading once above several
   *  stacked clients — the nav slot is last-writer-wins, so per-client mounts
   *  would overwrite each other. */
  showPageHeader?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

function fmtDollar(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(v: number): string {
  return `${v.toFixed(2)}%`;
}
function fmtRoas(v: number): string {
  return v.toFixed(2);
}
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function getISOWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartXTick({ x, y, payload }: any) {
  const d = new Date(String(payload.value));
  if (isNaN(d.getTime())) return <text x={x} y={y} textAnchor="middle" fontSize={9} fill="#6b7280">{payload.value}</text>;

  const day = DAY_LETTERS[d.getUTCDay()];
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return (
    <text x={x} y={y + 40} textAnchor="middle" fill="#6b7280">
      <tspan x={x} fontSize={10} fontWeight={600}>{day}</tspan>
      <tspan x={x} dy="13" fontSize={8}>{mm}/{dd}</tspan>
    </text>
  );
}

/** Returns a bg color class for goal-based conditional coloring */
function goalCellColor(
  value: number,
  goal: number | null,
  lowerIsBetter: boolean
): string {
  if (goal == null || goal === 0) return "";
  const met = lowerIsBetter ? value <= goal : value >= goal;
  if (met) return "color-mix(in srgb, var(--brand-green) 35%, transparent)";
  return "color-mix(in srgb, var(--brand-red) 35%, transparent)";
}

// ─── Summary Card ───────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  formatted,
  goal,
  goalFormatted,
  lowerIsBetter,
  icon: Icon,
}: {
  label: string;
  value: number;
  formatted: string;
  goal: number | null;
  goalFormatted: string | null;
  lowerIsBetter: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const met = goal != null
    ? lowerIsBetter ? value <= goal : value >= goal
    : null;

  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          </div>
          {met != null && (
            <div className={`size-2.5 rounded-full ${met ? "bg-brand-green" : "bg-brand-red"}`} />
          )}
        </div>
        <p className={`text-2xl font-bold tabular-nums ${met === true ? "text-brand-green" : met === false ? "text-brand-red" : ""}`}>{formatted}</p>
        {goalFormatted != null && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Goal: <span className="font-semibold text-blue-500">{goalFormatted}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function SalesMonitor({ clientIdCode, isPortal, showPageHeader = true }: SalesMonitorProps) {
  const [tableExpanded, setTableExpanded] = useState(true);

  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ["sales-monitor", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/sales-monitor?clientIdCode=${encodeURIComponent(clientIdCode)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  // Compute 30D totals and averages
  const summary = useMemo(() => {
    if (!data?.days?.length) return null;
    const days = data.days;
    const totalProductSales = days.reduce((s, d) => s + d.product_sales, 0);
    const totalAdSpend = days.reduce((s, d) => s + d.ad_spend, 0);
    const totalAdRevenue = days.reduce((s, d) => s + d.ad_revenue, 0);
    const avgAcos = totalAdRevenue > 0 ? (totalAdSpend / totalAdRevenue) * 100 : 0;
    const avgTacos = totalProductSales > 0 ? (totalAdSpend / totalProductSales) * 100 : 0;
    const avgRoas = totalAdSpend > 0 ? totalAdRevenue / totalAdSpend : 0;
    return { totalProductSales, totalAdSpend, totalAdRevenue, avgAcos, avgTacos, avgRoas };
  }, [data]);

  // Chart data — chronological order (oldest first)
  const chartData = useMemo(() => {
    if (!data?.days?.length) return [];
    return [...data.days];
  }, [data]);

  if (isLoading) return <LoadingPlaceholder className="h-96" />;
  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {error ? ((error as Error).message || "Failed to load sales monitor data.") : "No data available."}
        </CardContent>
      </Card>
    );
  }

  const { client, goals, latestDate, days } = data;

  // Metric row definitions for the table
  const metricRows = [
    { key: "product_sales", label: "Product Sales", fmt: fmtDollar, goal: goals.salesForecast1M, lowerIsBetter: false },
    { key: "ad_spend", label: "Ad Spend", fmt: fmtDollar, goal: goals.adSpendBudget1M, lowerIsBetter: true },
    { key: "ad_revenue", label: "Ad Revenue", fmt: fmtDollar, goal: null, lowerIsBetter: false },
    { key: "acos", label: "ACOS", fmt: fmtPct, goal: goals.acosGoal1M, lowerIsBetter: true },
    { key: "tacos", label: "TACOS", fmt: fmtPct, goal: goals.tacosGoal1M, lowerIsBetter: true },
    { key: "roas", label: "ROAS", fmt: fmtRoas, goal: goals.roasGoal1M, lowerIsBetter: false },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Portal: heading lives in nav row 3 */}
      {isPortal && showPageHeader && (
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
              aria-label="Sales Monitor"
            >
              <span className="font-bold text-sidebar-foreground">Sales</span>
              <span className="font-normal text-portal-accent">Monitor</span>
              <span className="text-muted-foreground text-xl ml-1.5 font-normal">-30D</span>
            </h1>
            {latestDate && (
              <span className="ml-auto text-xs text-muted-foreground shrink-0">
                Latest: {latestDate}
              </span>
            )}
          </div>
        </PageMetaSlot>
      )}
      {/* Portal, stacked under a shared heading: keep the freshness stamp with its own data */}
      {isPortal && !showPageHeader && latestDate && (
        <p className="text-xs text-muted-foreground">Latest: {latestDate}</p>
      )}
      {/* Hub: inline header with badges */}
      {!isPortal && (
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl lg:text-5xl font-[family-name:var(--font-outfit)] tracking-tighter">
            <span className="text-foreground font-bold">Sales</span>
            <span className="text-brand font-medium">Monitor</span>
            <span className="text-muted-foreground text-2xl lg:text-3xl ml-2 font-normal">-30D</span>
          </h1>
          <Badge variant="outline">{client.name}</Badge>
          <Badge variant="secondary">{client.marketplace}</Badge>
          <Badge variant="secondary">{client.country}</Badge>
          {latestDate && (
            <span className="ml-auto text-xs text-muted-foreground">
              Latest: {latestDate}
            </span>
          )}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard
            label="Product Sales"
            value={summary.totalProductSales}
            formatted={fmtDollar(summary.totalProductSales)}
            goal={goals.salesForecast1M}
            goalFormatted={goals.salesForecast1M != null ? fmtDollar(goals.salesForecast1M) : null}
            lowerIsBetter={false}
            icon={DollarSign}
          />
          <SummaryCard
            label="Ad Spend"
            value={summary.totalAdSpend}
            formatted={fmtDollar(summary.totalAdSpend)}
            goal={goals.adSpendBudget1M}
            goalFormatted={goals.adSpendBudget1M != null ? fmtDollar(goals.adSpendBudget1M) : null}
            lowerIsBetter={true}
            icon={Target}
          />
          <SummaryCard
            label="Ad Revenue"
            value={summary.totalAdRevenue}
            formatted={fmtDollar(summary.totalAdRevenue)}
            goal={null}
            goalFormatted={null}
            lowerIsBetter={false}
            icon={DollarSign}
          />
          <SummaryCard
            label="ACOS"
            value={summary.avgAcos}
            formatted={fmtPct(summary.avgAcos)}
            goal={goals.acosGoal1M}
            goalFormatted={goals.acosGoal1M != null ? fmtPct(goals.acosGoal1M) : null}
            lowerIsBetter={true}
            icon={Activity}
          />
          <SummaryCard
            label="TACOS"
            value={summary.avgTacos}
            formatted={fmtPct(summary.avgTacos)}
            goal={goals.tacosGoal1M}
            goalFormatted={goals.tacosGoal1M != null ? fmtPct(goals.tacosGoal1M) : null}
            lowerIsBetter={true}
            icon={Activity}
          />
          <SummaryCard
            label="ROAS"
            value={summary.avgRoas}
            formatted={fmtRoas(summary.avgRoas)}
            goal={goals.roasGoal1M}
            goalFormatted={goals.roasGoal1M != null ? fmtRoas(goals.roasGoal1M) : null}
            lowerIsBetter={false}
            icon={TrendingUp}
          />
        </div>
      )}

      {/* Expandable Daily Table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Daily Breakdown</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTableExpanded(!tableExpanded)}
              className="gap-1 text-xs"
            >
              {tableExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              {tableExpanded ? "Collapse" : "Expand"}
            </Button>
          </div>
        </CardHeader>
        {tableExpanded && days.length > 0 && (
          <CardContent className="px-0 pb-3 overflow-x-auto">
            <Table className="border-separate border-spacing-0 [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
              <TableHeader>
                {/* Week number row */}
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-card min-w-[100px]" />
                  <TableHead className="sticky left-[100px] z-10 bg-card min-w-[70px]" />
                  {(() => {
                    const spans: { week: number; count: number }[] = [];
                    for (const d of days) {
                      const w = getISOWeek(new Date(d.date));
                      if (spans.length > 0 && spans[spans.length - 1].week === w) {
                        spans[spans.length - 1].count++;
                      } else {
                        spans.push({ week: w, count: 1 });
                      }
                    }
                    return spans.map((s, i) => (
                      <TableHead
                        key={`w-${i}`}
                        colSpan={s.count}
                        className="text-center text-[9px] font-bold text-brand px-0 border-x border-border"
                      >
                        W{String(s.week).padStart(2, "0")}
                      </TableHead>
                    ));
                  })()}
                </TableRow>
                {/* Day letter + date row */}
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-card min-w-[100px] text-xs">Metric</TableHead>
                  <TableHead className="sticky left-[100px] z-10 bg-card min-w-[70px] text-xs text-blue-500">Goal</TableHead>
                  {days.map((d) => {
                    const dt = new Date(d.date);
                    const dayLetter = DAY_LETTERS[dt.getUTCDay()];
                    return (
                      <TableHead key={d.date} className="text-center min-w-[65px] px-1">
                        <div className="text-[10px] font-semibold">{dayLetter}</div>
                        <div className="text-[9px] text-muted-foreground">{fmtDateShort(d.date)}</div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {metricRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="sticky left-0 z-10 bg-card text-xs font-semibold">{row.label}</TableCell>
                    <TableCell className="sticky left-[100px] z-10 bg-card text-xs font-semibold text-blue-500 tabular-nums">
                      {row.goal != null ? row.fmt(row.goal) : "—"}
                    </TableCell>
                    {days.map((d) => {
                      const val = d[row.key as keyof DayData] as number;
                      const bgColor = row.goal != null ? goalCellColor(val, row.goal, row.lowerIsBetter) : undefined;
                      return (
                        <TableCell
                          key={d.date}
                          className="text-center text-[11px] tabular-nums px-1"
                          style={bgColor ? { backgroundColor: bgColor } : undefined}
                        >
                          {row.fmt(val)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      {/* Combo Chart */}
      {chartData.length > 1 && (
        <Card>
          <CardContent className="pt-4 pb-2">
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
                  <defs />

                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={<ChartXTick visibleTicksCount={chartData.length} />}
                    interval={chartData.length <= 14 ? 0 : Math.max(1, Math.floor(chartData.length / 12) - 1)}
                    height={80}
                    padding={{ left: 4, right: 4 }}
                  />
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`}
                    width={55}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                    width={45}
                  />

                  <Tooltip
                    contentStyle={{ background: "#1c1917", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#94a3b8", fontSize: 11 }}
                    labelFormatter={(label) => {
                      const d = new Date(String(label));
                      if (isNaN(d.getTime())) return String(label);
                      return `${DAY_LETTERS[d.getUTCDay()]} ${fmtDateShort(String(label))}`;
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, name: any) => {
                      const v = Number(value) || 0;
                      const n = String(name);
                      if (n === "ACOS" || n === "TACOS") return [fmtPct(v), n];
                      if (n === "ROAS") return [fmtRoas(v), n];
                      return [fmtDollar(v), n];
                    }}
                  />

                  <Legend
                    wrapperStyle={{ paddingTop: 8, fontSize: 11 }}
                  />

                  {/* Goal reference lines */}
                  {goals.acosGoal1M != null && (
                    <ReferenceLine
                      yAxisId="right"
                      y={goals.acosGoal1M}
                      stroke="#16a34a"
                      strokeDasharray="4 4"
                      strokeWidth={1}
                      label={{ value: `ACOS Goal ${fmtPct(goals.acosGoal1M)}`, fill: "#16a34a", fontSize: 9, position: "insideTopRight" }}
                    />
                  )}
                  {goals.tacosGoal1M != null && (
                    <ReferenceLine
                      yAxisId="right"
                      y={goals.tacosGoal1M}
                      stroke="#16a34a"
                      strokeDasharray="4 4"
                      strokeWidth={1}
                      label={{ value: `TACOS Goal ${fmtPct(goals.tacosGoal1M)}`, fill: "#16a34a", fontSize: 9, position: "insideBottomRight" }}
                    />
                  )}

                  {/* Green bars for ACOS & TACOS */}
                  <Bar
                    yAxisId="right"
                    dataKey="acos"
                    name="ACOS"
                    fill="#16a34a"
                    opacity={0.8}
                    barSize={10}
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="tacos"
                    name="TACOS"
                    fill="#166534"
                    opacity={0.7}
                    barSize={10}
                    radius={[2, 2, 0, 0]}
                  />

                  {/* Product Sales — brand orange line */}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="product_sales"
                    name="Product Sales"
                    stroke="#F7BF1D"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "#F7BF1D" }}
                    activeDot={{ r: 4 }}
                  />

                  {/* Ad Spend — red line */}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="ad_spend"
                    name="Ad Spend"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "#dc2626" }}
                    activeDot={{ r: 4 }}
                  />

                  {/* Ad Revenue — blue line */}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="ad_revenue"
                    name="Ad Revenue"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "#2563eb" }}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

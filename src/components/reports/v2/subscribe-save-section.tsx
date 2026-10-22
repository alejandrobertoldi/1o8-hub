"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */

import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { Surface } from "./primitives/surface";
import { ChartFrame } from "./primitives/chart-frame";
import { accentFor } from "./primitives/chart-colors";
import { type Surface as SurfaceKind } from "./primitives/palette";

interface DataRow {
  week: string;
  subscriptions: number;
  subscriptions_py: number;
  revenue: number;
  revenue_py: number;
  units: number;
  units_py: number;
  penetration: number;
  penetration_py: number;
}

interface ApiResponse {
  asins?: string[];
  selectedAsin?: string;
  data?: DataRow[];
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
  if (!n) return "0.00%";
  return `${Number(n).toFixed(2)}%`;
}

type FmtType = "num" | "currency" | "pct";

function applyFmt(v: number, fmt: FmtType) {
  if (fmt === "currency") return fmtCurrency(v);
  if (fmt === "pct") return fmtPct(v);
  return fmtNum(v);
}

// Period entity colors — same as the Period Comparative section. The current
// series follows the surface accent (orange on hub, charcoal on portal — the
// load-bearing dual-accent rule); previous year stays green + dashed on both.
// Recharts strokes are SVG attributes and cannot resolve CSS var(), so these
// must be concrete hex.
const PY_COLOR = "#05893E";

export function snsSeriesColors(surface: SurfaceKind): { current: string; py: string } {
  return { current: accentFor(surface), py: PY_COLOR };
}
const AXIS_TICK = { fontSize: 10, fill: "#6E6C77" };
const TOOLTIP_STYLE = { borderRadius: 8, border: "1px solid #D8D7DC", fontSize: 11 };

interface ChartConfig {
  title: string;
  subtitle: string;
  barKey: keyof DataRow;
  barLabel: string;
  pyKey: keyof DataRow;
  pyLabel: string;
  fmt: FmtType;
}

const CHARTS: ChartConfig[] = [
  {
    title: "Subscription count",
    subtitle: "Active subscriptions per week vs previous year",
    barKey: "subscriptions",
    barLabel: "Active subscriptions",
    pyKey: "subscriptions_py",
    pyLabel: "Previous year",
    fmt: "num",
  },
  {
    title: "Subscribe & Save sales",
    subtitle: "Weekly S&S revenue vs previous year",
    barKey: "revenue",
    barLabel: "Sales",
    pyKey: "revenue_py",
    pyLabel: "Previous year",
    fmt: "currency",
  },
  {
    title: "Subscribe & Save units",
    subtitle: "Weekly shipped units vs previous year",
    barKey: "units",
    barLabel: "Shipped units",
    pyKey: "units_py",
    pyLabel: "Previous year",
    fmt: "num",
  },
  {
    title: "Sales penetration trend",
    subtitle: "S&S share of total sales vs previous year",
    barKey: "penetration",
    barLabel: "Sales penetration",
    pyKey: "penetration_py",
    pyLabel: "Previous year",
    fmt: "pct",
  },
];

function LegendKey({ color, label, dash }: { color: string; label: string; dash?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {dash ? (
        <span className="inline-block w-6 border-t-2 border-dashed" style={{ borderColor: color }} />
      ) : (
        <span className="inline-block size-2 rounded-full" style={{ background: color }} />
      )}
      {label}
    </span>
  );
}

function SnsChart({
  config,
  data,
  colors,
}: {
  config: ChartConfig;
  data: DataRow[];
  colors: { current: string; py: string };
}) {
  return (
    <ChartFrame
      title={config.title}
      subtitle={config.subtitle}
      legend={[
        <LegendKey key="cur" color={colors.current} label={config.barLabel} />,
        <LegendKey key="py" color={colors.py} label={config.pyLabel} dash />,
      ]}
    >
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 6 }}>
          <XAxis
            dataKey="week"
            tickFormatter={(value) => String(value).split(" ")[0]}
            tick={{ fontSize: 9, fill: "#6E6C77" }}
            tickLine={false}
            axisLine={false}
            minTickGap={12}
          />
          <YAxis tickFormatter={(v) => applyFmt(Number(v), config.fmt)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={config.fmt === "currency" ? 58 : 44} domain={[0, "auto"]} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "#2C2B35" }} formatter={(v, n) => [applyFmt(Number(v), config.fmt), String(n)]} />
          <Line
            type="monotone"
            dataKey={config.barKey}
            name={config.barLabel}
            stroke={colors.current}
            strokeWidth={2.25}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey={config.pyKey}
            name={config.pyLabel}
            stroke={colors.py}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            strokeDasharray="6 4"
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function SubscribeSaveSection({
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
  const colors = snsSeriesColors(surface);
  const [selectedAsin, setSelectedAsin] = useState<string>("ALL");
  const requestKey =
    accountId && start && end && selectedAsin ? `${accountId}:${start}:${end}:${selectedAsin}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: ApiResponse | null } | null>(null);
  const [allAsins, setAllAsins] = useState<string[]>([]);

  useEffect(() => {
    if (!accountId || !start || !end || !selectedAsin) return;

    let ignore = false;
    fetch(
      `/api/reports/subscribe-save?accountId=${accountId}&start=${start}&end=${end}&asin=${encodeURIComponent(selectedAsin)}`
    )
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        if (ignore) return;
        setResult({ key: requestKey, data: d });
        if (d?.asins && d.asins.length > 0) setAllAsins(d.asins);
      })
      .catch(() => {
        if (!ignore) setResult({ key: requestKey, data: null });
      });
    return () => {
      ignore = true;
    };
  }, [accountId, start, end, selectedAsin, refreshKey, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;
  const rows = useMemo(() => data?.data ?? [], [data]);
  const hasRealData = rows.length > 0;

  if (!requestKey) {
    return (
      <Surface>
        <div className="p-[18px] text-mf-muted">Select a client and year to load Subscribe &amp; Save.</div>
      </Surface>
    );
  }

  if (loading && allAsins.length === 0) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`sk-${i}`} className="h-64 animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Surface>
        <div className="flex items-center gap-3 p-[18px]">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-mf-muted">ASIN</span>
          <select
            value={selectedAsin}
            onChange={(e) => setSelectedAsin(e.target.value)}
            className="max-w-xs flex-1 rounded-lg border border-mf-line bg-white px-3 py-1.5 text-xs text-mf-ink outline-none focus:border-brand"
          >
            {allAsins.length === 0 ? (
              <option value="ALL">All ASINs</option>
            ) : (
              <>
                <option value="ALL">All ASINs</option>
                {allAsins.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
      </Surface>

      {!hasRealData && !loading && (
        <Surface>
          <div className="p-[18px] text-mf-muted">No Subscribe &amp; Save data available for this client, ASIN and date range.</div>
        </Surface>
      )}

      {hasRealData && (
        <div className="grid gap-4 lg:grid-cols-2">
          {CHARTS.map((config) => (
            <SnsChart key={String(config.barKey)} config={config} data={rows} colors={colors} />
          ))}
        </div>
      )}
    </div>
  );
}

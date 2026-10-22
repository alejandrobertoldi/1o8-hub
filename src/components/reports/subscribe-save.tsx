"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

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

interface ChartConfig {
  title: string;
  barKey: keyof DataRow;
  barLabel: string;
  pyKey: keyof DataRow;
  pyLabel: string;
  fmt: "num" | "currency" | "pct";
}

const CHARTS: ChartConfig[] = [
  {
    title: "Subscription Count",
    barKey: "subscriptions",
    barLabel: "Active Subscriptions",
    pyKey: "subscriptions_py",
    pyLabel: "Last Year Active Subscriptions",
    fmt: "num",
  },
  {
    title: "Subscribe & Save Sales",
    barKey: "revenue",
    barLabel: "Sales",
    pyKey: "revenue_py",
    pyLabel: "Last Year Sales",
    fmt: "currency",
  },
  {
    title: "Subscribe & Save Units",
    barKey: "units",
    barLabel: "Shipped Units",
    pyKey: "units_py",
    pyLabel: "Last Year Shipped Units",
    fmt: "num",
  },
  {
    title: "Sales Penetration Trend",
    barKey: "penetration",
    barLabel: "Sales Penetration",
    pyKey: "penetration_py",
    pyLabel: "Last Year Penetration",
    fmt: "pct",
  },
];

function applyFmt(v: number, fmt: "num" | "currency" | "pct") {
  if (fmt === "currency") return fmtCurrency(v);
  if (fmt === "pct") return fmtPct(v);
  return fmtNum(v);
}

function buildEmptyRows(): DataRow[] {
  return [
    {
      week: "No data",
      subscriptions: 0,
      subscriptions_py: 0,
      revenue: 0,
      revenue_py: 0,
      units: 0,
      units_py: 0,
      penetration: 0,
      penetration_py: 0,
    },
  ];
}

function SnsChart({
  config,
  data,
  empty,
}: {
  config: ChartConfig;
  data: DataRow[];
  empty: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
      <div className="bg-[#3C4043] px-4 py-2">
        <h3 className="text-sm font-semibold text-[#F7BF1D] text-center">
          {config.title}
        </h3>
      </div>

      <div className="p-4">
        {empty && (
          <div className="mb-3 text-center text-xs text-black">
            No data available for the selected ASIN and date range
          </div>
        )}

        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

  <XAxis
  dataKey="week"
  tickFormatter={(value) => String(value).split(" ")[0]}
  tick={{ fontSize: 9, fill: "#000000" }}
  tickLine={false}
  axisLine={false}
  interval={0}
/>

  <YAxis
    tickFormatter={(v) => applyFmt(Number(v), config.fmt)}
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
    formatter={(v, n) => [applyFmt(Number(v), config.fmt), String(n)]}
  />

  <Legend
    wrapperStyle={{
      fontSize: "11px",
      paddingTop: "8px",
      color: "#000000",
    }}
  />

  <Line
    type="monotone"
    dataKey={config.barKey}
    name={config.barLabel}
    stroke="#F7BF1D"
    strokeWidth={2.5}
    dot={{ r: 3, fill: "#F7BF1D", stroke: "#3C4043", strokeWidth: 1 }}
    activeDot={{ r: 5 }}
  />

  <Line
    type="monotone"
    dataKey={config.pyKey}
    name={config.pyLabel}
    stroke="#3C4043"
    strokeWidth={2.5}
    dot={{ r: 3, fill: "#3C4043", stroke: "#F7BF1D", strokeWidth: 1 }}
    activeDot={{ r: 5 }}
    strokeDasharray="4 3"
  />
</LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function SubscribeSave({
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
  const [loading, setLoading] = useState(true);
  const [selectedAsin, setSelectedAsin] = useState<string>("");
  const [allAsins, setAllAsins] = useState<string[]>([]);
  const [rows, setRows] = useState<DataRow[]>([]);

  // 1) Cargar lista completa de ASINs
  useEffect(() => {
    if (!accountId || !start || !end) return;

    setLoading(true);

    fetch(
      `/api/reports/subscribe-save?accountId=${accountId}&start=${start}&end=${end}`
    )
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        const safeAsins = d?.asins ?? [];
        setAllAsins(safeAsins);

        const initialAsin = "ALL";
        setSelectedAsin(initialAsin);
        setRows(d?.data ?? []);
        setLoading(false);
      })
      .catch(() => {
        setAllAsins([]);
        setRows([]);
        setSelectedAsin("");
        setLoading(false);
      });
  }, [accountId, start, end, refreshKey]);

  // 2) Cuando cambie ASIN, cargar sus datos
  useEffect(() => {
    if (!accountId || !start || !end || !selectedAsin) return;

    setLoading(true);

    fetch(
      `/api/reports/subscribe-save?accountId=${accountId}&start=${start}&end=${end}&asin=${encodeURIComponent(
        selectedAsin
      )}`
    )
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        // Conservamos la lista completa si la API aquí no la devuelve
        if (d?.asins && d.asins.length > 0) {
          setAllAsins(d.asins);
        }

        setRows(d?.data ?? []);
        setLoading(false);
      })
      .catch(() => {
        setRows([]);
        setLoading(false);
      });
  }, [accountId, start, end, selectedAsin, refreshKey]);

  const safeRows = useMemo(() => {
    return rows.length > 0 ? rows : buildEmptyRows();
  }, [rows]);

  const hasRealData = rows.length > 0;
  console.log(rows);

  if (loading && !selectedAsin && allAsins.length === 0) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[#F7BF1D] bg-white animate-pulse h-64"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#F7BF1D] bg-white overflow-hidden">
        <div className="bg-[#3C4043] px-4 py-3 flex items-center gap-3">
          <span className="text-xs font-semibold text-[#F7BF1D] whitespace-nowrap">
            Filter by ASIN:
          </span>

          <select
            value={selectedAsin}
            onChange={(e) => setSelectedAsin(e.target.value)}
            className="text-xs rounded-lg border border-[#F7BF1D] bg-white text-black px-3 py-1.5 outline-none focus:ring-1 focus:ring-[#F7BF1D] flex-1 max-w-xs"
          >
            {allAsins.length === 0 ? (
              <option value="">No ASINs available</option>
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
      </div>

      {!hasRealData && (
        <div className="rounded-xl border border-[#F7BF1D] bg-white px-4 py-3 text-sm text-black">
          No Subscribe &amp; Save data available for this client, ASIN and date range.
        </div>
      )}

      {CHARTS.map((config) => (
        <SnsChart
          key={String(config.barKey)}
          config={config}
          data={safeRows}
          empty={!hasRealData}
        />
      ))}
    </div>
  );
}
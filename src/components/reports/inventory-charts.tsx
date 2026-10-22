"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/js-combine-iterations */

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";

interface InventoryItem {
  asin: string;
  product_name?: string;
  variation_name?: string;
  flavor?: string;
  size?: string;
  available: number;
  inbound: number;
  unfulfillable: number;
  total_units: number;
  fc_transfer: number;
  fc_processing: number;
  customer_order: number;
  working: number;
  shipped: number;
  receiving: number;
}

interface ApiResponse {
  items: InventoryItem[];
}

function fmtNum(n: number) {
  if (n === null || n === undefined || Number.isNaN(n)) return "0";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function labelFmt(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "";
  return fmtNum(n);
}

function splitTitle(text: string, maxLength = 38): string[] {
  if (!text) return [];

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length <= maxLength) {
      current = (current + " " + word).trim();
    } else {
      lines.push(current);
      current = word;
    }

    if (lines.length === 2) break;
  }

  if (current && lines.length < 2) {
    lines.push(current);
  }

  return lines;
}

function buildAxisLabel(item: InventoryItem): string {
  const mainTitle =
    item.variation_name ||
    item.product_name ||
    "";

  const details = [item.flavor, item.size]
    .filter(Boolean)
    .join(" | ");

  const splitLines = splitTitle(mainTitle, 38);

  return [
    item.asin,
    splitLines[0] || "",
    splitLines[1] || details || "",
  ]
    .filter(Boolean)
    .join("|||");
}

function CustomXAxisTick({
  x,
  y,
  payload,
  data,
}: {
  x?: number;
  y?: number;
  payload?: {
    value: string;
    index?: number;
  };
  data: { asin: string; axisLabel: string }[];
}) {
  const index = payload?.index ?? 0;
  const item = data[index];

  const lines = String(item?.axisLabel ?? item?.asin ?? payload?.value ?? "")
    .split("|||")
    .filter(Boolean);

  return (
    <g transform={`translate(${x},${y})`}>
      {lines.slice(0, 3).map((line, lineIndex) => (
        <text
          key={`${line}-${lineIndex}`}
          x={0}
          y={lineIndex * 14}
          textAnchor="middle"
          fill="#000000"
          fontSize={9}
        >
          {line}
        </text>
      ))}
    </g>
  );
}
function ChartWrapper({
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

function FbaInventoryBreakdownChart({ items }: { items: InventoryItem[] }) {
  const data = items
    .filter(
      (r) =>
        Number(r.available) +
          Number(r.inbound) +
          Number(r.unfulfillable) +
          Number(r.total_units) >
        0
    )
    .sort((a, b) => Number(b.available) - Number(a.available))
    .map((r) => ({
  asin: r.asin,
  axisLabel: buildAxisLabel(r),
  Available: Number(r.available) || 0,
      Inbound: Number(r.inbound) || 0,
      Unfulfillable: Number(r.unfulfillable) || 0,
      "Reserved Total":
        Number(r.fc_transfer) +
          Number(r.fc_processing) +
          Number(r.customer_order) || 0,
    }));

  if (data.length === 0) return null;

  return (
    <ChartWrapper title="FBA Inventory Breakdown">
      <ResponsiveContainer width="100%" height={370}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 95 }}>
          <XAxis
            dataKey="asin"
            tick={<CustomXAxisTick data={data} />}
            tickLine={false}
            axisLine={false}
            interval={0}
            height={110}
          />
          <YAxis
            tickFormatter={fmtNum}
            tick={{ fontSize: 10, fill: "#000000" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              fontSize: "11px",
              color: "#000000",
            }}
            formatter={(v, n) => [fmtNum(Number(v)), String(n)]}
          />
          <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px", color: "#000000" }} />

          <Bar dataKey="Available" stackId="a" fill="#F7BF1D">
            <LabelList formatter={labelFmt} position="inside" fill="#000000" fontSize={10} />
          </Bar>

          <Bar dataKey="Inbound" stackId="a" fill="#1f2937">
            <LabelList formatter={labelFmt} position="inside" fill="#ffffff" fontSize={10} />
          </Bar>

          <Bar dataKey="Unfulfillable" stackId="a" fill="#94a3b8">
            <LabelList formatter={labelFmt} position="inside" fill="#000000" fontSize={10} />
          </Bar>

          <Bar dataKey="Reserved Total" stackId="a" fill="#3b4f8a" radius={[4, 4, 0, 0]}>
            <LabelList formatter={labelFmt} position="inside" fill="#ffffff" fontSize={10} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

function ReservedInventoryBreakdownChart({ items }: { items: InventoryItem[] }) {
  const data = items
    .filter(
      (r) =>
        Number(r.fc_transfer) +
          Number(r.fc_processing) +
          Number(r.customer_order) >
        0
    )
    .map((r) => ({
  asin: r.asin,
  axisLabel: buildAxisLabel(r),
  "FC Transfer": Number(r.fc_transfer) || 0,
      "FC Processing": Number(r.fc_processing) || 0,
      "Customer Order": Number(r.customer_order) || 0,
    }));

  if (data.length === 0) return null;

  return (
    <ChartWrapper title="Reserved Inventory Breakdown">
      <ResponsiveContainer width="100%" height={370}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 95 }}>
          <XAxis
            tick={<CustomXAxisTick data={data} />}
            tickLine={false}
            axisLine={false}
            interval={0}
            height={110}
          />
          <YAxis
            tickFormatter={fmtNum}
            tick={{ fontSize: 10, fill: "#000000" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              fontSize: "11px",
              color: "#000000",
            }}
            formatter={(v, n) => [fmtNum(Number(v)), String(n)]}
          />
          <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px", color: "#000000" }} />

          <Bar dataKey="FC Transfer" stackId="a" fill="#F7BF1D">
            <LabelList formatter={labelFmt} position="inside" fill="#000000" fontSize={10} />
          </Bar>

          <Bar dataKey="FC Processing" stackId="a" fill="#1f2937">
            <LabelList formatter={labelFmt} position="inside" fill="#ffffff" fontSize={10} />
          </Bar>

          <Bar dataKey="Customer Order" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]}>
            <LabelList formatter={labelFmt} position="inside" fill="#000000" fontSize={10} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

// ── Export principal ─────────────────────────────────────

export function InventoryCharts({
  accountId,
  refreshKey = 0,
}: {
  accountId: string;
  refreshKey?: number;
}) {
  const requestKey = accountId ? `${accountId}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: ApiResponse | null } | null>(null);

  useEffect(() => {
    if (!accountId) return;

    let ignore = false;
    fetch(`/api/reports/inventory?accountId=${accountId}`)
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
  }, [accountId, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-xl border border-[#F7BF1D] bg-white animate-pulse h-64" />
        <div className="rounded-xl border border-[#F7BF1D] bg-white animate-pulse h-64" />
      </div>
    );
  }

  if (!data || data.items.length === 0) return null;

  return (
    <div className="space-y-4">
      <FbaInventoryBreakdownChart items={data.items} />
      <ReservedInventoryBreakdownChart items={data.items} />
    </div>
  );
}

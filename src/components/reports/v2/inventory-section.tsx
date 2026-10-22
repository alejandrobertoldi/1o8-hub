"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/no-array-index-as-key */
/* eslint-disable react-doctor/nextjs-no-img-element */

import { useEffect, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { Surface } from "./primitives/surface";
import { ChartFrame } from "./primitives/chart-frame";
import { Chip, type ChipTone } from "./primitives/chip";

interface InventoryItem {
  asin: string;
  product_name: string;
  variation_name?: string;
  flavor?: string;
  size?: string;
  link: string | null;
  status: string;
  alert: string;
  available: number;
  inbound: number;
  fc_transfer: number;
  fc_processing: number;
  customer_order: number;
  unfulfillable: number;
  total_units: number;
  units_sold_30: number;
  sales_30: number;
  days_of_supply: number;
  total_days_of_supply: number;
  days_of_supply_at_amazon: number;
  recommended_replenishment_qty: number;
  recommended_ship_date: string | null;
  utilization: number;
  maximum_shipment_qty: number;
  working: number;
  shipped: number;
  receiving: number;
  unit_storage_size: number;
}

interface ApiResponse {
  items: InventoryItem[];
  maxDate: string | null;
}

function fmtCurrency(n: number) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtNum(n: number) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ── Stacked-segment palette. Fixed slot order, validated with the dataviz
//    palette validator on the white card surface (4 slots, worst adjacent CVD
//    pair ΔE 22.2 protan); segments carry a 2px surface-color stroke as the gap. ──
const STACK = ["#F7BF1D", "#006BBB", "#05893E", "#653CBD"] as const;
const SURFACE_GAP = { stroke: "#FEFEFE", strokeWidth: 2 };
const AXIS_TICK = { fontSize: 10, fill: "#6E6C77" };
const TOOLTIP_STYLE = { borderRadius: 8, border: "1px solid #D8D7DC", fontSize: 11 };

function statusTone(status: string): ChipTone {
  const s = (status || "").toLowerCase();
  if (s === "active") return "positive";
  if (s === "inactive") return "negative";
  if (s === "incomplete") return "warning";
  return "neutral";
}

function alertTone(alert: string): { tone: ChipTone; label: string } {
  const a = (alert || "").toLowerCase();
  if (a === "") return { tone: "positive", label: "Healthy" };
  if (a.includes("out")) return { tone: "negative", label: alert };
  if (a.includes("low")) return { tone: "warning", label: alert };
  return { tone: "neutral", label: alert };
}

// ── Tables ──────────────────────────────────────────────────────────────────
interface ColDef {
  key: keyof InventoryItem;
  label: string;
  currency?: boolean;
  noTotal?: boolean;
}

function InventoryV2Table({ title, items, cols }: { title: string; items: InventoryItem[]; cols: ColDef[] }) {
  const [search, setSearch] = useState("");

  const filtered = items.filter(
    (r) =>
      r.asin.toLowerCase().includes(search.toLowerCase()) ||
      (r.product_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const totals = cols.reduce((acc, col) => {
    if (!col.noTotal) {
      acc[col.key as string] = filtered.reduce((sum, r) => sum + (Number(r[col.key]) || 0), 0);
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <Surface
      title={title}
      subtitle={`${filtered.length} items`}
      tools={
        <input
          type="text"
          placeholder="Search ASIN or product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-lg border border-mf-line bg-white px-3 py-1.5 text-xs text-mf-ink outline-none placeholder:text-mf-muted focus:border-brand"
        />
      }
    >
      <div className="custom-scroll max-h-[500px] overflow-auto">
        <table className="border-collapse text-xs" style={{ minWidth: "max-content", width: "100%" }}>
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 border-b border-r border-mf-line bg-mf-ghost px-4 py-2.5 text-left font-bold text-mf-ink" style={{ minWidth: "110px" }}>
                ASIN
              </th>
              <th className="border-b border-mf-line bg-mf-ghost px-4 py-2.5 text-left font-bold text-mf-ink" style={{ minWidth: "400px", maxWidth: "400px" }}>
                Item Name
              </th>
              <th className="border-b border-mf-line bg-mf-ghost px-4 py-2.5 text-center font-bold text-mf-ink" style={{ minWidth: "90px" }}>
                Image
              </th>
              <th className="border-b border-mf-line bg-mf-ghost px-4 py-2.5 text-center font-bold text-mf-ink" style={{ minWidth: "100px" }}>
                Status
              </th>
              <th className="border-b border-mf-line bg-mf-ghost px-4 py-2.5 text-center font-bold text-mf-ink" style={{ minWidth: "120px" }}>
                Alert
              </th>
              {cols.map((col) => (
                <th key={col.key as string} className="border-b border-mf-line bg-mf-ghost px-4 py-2.5 text-right font-bold text-mf-ink" style={{ minWidth: "130px" }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((row, i) => {
              const alert = alertTone(row.alert);
              return (
                <tr key={`${row.asin}-${i}`} className="border-b border-mf-line/60 transition-colors hover:bg-mf-ghost/60">
                  <td
                    className="sticky left-0 z-10 border-r border-mf-line px-4 py-2 font-semibold text-mf-ink"
                    style={{ backgroundColor: i % 2 === 0 ? "#FEFEFE" : "#F7F6FB" }}
                  >
                    {row.asin}
                  </td>
                  <td className={`px-4 py-2 text-mf-ink ${i % 2 === 0 ? "bg-white" : "bg-[#F7F6FB]"}`} style={{ minWidth: "220px", maxWidth: "220px" }}>
                    <span className="line-clamp-3 text-[11px] leading-tight">{row.product_name || "—"}</span>
                  </td>
                  <td className={`px-4 py-2 text-center ${i % 2 === 0 ? "bg-white" : "bg-[#F7F6FB]"}`}>
                    {row.link ? (
                      <img src={row.link} alt={row.asin} className="mx-auto size-16 rounded object-contain" />
                    ) : (
                      <span className="text-mf-muted">—</span>
                    )}
                  </td>
                  <td className={`px-4 py-2 text-center ${i % 2 === 0 ? "bg-white" : "bg-[#F7F6FB]"}`}>
                    <Chip tone={statusTone(row.status)}>{row.status || "—"}</Chip>
                  </td>
                  <td className={`px-4 py-2 text-center ${i % 2 === 0 ? "bg-white" : "bg-[#F7F6FB]"}`}>
                    <Chip tone={alert.tone}>{alert.label}</Chip>
                  </td>
                  {cols.map((col) => (
                    <td key={col.key as string} className={`whitespace-nowrap px-4 py-2 text-right tabular-nums text-mf-ink ${i % 2 === 0 ? "bg-white" : "bg-[#F7F6FB]"}`}>
                      {col.key === "recommended_ship_date"
                        ? row.recommended_ship_date ?? "—"
                        : col.currency
                        ? fmtCurrency(row[col.key] as number)
                        : fmtNum(row[col.key] as number)}
                    </td>
                  ))}
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={5 + cols.length} className="px-4 py-8 text-center text-mf-muted">
                  No items found
                </td>
              </tr>
            )}
          </tbody>

          <tfoot className="sticky bottom-0 z-20">
            <tr>
              <td className="sticky left-0 z-30 border-r border-t border-mf-line bg-mf-ghost px-4 py-2.5 font-bold text-mf-ink">Total</td>
              <td className="border-t border-mf-line bg-mf-ghost" />
              <td className="border-t border-mf-line bg-mf-ghost" />
              <td className="border-t border-mf-line bg-mf-ghost" />
              <td className="border-t border-mf-line bg-mf-ghost" />
              {cols.map((col) => (
                <td key={col.key as string} className="whitespace-nowrap border-t border-mf-line bg-mf-ghost px-4 py-2.5 text-right font-bold tabular-nums text-mf-ink">
                  {col.noTotal ? "" : col.currency ? fmtCurrency(totals[col.key as string]) : fmtNum(totals[col.key as string])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Surface>
  );
}

// ── Charts ──────────────────────────────────────────────────────────────────
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
  if (current && lines.length < 2) lines.push(current);
  return lines;
}

function buildAxisLabel(item: InventoryItem): string {
  const mainTitle = item.variation_name || item.product_name || "";
  const details = [item.flavor, item.size].filter(Boolean).join(" | ");
  const splitLines = splitTitle(mainTitle, 38);
  return [item.asin, splitLines[0] || "", splitLines[1] || details || ""].filter(Boolean).join("|||");
}

function CustomXAxisTick({
  x,
  y,
  payload,
  data,
}: {
  x?: number;
  y?: number;
  payload?: { value: string; index?: number };
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
        <text key={`${line}-${lineIndex}`} x={0} y={lineIndex * 13} textAnchor="middle" fill="#6E6C77" fontSize={9}>
          {line}
        </text>
      ))}
    </g>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block size-2 rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  );
}

function StackedInventoryChart({
  title,
  subtitle,
  data,
  series,
}: {
  title: string;
  subtitle: string;
  data: Record<string, string | number>[];
  series: { key: string; color: string }[];
}) {
  if (data.length === 0) {
    return (
      <Surface title={title} subtitle={subtitle}>
        <div className="p-[18px] text-xs text-mf-muted">No available data for the period.</div>
      </Surface>
    );
  }

  return (
    <ChartFrame title={title} subtitle={subtitle} legend={series.map((s) => <LegendDot key={s.key} color={s.color} label={s.key} />)}>
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 46 }}>
          <XAxis
            dataKey="asin"
            tick={<CustomXAxisTick data={data as { asin: string; axisLabel: string }[]} />}
            tickLine={false}
            axisLine={false}
            interval={0}
            height={52}
          />
          <YAxis tickFormatter={fmtNum} tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "#2C2B35" }} formatter={(v, n) => [fmtNum(Number(v)), String(n)]} cursor={{ fill: "rgba(16,34,39,0.05)" }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="a"
              fill={s.color}
              maxBarSize={24}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : undefined}
              {...SURFACE_GAP}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────
export function InventorySection({ accountId, refreshKey = 0 }: { accountId: string; refreshKey?: number }) {
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

  if (!requestKey) {
    return (
      <Surface>
        <div className="p-[18px] text-mf-muted">Select a client to load inventory.</div>
      </Surface>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={`sk-${i}`} className="h-64 animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Surface>
        <div className="p-[18px] text-mf-muted">No inventory data available.</div>
      </Surface>
    );
  }

  const items = data.items;

  const fbaData = items
    .filter((r) => Number(r.available) + Number(r.inbound) + Number(r.unfulfillable) + Number(r.total_units) > 0)
    .sort((a, b) => Number(b.available) - Number(a.available))
    .map((r) => ({
      asin: r.asin,
      axisLabel: buildAxisLabel(r),
      Available: Number(r.available) || 0,
      Inbound: Number(r.inbound) || 0,
      Unfulfillable: Number(r.unfulfillable) || 0,
      Reserved: Number(r.fc_transfer) + Number(r.fc_processing) + Number(r.customer_order) || 0,
    }));

  const reservedData = items
    .filter((r) => Number(r.fc_transfer) + Number(r.fc_processing) + Number(r.customer_order) > 0)
    .map((r) => ({
      asin: r.asin,
      axisLabel: buildAxisLabel(r),
      "FC Transfer": Number(r.fc_transfer) || 0,
      "FC Processing": Number(r.fc_processing) || 0,
      "Customer Order": Number(r.customer_order) || 0,
    }));

  return (
    <div className="space-y-4">
      <InventoryV2Table
        title="Inventory status"
        items={items}
        cols={[
          { key: "available", label: "Available" },
          { key: "inbound", label: "Inbound" },
          { key: "unfulfillable", label: "Unfulfillable" },
          { key: "total_units", label: "Total Units" },
          { key: "fc_transfer", label: "FC Transfer" },
          { key: "fc_processing", label: "FC Processing" },
          { key: "customer_order", label: "Customer Orders" },
          { key: "working", label: "Working" },
          { key: "shipped", label: "Shipped" },
          { key: "receiving", label: "Receiving" },
        ]}
      />

      <InventoryV2Table
        title="Latest sales breakdown"
        items={items}
        cols={[
          { key: "units_sold_30", label: "Units 30 Days" },
          { key: "sales_30", label: "Sales 30 Days", currency: true },
        ]}
      />

      <InventoryV2Table
        title="Amazon inventory suggestions"
        items={items}
        cols={[
          { key: "days_of_supply", label: "Days of Supply" },
          { key: "total_days_of_supply", label: "Total Days of Supply" },
          { key: "days_of_supply_at_amazon", label: "Days of Supply at Amazon" },
          { key: "recommended_replenishment_qty", label: "Recommended Replenishment" },
          { key: "recommended_ship_date", label: "Recommended Ship Date", noTotal: true },
          { key: "utilization", label: "Utilization" },
          { key: "maximum_shipment_qty", label: "Max Shipment Qty" },
        ]}
      />

      <StackedInventoryChart
        title="FBA inventory breakdown"
        subtitle="Available, inbound, unfulfillable & reserved units per ASIN"
        data={fbaData}
        series={[
          { key: "Available", color: STACK[0] },
          { key: "Inbound", color: STACK[1] },
          { key: "Unfulfillable", color: STACK[2] },
          { key: "Reserved", color: STACK[3] },
        ]}
      />

      <StackedInventoryChart
        title="Reserved inventory breakdown"
        subtitle="FC transfer, FC processing & customer orders per ASIN"
        data={reservedData}
        series={[
          { key: "FC Transfer", color: STACK[0] },
          { key: "FC Processing", color: STACK[1] },
          { key: "Customer Order", color: STACK[2] },
        ]}
      />
    </div>
  );
}

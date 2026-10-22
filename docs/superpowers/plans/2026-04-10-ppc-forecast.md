# PPC Forecast Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a spreadsheet-style PPC Forecast page showing monthly actuals per channel, editable forecast cells, balance rows, ROAS, and a combined bar chart — used in both hub and portal.

**Architecture:** New API endpoint `/api/ppc/forecast` groups sibling channels by brand prefix and returns monthly Redshift data + DB forecasts in one payload. Rewritten `ForecastEditor` component renders the spreadsheet table + Recharts chart. Hub and portal pages are thin wrappers passing `readOnly` prop.

**Tech Stack:** Next.js 16 App Router, React 19, Recharts, TanStack Query, Drizzle ORM, Redshift (pg), Tailwind CSS 4

---

## File Map

| File                                                 | Action  | Responsibility                                              |
|------------------------------------------------------|---------|-------------------------------------------------------------|
| `src/app/api/ppc/forecast/route.ts`                  | Create  | API: sibling detection, Redshift monthly query, forecast merge |
| `src/components/analytics/forecast-editor.tsx`       | Rewrite | Spreadsheet table + chart component                         |
| `src/app/sales-summary/forecast/page.tsx`            | Rewrite | Hub page with client dropdown                               |
| `src/app/portal/sales/forecast/page.tsx`             | Rewrite | Portal page, read-only                                      |
| `src/app/clients/[clientIdCode]/forecast/page.tsx`   | Rewrite | Per-client forecast (same pattern as hub)                   |

---

## Task 1: Create `/api/ppc/forecast` endpoint

**Files:**
- Create: `src/app/api/ppc/forecast/route.ts`

- [ ] **Step 1: Create the API route file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, clientForecasts } from "@/lib/db/schema";
import { eq, ilike, and } from "drizzle-orm";
import { queryRedshift } from "@/lib/redshift";

export const maxDuration = 120;

const RS_SCHEMA = "intentwise_ecommerce_graph";
const RS_TABLE = "account_summary";
const FULL_TABLE = `"${RS_SCHEMA}"."${RS_TABLE}"`;

const CHANNEL_LABELS: Record<string, string> = {
  SC: "Amazon SC",
  VC: "Amazon VC",
  WF: "Whole Foods",
};

function parseRawData(rawData: unknown): Record<string, string> {
  if (typeof rawData === "string") {
    try { return JSON.parse(rawData); } catch { return {}; }
  }
  if (rawData && typeof rawData === "object") return rawData as Record<string, string>;
  return {};
}

function parseClientCode(code: string): { brand: string; channel: string; country: string } | null {
  const parts = code.split("_");
  if (parts.length < 3) return null;
  return { brand: parts[0], channel: parts[1], country: parts[parts.length - 1] };
}

function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function generateMonths(): string[] {
  const now = new Date();
  const prevYear = now.getFullYear() - 1;
  const nextYear = now.getFullYear() + 1;
  const months: string[] = [];
  for (let y = prevYear; y <= nextYear; y++) {
    for (let m = 1; m <= 12; m++) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
    }
  }
  return months;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  if (!clientIdCode) {
    return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
  }

  // Portal clients can only see their own brand group
  if (session.user.role === "client" && session.user.clientIdCode) {
    const allowedCodes = (session.user.clientIdCode as string).split(",").map((s: string) => s.trim());
    const parsed = parseClientCode(clientIdCode);
    const allowed = allowedCodes.some((code) => {
      const p = parseClientCode(code);
      return p && parsed && p.brand === parsed.brand;
    });
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // 1. Parse brand prefix from the given client code
  const parsed = parseClientCode(clientIdCode);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid clientIdCode format" }, { status: 400 });
  }

  // 2. Find all active AAC siblings with same brand prefix
  const allActive = await db
    .select({
      clientIdCode: aac.clientIdCode,
      clientName: aac.clientName,
      rawData: aac.rawData,
    })
    .from(aac)
    .where(ilike(aac.clientStatus, "active"));

  interface SiblingInfo {
    clientIdCode: string;
    channel: string;
    accountId: string | null;
    marketplace: string | null;
    country: string | null;
    clientName: string | null;
  }

  const siblings: SiblingInfo[] = [];
  let primaryName = "";
  let primaryMarketplace = "";
  let primaryCountry = "";

  for (const row of allActive) {
    const p = parseClientCode(row.clientIdCode!);
    if (!p || p.brand !== parsed.brand) continue;

    const raw = parseRawData(row.rawData);
    const info: SiblingInfo = {
      clientIdCode: row.clientIdCode!,
      channel: p.channel,
      accountId: raw.IntentwiseID || null,
      marketplace: raw.Marketplace || null,
      country: raw.Country || null,
      clientName: row.clientName || null,
    };
    siblings.push(info);

    if (row.clientIdCode === clientIdCode) {
      primaryName = row.clientName || raw.BrandName || row.clientIdCode!;
      primaryMarketplace = raw.Marketplace || CHANNEL_LABELS[p.channel] || p.channel;
      primaryCountry = raw.Country || p.country;
    }
  }

  // If the exact code wasn't found, use the first sibling
  if (!primaryName && siblings.length > 0) {
    const first = siblings[0];
    primaryName = first.clientName || first.clientIdCode;
    primaryMarketplace = first.marketplace || CHANNEL_LABELS[first.channel] || first.channel;
    primaryCountry = first.country || "";
  }

  // 3. Query Redshift for monthly data per sibling account
  const accountIds = siblings
    .filter((s) => s.accountId)
    .map((s) => parseInt(s.accountId!, 10))
    .filter((id) => !isNaN(id));

  const months = generateMonths();
  const prevYear = new Date().getFullYear() - 1;
  const startDate = `${prevYear}-01-01`;

  interface RedshiftMonthlyRow {
    account_id: number;
    month: string;
    product_sales: number;
    ad_spend: number;
    days_included: number;
  }

  let redshiftRows: RedshiftMonthlyRow[] = [];
  let latestDate = "";

  if (accountIds.length > 0) {
    const inClause = accountIds.map((id) => `${id}::BIGINT`).join(",");

    const dataSql = `
      SELECT
        account_id,
        TO_CHAR(report_date, 'YYYY-MM') AS month,
        COALESCE(SUM(product_sales), 0) AS product_sales,
        COALESCE(SUM(ad_spend), 0) AS ad_spend,
        COUNT(DISTINCT report_date) AS days_included
      FROM ${FULL_TABLE}
      WHERE account_id IN (${inClause})
        AND report_date >= '${startDate}'::DATE
      GROUP BY account_id, TO_CHAR(report_date, 'YYYY-MM')
      ORDER BY account_id, month
    `;

    const latestSql = `
      SELECT MAX(report_date)::TEXT AS latest_date
      FROM ${FULL_TABLE}
      WHERE account_id IN (${inClause})
        AND product_sales IS NOT NULL
    `;

    const [dataRows, latestResult] = await Promise.all([
      queryRedshift<RedshiftMonthlyRow>(dataSql),
      queryRedshift<{ latest_date: string }>(latestSql),
    ]);

    redshiftRows = dataRows;
    latestDate = latestResult[0]?.latest_date || "";
  }

  // 4. Build per-channel data
  const accountToChannel = new Map<number, string>();
  for (const s of siblings) {
    if (s.accountId) {
      accountToChannel.set(parseInt(s.accountId, 10), s.channel);
    }
  }

  // Build channel data maps
  const channelSales = new Map<string, Record<string, number>>();
  const channelAdSpend = new Map<string, Record<string, number>>();
  const daysIncludedMap = new Map<string, number>(); // month -> max days across channels

  for (const row of redshiftRows) {
    const channel = accountToChannel.get(Number(row.account_id));
    if (!channel) continue;

    if (!channelSales.has(channel)) channelSales.set(channel, {});
    if (!channelAdSpend.has(channel)) channelAdSpend.set(channel, {});

    const sales = Number(row.product_sales) || 0;
    const spend = Number(row.ad_spend) || 0;
    if (sales > 0) channelSales.get(channel)![row.month] = sales;
    if (spend > 0) channelAdSpend.get(channel)![row.month] = spend;

    const days = Number(row.days_included) || 0;
    const existing = daysIncludedMap.get(row.month) || 0;
    if (days > existing) daysIncludedMap.set(row.month, days);
  }

  // Build standard 3 channel slots
  const standardChannels = ["SC", "VC", "WF"];
  const channels = standardChannels.map((key) => {
    const sibling = siblings.find((s) => s.channel === key);
    return {
      key,
      label: CHANNEL_LABELS[key] || key,
      clientIdCode: sibling?.clientIdCode || null,
      accountId: sibling?.accountId || null,
      sales: channelSales.get(key) || {},
      adSpend: channelAdSpend.get(key) || {},
    };
  });

  // 5. Build daysIncluded
  const daysIncluded: Record<string, { included: number; total: number }> = {};
  for (const m of months) {
    const included = daysIncludedMap.get(m) || 0;
    const total = daysInMonth(m);
    if (included > 0) {
      daysIncluded[m] = { included, total };
    }
  }

  // 6. Query forecasts for primary client code
  const forecastRows = await db
    .select({
      month: clientForecasts.month,
      metric: clientForecasts.metric,
      forecastValue: clientForecasts.forecastValue,
    })
    .from(clientForecasts)
    .where(eq(clientForecasts.clientIdCode, clientIdCode));

  const forecasts: { product_sales: Record<string, number>; ad_spend: Record<string, number> } = {
    product_sales: {},
    ad_spend: {},
  };
  for (const row of forecastRows) {
    const val = parseFloat(row.forecastValue || "0");
    if (val > 0 && (row.metric === "product_sales" || row.metric === "ad_spend")) {
      forecasts[row.metric][row.month] = val;
    }
  }

  return NextResponse.json({
    brand: primaryName,
    primaryClientIdCode: clientIdCode,
    marketplace: primaryMarketplace,
    country: primaryCountry,
    latestDate,
    months,
    daysIncluded,
    channels,
    forecasts,
  });
}
```

- [ ] **Step 2: Test manually**

Start dev server and test in browser:
```
curl http://localhost:3000/api/ppc/forecast?clientIdCode=PUR_SC_US
```
Expected: JSON with brand "Pura", 3 channel slots, monthly sales/adSpend data for SC channel, empty VC/WF.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ppc/forecast/route.ts
git commit -m "feat: add /api/ppc/forecast endpoint with sibling channel grouping"
```

---

## Task 2: Rewrite ForecastEditor component — table

**Files:**
- Rewrite: `src/components/analytics/forecast-editor.tsx`

- [ ] **Step 1: Replace entire file with the new component (table only, chart in Task 3)**

```typescript
"use client";

import { fmtCurrency } from "@/lib/formatters";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

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

type RowKind = "channel_sales" | "channel_adspend" | "global" | "forecast" | "balance" | "roas" | "days";

interface RowDef {
  kind: RowKind;
  label: string;
  metric?: "product_sales" | "ad_spend";
  channelKey?: string; // for channel rows
  accountId?: string | null;
}

function buildRows(channels: ForecastChannel[]): RowDef[] {
  const rows: RowDef[] = [];

  // Sales channel rows
  for (const ch of channels) {
    rows.push({
      kind: "channel_sales",
      label: `Sales ${ch.label}`,
      metric: "product_sales",
      channelKey: ch.key,
      accountId: ch.accountId,
    });
  }
  rows.push({ kind: "global", label: "Sales Global", metric: "product_sales" });
  rows.push({ kind: "forecast", label: "Sales Forecast", metric: "product_sales" });
  rows.push({ kind: "balance", label: "Sales Balance", metric: "product_sales" });

  // Ad Spend channel rows
  for (const ch of channels) {
    rows.push({
      kind: "channel_adspend",
      label: `Ad Spend ${ch.label}`,
      metric: "ad_spend",
      channelKey: ch.key,
      accountId: ch.accountId,
    });
  }
  rows.push({ kind: "global", label: "Ad Spend Global", metric: "ad_spend" });
  rows.push({ kind: "forecast", label: "Ad Spend Forecast", metric: "ad_spend" });
  rows.push({ kind: "balance", label: "Ad Spend Balance", metric: "ad_spend" });

  // ROAS
  rows.push({ kind: "roas", label: "ROAS" });

  return rows;
}

// ─── Component ──────────────────────────────────────────────────

export function ForecastEditor({ data, readOnly = false }: ForecastEditorProps) {
  const { brand, primaryClientIdCode, marketplace, country, latestDate, months, daysIncluded, channels, forecasts } = data;
  const queryClient = useQueryClient();
  const rows = useMemo(() => buildRows(channels), [channels]);

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
      case "roas":
        return getRoas(month);
      default:
        return null;
    }
  }

  // ─── Row styles ─────────────────────────────────────────────

  function rowClassName(row: RowDef): string {
    if (row.kind === "global") return "font-bold";
    if (row.kind === "forecast") return "bg-amber-50 dark:bg-amber-950/20";
    if (row.kind === "roas") return "font-bold";
    return "";
  }

  function cellText(row: RowDef, value: number | null): string {
    if (row.kind === "balance") return fmtBalance(value);
    if (row.kind === "roas") return value != null ? `$${Math.round(value)}` : "";
    return fmtCell(value);
  }

  function cellColor(row: RowDef, value: number | null): string {
    if (row.kind === "balance" && value != null) {
      return value >= 0 ? "text-[#34C759]" : "text-[#FF5C5F]";
    }
    return "";
  }

  // ─── Header ─────────────────────────────────────────────────

  const latestFormatted = latestDate
    ? new Date(latestDate).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })
    : "";

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-0">
      {/* Header bar */}
      <div className="rounded-t-xl bg-[#0a0a0a] text-white px-5 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <span className="text-lg font-bold tracking-tight text-brand">108<span className="text-white text-xs ml-1">AGENCY</span></span>
          <div>
            <p className="text-sm font-bold">PPC FORECAST</p>
            <p className="text-xs text-zinc-400">Client: <span className="text-white">{brand}</span></p>
            <p className="text-xs text-zinc-400">Marketplace: <span className="text-white">{marketplace}</span></p>
            <p className="text-xs text-zinc-400">Country: <span className="text-white">{country}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {!readOnly && (
            <span className="rounded bg-amber-400 px-2 py-1 text-[10px] font-bold text-black">EDITABLE CELLS IN YELLOW</span>
          )}
          {latestFormatted && (
            <p className="text-xs text-zinc-400">Latest Included Date: <span className="text-white font-medium">{latestFormatted}</span></p>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-b-xl border border-t-0 border-border">
        <table className="w-full text-xs tabular-nums">
          <thead>
            {/* Month headers row */}
            <tr className="bg-[#0a0a0a] text-white">
              <th className="sticky left-0 z-20 bg-[#0a0a0a] px-2 py-1.5 text-left min-w-[80px]"></th>
              <th className="sticky left-[80px] z-20 bg-[#0a0a0a] px-2 py-1.5 text-left min-w-[120px]"></th>
              <th className="sticky left-[200px] z-20 bg-[#0a0a0a] px-2 py-1.5 text-left min-w-[90px]">Included Days of Month:</th>
              <th className="sticky left-[290px] z-20 bg-[#0a0a0a] px-2 py-1.5 text-left min-w-[160px]"></th>
              {months.map((m) => {
                const di = daysIncluded[m];
                return (
                  <th key={m} className="border-l border-zinc-700 px-2 py-1.5 text-right whitespace-nowrap min-w-[72px]">
                    <div className="text-[10px] font-normal text-zinc-400">
                      {di ? `${di.included}/${di.total}` : ""}
                    </div>
                    <div className="text-[10px] font-bold">{formatMonthHeader(m)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={`border-b border-border ${rowClassName(row)}`}>
                {/* Col A: Account ID */}
                <td className="sticky left-0 z-10 bg-card px-2 py-1.5 text-muted-foreground whitespace-nowrap min-w-[80px] border-r border-border">
                  {(row.kind === "channel_sales" || row.kind === "channel_adspend") && row.accountId
                    ? row.accountId
                    : ""}
                </td>
                {/* Col B: Source */}
                <td className="sticky left-[80px] z-10 bg-card px-2 py-1.5 text-muted-foreground whitespace-nowrap min-w-[120px] border-r border-border">
                  {(row.kind === "channel_sales" || row.kind === "channel_adspend")
                    ? row.metric === "product_sales" ? "product_sales" : "ad_spend"
                    : ""}
                </td>
                {/* Col C: Frequency */}
                <td className="sticky left-[200px] z-10 bg-card px-2 py-1.5 text-muted-foreground whitespace-nowrap min-w-[90px] border-r border-border">
                  {row.kind !== "roas" ? "MONTHLY" : ""}
                </td>
                {/* Col D: Metric label */}
                <td className={`sticky left-[290px] z-10 px-2 py-1.5 whitespace-nowrap min-w-[160px] border-r border-border ${
                  row.kind === "forecast" ? "bg-amber-50 dark:bg-amber-950/20 font-bold" :
                  row.kind === "global" || row.kind === "roas" ? "bg-card font-bold" :
                  "bg-card"
                }`}>
                  {row.label}
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
                        <td key={month} className="border-l border-border bg-amber-50 dark:bg-amber-950/20 p-0">
                          <input
                            autoFocus
                            type="text"
                            defaultValue={value != null ? value.toString() : ""}
                            className="w-full bg-transparent px-2 py-1.5 text-right text-xs outline-none ring-1 ring-[#2563eb] rounded-none"
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
                        className={`border-l border-border bg-amber-50 dark:bg-amber-950/20 px-2 py-1.5 text-right cursor-pointer hover:ring-1 hover:ring-[#2563eb]/50 ${isSaving ? "opacity-50" : ""}`}
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
                      className={`border-l border-border px-2 py-1.5 text-right ${color} ${
                        row.kind === "forecast" ? "bg-amber-50 dark:bg-amber-950/20" : ""
                      }`}
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
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/manu/1o8Hub && npx tsc --noEmit src/components/analytics/forecast-editor.tsx 2>&1 | head -20`

Expected: No type errors (or only unrelated ones).

- [ ] **Step 3: Commit**

```bash
git add src/components/analytics/forecast-editor.tsx
git commit -m "feat: rewrite ForecastEditor with per-channel spreadsheet table"
```

---

## Task 3: Add chart to ForecastEditor

**Files:**
- Modify: `src/components/analytics/forecast-editor.tsx` (append chart section after table)

- [ ] **Step 1: Add Recharts imports at the top of the file**

Add after the existing imports:

```typescript
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts";
```

- [ ] **Step 2: Add chart data builder and chart section inside the component**

Add before the `return` statement in `ForecastEditor`:

```typescript
  // ─── Chart data ───────────────────────────────────────────────

  const chartData = useMemo(() => {
    return months.map((month) => {
      const salesActual = getGlobal(month, "product_sales");
      const salesForecast = getForecast(month, "product_sales");
      const spendActual = getGlobal(month, "ad_spend");
      const spendForecast = getForecast(month, "ad_spend");
      return {
        month: formatMonthHeader(month),
        salesForecast: salesForecast || null,
        salesActual: salesActual || null,
        spendForecast: spendForecast || null,
        spendActual: spendActual || null,
      };
    });
  }, [months, channels, localForecasts]);
```

Then add the chart JSX right after the closing `</div>` of the table's overflow container (before the final closing `</div>` of the component):

```tsx
      {/* Chart */}
      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData} barGap={0} barCategoryGap="15%">
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={{ stroke: "#334155" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#fff",
              }}
              formatter={(value: number, name: string) => [`$${Math.round(value).toLocaleString()}`, name]}
            />
            <Legend
              verticalAlign="top"
              height={36}
              wrapperStyle={{ fontSize: "11px" }}
            />
            <Bar dataKey="salesForecast" name="Sales Forecast" fill="#E8A700" radius={[2, 2, 0, 0]} maxBarSize={32}>
              <LabelList dataKey="salesForecast" position="top" fontSize={9} fill="#94a3b8" formatter={(v: number) => v ? `$${(v / 1000).toFixed(1)}k` : ""} />
            </Bar>
            <Bar dataKey="salesActual" name="Sales Amazon SC" fill="#dc2626" radius={[2, 2, 0, 0]} maxBarSize={32}>
              <LabelList dataKey="salesActual" position="top" fontSize={9} fill="#94a3b8" formatter={(v: number) => v ? `$${(v / 1000).toFixed(1)}k` : ""} />
            </Bar>
            <Bar dataKey="spendForecast" name="Ad Spend Forecast" fill="#166534" radius={[2, 2, 0, 0]} maxBarSize={32}>
              <LabelList dataKey="spendForecast" position="top" fontSize={9} fill="#94a3b8" formatter={(v: number) => v ? `$${(v / 1000).toFixed(1)}k` : ""} />
            </Bar>
            <Bar dataKey="spendActual" name="Ad Spend Amazon SC" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={32}>
              <LabelList dataKey="spendActual" position="top" fontSize={9} fill="#94a3b8" formatter={(v: number) => v ? `$${(v / 1000).toFixed(1)}k` : ""} />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/analytics/forecast-editor.tsx
git commit -m "feat: add forecast vs actual bar chart to ForecastEditor"
```

---

## Task 4: Rewrite hub forecast page

**Files:**
- Rewrite: `src/app/sales-summary/forecast/page.tsx`

- [ ] **Step 1: Replace entire file**

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ForecastEditor, type ForecastData } from "@/components/analytics/forecast-editor";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

interface ClientOption {
  clientIdCode: string;
  clientName: string;
}

export default function HubForecastPage() {
  const [selectedClient, setSelectedClient] = useState<string>("");

  const end = formatDate(new Date());
  const start = daysAgo(7);

  // Fetch all clients to build selector
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["sales-summary-clients-fc", start, end],
    queryFn: async () => {
      const res = await fetch(`/api/sales-summary?period=7D&start=${start}&end=${end}`);
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
  });

  const clients: ClientOption[] =
    summaryData?.clients?.map((c: { clientIdCode: string; clientName: string }) => ({
      clientIdCode: c.clientIdCode,
      clientName: c.clientName,
    })) ?? [];

  const activeClient = selectedClient || clients[0]?.clientIdCode || "";

  // Fetch forecast data for selected client
  const { data: forecastData, isLoading: forecastLoading } = useQuery<ForecastData>({
    queryKey: ["ppc-forecast", activeClient],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/forecast?clientIdCode=${activeClient}`);
      if (!res.ok) throw new Error("Failed to fetch forecast data");
      return res.json();
    },
    enabled: !!activeClient,
  });

  const isLoading = summaryLoading || forecastLoading;

  return (
    <div className="p-6 lg:p-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl lg:text-5xl font-[family-name:var(--font-geist-sans)] tracking-tighter">
          <span className="font-bold">PPC</span>
          <span className="text-brand">Forecast</span>
        </h1>
        {clients.length > 1 && (
          <select
            value={activeClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
          >
            {clients.map((c) => (
              <option key={c.clientIdCode} value={c.clientIdCode}>
                {c.clientName}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : forecastData ? (
        <ForecastEditor data={forecastData} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/sales-summary/forecast/page.tsx
git commit -m "feat: rewrite hub forecast page to use new ForecastEditor"
```

---

## Task 5: Rewrite portal forecast page

**Files:**
- Rewrite: `src/app/portal/sales/forecast/page.tsx`

- [ ] **Step 1: Replace entire file**

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ForecastEditor, type ForecastData } from "@/components/analytics/forecast-editor";

export default function PortalForecastPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();

  const clientIdCode =
    searchParams.get("client") || session?.user?.clientIdCode;
  const role = session?.user?.role;
  const readOnly = role === "client" || role === "prospect";

  const { data: forecastData, isLoading } = useQuery<ForecastData>({
    queryKey: ["ppc-forecast-portal", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/forecast?clientIdCode=${clientIdCode}`);
      if (!res.ok) throw new Error("Failed to fetch forecast data");
      return res.json();
    },
    enabled: !!clientIdCode,
  });

  if (!clientIdCode) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        No client assigned.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 bg-background">
        <div className="flex items-center gap-4">
          <Link
            href="/portal/sales"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-4xl lg:text-5xl font-[family-name:var(--font-geist-sans)] tracking-tighter">
            <span className="font-bold">PPC</span>
            <span className="text-[#2563eb]">Forecast</span>
          </h1>
        </div>
      </div>
      {forecastData ? (
        <ForecastEditor data={forecastData} readOnly={readOnly} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/portal/sales/forecast/page.tsx
git commit -m "feat: rewrite portal forecast page to use new ForecastEditor"
```

---

## Task 6: Update per-client forecast page

**Files:**
- Rewrite: `src/app/clients/[clientIdCode]/forecast/page.tsx`

- [ ] **Step 1: Replace entire file**

```typescript
"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ForecastEditor, type ForecastData } from "@/components/analytics/forecast-editor";

export default function ClientForecastPage({
  params,
}: {
  params: Promise<{ clientIdCode: string }>;
}) {
  const { clientIdCode } = React.use(params);

  const { data: forecastData, isLoading } = useQuery<ForecastData>({
    queryKey: ["ppc-forecast", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/ppc/forecast?clientIdCode=${clientIdCode}`);
      if (!res.ok) throw new Error("Failed to fetch forecast data");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">
        PPC Forecast
      </h1>
      {forecastData ? (
        <ForecastEditor data={forecastData} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/clients/[clientIdCode]/forecast/page.tsx
git commit -m "feat: update per-client forecast page to use new ForecastEditor"
```

---

## Task 7: Build verification

- [ ] **Step 1: Run lint**

```bash
cd /Users/manu/1o8Hub && npm run lint 2>&1 | tail -20
```

Expected: No new errors in the changed files.

- [ ] **Step 2: Run build**

```bash
cd /Users/manu/1o8Hub && npm run build 2>&1 | tail -30
```

Expected: Build succeeds.

- [ ] **Step 3: Manual smoke test**

Start dev server: `PORT=3000 npm run dev`

Test pages:
1. `http://localhost:3000/sales-summary/forecast` — select a client, verify table renders with channel rows, forecast cells are editable (yellow), chart shows bars
2. `http://localhost:3000/portal/sales/forecast` — verify read-only mode, no edit capability
3. `http://localhost:3000/clients/PUR_SC_US/forecast` — verify per-client page works

- [ ] **Step 4: Fix any issues found, commit**

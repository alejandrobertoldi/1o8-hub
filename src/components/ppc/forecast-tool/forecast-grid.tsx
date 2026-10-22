/* eslint-disable react/no-danger */
/* eslint-disable react-doctor/async-defer-await */
/* eslint-disable react-doctor/no-gray-on-colored-background */
/* eslint-disable react-doctor/no-render-in-render */
/* eslint-disable react-doctor/query-mutation-missing-invalidation */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";

import { useState, useCallback, useMemo, useEffect, useRef, Fragment } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ForecastToolCell, ForecastToolAsin, ForecastToolAsinCell } from "@/lib/db/schema";
import {
  calcDerived,
  calcWeightedAvgPrice,
  type ForecastInputs,
} from "./forecast-calculations";

// ---------------------------------------------------------------------------
// Instant CSS tooltip via data-tip attribute
// ---------------------------------------------------------------------------
const TOOLTIP_STYLE = `
[data-tip]{position:relative}
[data-tip]:hover::after{content:attr(data-tip);position:absolute;bottom:100%;right:0;white-space:nowrap;background:#1e1e2e;color:#e4e4e7;font-size:10px;padding:3px 7px;border-radius:4px;z-index:50;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.15)}
`;

// ---------------------------------------------------------------------------
// Metric row configuration
// ---------------------------------------------------------------------------

const METRIC_ROWS = [
  // Aggregate
  { key: "units_ordered", label: "Units Ordered", section: "aggregate", editable: false, format: "number" },
  { key: "ordered_product_sales", label: "Ordered Product Sales", section: "aggregate", editable: false, format: "currency" },
  { key: "total_order_items", label: "Total Order Items", section: "aggregate", editable: false, format: "number" },
  { key: "orders_ad", label: "Ad Orders", section: "aggregate", editable: false, format: "number" },
  { key: "ads_order_pct", label: "Ads Orders %", section: "aggregate", editable: false, format: "percent" },
  { key: "organic_orders", label: "Organic Orders", section: "aggregate", editable: false, format: "number" },
  { key: "organic_orders_pct", label: "Organic Orders %", section: "aggregate", editable: false, format: "percent" },
  // Advertising
  { key: "sessions", label: "Sessions", section: "advertising", editable: false, format: "number" },
  { key: "ad_cvr", label: "Ad CVR", section: "advertising", editable: false, format: "percent" },
  { key: "cv_amz_estimated", label: "CVR Estimated", section: "advertising", editable: true, format: "percent" },
  { key: "impressions", label: "Ad Impressions", section: "advertising", editable: false, format: "number" },
  { key: "clicks", label: "Ad Clicks", section: "advertising", editable: false, format: "number" },
  { key: "ctr_ad", label: "Ad CTR", section: "advertising", editable: false, format: "percent" },
  { key: "spend", label: "Ad Spend", section: "advertising", editable: true, format: "currency" },
  { key: "cpc_ad", label: "Ad CPC", section: "advertising", editable: false, format: "currency" },
  { key: "ad_revenue", label: "Ad Revenue", section: "advertising", editable: false, format: "currency" },
  { key: "acos", label: "AdACoS", section: "advertising", editable: false, format: "percent" },
  { key: "ad_roas", label: "Ad RoAS", section: "advertising", editable: false, format: "decimal" },
  { key: "category_coef", label: "Seasonality Coef", section: "advertising", editable: true, format: "percent" },
  // Inventory
  { key: "inv_month_end", label: "Inventory EOM", section: "inventory", editable: false, format: "number" },
  { key: "replenish_orders", label: "Inventory Replenishment", section: "inventory", editable: false, format: "number" },
  { key: "inv_coef", label: "Inventory Coef", section: "inventory", editable: false, format: "number" },
] as const;

type MetricKey = (typeof METRIC_ROWS)[number]["key"];
type Section = "aggregate" | "advertising" | "inventory";

/** Metrics editable in all months (no Redshift source) — auto-fill forecast from historical avg */
const ALWAYS_EDITABLE_METRICS = new Set(["cpc_ad", "ctr_ad", "cv_ad", "ad_cvr", "ads_order_pct"]);

/** Metrics whose forecast step is already applied via getCellValue — skip render-time growth */
const STEP_VIA_GETCELLVALUE = new Set(["cpc_ad", "ctr_ad", "cv_ad"]);

// ---------------------------------------------------------------------------
// Section metadata
// ---------------------------------------------------------------------------

const SECTIONS: Record<Section, { label: string; color: string; bgClass: string; textClass: string }> = {
  aggregate: {
    label: "Aggregate",
    color: "amber",
    bgClass: "bg-amber-100",
    textClass: "text-amber-800 font-bold",
  },
  advertising: {
    label: "Advertising",
    color: "zinc",
    bgClass: "bg-zinc-200",
    textClass: "text-zinc-800 font-bold",
  },
  inventory: {
    label: "Inventory",
    color: "green",
    bgClass: "bg-green-100",
    textClass: "text-green-800 font-bold",
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ForecastGridProps {
  versionId: string;
  cells: ForecastToolCell[];
  asins: ForecastToolAsin[];
  asinCells: ForecastToolAsinCell[];
  asinHistorical: Record<string, Record<string, Record<string, number>>>;
  historical: Record<string, Record<string, number>>;
  allMonths: string[];
  forecastStart: string;
  forecastEnd: string;
  historicStart: string;
  isLocked?: boolean;
  onEditSeasonality?: () => void;
  onForecastStartChange: (v: string) => void;
  onForecastEndChange: (v: string) => void;
  onHistoricStartChange: (v: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(value: number | null, format: string): string {
  if (value === null || value === undefined) return "";
  if (format === "currency") {
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (format === "percent") {
    return `${(value * 100).toFixed(2)}%`;
  }
  if (format === "decimal") {
    return value.toFixed(2);
  }
  return Math.round(value).toLocaleString("en-US");
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

/** Get the month string immediately before a given month */
function prevMonthStr(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ForecastGrid({ versionId, cells, asins, asinCells, asinHistorical, historical, allMonths, forecastStart, forecastEnd, historicStart, isLocked, onEditSeasonality, onForecastStartChange, onForecastEndChange, onHistoricStartChange }: ForecastGridProps) {
  // ---------------------------------------------------------------------------
  // Column layout computation
  // ---------------------------------------------------------------------------

  // Historic end = month before forecast start
  const historicEnd = useMemo(() => prevMonthStr(forecastStart), [forecastStart]);

  // All historic months in range
  const allHistMonths = useMemo(
    () => allMonths.filter((m) => m >= historicStart && m <= historicEnd),
    [allMonths, historicStart, historicEnd]
  );

  // Last 6 historic months shown individually
  const displayedHistMonths = useMemo(() => allHistMonths.slice(-6), [allHistMonths]);

  // Earlier months aggregated into a single column
  const aggregatedMonths = useMemo(() => {
    const displayedSet = new Set(displayedHistMonths);
    return allHistMonths.filter((m) => !displayedSet.has(m));
  }, [allHistMonths, displayedHistMonths]);

  // Forecast months
  const forecastMonths = useMemo(
    () => allMonths.filter((m) => m >= forecastStart && m <= forecastEnd),
    [allMonths, forecastStart, forecastEnd]
  );

  // All individually-displayed months (used for most column iterations)
  const displayedMonths = useMemo(
    () => [...displayedHistMonths, ...forecastMonths],
    [displayedHistMonths, forecastMonths]
  );

  const hasAggCol = aggregatedMonths.length > 0;

  // Section visibility toggles
  const [focusedCell, setFocusedCell] = useState<string | null>(null);
  const [showAggregate, setShowAggregate] = useState(true);
  const [showAdvertising, setShowAdvertising] = useState(true);
  const [showInventory, setShowInventory] = useState(true);
  const [expandedAsinRows, setExpandedAsinRows] = useState<Set<string>>(new Set());

  // Query client for cache invalidation after saves
  const queryClient = useQueryClient();

  // Derive config values from cells prop (always in sync)
  const cellsConfigSteps = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cell of cells) {
      if (cell.month === "_config" && cell.metric.endsWith("_step")) {
        map[cell.metric.replace("_step", "")] = Number(cell.value) || 0;
      }
    }
    return map;
  }, [cells]);

  const cellsAdRevenuePrice = useMemo(() => {
    for (const cell of cells) {
      if (cell.month === "_config" && cell.metric === "ad_revenue_price") {
        return Number(cell.value) || 0;
      }
    }
    return 0;
  }, [cells]);

  // Per-metric monthly step increment for forecast months
  // Local overrides for optimistic UI; merged with cells-derived base
  const [localStepOverrides, setLocalStepOverrides] = useState<Record<string, number>>({});
  const metricSteps = useMemo(
    () => ({ ...cellsConfigSteps, ...localStepOverrides }),
    [cellsConfigSteps, localStepOverrides]
  );
  const [focusedStep, setFocusedStep] = useState<string | null>(null);
  const [stepDraft, setStepDraft] = useState("");

  // Configurable ad revenue price override
  const [localAdRevenuePriceOverride, setLocalAdRevenuePriceOverride] = useState<number | null>(null);
  const adRevenuePrice = localAdRevenuePriceOverride ?? cellsAdRevenuePrice;
  const [adRevenuePriceDraft, setAdRevenuePriceDraft] = useState("");
  const [adRevenuePriceFocused, setAdRevenuePriceFocused] = useState(false);

  // Clear local overrides when cells update from server (save completed + refetch)
  const prevCellsRef = useRef(cells);
  useEffect(() => {
    if (prevCellsRef.current !== cells) {
      prevCellsRef.current = cells;
      setLocalStepOverrides({});
      setLocalAdRevenuePriceOverride(null);
    }
  }, [cells]);

  const sectionVisible: Record<Section, boolean> = {
    aggregate: showAggregate,
    advertising: showAdvertising,
    inventory: showInventory,
  };

  // Local cell values: { "2025-01": { "sessions": 1234 } }
  const [localCells, setLocalCells] = useState<Record<string, Record<string, number>>>(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const cell of cells) {
      if (!map[cell.month]) map[cell.month] = {};
      map[cell.month][cell.metric] = Number(cell.value);
    }
    return map;
  });

  // Per-ASIN cell values
  const [localAsinCells, setLocalAsinCells] = useState<Record<string, Record<string, Record<string, number>>>>(() => {
    const map: Record<string, Record<string, Record<string, number>>> = {};
    for (const cell of asinCells) {
      if (!map[cell.asinId]) map[cell.asinId] = {};
      if (!map[cell.asinId][cell.month]) map[cell.asinId][cell.month] = {};
      map[cell.asinId][cell.month][cell.metric] = Number(cell.value);
    }
    return map;
  });

  // Re-sync localCells when cells prop changes (e.g., after seasonality save + refetch)
  useEffect(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const cell of cells) {
      if (!map[cell.month]) map[cell.month] = {};
      map[cell.month][cell.metric] = Number(cell.value);
    }
    setLocalCells(map);
  }, [cells]);

  const saveAsinCells = useMutation({
    mutationFn: async (data: { asinId: string; month: string; metric: string; value: number | null }) => {
      const res = await fetch("/api/ppc/forecast-tool/asin-cells", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asinId: data.asinId, cells: [{ month: data.month, metric: data.metric, value: data.value }] }),
      });
      if (!res.ok) throw new Error("Failed to save asin cell");
    },
  });

  const getAsinCellValue = useCallback(
    (asinId: string, month: string, metric: string): number | null => {
      return localAsinCells[asinId]?.[month]?.[metric] ?? null;
    },
    [localAsinCells]
  );

  const handleAsinCellChange = (asinId: string, month: string, metric: string, value: string) => {
    const numValue = value === "" ? 0 : parseFloat(value);
    setLocalAsinCells((prev) => ({
      ...prev,
      [asinId]: {
        ...prev[asinId],
        [month]: { ...prev[asinId]?.[month], [metric]: numValue },
      },
    }));
  };

  const handleAsinCellBlur = (asinId: string, month: string, metric: string) => {
    const value = localAsinCells[asinId]?.[month]?.[metric];
    if (value !== undefined) {
      saveAsinCells.mutate({ asinId, month, metric, value });
    }
  };

  // Replenish Orders = SUM of per-ASIN replenish values for the month
  const getReplenishSum = useCallback(
    (month: string): number => {
      return asins.reduce((sum, asin) => sum + (getAsinCellValue(asin.id, month, "replenish") ?? 0), 0);
    },
    [asins, getAsinCellValue]
  );

  const weightedAvgPrice = useMemo(
    () =>
      calcWeightedAvgPrice(
        asins.map((a) => ({
          productPrice: Number(a.productPrice),
          sharePct: Number(a.sharePct) / 100,
        }))
      ),
    [asins]
  );

  // Save mutation — invalidates cache so next refetch picks up saved _config cells
  const saveCells = useMutation({
    mutationFn: async (cellData: { month: string; metric: string; value: number | null }) => {
      const res = await fetch("/api/ppc/forecast-tool/cells", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, cells: [cellData] }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to save cell ${cellData.metric}: ${res.status} ${text}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forecast-tool"] });
    },
  });

  // Historical key mapping — direct Redshift column lookups
  const HIST_MAP: Partial<Record<string, string>> = {
    sessions: "sessions",
    units_ordered: "units_ordered",
    spend: "ad_spend",
    orders_ad: "ad_orders",
    ad_conversions: "ad_conversions",
  };

  // Derive a metric from Redshift for a single month
  const deriveMetricFromHist = (metric: string, h: Record<string, number>): number | null => {
    switch (metric) {
      case "cpc_ad": return h.ad_clicks > 0 ? h.ad_spend / h.ad_clicks : null;
      case "ctr_ad": return h.ad_impressions > 0 ? h.ad_clicks / h.ad_impressions : null;
      case "cv_ad": return h.ad_clicks > 0 ? h.ad_orders / h.ad_clicks : null;
      case "ads_order_pct": return h.total_order_items > 0 ? h.ad_orders / h.total_order_items : null;
      case "ad_cvr": return h.sessions > 0 ? h.total_order_items / h.sessions : null;
      case "cv_amz_estimated": return h.sessions > 0 ? h.total_order_items / h.sessions : null;
      case "organic_orders": return (h.total_order_items ?? 0) - (h.ad_orders ?? 0);
      case "organic_orders_pct": return h.total_order_items > 0 ? ((h.total_order_items - h.ad_orders) / h.total_order_items) : null;
      case "ad_roas": return h.ad_spend > 0 ? h.ad_revenue / h.ad_spend : null;
      case "spend": return h.ad_spend ?? null;
      default: return null;
    }
  };

  // Historical averages: avg of last 6 historic months before forecastStart
  const historicalAverages = useMemo(() => {
    const averages: Record<string, number> = {};
    const histMonths = allMonths.filter((m) => m < forecastStart);
    const metricsToAvg = [...ALWAYS_EDITABLE_METRICS, "cv_amz_estimated", "ad_cvr", "spend"];
    for (const metric of metricsToAvg) {
      const vals = histMonths
        .map((m) => {
          if (ALWAYS_EDITABLE_METRICS.has(metric)) {
            const h = historical[m];
            return h ? deriveMetricFromHist(metric, h) : null;
          }
          const saved = localCells[m]?.[metric];
          if (saved != null && saved > 0) return saved;
          const h = historical[m];
          return h ? deriveMetricFromHist(metric, h) : null;
        })
        .filter((v): v is number => v != null && v > 0);
      const recent = vals.slice(-6);
      if (recent.length > 0) {
        averages[metric] = recent.reduce((a, b) => a + b, 0) / recent.length;
      }
    }
    return averages;
  }, [allMonths, forecastStart, localCells, historical]);

  // Derive ad metrics from Redshift historical data for a given month
  const deriveFromRedshift = useCallback(
    (metric: string, month: string): number | null => {
      const h = historical[month];
      if (!h) return null;
      return deriveMetricFromHist(metric, h);
    },
    [historical]
  );

  // Get raw editable value for a metric/month
  const getCellValue = useCallback(
    (metric: string, month: string): number | null => {
      if (metric === "replenish_orders") {
        return getReplenishSum(month);
      }
      // Derived ad metrics — historical: always from Redshift; forecast: always from average
      if (ALWAYS_EDITABLE_METRICS.has(metric)) {
        if (month < forecastStart) {
          const derived = deriveFromRedshift(metric, month);
          if (derived !== null) return derived;
        }
      }
      const local = localCells[month]?.[metric];
      if (local !== undefined && !ALWAYS_EDITABLE_METRICS.has(metric)) return local;
      const histKey = HIST_MAP[metric];
      if (histKey && historical[month]?.[histKey] !== undefined) {
        return historical[month][histKey];
      }
      if (!ALWAYS_EDITABLE_METRICS.has(metric) && (metric === "cv_amz_estimated" || metric === "ad_cvr")) {
        const derived = deriveFromRedshift(metric, month);
        if (derived !== null) return derived;
      }
      // Auto-fill forecast months with historical average + step increment
      if (month >= forecastStart && (ALWAYS_EDITABLE_METRICS.has(metric) || metric === "cv_amz_estimated" || metric === "ad_cvr" || metric === "spend") && historicalAverages[metric] !== undefined) {
        const base = historicalAverages[metric];
        const step = metricSteps[metric] ?? 0;
        if (step === 0) return base;
        const idx = forecastMonths.indexOf(month);
        if (idx <= 0) return base;
        if (metric === "spend") return base * (1 + step * idx);
        return base + idx * step;
      }
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localCells, historical, forecastStart, historicalAverages, deriveFromRedshift, getReplenishSum, metricSteps, forecastMonths]
  );

  // Build ForecastInputs for a given month
  const buildInputs = useCallback(
    (month: string, monthList: string[]): ForecastInputs => {
      const monthIdx = monthList.indexOf(month);
      const prevMonth = monthIdx > 0 ? monthList[monthIdx - 1] : null;
      return {
        sessions: getCellValue("sessions", month) ?? 0,
        unitsOrdered: getCellValue("units_ordered", month) ?? 0,
        totalOrderItems: getCellValue("total_order_items", month) ?? 0,
        categoryCoef: getCellValue("category_coef", month) ?? 0,
        cvAmzEstimated: getCellValue("cv_amz_estimated", month) ?? 0,
        spend: getCellValue("spend", month) ?? 0,
        cpcAd: getCellValue("cpc_ad", month) ?? 0,
        ctrAd: getCellValue("ctr_ad", month) ?? 0,
        cvAd: getCellValue("cv_ad", month) ?? 0,
        adsOrderPct: getCellValue("ads_order_pct", month) ?? 0,
        replenishOrders: getCellValue("replenish_orders", month) ?? 0,
        prevInvMonthEnd: prevMonth
          ? (getCellValue("inv_month_end", prevMonth) ??
              calcDerived(buildInputsFlat(prevMonth), weightedAvgPrice).invMonthEnd)
          : 0,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getCellValue, weightedAvgPrice]
  );

  const buildInputsFlat = useCallback(
    (month: string): ForecastInputs => ({
      sessions: getCellValue("sessions", month) ?? 0,
      unitsOrdered: getCellValue("units_ordered", month) ?? 0,
      totalOrderItems: getCellValue("total_order_items", month) ?? 0,
      categoryCoef: getCellValue("category_coef", month) ?? 0,
      cvAmzEstimated: getCellValue("cv_amz_estimated", month) ?? 0,
      spend: getCellValue("spend", month) ?? 0,
      cpcAd: getCellValue("cpc_ad", month) ?? 0,
      ctrAd: getCellValue("ctr_ad", month) ?? 0,
      cvAd: getCellValue("cv_ad", month) ?? 0,
      adsOrderPct: getCellValue("ads_order_pct", month) ?? 0,
      replenishOrders: getCellValue("replenish_orders", month) ?? 0,
      prevInvMonthEnd: 0,
    }),
    [getCellValue]
  );

  // Historical average sessions (for Sessions forecast calc)
  const avgHistoricalSessions = useMemo(() => {
    const histMonths = allMonths.filter((m) => m < forecastStart);
    const vals = histMonths
      .map((m) => historical[m]?.sessions)
      .filter((v): v is number => v != null && v > 0);
    const recent = vals.slice(-6);
    return recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  }, [allMonths, forecastStart, historical]);

  // Fallback avg price (used when rolling window has no data)
  const fallbackAvgPrice = useMemo(() => {
    const histMonths = allMonths.filter((m) => m < forecastStart);
    const salesVals: number[] = [];
    const unitsVals: number[] = [];
    for (const m of histMonths) {
      const s = historical[m]?.product_sales;
      const u = historical[m]?.units_ordered;
      if (s != null && s > 0 && u != null && u > 0) {
        salesVals.push(s);
        unitsVals.push(u);
      }
    }
    const recent6Sales = salesVals.slice(-6);
    const recent6Units = unitsVals.slice(-6);
    if (recent6Sales.length === 0) return weightedAvgPrice;
    const avgSales = recent6Sales.reduce((a, b) => a + b, 0) / recent6Sales.length;
    const avgUnits = recent6Units.reduce((a, b) => a + b, 0) / recent6Units.length;
    return avgUnits > 0 ? avgSales / avgUnits : weightedAvgPrice;
  }, [allMonths, forecastStart, historical, weightedAvgPrice]);

  // ---------------------------------------------------------------------------
  // getDisplayValue — the core cell resolver
  // ---------------------------------------------------------------------------

  const getDisplayValue = useCallback(
    (metric: string, month: string): number | null => {
      const row = METRIC_ROWS.find((r) => r.key === metric);
      if (!row) return null;
      const isForecast = month >= forecastStart;

      if (row.editable) {
        return getCellValue(metric, month);
      }

      // Sessions: historical from Redshift, forecast = OPS / (AVG prev 6 OPS / AVG prev 6 Sessions)
      if (metric === "sessions") {
        if (!isForecast) return historical[month]?.sessions ?? null;
        const ops = getDisplayValue("ordered_product_sales", month) ?? 0;
        const histMonths = allMonths.filter((m) => m < forecastStart);
        const prev6 = histMonths.slice(-6);
        let sumOPS = 0;
        let sumSessions = 0;
        for (const m of prev6) {
          sumOPS += getDisplayValue("ordered_product_sales", m) ?? 0;
          sumSessions += historical[m]?.sessions ?? 0;
        }
        const avgOPS = prev6.length > 0 ? sumOPS / prev6.length : 0;
        const avgSessions = prev6.length > 0 ? sumSessions / prev6.length : 0;
        const opsPerSession = avgSessions > 0 ? avgOPS / avgSessions : 0;
        return opsPerSession > 0 ? Math.round(ops / opsPerSession) : 0;
      }

      // Units Ordered: historic from account_summary (per-ASIN only for sub-rows); forecast derived
      if (metric === "units_ordered") {
        if (!isForecast) {
          return historical[month]?.units_ordered ?? null;
        }
        const histMonths = allMonths.filter((m) => m < forecastStart);
        const prev6 = histMonths.slice(-6);
        let sumUnits = 0;
        let sumTotalItems = 0;
        for (const m of prev6) {
          sumUnits += getDisplayValue("units_ordered", m) ?? 0;
          sumTotalItems += historical[m]?.total_order_items ?? 0;
        }
        const ratio = sumTotalItems > 0 ? sumUnits / sumTotalItems : 0;
        const totalOrderItems = getDisplayValue("total_order_items", month) ?? 0;
        return Math.round(ratio * totalOrderItems);
      }

      // Replenish Orders: SUM of per-ASIN replenish values
      if (metric === "replenish_orders") {
        return getReplenishSum(month);
      }

      // Ordered Product Sales:
      //   Historic: from Redshift
      //   Forecast: (AVG prev 6 OPS / AVG prev 6 units_ordered) × total_order_items
      if (metric === "ordered_product_sales") {
        if (!isForecast) return historical[month]?.product_sales ?? null;

        const histMonths = allMonths.filter((m) => m < forecastStart);
        const prev6 = histMonths.slice(-6);
        let sumOPS = 0;
        let sumUnits = 0;
        for (const m of prev6) {
          sumOPS += getDisplayValue("ordered_product_sales", m) ?? 0;
          sumUnits += getDisplayValue("units_ordered", m) ?? 0;
        }
        const avgOPS = prev6.length > 0 ? sumOPS / prev6.length : 0;
        const avgUnits = prev6.length > 0 ? sumUnits / prev6.length : 0;
        const pricePerUnit = avgUnits > 0 ? avgOPS / avgUnits : 0;
        const totalOrderItems = getDisplayValue("total_order_items", month);
        return totalOrderItems != null ? totalOrderItems * pricePerUnit : null;
      }

      // Total Order Items: Orders (Ad) / Ads Order %
      if (metric === "total_order_items") {
        if (!isForecast) return historical[month]?.total_order_items ?? null;
        const spend = getCellValue("spend", month) ?? 0;
        const cpcAd = getCellValue("cpc_ad", month) ?? 0;
        const cvAd = getCellValue("cv_ad", month) ?? 0;
        const adsOrderPct = getCellValue("ads_order_pct", month) ?? 0;
        const clicks = cpcAd > 0 ? spend / cpcAd : 0;
        const ordersAd = clicks * cvAd;
        return adsOrderPct > 0 ? Math.round(ordersAd / adsOrderPct) : 0;
      }

      // INV Month End: SUM of per-ASIN inv_eom values
      if (metric === "inv_month_end") {
        if (!isForecast) {
          let sum = 0;
          let hasData = false;
          for (const a of asins) {
            if (a.asin && asinHistorical[a.asin]?.[month]?.inv_eom != null) {
              sum += Math.round(asinHistorical[a.asin][month].inv_eom);
              hasData = true;
            }
          }
          return hasData ? sum : null;
        }
        // Forecast: fall through to derivedMap
      }

      // Metrics derived from Redshift / averaged for forecast (hidden cv_ad used internally)
      if (metric === "cpc_ad" || metric === "ctr_ad" || metric === "cv_ad") {
        return getCellValue(metric, month);
      }

      // Ad Orders: historical from Redshift, forecast from calcDerived
      if (metric === "orders_ad") {
        if (!isForecast) return historical[month]?.ad_orders ?? null;
        // Fall through to derivedMap below
      }

      // Ads Orders %: calculated = ad_orders / total_order_items
      if (metric === "ads_order_pct") {
        if (!isForecast) {
          const h = historical[month];
          return h && h.total_order_items > 0 ? h.ad_orders / h.total_order_items : null;
        }
        const adOrders = getDisplayValue("orders_ad", month) ?? 0;
        const totalItems = getDisplayValue("total_order_items", month) ?? 0;
        return totalItems > 0 ? adOrders / totalItems : null;
      }

      // Organic Orders: total_order_items - ad_orders
      if (metric === "organic_orders") {
        const totalItems = getDisplayValue("total_order_items", month) ?? 0;
        const adOrders = !isForecast
          ? (historical[month]?.ad_orders ?? 0)
          : (getDisplayValue("orders_ad", month) ?? 0);
        return Math.round(totalItems - adOrders);
      }

      // Organic Orders %: organic_orders / total_order_items
      if (metric === "organic_orders_pct") {
        const totalItems = getDisplayValue("total_order_items", month) ?? 0;
        const organic = getDisplayValue("organic_orders", month) ?? 0;
        return totalItems > 0 ? organic / totalItems : null;
      }

      // Ad CVR: total_order_items / sessions (calculated, not editable)
      if (metric === "ad_cvr") {
        const totalItems = getDisplayValue("total_order_items", month) ?? 0;
        const sessions = getDisplayValue("sessions", month) ?? 0;
        return sessions > 0 ? totalItems / sessions : null;
      }

      // Ad Conversions: from Redshift historical; forecast: same as ad_orders
      if (metric === "ad_conversions") {
        if (!isForecast) return historical[month]?.ad_conversions ?? null;
        return getDisplayValue("orders_ad", month);
      }

      // Ad RoAS: ad_revenue / ad_spend
      if (metric === "ad_roas") {
        const adRevenue = getDisplayValue("ad_revenue", month) ?? 0;
        const adSpend = getDisplayValue("spend", month) ?? 0;
        return adSpend > 0 ? adRevenue / adSpend : null;
      }

      // Inventory Coef: inv_month_end / next month units_ordered
      if (metric === "inv_coef") {
        const invEom = getDisplayValue("inv_month_end", month);
        const monthIdx = allMonths.indexOf(month);
        const nextMonth = monthIdx >= 0 && monthIdx < allMonths.length - 1 ? allMonths[monthIdx + 1] : null;
        const nextUnits = nextMonth ? getDisplayValue("units_ordered", nextMonth) : null;
        return (invEom != null && nextUnits != null && nextUnits > 0) ? invEom / nextUnits : null;
      }

      // Historical: use Redshift directly for remaining metrics
      if (!isForecast) {
        if (metric === "clicks") return historical[month]?.ad_clicks ?? null;
        if (metric === "impressions") return historical[month]?.ad_impressions ?? null;
        if (metric === "ad_revenue") return historical[month]?.ad_revenue ?? null;
        if (metric === "acos") {
          const spend = historical[month]?.ad_spend ?? 0;
          const rev = historical[month]?.ad_revenue ?? 0;
          return rev > 0 ? spend / rev : null;
        }
      }

      // Forecast: derive from inputs
      const inputs = buildInputs(month, displayedMonths);
      inputs.sessions = (() => {
        if (!isForecast) return historical[month]?.sessions ?? 0;
        const coef = getCellValue("category_coef", month) ?? 0;
        return Math.round(avgHistoricalSessions * (1 + coef));
      })();
      inputs.unitsOrdered = (() => {
        if (!isForecast) return historical[month]?.units_ordered ?? 0;
        const cvAmz = getCellValue("cv_amz_estimated", month) ?? 0;
        return Math.round(inputs.sessions * cvAmz);
      })();
      const salesPrice = isForecast ? fallbackAvgPrice : weightedAvgPrice;
      const derived = calcDerived(inputs, salesPrice);
      if (adRevenuePrice > 0 && isForecast) {
        derived.adRevenue = derived.ordersAd * adRevenuePrice;
        derived.acos = derived.adRevenue > 0 ? inputs.spend / derived.adRevenue : 0;
      }

      const derivedMap: Record<string, number> = {
        ordered_product_sales: derived.orderedProductSales,
        clicks: derived.clicks,
        orders_ad: derived.ordersAd,
        ad_revenue: derived.adRevenue,
        impressions: derived.impressions,
        acos: derived.acos,
        inv_month_end: derived.invMonthEnd,
      };

      return derivedMap[metric] ?? null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getCellValue, buildInputs, displayedMonths, weightedAvgPrice, fallbackAvgPrice, adRevenuePrice, forecastStart, historical, avgHistoricalSessions, getReplenishSum, asins, asinHistorical, getAsinCellValue, allMonths]
  );

  // Handle cell edit
  const handleCellChange = (month: string, metric: string, value: string) => {
    const numValue = value === "" ? 0 : parseFloat(value);
    setLocalCells((prev) => ({
      ...prev,
      [month]: { ...prev[month], [metric]: numValue },
    }));
  };

  const handleCellBlur = (month: string, metric: string) => {
    const value = localCells[month]?.[metric];
    if (value !== undefined) {
      saveCells.mutate({ month, metric, value });
    }
  };

  // ---------------------------------------------------------------------------
  // Aggregated column: sum/avg of early historic months
  // ---------------------------------------------------------------------------

  /** Non-summable metrics — aggregate should average, not sum */
  const AVG_METRICS = new Set(["cpc_ad", "ctr_ad", "ads_order_pct", "acos", "cv_amz_estimated", "ad_cvr", "ad_roas", "category_coef", "organic_orders_pct", "inv_coef"]);

  const getAggValue = useCallback(
    (metric: string): number | null => {
      if (aggregatedMonths.length === 0) return null;
      const vals = aggregatedMonths
        .map((m) => getDisplayValue(metric, m))
        .filter((v): v is number => v != null);
      if (vals.length === 0) return null;
      if (AVG_METRICS.has(metric)) {
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      }
      return vals.reduce((a, b) => a + b, 0);
    },
    [aggregatedMonths, getDisplayValue]
  );

  const getAsinAggUnits = useCallback(
    (asinCode: string | null): number | null => {
      if (aggregatedMonths.length === 0 || !asinCode) return null;
      let sum = 0;
      let found = false;
      for (const m of aggregatedMonths) {
        if (asinHistorical[asinCode]?.[m]?.product_quantity != null) {
          sum += Math.round(asinHistorical[asinCode][m].product_quantity);
          found = true;
        }
      }
      return found ? sum : null;
    },
    [aggregatedMonths, asinHistorical]
  );

  // ---------------------------------------------------------------------------
  // Historic 6-month average column
  // ---------------------------------------------------------------------------

  const getHistAvgValue = useCallback(
    (metric: string): number | null => {
      if (allHistMonths.length === 0) return null;
      const vals = allHistMonths
        .map((m) => getDisplayValue(metric, m))
        .filter((v): v is number => v != null);
      if (vals.length === 0) return null;
      const sum = vals.reduce((a, b) => a + b, 0);
      if (AVG_METRICS.has(metric)) return sum / vals.length;
      return sum;
    },
    [allHistMonths, getDisplayValue]
  );

  // ---------------------------------------------------------------------------
  // Cell tooltip — explains data source on hover
  // ---------------------------------------------------------------------------

  const getCellTooltip = useCallback(
    (metric: string, month: string): string => {
      const isForecast = month >= forecastStart;
      const row = METRIC_ROWS.find((r) => r.key === metric);
      if (!row) return "";

      if (row.editable) {
        if (isForecast) {
          const step = metricSteps[metric];
          if (step) return `Avg 6M + step (${step > 0 ? "+" : ""}${(step * 100).toFixed(2)}%/mo) · editable`;
          return `Avg 6M · editable`;
        }
        if (metric === "spend") return "Redshift: ad_spend";
        if (metric === "cv_amz_estimated") return "Manual: estimated CVR";
        return "Redshift · editable";
      }

      if (metric === "sessions") {
        return isForecast ? "Forecast: OPS / (avg OPS / avg Sessions)" : "Redshift: mobile_app_sessions + browser_session";
      }
      if (metric === "units_ordered") {
        if (!isForecast) return "Redshift: product_quantity";
        return "Forecast: (units_6M / total_items_6M) × total_order_items";
      }
      if (metric === "ordered_product_sales") {
        return isForecast ? "Forecast: price_per_unit × total_order_items" : "Redshift: product_sales";
      }
      if (metric === "total_order_items") {
        return isForecast ? "Forecast: orders_ad / ads_order_pct" : "Redshift: total_order_items";
      }
      if (metric === "orders_ad") {
        return isForecast ? "Forecast: clicks × cv_ad" : "Redshift: ad_orders";
      }
      if (metric === "ads_order_pct") {
        return "Calculated: ad_orders / total_order_items";
      }
      if (metric === "organic_orders") {
        return "Calculated: total_order_items − ad_orders";
      }
      if (metric === "organic_orders_pct") {
        return "Calculated: organic_orders / total_order_items";
      }
      if (metric === "ad_cvr") {
        return "Calculated: total_order_items / sessions";
      }
      if (metric === "impressions") {
        return isForecast ? "Forecast: clicks / ctr_ad" : "Redshift: ad_impressions";
      }
      if (metric === "clicks") {
        return isForecast ? "Forecast: spend / cpc_ad" : "Redshift: ad_clicks";
      }
      if (metric === "ctr_ad") {
        return "Calculated: ad_clicks / ad_impressions";
      }
      if (metric === "ad_conversions") {
        return isForecast ? "Forecast: same as ad_orders" : "Redshift: ad_conversions";
      }
      if (metric === "cpc_ad") {
        return "Calculated: ad_spend / ad_clicks";
      }
      if (metric === "ad_revenue") {
        if (isForecast && adRevenuePrice > 0) return `Forecast: orders_ad × $${adRevenuePrice.toFixed(2)}/unit`;
        return isForecast ? "Forecast: orders_ad × avg price" : "Redshift: ad_revenue";
      }
      if (metric === "acos") {
        return "Calculated: ad_spend / ad_revenue";
      }
      if (metric === "ad_roas") {
        return "Calculated: ad_revenue / ad_spend";
      }
      if (metric === "category_coef") {
        return isForecast ? "Seasonality coefficient · editable" : "No historic data";
      }
      if (metric === "inv_month_end") {
        return isForecast ? "Forecast: prev_inv + replenish − units" : "Redshift: SUM per-ASIN inv_eom";
      }
      if (metric === "replenish_orders") {
        return "User input: SUM per-ASIN replenishment";
      }
      if (metric === "inv_coef") {
        return "Calculated: inv_eom / next_month_units";
      }
      return isForecast ? "Forecast" : "Redshift";
    },
    [forecastStart, metricSteps, adRevenuePrice]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Total columns for section header colSpan
  const totalCols = 1 + (hasAggCol ? 1 : 0) + displayedHistMonths.length + 1 /* hist avg */ + 1 /* predict col */ + forecastMonths.length;

  const renderSectionHeader = (section: Section) => {
    const meta = SECTIONS[section];
    return (
      <tr key={`section-${section}`} className={meta.bgClass}>
        <td
          colSpan={totalCols}
          className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${meta.textClass} sticky left-0 ${meta.bgClass}`}
        >
          {meta.label}
        </td>
      </tr>
    );
  };

  const renderMetricRow = (row: (typeof METRIC_ROWS)[number]) => (
    <tr key={row.key} className="border-b border-border hover:bg-muted/50 transition-colors">
      {/* Sticky label column */}
      <td
        className={`sticky left-0 z-10 bg-card px-3 py-1 text-xs text-foreground whitespace-nowrap min-w-[160px] border-r border-border ${ASIN_PARENT_METRICS.has(row.key) ? "cursor-pointer select-none" : ""}`}
        onClick={ASIN_PARENT_METRICS.has(row.key) ? () => toggleAsinExpand(row.key) : undefined}
      >
        {ASIN_PARENT_METRICS.has(row.key) && (
          <span className="inline-block w-3 text-[9px] text-muted-foreground mr-0.5">{expandedAsinRows.has(row.key) ? "▾" : "▸"}</span>
        )}
        <span>{row.label}</span>
      </td>

      {/* Aggregated historic column */}
      {hasAggCol && (() => {
        const aggVal = getAggValue(row.key);
        return (
          <td data-tip={`${row.label}: Sum/Avg of ${monthLabel(aggregatedMonths[0])} – ${monthLabel(aggregatedMonths[aggregatedMonths.length - 1])}`} className="px-2 py-1 text-right text-xs min-w-[90px] border-l border-border bg-blue-50/30 dark:bg-blue-500/10 text-blue-900 dark:text-blue-300 font-medium cursor-help">
            {aggVal !== null ? formatValue(aggVal, row.format) : <span className="text-muted-foreground">—</span>}
          </td>
        );
      })()}

      {/* Historic month columns */}
      {displayedHistMonths.map((month) => {
        const displayValue = getDisplayValue(row.key, month);
        return (
          <td key={month} data-tip={getCellTooltip(row.key, month)} className="px-2 py-1 text-right text-xs min-w-[90px] border-l border-border text-muted-foreground cursor-help">
            {displayValue !== null ? formatValue(displayValue, row.format) : <span className="text-muted-foreground">—</span>}
          </td>
        );
      })}

      {/* Historic sum column */}
      <td data-tip={`${row.label}: Sum of all historic months (${allHistMonths.length}mo)`} className="px-2 py-1 text-right text-xs min-w-[90px] border-l-2 border-l-blue-400 bg-blue-50/30 dark:bg-blue-500/10 text-blue-900 dark:text-blue-300 font-medium cursor-help">
        {(() => {
          const avg = getHistAvgValue(row.key);
          return avg !== null ? formatValue(avg, row.format) : <span className="text-muted-foreground">—</span>;
        })()}
      </td>

      {/* Forecast prediction overrides column */}
      <td className="px-1 py-0.5 text-right min-w-[80px] border-l-2 border-l-amber-400 bg-amber-50/50">
        {row.key === "ad_revenue" ? (
          <input
            type="text"
            className={`w-full text-right text-[10px] rounded px-1 py-0.5 focus:outline-none focus:ring-1 font-medium ${isLocked ? "bg-[#FDF0C4] border border-[#F7BF1D]/30 text-[#A07800] cursor-not-allowed" : "bg-[#F8BF1D] border border-[#F7BF1D] focus:ring-[#F7BF1D] text-black placeholder-black/40"}`}
            placeholder="$/unit"
            readOnly={isLocked}
            value={adRevenuePriceFocused ? adRevenuePriceDraft : (adRevenuePrice > 0 ? `$${adRevenuePrice.toFixed(2)}` : "")}
            onFocus={() => {
              if (isLocked) return;
              setAdRevenuePriceFocused(true);
              setAdRevenuePriceDraft(adRevenuePrice > 0 ? String(adRevenuePrice) : "");
            }}
            onChange={(e) => setAdRevenuePriceDraft(e.target.value)}
            onBlur={() => {
              setAdRevenuePriceFocused(false);
              const val = parseFloat(adRevenuePriceDraft);
              const price = isNaN(val) ? 0 : val;
              setLocalAdRevenuePriceOverride(price);
              saveCells.mutate({ month: "_config", metric: "ad_revenue_price", value: price });
            }}
          />
        ) : ASIN_PARENT_METRICS.has(row.key) && row.key !== "inv_coef" ? (() => {
          const sum = asins.reduce((acc, a) => acc + (getAsinCellValue(a.id, "_global", "share_pct") ?? (parseFloat(a.sharePct) || 0)), 0);
          return <span className={`text-[10px] font-medium ${Math.abs(sum - 100) > 0.1 ? "text-destructive" : "text-muted-foreground"}`}>{sum.toFixed(2)}%</span>;
        })() : row.key !== "category_coef" ? (
          <input
            type="text"
            className={`w-full text-right text-[10px] rounded px-1 py-0.5 focus:outline-none focus:ring-1 font-medium ${isLocked ? "bg-[#FDF0C4] border border-[#F7BF1D]/30 text-[#A07800] cursor-not-allowed" : "bg-[#F8BF1D] border border-[#F7BF1D] focus:ring-[#F7BF1D] text-black placeholder-black/40"}`}
            placeholder="±%/mo"
            readOnly={isLocked}
            value={focusedStep === row.key ? stepDraft : (metricSteps[row.key] ? `${(metricSteps[row.key] * 100).toFixed(2)}%` : "")}
            onFocus={() => {
              if (isLocked) return;
              setFocusedStep(row.key);
              const raw = metricSteps[row.key] ?? 0;
              setStepDraft(raw !== 0 ? String(raw * 100) : "");
            }}
            onChange={(e) => { if (!isLocked) setStepDraft(e.target.value); }}
            onBlur={() => {
              if (isLocked) return;
              setFocusedStep(null);
              const pct = parseFloat(stepDraft);
              const decimal = isNaN(pct) ? 0 : pct / 100;
              setLocalStepOverrides((prev) => ({ ...prev, [row.key]: decimal }));
              saveCells.mutate({ month: "_config", metric: `${row.key}_step`, value: decimal });
            }}
          />
        ) : null}
      </td>

      {/* Forecast month columns */}
      {forecastMonths.map((month) => {
        const isForecast = true;
        const isEditable = row.editable;
        let displayValue: number | null;
        if (row.key === "inv_month_end") {
          displayValue = getInvMonthEndSum(month);
        } else if (row.key === "inv_coef") {
          const invEom = getInvMonthEndSum(month);
          const monthIdx = displayedMonths.indexOf(month);
          const nextMonth = monthIdx < displayedMonths.length - 1 ? displayedMonths[monthIdx + 1] : null;
          const nextUnits = nextMonth ? getDisplayValue("units_ordered", nextMonth) : null;
          displayValue = (invEom != null && nextUnits != null && nextUnits > 0) ? invEom / nextUnits : null;
        } else {
          displayValue = getDisplayValue(row.key, month);
        }
        // Apply growth step modifier for non-editable derived forecast metrics
        if (!row.editable && !STEP_VIA_GETCELLVALUE.has(row.key) && displayValue !== null) {
          const growthStep = metricSteps[row.key] ?? 0;
          if (growthStep !== 0) {
            const fIdx = forecastMonths.indexOf(month);
            if (fIdx > 0) {
              displayValue = displayValue * (1 + growthStep * fIdx);
            }
          }
        }
        const rawValue = row.editable ? (getCellValue(row.key, month) ?? "") : "";

        if (isEditable) {
          const numVal = typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue));
          const isCoef = row.key === "category_coef";
          const formattedInput = rawValue === "" || isNaN(numVal) ? "" :
            row.format === "currency" ? `$${numVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` :
            row.format === "percent" ? (isCoef ? `${numVal >= 0 ? "+" : ""}${(numVal * 100).toFixed(2)}%` : `${(numVal * 100).toFixed(2)}%`) :
            Math.round(numVal).toLocaleString("en-US");
          const coefInputColor = isCoef && !isNaN(numVal) && numVal !== 0
            ? numVal > 0 ? "!text-green-700" : "!text-red-600"
            : "";

          return (
            <td
              key={month}
              data-tip={getCellTooltip(row.key, month)}
              className="px-1 py-0.5 text-right min-w-[90px] bg-amber-50/30 border-l border-border"
            >
              <input
                type="text"
                className={`w-full text-right text-xs rounded px-1 py-0.5 focus:outline-none focus:ring-1 font-medium ${isLocked ? "bg-[#FDF0C4] border border-[#F7BF1D]/30 text-[#A07800] cursor-not-allowed" : "bg-[#F8BF1D] border border-[#F7BF1D] focus:ring-[#F7BF1D] text-black placeholder-black/40"} ${coefInputColor}`}
                value={focusedCell === `${month}:${row.key}` ? (rawValue === "" ? "" : row.format === "percent" ? String(numVal * 100) : String(rawValue)) : formattedInput}
                onChange={(e) => {
                  if (isLocked) return;
                  if (row.format === "percent") {
                    const pctVal = e.target.value === "" ? "" : e.target.value;
                    const decimal = pctVal === "" ? 0 : parseFloat(pctVal) / 100;
                    handleCellChange(month, row.key, String(decimal));
                  } else {
                    handleCellChange(month, row.key, e.target.value);
                  }
                }}
                onFocus={() => !isLocked && setFocusedCell(`${month}:${row.key}`)}
                onBlur={() => { setFocusedCell(null); if (!isLocked) handleCellBlur(month, row.key); }}
                readOnly={isLocked}
                placeholder="—"
              />
            </td>
          );
        }

        // Read-only (historical or derived)
        return (
          <td
            key={month}
            data-tip={getCellTooltip(row.key, month)}
            className={`px-2 py-1 text-right text-xs min-w-[90px] border-l border-border cursor-help ${
              !isForecast ? "text-muted-foreground" : "text-foreground"
            }`}
          >
            {displayValue !== null ? formatValue(displayValue, row.format) : <span className="text-muted-foreground">—</span>}
          </td>
        );
      })}
    </tr>
  );

  // ASIN breakdown rows
  const ASIN_PARENT_METRICS = new Set(["inv_coef", "units_ordered", "inv_month_end", "replenish_orders"]);

  const toggleAsinExpand = (metricKey: string) => {
    setExpandedAsinRows((prev) => {
      const next = new Set(prev);
      if (next.has(metricKey)) next.delete(metricKey); else next.add(metricKey);
      return next;
    });
  };

  // Per-ASIN INV Month End
  const getAsinInvMonthEnd = useCallback(
    (asinId: string, asinCode: string | null, month: string, share: number): number | null => {
      const isForecast = month >= forecastStart;

      if (!isForecast) {
        if (asinCode && asinHistorical[asinCode]?.[month]?.inv_eom != null) {
          return Math.round(asinHistorical[asinCode][month].inv_eom);
        }
        return null;
      }

      const monthIdx = displayedMonths.indexOf(month);
      const totalUnits = getDisplayValue("units_ordered", month) ?? 0;
      const sales = Math.round(totalUnits * share);
      const replenish = getAsinCellValue(asinId, month, "replenish") ?? 0;

      let prevInv = 0;
      if (monthIdx > 0) {
        const prevMonth = displayedMonths[monthIdx - 1];
        const prev = getAsinInvMonthEnd(asinId, asinCode, prevMonth, share);
        prevInv = prev ?? 0;
      }

      return prevInv - sales + replenish;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayedMonths, forecastStart, asinHistorical, getDisplayValue, getAsinCellValue]
  );

  const getInvMonthEndSum = useCallback(
    (month: string): number | null => {
      let sum = 0;
      let hasData = false;
      for (const a of asins) {
        const sPct = getAsinCellValue(a.id, "_global", "share_pct") ?? (parseFloat(a.sharePct) || 0);
        const v = getAsinInvMonthEnd(a.id, a.asin, month, sPct / 100);
        if (v !== null) { sum += v; hasData = true; }
      }
      return hasData ? sum : null;
    },
    [asins, getAsinCellValue, getAsinInvMonthEnd]
  );

  const renderAsinSubRows = (parentMetric: string) => {
    if (!expandedAsinRows.has(parentMetric) || asins.length === 0) return null;
    return asins.map((asin) => (
      <tr key={`${parentMetric}-${asin.id}`} className="border-b border-border bg-muted">
        <td className="sticky left-0 z-10 bg-muted pl-6 pr-3 py-0.5 text-[10px] text-muted-foreground min-w-[200px] border-r border-border" title={asin.productName}>
          <div className="whitespace-nowrap">{asin.asin || asin.sku || "—"}</div>
          {(() => {
            const attrs = (asin.variationAttributes ?? {}) as Record<string, string>;
            const hasAttrs = Object.keys(attrs).length > 0;
            if (hasAttrs) {
              // Size always last
              const keys = Object.keys(attrs).sort((a, b) =>
                a.toLowerCase() === "size" ? 1 : b.toLowerCase() === "size" ? -1 : 0
              );
              return (
                <div className="whitespace-nowrap text-[9px] text-muted-foreground leading-tight">
                  {keys.map(k => attrs[k]).join(" · ")}
                </div>
              );
            }
            // No variation attrs — show truncated product name (covers variety packs)
            if (asin.productName) {
              return (
                <div className="text-[9px] text-muted-foreground leading-tight truncate max-w-[190px]">
                  {asin.productName}
                </div>
              );
            }
            return null;
          })()}
        </td>
        {/* Aggregated column for ASIN sub-rows */}
        {hasAggCol && (() => {
          let aggVal: number | null = null;
          if (parentMetric === "units_ordered") {
            aggVal = getAsinAggUnits(asin.asin);
          } else if (parentMetric === "inv_month_end") {
            const sharePct = getAsinCellValue(asin.id, "_global", "share_pct") ?? (parseFloat(asin.sharePct) || 0);
            const share = sharePct / 100;
            let sum = 0; let has = false;
            for (const m of aggregatedMonths) {
              const v = getAsinInvMonthEnd(asin.id, asin.asin, m, share);
              if (v != null) { sum += v; has = true; }
            }
            aggVal = has ? Math.round(sum) : null;
          }
          return (
            <td className="px-2 py-0.5 text-right text-[10px] text-blue-700/60 dark:text-blue-400/70 min-w-[90px] border-l border-border bg-blue-50/20 dark:bg-blue-500/5">
              {aggVal != null && aggVal !== 0 ? aggVal.toLocaleString("en-US") : <span className="text-muted-foreground">—</span>}
            </td>
          );
        })()}
        {/* Historic month cells for ASIN sub-rows */}
        {displayedHistMonths.map((month) => {
          const sharePct = getAsinCellValue(asin.id, "_global", "share_pct") ?? (parseFloat(asin.sharePct) || 0);
          const share = sharePct / 100;
          if (parentMetric === "units_ordered") {
            const asinCode = asin.asin;
            let val: number | null = null;
            if (asinCode && asinHistorical[asinCode]?.[month]?.product_quantity != null) {
              val = Math.round(asinHistorical[asinCode][month].product_quantity);
            }
            return (
              <td key={month} className="px-2 py-0.5 text-right text-[10px] text-muted-foreground min-w-[90px] border-l border-border">
                {val != null && val !== 0 ? val.toLocaleString("en-US") : <span className="text-muted-foreground">—</span>}
              </td>
            );
          }
          if (parentMetric === "inv_month_end") {
            const val = getAsinInvMonthEnd(asin.id, asin.asin, month, share);
            return (
              <td key={month} className={`px-2 py-0.5 text-right text-[10px] min-w-[90px] border-l border-border ${val !== null && val < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                {val !== null ? Math.round(val).toLocaleString("en-US") : <span className="text-muted-foreground">—</span>}
              </td>
            );
          }
          return (
            <td key={month} className="px-2 py-0.5 text-right text-[10px] text-muted-foreground min-w-[90px] border-l border-border">
              <span className="text-muted-foreground">—</span>
            </td>
          );
        })}
        {/* Hist avg cell for ASIN sub-rows: show % of total units_ordered */}
        <td className="px-2 py-0.5 text-right text-[10px] min-w-[90px] border-l-2 border-l-blue-400 bg-blue-50/20 dark:bg-blue-500/5 text-blue-700/60 dark:text-blue-400/70">
          {(() => {
            const asinCode = asin.asin;
            if (!asinCode) return <span className="text-muted-foreground">—</span>;
            if (parentMetric === "units_ordered") {
              let asinSum = 0;
              for (const m of allHistMonths) {
                if (asinHistorical[asinCode]?.[m]?.product_quantity != null) {
                  asinSum += Math.round(asinHistorical[asinCode][m].product_quantity);
                }
              }
              const totalUnits = getHistAvgValue("units_ordered") ?? 0;
              const pct = totalUnits > 0 ? (asinSum / totalUnits) * 100 : 0;
              return pct > 0 ? <>{asinSum.toLocaleString("en-US")} <span className="text-blue-400">({pct.toFixed(2)}%)</span></> : <span className="text-muted-foreground">—</span>;
            }
            if (parentMetric === "inv_month_end") {
              const sharePct = getAsinCellValue(asin.id, "_global", "share_pct") ?? (parseFloat(asin.sharePct) || 0);
              const share = sharePct / 100;
              let sum = 0;
              let hasData = false;
              for (const m of allHistMonths) {
                const val = getAsinInvMonthEnd(asin.id, asinCode, m, share);
                if (val != null) { sum += val; hasData = true; }
              }
              return hasData ? Math.round(sum).toLocaleString("en-US") : <span className="text-muted-foreground">—</span>;
            }
            return null;
          })()}
        </td>
        {/* Predict cell: editable share % override for units_ordered ASIN sub-rows */}
        <td className="px-1 py-0.5 min-w-[80px] border-l-2 border-l-amber-400 bg-amber-50/20">
          {parentMetric === "units_ordered" ? (() => {
            const rawVal = getAsinCellValue(asin.id, "_global", "share_pct");
            const cellKey = `asin-${asin.id}-predict-share`;
            const isFoc = focusedCell === cellKey;
            const displayVal = rawVal != null ? `${rawVal.toFixed(2)}%` : `${parseFloat(asin.sharePct).toFixed(2)}%`;
            return (
              <input
                type="text"
                className={`w-full text-right text-[10px] rounded px-1 py-0.5 focus:outline-none focus:ring-1 font-medium ${isLocked ? "bg-[#FDF0C4] border border-[#F7BF1D]/30 text-[#A07800] cursor-not-allowed" : "bg-[#F8BF1D] border border-[#F7BF1D] focus:ring-[#F7BF1D] text-black placeholder-black/40"}`}
                placeholder="%"
                readOnly={isLocked}
                value={isFoc ? String(rawVal ?? (parseFloat(asin.sharePct) || "")) : displayVal}
                onChange={(e) => {
                  if (isLocked) return;
                  const val = e.target.value === "" ? "0" : e.target.value;
                  handleAsinCellChange(asin.id, "_global", "share_pct", val);
                }}
                onFocus={() => !isLocked && setFocusedCell(cellKey)}
                onBlur={() => { setFocusedCell(null); if (!isLocked) handleAsinCellBlur(asin.id, "_global", "share_pct"); }}
              />
            );
          })() : null}
        </td>
        {/* Forecast month cells for ASIN sub-rows */}
        {forecastMonths.map((month) => {
          const sharePct = getAsinCellValue(asin.id, "_global", "share_pct") ?? (parseFloat(asin.sharePct) || 0);
          const share = sharePct / 100;

          if (parentMetric === "inv_coef") {
            const invEom = getAsinInvMonthEnd(asin.id, asin.asin, month, share);
            const monthIdx = forecastMonths.indexOf(month);
            const nextMonth = monthIdx < forecastMonths.length - 1 ? forecastMonths[monthIdx + 1] : null;
            const salesMonth = nextMonth ?? month;
            const salesTotalUnits = getDisplayValue("units_ordered", salesMonth) ?? 0;
            const sales = Math.round(salesTotalUnits * share);
            const coef = (invEom != null && sales > 0) ? invEom / sales : null;
            return (
              <td key={month} className="px-2 py-0.5 text-right text-[10px] text-muted-foreground min-w-[90px] border-l border-border">
                {coef !== null ? coef.toFixed(2) : <span className="text-muted-foreground">—</span>}
              </td>
            );
          }

          if (parentMetric === "units_ordered") {
            // Use historic % until first replenishment, then switch to predict %
            const asinCode = asin.asin;
            let histPct = 0;
            if (asinCode) {
              let asinSum = 0;
              for (const m of allHistMonths) {
                if (asinHistorical[asinCode]?.[m]?.product_quantity != null) {
                  asinSum += Math.round(asinHistorical[asinCode][m].product_quantity);
                }
              }
              const totalHist = getHistAvgValue("units_ordered") ?? 0;
              histPct = totalHist > 0 ? asinSum / totalHist : 0;
            }
            const predictPct = (getAsinCellValue(asin.id, "_global", "share_pct") ?? (parseFloat(asin.sharePct) || 0)) / 100;
            // Find first forecast month with replenishment for this ASIN
            const firstReplenishIdx = forecastMonths.findIndex((fm) => (getAsinCellValue(asin.id, fm, "replenish") ?? 0) > 0);
            const monthIdx = forecastMonths.indexOf(month);
            const usePredict = firstReplenishIdx >= 0 && monthIdx > firstReplenishIdx;
            const pct = usePredict ? predictPct : histPct;
            const totalUnits = getDisplayValue("units_ordered", month) ?? 0;
            const val = Math.round(totalUnits * pct);
            return (
              <td key={month} className={`px-2 py-0.5 text-right text-[10px] min-w-[90px] border-l border-border ${usePredict ? "text-amber-600" : "text-blue-700/60 dark:text-blue-400/70"}`}>
                {val !== 0 ? val.toLocaleString("en-US") : <span className="text-muted-foreground">—</span>}
              </td>
            );
          }

          if (parentMetric === "replenish_orders") {
            const rawVal = getAsinCellValue(asin.id, month, "replenish");
            const cellKey = `asin-${asin.id}-${month}-replenish`;
            const displayVal = rawVal != null && rawVal !== 0 ? Math.round(rawVal).toLocaleString("en-US") : "";
            return (
              <td key={month} className={`px-1 py-0.5 text-right min-w-[90px] bg-green-50/40 border-l border-border`}>
                <input
                  type="text"
                  className={`w-full text-right text-[10px] rounded px-1 py-0.5 focus:outline-none focus:ring-1 font-medium ${isLocked ? "bg-[#FDF0C4] border border-[#F7BF1D]/30 text-[#A07800] cursor-not-allowed" : "bg-[#F8BF1D] border border-[#F7BF1D] focus:ring-[#F7BF1D] text-black placeholder-black/40"}`}
                  readOnly={isLocked}
                  value={focusedCell === cellKey ? String(rawVal ?? "") : displayVal}
                  onChange={(e) => { if (!isLocked) handleAsinCellChange(asin.id, month, "replenish", e.target.value); }}
                  onFocus={() => !isLocked && setFocusedCell(cellKey)}
                  onBlur={() => { setFocusedCell(null); if (!isLocked) handleAsinCellBlur(asin.id, month, "replenish"); }}
                  placeholder="0"
                />
              </td>
            );
          }

          if (parentMetric === "inv_month_end") {
            const val = getAsinInvMonthEnd(asin.id, asin.asin, month, share);
            return (
              <td key={month} className={`px-2 py-0.5 text-right text-[10px] min-w-[90px] border-l border-border ${val !== null && val < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                {val !== null ? Math.round(val).toLocaleString("en-US") : <span className="text-muted-foreground">—</span>}
              </td>
            );
          }

          return (
            <td key={month} className={`px-2 py-0.5 text-right text-[10px] text-muted-foreground min-w-[90px] border-l border-border`}>
              <span className="text-muted-foreground">—</span>
            </td>
          );
        })}
      </tr>
    ));
  };

  const sections: Section[] = ["aggregate", "advertising", "inventory"];
  const sectionToggleConfig: Array<{
    key: Section;
    label: string;
    active: boolean;
    toggle: () => void;
    activeClass: string;
  }> = [
    {
      key: "aggregate",
      label: "Aggregate",
      active: showAggregate,
      toggle: () => setShowAggregate((v) => !v),
      activeClass: "bg-amber-500 text-white border-amber-500",
    },
    {
      key: "advertising",
      label: "Advertising",
      active: showAdvertising,
      toggle: () => setShowAdvertising((v) => !v),
      activeClass: "bg-zinc-700 text-white border-zinc-700 dark:bg-zinc-500 dark:border-zinc-500",
    },
    {
      key: "inventory",
      label: "Inventory",
      active: showInventory,
      toggle: () => setShowInventory((v) => !v),
      activeClass: "bg-green-600 text-white border-green-600",
    },
  ];

  return (
    <div className="flex flex-col">
      {/* Section toggle bar + date range pickers — sticky below page header */}
      <div className="pt-1 pb-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium mr-1">Show:</span>
        {sectionToggleConfig.map((s) => (
          <button
            key={s.key}
            onClick={s.toggle}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              s.active
                ? s.activeClass
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            <span
              className={`size-2 rounded-full ${
                s.active ? "bg-white/80" : "bg-muted-foreground/40"
              }`}
            />
            {s.label}
          </button>
        ))}

        {/* Date range pickers */}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <label className="font-medium text-muted-foreground">Historic</label>
            <select
              className="rounded border border-border bg-card px-1.5 py-0.5 text-xs text-foreground"
              value={historicStart}
              onChange={(e) => onHistoricStartChange(e.target.value)}
            >
              {allMonths.filter((m) => m < forecastStart).map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
            <span className="text-muted-foreground">→ {monthLabel(historicEnd)}</span>
          </div>
          <span className="text-border">|</span>
          <div className="flex items-center gap-1">
            <label className="font-medium text-muted-foreground">Forecast</label>
            <select
              className="rounded border border-border bg-card px-1.5 py-0.5 text-xs text-foreground"
              value={forecastStart}
              onChange={(e) => onForecastStartChange(e.target.value)}
            >
              {allMonths.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
            <span className="text-muted-foreground">→</span>
            <select
              className="rounded border border-border bg-card px-1.5 py-0.5 text-xs text-foreground"
              value={forecastEnd}
              onChange={(e) => onForecastEndChange(e.target.value)}
            >
              {allMonths.filter((m) => m >= forecastStart).map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
        </div>

        {onEditSeasonality && (
          <button
            onClick={onEditSeasonality}
            className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-muted transition-colors"
          >
            Edit Seasonality
          </button>
        )}
        {saveCells.isPending && (
          <span className="text-xs text-muted-foreground animate-pulse">Saving…</span>
        )}
        {saveCells.isError && (
          <span className="text-xs text-destructive">Save failed</span>
        )}
      </div>

      {/* Grid */}
      <style dangerouslySetInnerHTML={{ __html: TOOLTIP_STYLE }} />
      <div className="overflow-auto rounded-lg border border-border bg-card max-h-[calc(100vh-260px)]">
        <table className="text-xs tabular-nums text-foreground border-collapse w-full">
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted [&>th]:bg-muted">
              <th className="sticky left-0 z-30 bg-muted px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap min-w-[160px] border-r border-border border-b border-border">
                Metric
              </th>
              {/* Aggregated column header */}
              {hasAggCol && (
                <th className="p-2 text-right text-xs font-semibold whitespace-nowrap min-w-[90px] border-b border-border bg-blue-50 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300">
                  {monthLabel(aggregatedMonths[0])}
                  <span className="block text-[9px] font-normal leading-none mt-0.5 text-blue-500/70 dark:text-blue-300/70">
                    – {monthLabel(aggregatedMonths[aggregatedMonths.length - 1])}
                  </span>
                </th>
              )}
              {/* Historic month headers */}
              {displayedHistMonths.map((month) => (
                <th
                  key={month}
                  className="p-2 text-right text-xs font-semibold whitespace-nowrap min-w-[90px] border-b border-border bg-muted text-foreground"
                >
                  {monthLabel(month)}
                </th>
              ))}
              {/* Historic average column header */}
              <th className="p-2 text-right text-xs font-semibold whitespace-nowrap min-w-[90px] border-b border-border border-l-2 border-l-blue-400 bg-blue-50 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300">
                Historic
                <span className="block text-[9px] font-normal leading-none mt-0.5 text-blue-500/70 dark:text-blue-300/70">
                  Sum {allHistMonths.length > 0 ? `${monthLabel(allHistMonths[0])} – ${monthLabel(allHistMonths[allHistMonths.length - 1])}` : ""}
                </span>
              </th>
              {/* Predict column header */}
              <th className="p-2 text-right text-xs font-semibold whitespace-nowrap min-w-[80px] border-b border-border border-l-2 border-l-amber-400 bg-amber-50 text-amber-700">
                Forecast
                <span className="block text-[9px] font-normal leading-none mt-0.5 text-amber-500/70">overrides</span>
              </th>
              {/* Forecast month headers */}
              {forecastMonths.map((month) => (
                <th
                  key={month}
                  className="p-2 text-right text-xs font-semibold whitespace-nowrap min-w-[90px] border-b border-border bg-amber-50 text-amber-800"
                >
                  {monthLabel(month)}
                  <span className="block text-[9px] font-normal leading-none mt-0.5 text-amber-500/80">
                    forecast
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              if (!sectionVisible[section]) return null;
              const rows = METRIC_ROWS.filter((r) => r.section === section);
              return (
                <Fragment key={section}>
                  {renderSectionHeader(section)}
                  {rows.map((row) => (
                    <Fragment key={row.key}>
                      {renderMetricRow(row)}
                      {ASIN_PARENT_METRICS.has(row.key) && renderAsinSubRows(row.key)}
                    </Fragment>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Units for a client's chosen recent + seasonal windows, per SKU and per ASIN.
// Per ASIN matters: last year's sales were often booked under SKUs that no
// longer exist, so a per-SKU lookup alone misses them (Halfday 2026-10-08:
// Peach 20 units by SKU vs 2,177 by ASIN). Separate from
// /api/sales-summary/inventory so that route's cron-warmed cache key stays stable.
// Every value below that reaches SQL text is validated in parseWindowsParams.
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { queryRedshift } from "@/lib/redshift";
import { getCachedData, setCachedData } from "@/lib/sales-cache";
import { isHubStaff } from "@/lib/roles";
import {
  recentWindow, resolveSeasonalWindow, todayIso, validateSeasonalWindow, type DateWindow,
} from "@/lib/inventory/rec-settings";

export const maxDuration = 120;

const PROD_TABLE = `"intentwise_ecommerce_graph"."product_summary"`;
const CACHE_TYPE = "inventory-windows";
const CACHE_VERSION = "v2"; // v2 adds byAsin

export interface WindowsResponse {
  recent: DateWindow;
  seasonal: DateWindow;
  /** Keyed `${asin}|${sku}` — used to split an ASIN's units across its SKUs. */
  units: Record<string, { recent: number; seasonal: number }>;
  /** Keyed by ASIN — every SKU's units summed, including SKUs no longer listed. */
  byAsin?: Record<string, { recent: number; seasonal: number }>;
}

export function parseWindowsParams(
  sp: URLSearchParams,
  today: string,
): { ok: true; ids: string[]; recent: DateWindow; seasonal: DateWindow } | { ok: false; error: string } {
  const ids = (sp.get("accountIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0 || ids.some((id) => !/^\d+$/.test(id))) return { ok: false, error: "Invalid accountIds" };
  const recentDays = Number(sp.get("recentDays"));
  if (!Number.isInteger(recentDays) || recentDays < 7 || recentDays > 365) {
    return { ok: false, error: "recentDays must be an integer 7–365" };
  }
  const seasonalStart = sp.get("seasonalStart") || null;
  const seasonalEnd = sp.get("seasonalEnd") || null;
  const winErr = validateSeasonalWindow(seasonalStart, seasonalEnd);
  if (winErr) return { ok: false, error: winErr };
  return {
    ok: true,
    ids,
    recent: recentWindow(recentDays, today),
    seasonal: resolveSeasonalWindow({ seasonalStart, seasonalEnd }, today),
  };
}

interface UnitsRow { asin: string; sku: string; units: string | number }

function unitsSql(idList: string, w: DateWindow): string {
  return `
    SELECT p.product AS asin, p.sku, SUM(COALESCE(p.product_quantity, 0)) AS units
    FROM ${PROD_TABLE} p
    WHERE p.account_id IN (${idList})
      AND p.report_date >= '${w.start}'::DATE
      AND p.report_date <= '${w.end}'::DATE
    GROUP BY p.product, p.sku
  `;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user?.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = parseWindowsParams(req.nextUrl.searchParams, todayIso());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { ids, recent, seasonal } = parsed;

  const cacheKey = [CACHE_VERSION, [...ids].sort().join(","), recent.start, recent.end, seasonal.start, seasonal.end].join("|");
  // The cache is best-effort: a cache-DB hiccup must never block the windows.
  try {
    const cached = await getCachedData<WindowsResponse>(CACHE_TYPE, cacheKey);
    if (cached) return NextResponse.json(cached);
  } catch (e) {
    console.error("[inventory/windows] cache read failed", e);
  }

  const idList = ids.join(",");
  let body: WindowsResponse;
  try {
    const [recentRows, seasonalRows] = await Promise.all([
      queryRedshift<UnitsRow>(unitsSql(idList, recent)),
      queryRedshift<UnitsRow>(unitsSql(idList, seasonal)),
    ]);
    const units: WindowsResponse["units"] = {};
    const byAsin: WindowsResponse["byAsin"] = {};
    const slot = (r: UnitsRow) => (units[`${r.asin}|${r.sku}`] ??= { recent: 0, seasonal: 0 });
    const asinSlot = (r: UnitsRow) => (byAsin[r.asin] ??= { recent: 0, seasonal: 0 });
    for (const r of recentRows) {
      const n = Number(r.units) || 0;
      slot(r).recent = n;
      if (r.asin) asinSlot(r).recent += n;
    }
    for (const r of seasonalRows) {
      const n = Number(r.units) || 0;
      slot(r).seasonal = n;
      if (r.asin) asinSlot(r).seasonal += n;
    }

    body = { recent, seasonal, units, byAsin };
  } catch (e) {
    console.error("[inventory/windows] Redshift failed", e);
    return NextResponse.json({ error: "Failed to load sales windows" }, { status: 502 });
  }

  try {
    await setCachedData(CACHE_TYPE, cacheKey, body);
  } catch (e) {
    console.error("[inventory/windows] cache write failed", e);
  }
  return NextResponse.json(body);
}

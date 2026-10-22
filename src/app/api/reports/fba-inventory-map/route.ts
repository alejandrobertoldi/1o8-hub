import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { getCachedReport, setCachedReport } from "@/lib/reports-cache";
import { aggregate } from "@/lib/fba-inventory-map/aggregate";
import { isMonth } from "@/lib/fba-inventory-map/month";
import { fetchAsinList, fetchAvailableMonths, fetchDemand, fetchFcDirectory, fetchStockRows } from "@/lib/fba-inventory-map/queries.server";
import type { AsinOption, FbaMapBody, FbaMapResponse } from "@/lib/fba-inventory-map/types";
import {
  ASINS_CACHE_TYPE,
  CACHE_TYPE,
  MONTHS_CACHE_TYPE,
  MONTHS_TTL_MS,
  PAYLOAD_TTL_MS,
} from "@/lib/fba-inventory-map/cache-keys";

export const maxDuration = 120;


const ACCOUNT_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ASIN_RE = /^[A-Z0-9]{10}$/;

const emptyBody = (): FbaMapBody => ({
  dots: [],
  unplaced: { units: 0, share: 0, fcs: [] },
  totals: { units: 0, placedUnits: 0, fee: 0 },
  demand: { status: "unavailable", reason: "no_orders" },
  divisions: null,
});

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const accountId = params.get("accountId")?.trim() ?? "";
  const monthParam = params.get("month");
  if (!ACCOUNT_RE.test(accountId)) return NextResponse.json({ error: "valid accountId is required" }, { status: 400 });
  if (monthParam !== null && !isMonth(monthParam)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  const asinParam = params.get("asin")?.trim().toUpperCase() || null;
  if (asinParam !== null && !ASIN_RE.test(asinParam)) {
    return NextResponse.json({ error: "asin must be a 10-character ASIN" }, { status: 400 });
  }

  try {
    let availableMonths = await getCachedReport<string[]>(MONTHS_CACHE_TYPE, accountId, MONTHS_TTL_MS);
    if (!availableMonths) {
      availableMonths = await fetchAvailableMonths(accountId);
      await setCachedReport(MONTHS_CACHE_TYPE, accountId, availableMonths);
    }

    const month = monthParam ?? availableMonths[0] ?? null;
    if (!month) {
      return NextResponse.json({ accountId, month: null, availableMonths, asin: null, asins: [], ...emptyBody() } satisfies FbaMapResponse);
    }

    let asins = await getCachedReport<AsinOption[]>(ASINS_CACHE_TYPE, `${accountId}:${month}`, PAYLOAD_TTL_MS);
    const key = `${accountId}:${month}:${asinParam ?? "all"}`;
    let body = await getCachedReport<FbaMapBody>(CACHE_TYPE, key, PAYLOAD_TTL_MS);

    // The ASIN list and the stock+demand queries only depend on month, not on each
    // other, so on a double cache miss all three Redshift round trips run together
    // instead of the ASIN list going first and adding its own latency in series.
    const needAsins = !asins;
    const needBody = !body;
    if (needAsins || needBody) {
      const [asinsResult, stock, demand, directory] = await Promise.all([
        needAsins ? fetchAsinList(accountId, month) : Promise.resolve(null),
        needBody ? fetchStockRows(accountId, month, asinParam) : Promise.resolve(null),
        needBody ? fetchDemand(accountId, month, asinParam) : Promise.resolve(null),
        needBody ? fetchFcDirectory() : Promise.resolve(null),
      ]);
      if (needAsins) {
        asins = asinsResult!;
        if (asins.length > 0) await setCachedReport(ASINS_CACHE_TYPE, `${accountId}:${month}`, asins);
      }
      if (needBody) {
        body = aggregate(stock!, demand!, directory!);
        // An empty month is not cached: its report may land later, and the miss is cheap.
        if (body.totals.units > 0) await setCachedReport(CACHE_TYPE, key, body);
      }
    }
    return NextResponse.json({ accountId, month, availableMonths, asin: asinParam, asins: asins!, ...(body!) } satisfies FbaMapResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

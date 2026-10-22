import { NextRequest, NextResponse, after } from "next/server";
import {
  getSnapshotMeta,
  readOrderGeographyFromSnapshot,
  refreshSnapshotQuietly,
} from "@/lib/reports/order-geography-snapshot";
import { fetchOrderGeography } from "@/lib/reports/order-geography.server";
import { snapshotCoverage } from "@/lib/reports/order-geography";
import { widestTrailingWindow } from "@/lib/reports/trailing-range";
import { getCachedReport, setCachedReport, buildDatedKey } from "@/lib/reports-cache";
import { requireAuthOrCron, getEffectiveAccountId } from "@/lib/api-auth";

/* Reads the local snapshot, not Redshift, so this is normally a fast Postgres
   query. The ceiling stays high only for the cold path below, where a client
   with no snapshot yet falls back to a live scan. */
export const maxDuration = 300;

const CACHE_TYPE = "report-order-geography";

export async function GET(req: NextRequest) {
  const unauthorized = await requireAuthOrCron(req);
  if (unauthorized) return unauthorized;

  const params = req.nextUrl.searchParams;
  const accountId = (await getEffectiveAccountId(req)) ?? "";
  const start = params.get("start");
  const end = params.get("end");
  const refresh = params.get("refresh") === "true";

  if (!accountId || !start || !end) {
    return NextResponse.json(
      { error: "accountId, start and end are required" },
      { status: 400 },
    );
  }

  const cacheKey = buildDatedKey(accountId, start, end);

  if (!refresh) {
    const cached = await getCachedReport<unknown>(CACHE_TYPE, cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  try {
    const meta = await getSnapshotMeta(accountId);

    // Serve from the local snapshot whenever it covers the window — a ~2s
    // Postgres read instead of a ~80s Redshift scan — or trails it by a few
    // days, since the snapshot job does not reach every client daily. A client
    // not snapshotted yet, or a range reaching well past what was captured,
    // still falls back to the live scan.
    const coverage = snapshotCoverage(meta, start, end);
    const covered = coverage !== "none";

    // A snapshot that has fallen behind is rebuilt after the response is sent,
    // so the next view is current without waiting for the next cron run.
    // Accounts with no snapshot are left to the cron, which covers only
    // Active clients.
    if (meta !== null && meta.coveredEnd < widestTrailingWindow().end) {
      after(() => refreshSnapshotQuietly(accountId));
    }

    const report = covered
      ? await readOrderGeographyFromSnapshot(accountId, start, end)
      : await fetchOrderGeography(accountId, start, end);

    const withMeta = {
      ...report,
      source: covered ? ("snapshot" as const) : ("live" as const),
      snapshotRefreshedAt: covered && meta ? meta.refreshedAt.toISOString() : null,
    };
    // A stale read is not cached: it is cheap to rebuild, and caching it would
    // keep showing the missing days for 24h after the snapshot catches up.
    if (coverage !== "stale") await setCachedReport(CACHE_TYPE, cacheKey, withMeta);
    return NextResponse.json(withMeta);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}

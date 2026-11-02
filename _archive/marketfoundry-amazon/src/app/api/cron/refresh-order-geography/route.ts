/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextResponse } from "next/server";
import { listStalestSnapshotAccountIds } from "@/lib/reports/order-geography-snapshot";

/**
 * Rebuilds the Order Geography snapshot for the two stalest Active clients.
 *
 * Vercel runs this every 10 minutes from 11:00 to 12:50 UTC, then hourly at
 * :20 from 13:20 to 19:20 UTC (vercel.json; the `?retry=afternoon` path only
 * makes that a separate cron entry and is not read here). An account that
 * fails stays stalest and is retried next run; runs go quiet once every
 * snapshot has been refreshed since 11:00 UTC, so the afternoon runs only
 * pick up the day's failures. They stop before the 20:00 UTC archive drain.
 *
 * It used to send every client out at once — four workers of four — which
 * put eight scans on the Redshift datashare together. On 2026-09-23 each ran
 * ~400s under that contention, past the 240s query timeout and the 300s
 * function limit, and nothing was written. Two scans at a time is what the
 * working local backfill ran. This route waits for its worker, so it gets
 * the same 300s.
 */
export const maxDuration = 300;

const CLIENTS_PER_RUN = 2;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountIds = await listStalestSnapshotAccountIds(CLIENTS_PER_RUN);
  const t0 = Date.now();
  if (accountIds.length === 0) {
    return NextResponse.json({ timestamp: new Date().toISOString(), durationMs: 0, accountIds, worker: null });
  }

  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

  let worker: Record<string, unknown>;
  try {
    const res = await fetch(`${baseUrl}/api/internal/refresh/order-geography`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
        "x-cron-refresh": "true",
      },
      body: JSON.stringify({ clients: accountIds.map((id) => ({ name: id, accountIds: [id] })) }),
    });
    const data = res.ok ? await res.json() : { ok: 0, errors: 1 };
    worker = { status: res.ok ? "ok" : "error", ...data };
  } catch (error) {
    worker = { status: "error", error: String(error) };
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - t0,
    accountIds,
    worker,
  });
}

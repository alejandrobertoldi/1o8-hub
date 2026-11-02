/* eslint-disable react-doctor/async-await-in-loop */
import { NextResponse } from "next/server";
import { refreshOrderGeographySnapshot } from "@/lib/reports/order-geography-snapshot";
import { widestTrailingWindow } from "@/lib/reports/trailing-range";

export const maxDuration = 300;

/**
 * Scans per invocation. The Redshift source is an external datashare where
 * one account's 365-day scan costs ~70s or worse, so this is deliberately
 * serial: the cron fans clients out across several invocations, and running
 * many heavy cross-cluster scans at once slows every other report that shares
 * the warehouse.
 */
const CONCURRENCY = 2;

type Client = { name: string; accountIds: string[] };

/**
 * Refresh the local Order Geography snapshot for a chunk of clients.
 *
 * This no longer warms a response cache — it rebuilds the Postgres mirror the
 * report reads from, so any date range is fast afterwards rather than only
 * the presets a warm job happened to pre-compute.
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { clients?: Client[] };
  const clients = body.clients ?? [];
  const window = widestTrailingWindow();

  let ok = 0;
  let errors = 0;
  const failures: string[] = [];
  let lines = 0;

  for (let i = 0; i < clients.length; i += CONCURRENCY) {
    const batch = clients.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (client) => {
        const accountId = client.accountIds.join(",");
        try {
          const { lineCount } = await refreshOrderGeographySnapshot(accountId, window);
          return { accountId, lineCount };
        } catch (error) {
          console.error(`[order-geography] snapshot failed for ${accountId}:`, error);
          return { accountId, lineCount: null };
        }
      }),
    );
    for (const r of results) {
      if (r.lineCount === null) {
        errors++;
        failures.push(r.accountId);
      } else {
        ok++;
        lines += r.lineCount;
      }
    }
  }

  return NextResponse.json({
    worker: "order-geography",
    ok,
    errors,
    failures,
    lines,
    window,
  });
}

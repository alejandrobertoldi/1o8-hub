/**
 * GET /api/aplus2/clients
 *
 * Returns every aac client plus rollups from aplus2_sets + aplus2_versions.
 * Drives the /aplus2 landing page.
 *
 * Shape:
 *   [{
 *     clientIdCode, clientName,
 *     setCount,
 *     marketplaceCounts: { US: 3, UK: 1 },
 *     latestStatus: "in_progress" | "approved" | ... | null
 *   }]
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, aplus2Sets, aplus2Versions } from "@/lib/db/schema";

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const setRows = await db
    .select({
      clientIdCode: aplus2Sets.clientIdCode,
      marketplace: aplus2Sets.marketplace,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(aplus2Sets)
    .groupBy(aplus2Sets.clientIdCode, aplus2Sets.marketplace);

  const latestStatusRows = await db.execute<{ client_id_code: string; status: string }>(sql`
    SELECT DISTINCT ON (s.client_id_code)
      s.client_id_code, v.status
    FROM ${aplus2Versions} v
    JOIN ${aplus2Sets} s ON s.id = v.set_id
    ORDER BY s.client_id_code, v.updated_at DESC
  `);
  const latestByClient = new Map<string, string>();
  for (const r of latestStatusRows) latestByClient.set(r.client_id_code, r.status);

  const clientRows = await db
    .select({ clientIdCode: aac.clientIdCode, clientName: aac.clientName })
    .from(aac);

  const setsByClient = new Map<string, { mkt: string; count: number }[]>();
  for (const r of setRows) {
    const arr = setsByClient.get(r.clientIdCode) ?? [];
    arr.push({ mkt: r.marketplace, count: r.count });
    setsByClient.set(r.clientIdCode, arr);
  }

  const out = clientRows.map((c) => {
    const buckets = setsByClient.get(c.clientIdCode) ?? [];
    const marketplaceCounts: Record<string, number> = {};
    let setCount = 0;
    for (const b of buckets) {
      marketplaceCounts[b.mkt] = (marketplaceCounts[b.mkt] ?? 0) + b.count;
      setCount += b.count;
    }
    return {
      clientIdCode: c.clientIdCode,
      clientName: c.clientName,
      setCount,
      marketplaceCounts,
      latestStatus: latestByClient.get(c.clientIdCode) ?? null,
    };
  });

  out.sort((a, b) => {
    if (a.setCount !== b.setCount) return b.setCount - a.setCount;
    return (a.clientName ?? "").localeCompare(b.clientName ?? "");
  });

  return NextResponse.json(out);
}

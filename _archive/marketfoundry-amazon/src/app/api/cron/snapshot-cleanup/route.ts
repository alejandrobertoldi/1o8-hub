/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { amazonSnapshots } from "@/lib/db/schema";
import { sql, inArray } from "drizzle-orm";

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find IDs of snapshots older than the 10 most recent per product
  const staleRows = await db.execute(sql`
    SELECT id FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY ${amazonSnapshots.productId}
          ORDER BY ${amazonSnapshots.fetchedAt} DESC
        ) AS rn
      FROM ${amazonSnapshots}
    ) ranked
    WHERE rn > 10
  `);

  const staleIds = (staleRows as unknown as { id: number }[]).map((r) => r.id);

  if (staleIds.length > 0) {
    // Delete in batches of 500
    for (let i = 0; i < staleIds.length; i += 500) {
      const batch = staleIds.slice(i, i + 500);
      await db
        .delete(amazonSnapshots)
        .where(inArray(amazonSnapshots.id, batch));
    }
  }

  return NextResponse.json({
    cleanedAt: new Date().toISOString(),
    deletedSnapshots: staleIds.length,
  });
}

/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { publishDirtyToBigQuery } from "@/lib/bigquery";
import { db } from "@/lib/db";
import { master, publishHistory } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if there are dirty products
  const dirtyRows = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      changeLog: master.changeLog,
    })
    .from(master)
    .where(eq(master.isDirty, true));

  if (dirtyRows.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No pending changes to sync",
      synced: 0,
    });
  }

  // Snapshot changes for history
  const changesSnapshot = dirtyRows.map((p) => ({
    asin: p.asin,
    sku: p.sku,
    edits: (p.changeLog ?? []).map((e) => ({
      field: e.field,
      oldValue: e.oldValue,
      newValue: e.newValue,
    })),
  }));

  try {
    const result = await publishDirtyToBigQuery();

    // Clear changeLogs on synced products
    for (const row of dirtyRows) {
      await db
        .update(master)
        .set({ changeLog: [] })
        .where(eq(master.id, row.id));
    }

    // Log to publish history
    await db.insert(publishHistory).values({
      publishedBy: "system/cron",
      rowsPublished: result.rowsPublished,
      jobId: result.jobId,
      dirtyCount: dirtyRows.length,
      changes: changesSnapshot,
    });

    console.log(
      `[BQ Sync Cron] Synced ${result.rowsPublished} products (Job: ${result.jobId})`
    );

    return NextResponse.json({
      success: true,
      synced: result.rowsPublished,
      jobId: result.jobId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[BQ Sync Cron] Failed:", message);
    return NextResponse.json(
      { error: `Sync failed: ${message}` },
      { status: 500 }
    );
  }
}

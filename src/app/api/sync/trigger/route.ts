/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { publishDirtyToBigQuery, publishToBigQuery } from "@/lib/bigquery";
import { db } from "@/lib/db";
import { master, publishHistory } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { unauthorized, forbidden, getErrorMessage } from "@/lib/api-utils";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();

  if (!canAccessSection(session, "publish")) return forbidden();

  let mode: "incremental" | "full" = "incremental";
  try {
    const body = await req.json();
    if (body?.mode === "full") mode = "full";
  } catch {
    // Default incremental
  }

  // Snapshot dirty products before sync
  const dirtyRows = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      changeLog: master.changeLog,
    })
    .from(master)
    .where(eq(master.isDirty, true));

  if (mode === "incremental" && dirtyRows.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No pending changes to sync",
      synced: 0,
    });
  }

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
    const result =
      mode === "full"
        ? await publishToBigQuery()
        : await publishDirtyToBigQuery();

    // Clear changeLogs
    if (dirtyRows.length > 0) {
      for (const row of dirtyRows) {
        await db
          .update(master)
          .set({ changeLog: [] })
          .where(eq(master.id, row.id));
      }
    }

    // Log to history
    await db.insert(publishHistory).values({
      publishedBy: session.user.email,
      rowsPublished: result.rowsPublished,
      jobId: result.jobId,
      dirtyCount: dirtyRows.length,
      changes: changesSnapshot,
    });

    return NextResponse.json({
      success: true,
      synced: result.rowsPublished,
      jobId: result.jobId,
      mode,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Sync failed: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}

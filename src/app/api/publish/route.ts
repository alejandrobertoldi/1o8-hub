/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { publishToBigQuery, publishDirtyToBigQuery, getPublishInfo } from "@/lib/bigquery";
import { db } from "@/lib/db";
import { publishHistory, master } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { unauthorized, forbidden, getErrorMessage } from "@/lib/api-utils";

export const maxDuration = 60;

export async function GET() {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (!canAccessSection(session, "publish")) return forbidden("Forbidden: admin only");

  const info = await getPublishInfo();
  return NextResponse.json(info);
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (!canAccessSection(session, "publish")) return forbidden("Forbidden: admin only");

  try {
    // Parse optional mode from request body (default: incremental)
    let mode: "incremental" | "full" = "incremental";
    try {
      const body = await req.json();
      if (body?.mode === "full") mode = "full";
    } catch {
      // No body or invalid JSON — use default
    }

    // Read dirty products with changeLogs before publish (they'll be reset after)
    const dirtyRows = await db
      .select({
        id: master.id,
        asin: master.asin,
        sku: master.sku,
        changeLog: master.changeLog,
      })
      .from(master)
      .where(eq(master.isDirty, true));
    const dirtyCount = dirtyRows.length;

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

    // Publish
    const result =
      mode === "full"
        ? await publishToBigQuery()
        : await publishDirtyToBigQuery();

    // Clear changeLogs on published products
    if (dirtyRows.length > 0) {
      const dirtyIds = dirtyRows.map((p) => p.id);
      for (const id of dirtyIds) {
        await db
          .update(master)
          .set({ changeLog: [] })
          .where(eq(master.id, id));
      }
    }

    // Log to publish history with snapshotted changes
    try {
      await db.insert(publishHistory).values({
        publishedBy: session.user.email,
        rowsPublished: result.rowsPublished,
        jobId: result.jobId,
        dirtyCount,
        changes: changesSnapshot,
      });
    } catch (historyErr) {
      console.error("Failed to log publish history:", historyErr);
    }

    return NextResponse.json({
      success: true,
      ...result,
      mode,
      dirtyCount,
      publishedAt: new Date().toISOString(),
      publishedBy: session.user.email,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: `Publish failed: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}

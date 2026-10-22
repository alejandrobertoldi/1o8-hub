/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, publishHistory } from "@/lib/db/schema";
import { eq, desc, count, sql } from "drizzle-orm";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pending changes count
  const [dirtyResult] = await db
    .select({ count: count() })
    .from(master)
    .where(eq(master.isDirty, true));

  // Total products
  const [totalResult] = await db
    .select({ count: count() })
    .from(master);

  // Last sync
  const [lastSync] = await db
    .select({
      id: publishHistory.id,
      publishedBy: publishHistory.publishedBy,
      publishedAt: publishHistory.publishedAt,
      rowsPublished: publishHistory.rowsPublished,
      jobId: publishHistory.jobId,
      dirtyCount: publishHistory.dirtyCount,
    })
    .from(publishHistory)
    .orderBy(desc(publishHistory.publishedAt))
    .limit(1);

  // Recent editors — unique emails from dirty products' changeLogs
  const dirtyProducts = await db
    .select({ changeLog: master.changeLog })
    .from(master)
    .where(eq(master.isDirty, true));

  const editors = new Set<string>();
  for (const p of dirtyProducts) {
    for (const entry of p.changeLog ?? []) {
      if (entry.changedBy) editors.add(entry.changedBy);
    }
  }

  return NextResponse.json({
    pendingChanges: dirtyResult.count,
    totalProducts: totalResult.count,
    lastSync: lastSync ?? null,
    pendingEditors: Array.from(editors),
  });
}

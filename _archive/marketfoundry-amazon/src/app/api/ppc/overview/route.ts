/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { aac, ppcSnapshots } from "@/lib/db/schema";
import { ilike, eq, and, desc, sql } from "drizzle-orm";

export const maxDuration = 30;

/**
 * GET /api/ppc/overview
 * Returns all active clients with their latest campaign snapshot for the dashboard cards.
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (!role || !isEditorOrAbove(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get active clients
  const activeClients = await db
    .select({
      clientIdCode: aac.clientIdCode,
      clientName: aac.clientName,
    })
    .from(aac)
    .where(ilike(aac.clientStatus, "active"));

  // Get latest campaign snapshot per client using a subquery
  const latestSnapshots = await db
    .select()
    .from(ppcSnapshots)
    .where(eq(ppcSnapshots.reportType, "campaign"))
    .orderBy(desc(ppcSnapshots.snapshotDate));

  // Build lookup: clientIdCode -> latest snapshot
  const snapshotMap = new Map<string, typeof latestSnapshots[0]>();
  for (const snap of latestSnapshots) {
    if (!snapshotMap.has(snap.clientIdCode)) {
      snapshotMap.set(snap.clientIdCode, snap);
    }
  }

  const clients = activeClients
    .filter((c) => c.clientIdCode)
    .map((c) => {
      const snap = snapshotMap.get(c.clientIdCode!);
      return {
        clientIdCode: c.clientIdCode!,
        clientName: c.clientName || c.clientIdCode!,
        latestSnapshot: snap
          ? {
              snapshotDate: snap.snapshotDate,
              summary: snap.summary,
              deltas: snap.deltas,
            }
          : null,
      };
    })
    // Sort: clients with data first, then alphabetical
    .sort((a, b) => {
      if (a.latestSnapshot && !b.latestSnapshot) return -1;
      if (!a.latestSnapshot && b.latestSnapshot) return 1;
      return a.clientName.localeCompare(b.clientName);
    });

  return NextResponse.json({ clients });
}

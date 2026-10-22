import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { supportTickets } from "@/lib/db/schema";
import { count as dbCount, sql, notInArray, eq, and, isNull, lt } from "drizzle-orm";

export const maxDuration = 60;

export async function GET() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [openCount] = await db
    .select({ count: dbCount() })
    .from(supportTickets)
    .where(notInArray(supportTickets.status, ["resolved", "closed"]));

  const [unassignedCount] = await db
    .select({ count: dbCount() })
    .from(supportTickets)
    .where(
      and(
        notInArray(supportTickets.status, ["resolved", "closed"]),
        isNull(supportTickets.assignedTo)
      )
    );

  const [slaBreachCount] = await db
    .select({ count: dbCount() })
    .from(supportTickets)
    .where(
      and(
        notInArray(supportTickets.status, ["resolved", "closed"]),
        lt(supportTickets.slaDeadline, new Date())
      )
    );

  const [avgResolution] = await db
    .select({
      avgHours: sql<number>`AVG(EXTRACT(EPOCH FROM (${supportTickets.resolvedAt} - ${supportTickets.createdAt})) / 3600)`,
    })
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.status, "resolved"),
        sql`${supportTickets.resolvedAt} > NOW() - INTERVAL '30 days'`
      )
    );

  return NextResponse.json({
    openCount: openCount?.count ?? 0,
    unassignedCount: unassignedCount?.count ?? 0,
    slaBreachCount: slaBreachCount?.count ?? 0,
    avgResolutionHours: Math.round(avgResolution?.avgHours ?? 0),
  });
}

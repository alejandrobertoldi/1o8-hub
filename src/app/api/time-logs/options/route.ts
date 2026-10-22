export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { teamDirectoryProfiles, users } from "@/lib/db/schema";
import { timeLogSession } from "@/lib/time-logs/auth";
import { listLoggableClients } from "@/lib/time-logs/server";
import { TIME_SETTINGS, WORK_TYPES } from "@/lib/time-logs/catalog";

/** GET /api/time-logs/options — dropdown data for the timesheet. */
export async function GET() {
  const me = await timeLogSession();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [clients, people] = await Promise.all([
    listLoggableClients(),
    // Admins can view / log for anyone on the active team.
    me.isAdmin
      ? db
          .select({ id: users.id, name: users.name })
          .from(users)
          .innerJoin(teamDirectoryProfiles, eq(teamDirectoryProfiles.userId, users.id))
          .where(and(eq(users.employmentStatus, "active")))
          .orderBy(asc(users.name))
      : Promise.resolve([]),
  ]);
  return NextResponse.json({
    me: me.userId,
    isAdmin: me.isAdmin,
    clients,
    workTypes: WORK_TYPES.map((w) => w.label),
    settings: TIME_SETTINGS,
    people,
  });
}

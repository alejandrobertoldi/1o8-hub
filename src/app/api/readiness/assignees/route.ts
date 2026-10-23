export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { asanaAssigneeMap, serviceProviders } from "@/lib/db/schema";
import { hasAdminPowers } from "@/lib/roles";
import { READINESS_DEPARTMENTS } from "@/lib/readiness/match";
import { listAssigneeMap } from "@/lib/readiness/server";
import { guarded } from "@/lib/db/guarded-route";

async function admin() {
  const session = await getAuthSession();
  return session && hasAdminPowers(session.user.role) ? session : null;
}

/** GET — every Asana assignee with its mapping (admins). */
async function getHandler() {
  if (!(await admin())) return NextResponse.json({ error: "Only admins can edit the assignee mapping" }, { status: 403 });
  const [assignees, providers] = await Promise.all([
    listAssigneeMap(),
    db.select({ id: serviceProviders.id, name: serviceProviders.name, status: serviceProviders.status }).from(serviceProviders).orderBy(asc(serviceProviders.name)),
  ]);
  return NextResponse.json({ departments: READINESS_DEPARTMENTS, assignees, providers });
}

const patchSchema = z.object({
  assigneeKey: z.string().min(1),
  userId: z.string().uuid().nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  department: z.enum(READINESS_DEPARTMENTS).nullable().optional(),
  excluded: z.boolean().optional(),
});

/** PATCH — link an assignee to a person or a service provider, set its department, or exclude it. */
export async function PATCH(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: "Only admins can edit the assignee mapping" }, { status: 403 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { assigneeKey, ...set } = parsed.data;
  // An assignee is either a team member or a service provider, never both.
  if (set.userId) set.providerId = null;
  else if (set.providerId) set.userId = null;
  const res = await db
    .update(asanaAssigneeMap)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(asanaAssigneeMap.assigneeKey, assigneeKey))
    .returning({ key: asanaAssigneeMap.assigneeKey });
  return res.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export const GET = guarded("GET /api/readiness/assignees", 15_000, getHandler);

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { teamDirectoryProfiles, userDepartmentLeads, users } from "@/lib/db/schema";
import { hasAdminPowers } from "@/lib/roles";
import { directoryInputSchema, splitDirectoryInput } from "@/lib/team/directory";

type Ctx = { params: Promise<{ userId: string }> };

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!hasAdminPowers(session.user.role)) {
    return { error: NextResponse.json({ error: "Only admins can change the team directory" }, { status: 403 }) };
  }
  return { session };
}

/** PATCH — admins edit a person's directory entry; send only the fields that change. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { userId } = await params;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  // Partial update: overlay the body on the person's current values, then
  // validate the whole record so a single-field edit can't leave it invalid.
  const [current] = await db
    .select({ user: users, profile: teamDirectoryProfiles })
    .from(users)
    .leftJoin(teamDirectoryProfiles, eq(teamDirectoryProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = current.profile;
  const base = {
    name: current.user.name ?? "",
    email: current.user.email,
    title: current.user.jobTitle ?? "",
    departments: current.user.departments,
    phone: current.user.phone ?? "",
    company: p?.company ?? "",
    expertise: p?.expertise ?? "",
    employmentType: p?.employmentType ?? "",
    location: p?.location ?? "",
    timeZone: p?.timeZone ?? "",
    workDays: p?.workDays ?? [],
    workStartLocal: p?.workStartLocal ?? "",
    workEndLocal: p?.workEndLocal ?? "",
    workStartChicago: p?.workStartChicago ?? "",
    workEndChicago: p?.workEndChicago ?? "",
  };
  const unknown = Object.keys(body).filter((k) => !(k in base));
  if (unknown.length) return NextResponse.json({ error: `Unknown field(s): ${unknown.join(", ")}` }, { status: 400 });
  // null clears a text field
  const overlay = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v === null ? "" : v]));
  const parsed = directoryInputSchema.safeParse({ ...base, ...overlay });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { user, profile } = splitDirectoryInput(parsed.data);
  // Keep the full title list unless the title itself changed.
  const userSet = "title" in body ? user : { ...user, jobTitles: current.user.jobTitles };

  const [clash] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, user.email), ne(users.id, userId))).limit(1);
  if (clash) return NextResponse.json({ error: `${user.email} belongs to another person` }, { status: 409 });

  const updated = await db.transaction(async (tx) => {
    const res = await tx.update(users).set({ ...userSet, updatedAt: new Date() }).where(eq(users.id, userId)).returning({ id: users.id });
    if (!res.length) return false;
    await tx
      .insert(teamDirectoryProfiles)
      .values({ userId, ...profile, source: "hub" })
      .onConflictDoUpdate({ target: teamDirectoryProfiles.userId, set: { ...profile, source: "hub", updatedAt: new Date() } });
    return true;
  });
  return updated ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * DELETE — admins remove a person from the team. Soft: employment_status
 * becomes 'alumni' and their department-lead seats are freed; the account,
 * logged hours and history are kept. Re-adding them (POST) reactivates it.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { userId } = await params;
  if (session.user.id === userId) {
    return NextResponse.json({ error: "You can't remove yourself from the team" }, { status: 400 });
  }
  const res = await db.transaction(async (tx) => {
    const r = await tx
      .update(users)
      .set({ employmentStatus: "alumni", updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    await tx.delete(userDepartmentLeads).where(eq(userDepartmentLeads.userId, userId));
    return r;
  });
  return res.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

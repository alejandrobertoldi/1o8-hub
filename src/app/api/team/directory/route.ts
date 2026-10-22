export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { teamDirectoryProfiles, users } from "@/lib/db/schema";
import { hasAdminPowers } from "@/lib/roles";
import { directoryInputSchema, listDirectory, splitDirectoryInput } from "@/lib/team/directory";

/** GET /api/team/directory — the 1o8 team directory, readable by every hub user. */
export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listDirectory());
}

/**
 * POST /api/team/directory — admins add a person to the team. Re-adding
 * someone who left (alumni) reactivates their existing account instead of
 * creating a duplicate.
 */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Only admins can add people to the team" }, { status: 403 });
  }

  const parsed = directoryInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { user, profile } = splitDirectoryInput(parsed.data);

  const [existing] = await db.select({ id: users.id, status: users.employmentStatus }).from(users).where(eq(users.email, user.email)).limit(1);
  if (existing?.status === "active") {
    const [inDirectory] = await db.select({ id: teamDirectoryProfiles.userId }).from(teamDirectoryProfiles).where(eq(teamDirectoryProfiles.userId, existing.id)).limit(1);
    if (inDirectory) return NextResponse.json({ error: `${user.email} is already on the team` }, { status: 409 });
  }

  const userId = await db.transaction(async (tx) => {
    let id = existing?.id;
    if (id) {
      await tx.update(users).set({ ...user, employmentStatus: "active", updatedAt: new Date() }).where(eq(users.id, id));
    } else {
      // New team members get the standard internal role; admins adjust it in Admin → Users.
      const [created] = await tx.insert(users).values({ ...user, role: "editor", employmentStatus: "active" }).returning({ id: users.id });
      id = created.id;
    }
    await tx
      .insert(teamDirectoryProfiles)
      .values({ userId: id, ...profile, source: "hub" })
      .onConflictDoUpdate({ target: teamDirectoryProfiles.userId, set: { ...profile, source: "hub", updatedAt: new Date() } });
    return id;
  });

  return NextResponse.json({ id: userId }, { status: 201 });
}

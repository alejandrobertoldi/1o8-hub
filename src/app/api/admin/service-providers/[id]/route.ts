export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { serviceProviders } from "@/lib/db/schema";
import { hasAdminPowers } from "@/lib/roles";
import { syncAssigneeMap } from "@/lib/readiness/server";
import { providerSchema } from "@/lib/service-providers";

async function admin() {
  const session = await getAuthSession();
  return session && hasAdminPowers(session.user.role) ? session : null;
}

type Ctx = { params: Promise<{ id: string }> };

/** PATCH — edit a provider (any subset of fields). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await admin())) return NextResponse.json({ error: "Only admins can manage service providers" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = providerSchema.partial().safeParse(body);
  if (!parsed.success || !body) return NextResponse.json({ error: parsed.error?.issues[0].message ?? "Invalid body" }, { status: 400 });
  // .partial() keeps zod defaults; only write the keys the client sent.
  const set = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => k in body));
  if (set.name) {
    const [dup] = await db
      .select({ id: serviceProviders.id })
      .from(serviceProviders)
      .where(and(eq(serviceProviders.name, String(set.name)), ne(serviceProviders.id, id)))
      .limit(1);
    if (dup) return NextResponse.json({ error: "A provider with that name already exists" }, { status: 409 });
  }
  const [row] = await db
    .update(serviceProviders)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(serviceProviders.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ("emails" in set || "name" in set) await syncAssigneeMap();
  return NextResponse.json(row);
}

/**
 * DELETE — removes the provider. Its Asana assignees stay on the board,
 * unlinked (asana_assignee_map.provider_id is set null by the FK); past
 * snapshots keep its name. To keep history linked, set status "inactive".
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!(await admin())) return NextResponse.json({ error: "Only admins can manage service providers" }, { status: 403 });
  const { id } = await params;
  const res = await db.delete(serviceProviders).where(eq(serviceProviders.id, id)).returning({ id: serviceProviders.id });
  return res.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

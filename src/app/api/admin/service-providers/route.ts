export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { serviceProviders } from "@/lib/db/schema";
import { hasAdminPowers } from "@/lib/roles";
import { listAssigneeMap, syncAssigneeMap } from "@/lib/readiness/server";
import { providerSchema, type ProviderWithWork } from "@/lib/service-providers";

async function admin() {
  const session = await getAuthSession();
  return session && hasAdminPowers(session.user.role) ? session : null;
}

/** GET — every service provider with the Asana assignees linked to it (admins). */
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Only admins can manage service providers" }, { status: 403 });
  const [providers, map] = await Promise.all([
    db.select().from(serviceProviders).orderBy(asc(serviceProviders.name)),
    listAssigneeMap(),
  ]);
  const result: ProviderWithWork[] = providers.map((p) => {
    const assignees = map
      .filter((m) => m.providerId === p.id)
      .map((m) => ({ assigneeKey: m.assigneeKey, assigneeName: m.assigneeName, open: m.open }));
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      contactName: p.contactName,
      department: p.department,
      services: p.services,
      emails: p.emails,
      website: p.website,
      location: p.location,
      timeZone: p.timeZone,
      status: p.status,
      notes: p.notes,
      assignees,
      open: assignees.reduce((s, a) => s + a.open, 0),
    };
  });
  return NextResponse.json(result);
}

/** POST — add a provider; Asana assignees with its emails / name get linked. */
export async function POST(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: "Only admins can manage service providers" }, { status: 403 });
  const parsed = providerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const [row] = await db.insert(serviceProviders).values(parsed.data).onConflictDoNothing().returning();
  if (!row) return NextResponse.json({ error: "A provider with that name already exists" }, { status: 409 });
  await syncAssigneeMap();
  return NextResponse.json(row, { status: 201 });
}

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { opportunitySchema } from "@/lib/new-business";
import { NEW_BUSINESS_FORBIDDEN as FORBIDDEN, newBusinessSession } from "@/lib/new-business/auth";
import { createOpportunity, listOpportunities } from "@/lib/new-business/server";

const STAFF = ["owner", "super_admin", "admin", "editor", "viewer"] as const;

/** GET — the whole pipeline, plus the staff who can own an opportunity. */
export async function GET() {
  if (!(await newBusinessSession())) return NextResponse.json(FORBIDDEN, { status: 403 });
  const [opportunities, owners] = await Promise.all([
    listOpportunities(),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.role, STAFF)).orderBy(asc(users.name)),
  ]);
  return NextResponse.json({ opportunities, owners: owners.map((o) => ({ id: o.id, name: o.name ?? o.email })) });
}

/** POST — add an opportunity; it gets the next pitch number (1O87xxxx) for Hours. */
export async function POST(req: NextRequest) {
  const session = await newBusinessSession();
  if (!session) return NextResponse.json(FORBIDDEN, { status: 403 });
  const parsed = opportunitySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const row = await createOpportunity(parsed.data, session.user.id);
  return NextResponse.json(row, { status: 201 });
}

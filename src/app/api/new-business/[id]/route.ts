export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { newBusinessOpportunities, timeLogs } from "@/lib/db/schema";
import { opportunitySchema, pitchProjectNumber } from "@/lib/new-business";
import { updateOpportunity } from "@/lib/new-business/server";
import { INTERNAL_CLIENT_CODE } from "@/lib/time-logs/catalog";
import { NEW_BUSINESS_FORBIDDEN as FORBIDDEN, newBusinessSession } from "@/lib/new-business/auth";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH — edit any subset of fields; a new stage is stamped in the history. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await newBusinessSession();
  if (!session) return NextResponse.json(FORBIDDEN, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = opportunitySchema.partial().safeParse(body);
  if (!parsed.success || !body) return NextResponse.json({ error: parsed.error?.issues[0].message ?? "Invalid body" }, { status: 400 });
  // .partial() keeps zod defaults; only write the keys the client sent.
  const set = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => k in body));
  const row = await updateOpportunity(id, set, session.user.id);
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * DELETE — only for a mistaken entry: once hours are logged to its pitch
 * number it must stay (mark it Lost or On hold instead) so the hours keep a home.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!(await newBusinessSession())) return NextResponse.json(FORBIDDEN, { status: 403 });
  const { id } = await params;
  const [opp] = await db.select({ seq: newBusinessOpportunities.seq }).from(newBusinessOpportunities).where(eq(newBusinessOpportunities.id, id)).limit(1);
  if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [logged] = await db
    .select({ id: timeLogs.id })
    .from(timeLogs)
    .where(and(eq(timeLogs.clientIdCode, INTERNAL_CLIENT_CODE), eq(timeLogs.projectNumber, pitchProjectNumber(opp.seq))))
    .limit(1);
  if (logged) return NextResponse.json({ error: "Hours are logged to this pitch: mark it Lost or On hold instead" }, { status: 409 });
  await db.delete(newBusinessOpportunities).where(eq(newBusinessOpportunities.id, id));
  return NextResponse.json({ ok: true });
}

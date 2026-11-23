export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { hasAdminPowers } from "@/lib/roles";
import { CREDIT_SETTING_KEY, parseCredit } from "@/lib/system-health/anthropic";

/** PUT { amountUsd, asOf: "YYYY-MM-DD" } — the Claude credit balance shown in the Claude Console on that date. */
export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { amountUsd?: unknown; asOf?: unknown } | null;
  const credit = parseCredit(JSON.stringify({ amountUsd: Number(body?.amountUsd), asOf: body?.asOf }));
  if (!credit || credit.amountUsd < 0) return NextResponse.json({ error: "Give the balance in USD and its date (YYYY-MM-DD)" }, { status: 400 });
  if (credit.asOf > new Date().toISOString().slice(0, 10)) return NextResponse.json({ error: "The date can't be in the future" }, { status: 400 });
  const value = JSON.stringify(credit);
  const updatedBy = session.user.email ?? "";
  await db
    .insert(seoSettings)
    .values({ key: CREDIT_SETTING_KEY, value, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({ target: seoSettings.key, set: { value, updatedBy, updatedAt: new Date() } });
  return NextResponse.json({ ok: true, credit });
}

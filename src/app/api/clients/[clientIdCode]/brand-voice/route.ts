import { hasAdminPowers } from "@/lib/roles";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { brandVoiceSchema } from "@/lib/brand-voice/types";
import { getBrandVoice, saveBrandVoice } from "@/lib/brand-voice/queries";

type Ctx = { params: Promise<{ clientIdCode: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientIdCode } = await params;
  return NextResponse.json(await getBrandVoice(clientIdCode));
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { clientIdCode } = await params;

  const [client] = await db.select({ id: aac.id }).from(aac).where(eq(aac.clientIdCode, clientIdCode)).limit(1);
  if (!client) return NextResponse.json({ error: `Client ${clientIdCode} not found` }, { status: 404 });

  const parsed = brandVoiceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `${issue.path.join(".") || "body"}: ${issue.message}` }, { status: 400 });
  }

  await saveBrandVoice(clientIdCode, parsed.data, { source: "hub", updatedBy: session.user.email ?? null });
  return NextResponse.json(await getBrandVoice(clientIdCode));
}

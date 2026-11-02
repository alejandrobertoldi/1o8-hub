import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { ppcAlerts } from "@/lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (!role || !isEditorOrAbove(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const clientIdCode = searchParams.get("clientIdCode");
  const activeOnly = searchParams.get("activeOnly") !== "false";

  if (!clientIdCode) return NextResponse.json({ error: "clientIdCode required" }, { status: 400 });

  const conditions = [eq(ppcAlerts.clientIdCode, clientIdCode)];
  if (activeOnly) conditions.push(isNull(ppcAlerts.acknowledgedAt));

  const rows = await db
    .select()
    .from(ppcAlerts)
    .where(and(...conditions))
    .orderBy(desc(ppcAlerts.createdAt))
    .limit(50);

  return NextResponse.json({ alerts: rows });
}

/** PUT /api/ppc/alerts — acknowledge an alert */
export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (!role || !isEditorOrAbove(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id } = body as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const [row] = await db
    .update(ppcAlerts)
    .set({
      acknowledgedAt: new Date(),
      acknowledgedBy: (session.user as { id: string }).id,
    })
    .where(eq(ppcAlerts.id, id))
    .returning();

  return NextResponse.json({ alert: row });
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { ppcDecisions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (!role || !isEditorOrAbove(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientIdCode = new URL(req.url).searchParams.get("clientIdCode");
  if (!clientIdCode) return NextResponse.json({ error: "clientIdCode required" }, { status: 400 });

  const rows = await db
    .select()
    .from(ppcDecisions)
    .where(eq(ppcDecisions.clientIdCode, clientIdCode))
    .orderBy(desc(ppcDecisions.decidedAt))
    .limit(50);

  return NextResponse.json({ decisions: rows });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (!role || !isEditorOrAbove(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { clientIdCode, decision, expectedOutcome, expectedMetric, expectedValue } = body as {
    clientIdCode: string;
    decision: string;
    expectedOutcome?: string;
    expectedMetric?: string;
    expectedValue?: number;
  };

  if (!clientIdCode || !decision) {
    return NextResponse.json({ error: "clientIdCode and decision required" }, { status: 400 });
  }

  const [row] = await db
    .insert(ppcDecisions)
    .values({
      clientIdCode,
      decision,
      expectedOutcome: expectedOutcome || null,
      expectedMetric: expectedMetric || null,
      expectedValue: expectedValue?.toString() || null,
      decidedBy: (session.user as { id: string }).id,
    })
    .returning();

  return NextResponse.json({ decision: row }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (!role || !isEditorOrAbove(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, actualOutcome, actualMetric, actualValue } = body as {
    id: string;
    actualOutcome?: string;
    actualMetric?: string;
    actualValue?: number;
  };

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const [row] = await db
    .update(ppcDecisions)
    .set({
      actualOutcome: actualOutcome || null,
      actualMetric: actualMetric || null,
      actualValue: actualValue?.toString() || null,
      measuredAt: new Date(),
    })
    .where(eq(ppcDecisions.id, id))
    .returning();

  return NextResponse.json({ decision: row });
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { ppcApprovals } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { hasAdminPowers, isEditorOrAbove } from "@/lib/roles";

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
    .from(ppcApprovals)
    .where(eq(ppcApprovals.clientIdCode, clientIdCode))
    .orderBy(desc(ppcApprovals.requestedAt))
    .limit(50);

  return NextResponse.json({ approvals: rows });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (!role || !isEditorOrAbove(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { clientIdCode, approvalType, description } = body as {
    clientIdCode: string;
    approvalType: string;
    description: string;
  };

  if (!clientIdCode || !approvalType || !description) {
    return NextResponse.json({ error: "clientIdCode, approvalType, description required" }, { status: 400 });
  }

  const [row] = await db
    .insert(ppcApprovals)
    .values({
      clientIdCode,
      approvalType,
      description,
      requestedBy: (session.user as { id: string }).id,
    })
    .returning();

  return NextResponse.json({ approval: row }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (!hasAdminPowers(role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { id, action } = body as { id: string; action: "approve" | "reject" };

  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  const userId = (session.user as { id: string }).id;
  const now = new Date();

  const updates = action === "approve"
    ? { status: "approved" as const, approvedAt: now, approvedBy: userId }
    : { status: "rejected" as const, rejectedAt: now, rejectedBy: userId };

  const [row] = await db
    .update(ppcApprovals)
    .set(updates)
    .where(eq(ppcApprovals.id, id))
    .returning();

  return NextResponse.json({ approval: row });
}

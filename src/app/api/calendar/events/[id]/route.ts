import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { calendarEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

const VALID_TYPES = ["holiday", "deadline", "content", "milestone", "pto"] as const;
type ValidType = (typeof VALID_TYPES)[number];

function isValidType(v: unknown): v is ValidType {
  return typeof v === "string" && (VALID_TYPES as readonly string[]).includes(v);
}

function isValidDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// PATCH /api/calendar/events/[id] — update fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const existing = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, id))
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const current = existing[0];

  const { title, startDate, endDate, type, memberName, description } = body as {
    title?: string;
    startDate?: string;
    endDate?: string;
    type?: string;
    memberName?: string | null;
    description?: string | null;
  };

  const updates: {
    title?: string;
    startDate?: string;
    endDate?: string;
    type?: ValidType;
    memberName?: string | null;
    description?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (title !== undefined) {
    if (!title.trim()) {
      return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    }
    updates.title = title.trim();
  }
  if (startDate !== undefined) {
    if (!isValidDate(startDate)) {
      return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    }
    updates.startDate = startDate;
  }
  if (endDate !== undefined) {
    if (!isValidDate(endDate)) {
      return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
    }
    updates.endDate = endDate;
  }
  if (type !== undefined) {
    if (!isValidType(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    updates.type = type;
  }
  if (memberName !== undefined) {
    updates.memberName = memberName?.trim() || null;
  }
  if (description !== undefined) {
    updates.description = description?.trim() || null;
  }

  const finalStart = updates.startDate ?? current.startDate;
  const finalEnd = updates.endDate ?? current.endDate;
  if (finalEnd < finalStart) {
    return NextResponse.json(
      { error: "endDate must be on or after startDate" },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(calendarEvents)
    .set(updates)
    .where(eq(calendarEvents.id, id))
    .returning();

  return NextResponse.json(updated);
}

// DELETE /api/calendar/events/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const deleted = await db
    .delete(calendarEvents)
    .where(eq(calendarEvents.id, id))
    .returning({ id: calendarEvents.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

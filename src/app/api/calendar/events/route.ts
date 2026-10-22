import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { calendarEvents } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

const VALID_TYPES = ["holiday", "deadline", "content", "milestone", "pto"] as const;
type ValidType = (typeof VALID_TYPES)[number];

function isValidType(v: unknown): v is ValidType {
  return typeof v === "string" && (VALID_TYPES as readonly string[]).includes(v);
}

function isValidDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// GET /api/calendar/events — list all
export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(calendarEvents)
    .orderBy(asc(calendarEvents.startDate));

  return NextResponse.json(rows);
}

// POST /api/calendar/events — create new
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { title, startDate, endDate, type, memberName, description } = body as {
    title?: string;
    startDate?: string;
    endDate?: string;
    type?: string;
    memberName?: string;
    description?: string;
  };

  if (!title?.trim() || !isValidDate(startDate) || !isValidType(type)) {
    return NextResponse.json(
      { error: "title, startDate (YYYY-MM-DD), and type are required" },
      { status: 400 }
    );
  }

  const finalEnd = isValidDate(endDate) ? endDate : startDate;
  if (finalEnd < startDate) {
    return NextResponse.json(
      { error: "endDate must be on or after startDate" },
      { status: 400 }
    );
  }

  const [inserted] = await db
    .insert(calendarEvents)
    .values({
      title: title.trim(),
      startDate,
      endDate: finalEnd,
      type,
      memberName: memberName?.trim() || null,
      description: description?.trim() || null,
    })
    .returning();

  return NextResponse.json(inserted, { status: 201 });
}

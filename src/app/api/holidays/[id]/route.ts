import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { publicHolidays } from "@/lib/db/schema";
import { isDateString } from "@/lib/time-off/working-days";
import { hasAdminPowers } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Postgres `unique_violation`. Same helper as POST /api/holidays — the
 * `postgres` driver copies SQLSTATE onto `err.code` as a string.
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

// PATCH /api/holidays/[id] — admin only. Update date and/or name; country
// stays fixed (rows live under a country tab). Duplicate dates for the same
// country 409 the same way POST does.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { holidayDate, name } = body as {
    holidayDate?: unknown;
    name?: unknown;
  };

  const updates: { holidayDate?: string; name?: string } = {};

  if (holidayDate !== undefined) {
    if (!isDateString(holidayDate)) {
      return NextResponse.json(
        { error: "holidayDate must be a valid YYYY-MM-DD date" },
        { status: 400 }
      );
    }
    updates.holidayDate = holidayDate;
  }

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    updates.name = name.trim().slice(0, 120);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Provide holidayDate and/or name to update" },
      { status: 400 }
    );
  }

  try {
    const [updated] = await db
      .update(publicHolidays)
      .set(updates)
      .where(eq(publicHolidays.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "That country already has a holiday on that date" },
        { status: 409 }
      );
    }
    console.error("[holidays] update failed:", err);
    return NextResponse.json(
      { error: "Failed to update holiday" },
      { status: 500 }
    );
  }
}

// DELETE /api/holidays/[id] — admin only. Reference data, safe to remove.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [deleted] = await db
    .delete(publicHolidays)
    .where(eq(publicHolidays.id, id))
    .returning();

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: deleted.id });
}

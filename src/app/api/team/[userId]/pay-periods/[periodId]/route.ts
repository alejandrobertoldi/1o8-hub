import { NextRequest, NextResponse, after } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPayPeriods } from "@/lib/db/schema";
import { requireTier } from "@/lib/team/guards";
import { isDateString, overlaps } from "@/lib/time-off/working-days";
import { logEventAsync } from "@/lib/event-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPEN_ENDED = "9999-12-31";

/**
 * PATCH may only touch these three columns. contractType, rateAmount,
 * rateCurrency and ratePeriod are real columns on this table but are NOT
 * writable through this route — accepting and silently discarding them would
 * look exactly like a successful save (the same doctrine PATCH
 * /api/team/[userId] enforces via isKnownField/canWriteField).
 */
const WRITABLE_KEYS = new Set(["effectiveFrom", "effectiveTo", "note"]);

function isExclusionViolation(err: unknown): boolean {
  const cause = (err as { cause?: unknown })?.cause;
  const src = (cause ?? err) as { code?: unknown };
  return src?.code === "23P01";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; periodId: string }> }
) {
  const { userId, periodId } = await params;
  const guard = await requireTier("superadmin", userId);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const patch = body as Record<string, unknown>;

  // 400 before any read. A rejected request must touch the database zero
  // times — this check runs before db.select and before any write.
  const rejected = Object.keys(patch).filter((k) => !WRITABLE_KEYS.has(k));
  if (rejected.length > 0) {
    return NextResponse.json(
      { error: `Not writable via PATCH: ${rejected.join(", ")}` },
      { status: 400 }
    );
  }
  const { effectiveFrom, effectiveTo, note } = patch;

  const [current] = await db
    .select()
    .from(userPayPeriods)
    .where(and(eq(userPayPeriods.id, periodId), eq(userPayPeriods.userId, userId)))
    .limit(1);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextFrom = effectiveFrom === undefined ? current.effectiveFrom : effectiveFrom;
  const nextTo = effectiveTo === undefined ? current.effectiveTo : effectiveTo;

  if (!isDateString(nextFrom)) {
    return NextResponse.json(
      { error: "effectiveFrom must be a valid date in YYYY-MM-DD format" },
      { status: 400 }
    );
  }
  if (nextTo !== null && !isDateString(nextTo)) {
    return NextResponse.json(
      { error: "effectiveTo must be a valid date in YYYY-MM-DD format, or null" },
      { status: 400 }
    );
  }
  if (nextTo !== null && (nextTo as string) < nextFrom) {
    return NextResponse.json(
      { error: "effectiveTo must be on or after effectiveFrom" },
      { status: 400 }
    );
  }

  // Same pre-check as POST, but excluding the row being edited — otherwise
  // every period would collide with itself.
  const others = await db
    .select({
      effectiveFrom: userPayPeriods.effectiveFrom,
      effectiveTo: userPayPeriods.effectiveTo,
    })
    .from(userPayPeriods)
    .where(and(eq(userPayPeriods.userId, userId), ne(userPayPeriods.id, periodId)));

  const clash = others.find((r) =>
    overlaps(
      nextFrom,
      (nextTo as string | null) ?? OPEN_ENDED,
      r.effectiveFrom,
      r.effectiveTo ?? OPEN_ENDED
    )
  );
  if (clash) {
    return NextResponse.json(
      {
        error: `That period overlaps an existing one (${clash.effectiveFrom} → ${
          clash.effectiveTo ?? "ongoing"
        }).`,
      },
      { status: 409 }
    );
  }

  const updateSet: Record<string, unknown> = {
    effectiveFrom: nextFrom,
    effectiveTo: (nextTo as string | null) ?? null,
    ...(note === undefined
      ? {}
      : { note: typeof note === "string" && note.trim() ? note.trim() : null }),
  };

  try {
    await db
      .update(userPayPeriods)
      .set(updateSet)
      .where(and(eq(userPayPeriods.id, periodId), eq(userPayPeriods.userId, userId)));
  } catch (err) {
    if (isExclusionViolation(err)) {
      return NextResponse.json(
        { error: "That period overlaps an existing one" },
        { status: 409 }
      );
    }
    console.error("[pay-periods] update failed:", err);
    return NextResponse.json(
      { error: "Failed to update pay period" },
      { status: 500 }
    );
  }

  after(
    logEventAsync({
      userEmail: guard.session.user.email,
      userName: guard.session.user.name ?? null,
      section: "admin",
      action: "user:pay-period:update",
      status: "success",
      resourceType: "user",
      resourceId: userId,
      // The columns actually written by the UPDATE above — never the request
      // body's keys, which can diverge from what the SET clause wrote (e.g. a
      // body with no `note` still applies a full row update).
      detail: { payPeriodId: periodId, fields: Object.keys(updateSet) },
    })
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string; periodId: string }> }
) {
  const { userId, periodId } = await params;
  const guard = await requireTier("superadmin", userId);
  if (!guard.ok) return guard.response;

  // .returning() so the handler can tell "deleted one row" from "matched
  // nothing". Without it a stale or bogus periodId answered 200 AND wrote an
  // audit row for a deletion that never happened, while PATCH 404s in the
  // identical case. Nothing is logged on the 404 path.
  const deleted = await db
    .delete(userPayPeriods)
    .where(and(eq(userPayPeriods.id, periodId), eq(userPayPeriods.userId, userId)))
    .returning({ id: userPayPeriods.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  after(
    logEventAsync({
      userEmail: guard.session.user.email,
      userName: guard.session.user.name ?? null,
      section: "admin",
      action: "user:pay-period:delete",
      status: "success",
      resourceType: "user",
      resourceId: userId,
      detail: { payPeriodId: periodId },
    })
  );

  return NextResponse.json({ success: true });
}

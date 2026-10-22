import { NextRequest, NextResponse, after } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPayPeriods } from "@/lib/db/schema";
import { requireTier } from "@/lib/team/guards";
import { isDateString, overlaps } from "@/lib/time-off/working-days";
import { logEventAsync } from "@/lib/event-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTRACT_TYPES = new Set(["hourly", "salaried", "contractor"]);
const RATE_PERIODS = new Set(["hour", "month", "year"]);

/**
 * The only keys POST accepts. Silently dropping an unknown key looks exactly
 * like a successful save: a typo'd `effectiveto` would yield a 201 for an
 * OPEN-ENDED period, which then 409s every later add against the
 * `user_pay_periods_no_overlap` EXCLUDE constraint. Mirrors WRITABLE_KEYS in
 * payment/route.ts and the unknown-field 400 in team/[userId]/route.ts.
 */
const WRITABLE_KEYS = new Set([
  "effectiveFrom",
  "effectiveTo",
  "contractType",
  "rateAmount",
  "rateCurrency",
  "ratePeriod",
  "note",
]);

/**
 * The sentinel used ONLY for the in-memory overlap pre-check. A NULL
 * effective_to means "in force indefinitely", and overlaps() needs two real
 * date strings. It is never written to the database — the column stays NULL.
 */
const OPEN_ENDED = "9999-12-31";

/**
 * Postgres `exclusion_violation`. The `postgres` driver copies the server's
 * SQLSTATE onto `err.code` as a string; drizzle may wrap the driver error, so
 * unwrap `cause` too — reading `.code` off the top level alone has silently
 * yielded undefined on this codebase before.
 */
function isExclusionViolation(err: unknown): boolean {
  const cause = (err as { cause?: unknown })?.cause;
  const src = (cause ?? err) as { code?: unknown };
  return src?.code === "23P01";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const guard = await requireTier("superadmin", userId);
  if (!guard.ok) return guard.response;

  const rows = await db
    .select()
    .from(userPayPeriods)
    .where(eq(userPayPeriods.userId, userId))
    .orderBy(desc(userPayPeriods.effectiveFrom));
  return NextResponse.json(rows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const guard = await requireTier("superadmin", userId);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  // 400 before any database access — a rejected request must touch the
  // database zero times.
  const unknown = Object.keys(body as Record<string, unknown>).filter(
    (k) => !WRITABLE_KEYS.has(k)
  );
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Unknown field(s): ${unknown.join(", ")}` },
      { status: 400 }
    );
  }

  const {
    effectiveFrom,
    effectiveTo,
    contractType,
    rateAmount,
    rateCurrency,
    ratePeriod,
    note,
  } = body as Record<string, unknown>;

  if (!isDateString(effectiveFrom)) {
    return NextResponse.json(
      { error: "effectiveFrom must be a valid date in YYYY-MM-DD format" },
      { status: 400 }
    );
  }
  if (effectiveTo !== null && effectiveTo !== undefined && !isDateString(effectiveTo)) {
    return NextResponse.json(
      { error: "effectiveTo must be a valid date in YYYY-MM-DD format, or null" },
      { status: 400 }
    );
  }
  const to = (effectiveTo as string | null | undefined) ?? null;
  // Lexicographic comparison is valid: YYYY-MM-DD sorts chronologically.
  if (to !== null && to < effectiveFrom) {
    return NextResponse.json(
      { error: "effectiveTo must be on or after effectiveFrom" },
      { status: 400 }
    );
  }
  if (typeof contractType !== "string" || !CONTRACT_TYPES.has(contractType)) {
    return NextResponse.json(
      { error: "contractType must be one of hourly, salaried, contractor" },
      { status: 400 }
    );
  }
  if (typeof ratePeriod !== "string" || !RATE_PERIODS.has(ratePeriod)) {
    return NextResponse.json(
      { error: "ratePeriod must be one of hour, month, year" },
      { status: 400 }
    );
  }
  if (typeof rateCurrency !== "string" || !/^[A-Za-z]{3}$/.test(rateCurrency)) {
    return NextResponse.json(
      { error: "rateCurrency must be a three-letter ISO code" },
      { status: 400 }
    );
  }
  // Number(null) / Number("") / Number([]) / Number(false) are all 0, which
  // would otherwise sail past the finite/non-negative check below and
  // silently store a real $0.00 pay rate. Only a JSON number or a non-empty
  // numeric string is an intentional rate value.
  if (
    typeof rateAmount !== "number" &&
    !(typeof rateAmount === "string" && rateAmount.trim() !== "")
  ) {
    return NextResponse.json(
      { error: "rateAmount must be a non-negative number" },
      { status: 400 }
    );
  }
  const amount = Number(rateAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json(
      { error: "rateAmount must be a non-negative number" },
      { status: 400 }
    );
  }

  // Friendly fast path in front of the EXCLUDE constraint. Reuses overlaps()
  // from working-days.ts rather than reimplementing interval maths.
  const existing = await db
    .select({
      effectiveFrom: userPayPeriods.effectiveFrom,
      effectiveTo: userPayPeriods.effectiveTo,
    })
    .from(userPayPeriods)
    .where(eq(userPayPeriods.userId, userId));

  const clash = existing.find((r) =>
    overlaps(effectiveFrom, to ?? OPEN_ENDED, r.effectiveFrom, r.effectiveTo ?? OPEN_ENDED)
  );
  if (clash) {
    return NextResponse.json(
      {
        error: `That period overlaps an existing one (${clash.effectiveFrom} → ${
          clash.effectiveTo ?? "ongoing"
        }). Close the earlier period first.`,
      },
      { status: 409 }
    );
  }

  try {
    const [inserted] = await db
      .insert(userPayPeriods)
      .values({
        userId,
        effectiveFrom,
        effectiveTo: to,
        contractType: contractType as "hourly" | "salaried" | "contractor",
        // numeric(12,2) is a STRING at the driver boundary. toFixed(2) also
        // keeps a value like 5200 from storing as "5200" and reading back as
        // "5200.00", which would look like a silent edit in the history table.
        rateAmount: amount.toFixed(2),
        rateCurrency: rateCurrency.toUpperCase(),
        ratePeriod: ratePeriod as "hour" | "month" | "year",
        note: typeof note === "string" && note.trim() ? note.trim() : null,
        createdBy: guard.session.user.id,
      })
      .returning();

    after(
      logEventAsync({
        userEmail: guard.session.user.email,
        userName: guard.session.user.name ?? null,
        section: "admin",
        action: "user:pay-period:create",
        status: "success",
        resourceType: "user",
        resourceId: userId,
        // Dates and the period id only — the RATE is the sensitive value and
        // must never be copied into admin_event_log, which admins can read.
        detail: {
          payPeriodId: inserted.id,
          effectiveFrom,
          effectiveTo: to,
        },
      })
    );

    return NextResponse.json(inserted, { status: 201 });
  } catch (err) {
    // The read-then-write race the pre-check above cannot see: two concurrent
    // POSTs both read an empty conflict set before either writes. Only the
    // EXCLUDE constraint closes it — and its error must read as a conflict,
    // not as a 500.
    if (isExclusionViolation(err)) {
      return NextResponse.json(
        { error: "That period overlaps an existing one" },
        { status: 409 }
      );
    }
    console.error("[pay-periods] insert failed:", err);
    return NextResponse.json(
      { error: "Failed to create pay period" },
      { status: 500 }
    );
  }
}

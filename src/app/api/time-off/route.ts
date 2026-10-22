import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { timeOffRequests, users, type TimeOffRequest } from "@/lib/db/schema";
import { sendEmail, buildTimeOffRequestEmail } from "@/lib/email";
import { TIME_OFF_APPROVER_EMAILS } from "@/lib/constants";
import { countWorkingDays, isDateString } from "@/lib/time-off/working-days";
import {
  canSubmitTimeOff,
  findConflict,
  todayInZone,
} from "@/lib/time-off/guards";
import {
  getAllRequests,
  getHolidayDates,
  getMyRequests,
  getOwnActiveRequests,
} from "@/lib/time-off/queries";
import { hasAdminPowers } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * True for Postgres SQLSTATE 23P01 (exclusion_violation) — the
 * `time_off_no_overlap_per_user` constraint added alongside this route
 * (see the comment above `timeOffRequests` in schema.ts). The `postgres`
 * driver copies the server's SQLSTATE onto `err.code` as a string:
 * verified at `node_modules/postgres/src/connection.js:34` (wire field 67
 * → `code`) and `node_modules/postgres/src/errors.js:1-7`
 * (`Object.assign(this, x)`).
 */
function isExclusionViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23P01"
  );
}

// GET /api/time-off — own requests; admins get all (including reason).
// Reshaped to include the caller's live countryCode (never from session/JWT,
// which doesn't refresh until re-login) — /calendar uses it to gate the
// "Request time off" button and choose which country's holidays to overlay.
export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (!canSubmitTimeOff(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows =
    hasAdminPowers(role)
      ? await getAllRequests()
      : await getMyRequests(session.user.id);

  const [me] = await db
    .select({
      countryCode: users.countryCode,
      residenceTimezone: users.residenceTimezone,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  // "Today" in the caller's residence zone so the requests UI can gate Cancel /
  // Edit with the same day boundary the DELETE/PUT routes use (ruling P3).
  const today = todayInZone(me?.residenceTimezone ?? null, new Date());

  return NextResponse.json({
    requests: rows,
    countryCode: me?.countryCode ?? null,
    today,
  });
}

// POST /api/time-off — create own request as `pending`.
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canSubmitTimeOff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { startDate, endDate, reason } = body as {
    startDate?: unknown;
    endDate?: unknown;
    reason?: unknown;
  };

  if (!isDateString(startDate) || !isDateString(endDate)) {
    return NextResponse.json(
      { error: "startDate and endDate must be valid YYYY-MM-DD dates" },
      { status: 400 }
    );
  }
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "endDate must be on or after startDate" },
      { status: 400 }
    );
  }

  // `isDateString` accepts any well-formed calendar date, so a typo'd year
  // (e.g. "9026") would otherwise reach `countWorkingDays`, which iterates
  // and allocates a `Date` per day in the range — and, now that
  // `time_off_no_overlap_per_user` exists, a request that wide would
  // self-block every future submission from that user with no UI to cancel
  // it. Both dates are already validated YYYY-MM-DD above, so `Date.parse`
  // on a date-only string is UTC per spec and this is safe.
  const MAX_SPAN_DAYS = 365;
  const spanDays =
    (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1;
  if (spanDays > MAX_SPAN_DAYS) {
    return NextResponse.json(
      { error: `A request cannot span more than ${MAX_SPAN_DAYS} days` },
      { status: 400 }
    );
  }

  const MAX_REASON_LENGTH = 2000;
  if (typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }
  if (reason.trim().length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `reason must be ${MAX_REASON_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  // Reject overlap with the requester's own pending/approved requests.
  const active = await getOwnActiveRequests(session.user.id);
  const conflict = findConflict(startDate, endDate, active);
  if (conflict) {
    return NextResponse.json(
      {
        error: "You already have a request covering those dates",
        conflict: { startDate: conflict.startDate, endDate: conflict.endDate },
      },
      { status: 409 }
    );
  }

  const [me] = await db
    .select({ name: users.name, countryCode: users.countryCode })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  // Design D-C. A missing holiday calendar is NOT a recoverable state: this
  // route freezes `workingDays` as an integer snapshot that is never
  // recomputed, so counting against an empty holiday set writes a
  // permanently wrong number (a PK user's week spanning Eid would store 5
  // and stay 5 forever). 422 rather than 409 or 400 — the body is
  // well-formed and it is the account state that blocks processing, and this
  // route already uses 409 for overlaps and 400 for bad input, so 422 stays
  // distinguishable for the UI. A missing `users` row lands here too, which
  // is what the old silent `?? null` swallowed.
  //
  // Only POST is gated. PATCH (approve/deny) and DELETE (cancel) stay
  // ungated, or an admin clearing someone's calendar would strand their
  // existing requests in an unapprovable, uncancellable state.
  if (!me?.countryCode) {
    return NextResponse.json(
      {
        error:
          "Your holiday calendar isn't set. Ask an admin to set it on your profile before booking time off.",
      },
      { status: 422 }
    );
  }

  const holidays = await getHolidayDates(
    me.countryCode,
    startDate,
    endDate
  );
  const workingDays = countWorkingDays(startDate, endDate, holidays);

  // The findConflict check above is the fast path (and the only place that
  // can return the friendly conflict dates); it cannot see a concurrent
  // POST from the same user racing this one. `time_off_no_overlap_per_user`
  // (schema.ts, migration 0087) is the backstop for that race.
  let inserted: TimeOffRequest;
  try {
    [inserted] = await db
      .insert(timeOffRequests)
      .values({
        userId: session.user.id,
        startDate,
        endDate,
        reason: reason.trim(),
        status: "pending",
        workingDays,
      })
      .returning();
  } catch (err) {
    if (isExclusionViolation(err)) {
      return NextResponse.json(
        { error: "You already have a request covering those dates" },
        { status: 409 }
      );
    }
    console.error("[time-off] failed to insert request:", err);
    return NextResponse.json(
      { error: "Failed to create request" },
      { status: 500 }
    );
  }

  // Notification is best-effort: a Resend outage must never block someone
  // from booking time off. The nav badge is the fallback path.
  const email = buildTimeOffRequestEmail({
    requesterName: me?.name || session.user.email || "A team member",
    startDate,
    endDate,
    workingDays,
    reason: reason.trim(),
  });
  // One send per approver — Resend is happy with a multi-recipient `to`, but
  // `sendEmail` takes a single address, so this follows the same fan-out the
  // onboarding route uses. `every` so a partial failure still warns.
  const results = await Promise.all(
    TIME_OFF_APPROVER_EMAILS.map((to) =>
      sendEmail({ to, subject: email.subject, html: email.html })
    )
  );
  const sent = results.every(Boolean);
  if (!sent) {
    console.warn(
      `[time-off] approver email not sent for request ${inserted.id}`
    );
  }

  return NextResponse.json(inserted, { status: 201 });
}

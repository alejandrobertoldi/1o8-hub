import { NextRequest, NextResponse, after } from "next/server";
import { and, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { timeOffRequests, users } from "@/lib/db/schema";
import {
  sendEmail,
  buildTimeOffDecisionEmail,
  buildTimeOffRequestEmail,
} from "@/lib/email";
import { countWorkingDays, isDateString } from "@/lib/time-off/working-days";
import {
  canCancel,
  canRevoke,
  canSubmitTimeOff,
  timeOffApproverEmails,
  findConflict,
  isApprover,
  todayInZone,
} from "@/lib/time-off/guards";
import { getHolidayDates, getOwnActiveRequests } from "@/lib/time-off/queries";
import { publishTimeOff } from "@/lib/time-off/team-calendar";

const FROM_GUSTO = "This time off comes from Gusto. Change it in Gusto and the hub will follow.";

export const dynamic = "force-dynamic";

function isExclusionViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23P01"
  );
}

// NOTE: the plan had a UTC-only `todayKey()` here. It is REPLACED by
// `todayInZone()` in guards.ts — see Controller Amendment 1. The route reads
// the clock exactly once, at the call site, and passes it in.

// PATCH /api/time-off/[id] — approve, deny, or revoke an already-approved
// request. Jake and Manu only (spec D2, revised 2026-08-07).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Gated on role AND email so a demoted approver fails closed: isApprover
  // alone only checks the email string, and a role change should win.
  if (!canSubmitTimeOff(session.user.role) || !isApprover(session.user.email)) {
    return NextResponse.json(
      { error: "Only the designated approver can decide time-off requests" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const status = (body as { status?: unknown } | null)?.status;
  const noteRaw = (body as { decisionNote?: unknown } | null)?.decisionNote;

  if (status !== "approved" && status !== "denied" && status !== "cancelled") {
    return NextResponse.json(
      { error: "status must be 'approved', 'denied' or 'cancelled'" },
      { status: 400 }
    );
  }
  const decisionNote =
    typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim() : null;

  // A revocation must say why (ruling R3) — it is the substitute for the
  // conversation D10 assumed would happen off-system.
  if (status === "cancelled" && !decisionNote) {
    return NextResponse.json(
      { error: "A note is required when revoking approved time off" },
      { status: 400 }
    );
  }

  const [existing] = await db
    .select()
    .from(timeOffRequests)
    .where(eq(timeOffRequests.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.source === "gusto") {
    return NextResponse.json({ error: FROM_GUSTO }, { status: 409 });
  }
  // pending -> approved/denied is the original decision. approved ->
  // cancelled is an approver revoking already-granted leave (D10 reversed for
  // approvers on 2026-08-10). Everything else is a stale link or a
  // double-click.
  const allowed =
    status === "cancelled"
      ? canRevoke(existing.status)
      : existing.status === "pending";

  if (!allowed) {
    // The approve/deny path keeps its original copy. Revoke needs its own:
    // PUT (owner edit) sends an approved request back to pending, so a revoke
    // can legitimately land on a pending row, and "Request is already pending"
    // reads as if pending were a terminal decided state — the opposite of the
    // truth, since the request is waiting for the approver reading the message.
    return NextResponse.json(
      {
        error:
          status === "cancelled"
            ? "Only approved time off can be revoked"
            : `Request is already ${existing.status}`,
      },
      { status: 409 }
    );
  }

  const [updated] = await db
    .update(timeOffRequests)
    .set({
      status,
      decidedBy: session.user.id,
      decidedAt: new Date(),
      decisionNote,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(timeOffRequests.id, id),
        eq(timeOffRequests.status, existing.status)
      )
    )
    .returning();

  // Lost the race to a concurrent decision.
  if (!updated) {
    return NextResponse.json(
      { error: "Request was decided by someone else" },
      { status: 409 }
    );
  }

  // Mirror onto the shared time off calendar (approved → event, else removed).
  after(() => publishTimeOff(updated.id));

  const [requester] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, updated.userId))
    .limit(1);

  if (requester?.email) {
    const email = buildTimeOffDecisionEmail({
      status,
      startDate: updated.startDate,
      endDate: updated.endDate,
      workingDays: updated.workingDays,
      decisionNote,
    });
    const sent = await sendEmail({
      to: requester.email,
      subject: email.subject,
      html: email.html,
    });
    if (!sent) {
      console.warn(`[time-off] decision email not sent for request ${id}`);
    }
  }

  return NextResponse.json(updated);
}

/**
 * PUT /api/time-off/[id] — owner edits dates/reason on their own request.
 *
 * Same window as cancel (pending always; approved only while start is still
 * in the future). Editing an approved request clears the decision and returns
 * it to pending so an approver must re-confirm the new dates.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canSubmitTimeOff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
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

  const [existing] = await db
    .select()
    .from(timeOffRequests)
    .where(eq(timeOffRequests.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.source === "gusto") {
    return NextResponse.json({ error: FROM_GUSTO }, { status: 409 });
  }
  if (existing.userId !== session.user.id) {
    return NextResponse.json(
      { error: "You can only edit your own requests" },
      { status: 403 }
    );
  }

  const [me] = await db
    .select({
      name: users.name,
      countryCode: users.countryCode,
      residenceTimezone: users.residenceTimezone,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const today = todayInZone(me?.residenceTimezone ?? null, new Date());
  if (!canCancel(existing.status, existing.startDate, today)) {
    return NextResponse.json(
      {
        error: `A ${existing.status} request starting ${existing.startDate} cannot be edited`,
      },
      { status: 409 }
    );
  }

  if (!me?.countryCode) {
    return NextResponse.json(
      {
        error:
          "Your holiday calendar isn't set. Ask an admin to set it on your profile before editing time off.",
      },
      { status: 422 }
    );
  }

  const active = await getOwnActiveRequests(session.user.id);
  const conflict = findConflict(
    startDate,
    endDate,
    active.filter((r) => r.id !== id)
  );
  if (conflict) {
    return NextResponse.json(
      {
        error: "You already have a request covering those dates",
        conflict: { startDate: conflict.startDate, endDate: conflict.endDate },
      },
      { status: 409 }
    );
  }

  const holidays = await getHolidayDates(me.countryCode, startDate, endDate);
  const workingDays = countWorkingDays(startDate, endDate, holidays);
  const wasApproved = existing.status === "approved";

  let updated;
  try {
    [updated] = await db
      .update(timeOffRequests)
      .set({
        startDate,
        endDate,
        reason: reason.trim(),
        workingDays,
        status: "pending",
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(timeOffRequests.id, id),
          eq(timeOffRequests.status, existing.status)
        )
      )
      .returning();
  } catch (err) {
    if (isExclusionViolation(err)) {
      return NextResponse.json(
        { error: "You already have a request covering those dates" },
        { status: 409 }
      );
    }
    console.error("[time-off] failed to edit request:", err);
    return NextResponse.json({ error: "Failed to update request" }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Request changed while you were editing it" },
      { status: 409 }
    );
  }

  // An approved request went back to pending: take it off the shared calendar.
  if (wasApproved) after(() => publishTimeOff(updated.id));

  // Re-notify approvers — especially important when an approved request is
  // pulled back to pending with new dates.
  const email = buildTimeOffRequestEmail({
    requesterName: me.name || session.user.email || "A team member",
    startDate,
    endDate,
    workingDays,
    reason: reason.trim(),
  });
  const results = await Promise.all(
    timeOffApproverEmails().map((to) =>
      sendEmail({ to, subject: email.subject, html: email.html })
    )
  );
  if (!results.every(Boolean)) {
    console.warn(`[time-off] approver email not sent for edited request ${id}`);
  }

  return NextResponse.json({ ...updated, wasApproved });
}

// DELETE /api/time-off/[id] — owner cancels their own request.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canSubmitTimeOff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(timeOffRequests)
    .where(eq(timeOffRequests.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.source === "gusto") {
    return NextResponse.json({ error: FROM_GUSTO }, { status: 409 });
  }
  if (existing.userId !== session.user.id) {
    return NextResponse.json(
      { error: "You can only cancel your own requests" },
      { status: 403 }
    );
  }
  // "Today" must be the requester's OWN today, not UTC (ruling P3).
  // residence_timezone is not on the session — auth-db.ts copies only
  // id/role/clientIdCode/clientStatus onto session.user — so it is read here.
  const [me] = await db
    .select({ residenceTimezone: users.residenceTimezone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const today = todayInZone(me?.residenceTimezone ?? null, new Date());

  if (!canCancel(existing.status, existing.startDate, today)) {
    return NextResponse.json(
      { error: `A ${existing.status} request starting ${existing.startDate} cannot be cancelled` },
      { status: 409 }
    );
  }

  // Conditioned on the status we just validated, mirroring the PATCH above.
  // Without it, a concurrent approve landing between this route's read and its
  // write would be silently overwritten with 'cancelled'.
  const [updated] = await db
    .update(timeOffRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(timeOffRequests.id, id),
        eq(timeOffRequests.status, existing.status)
      )
    )
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: "Request changed while you were cancelling it" },
      { status: 409 }
    );
  }

  after(() => publishTimeOff(updated.id));
  return NextResponse.json(updated);
}

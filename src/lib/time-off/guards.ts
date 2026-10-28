import { TIME_OFF_APPROVER_EMAILS } from "@/lib/constants";
import { isValidTimeZone } from "@/lib/timezones";
import { overlaps } from "./working-days";

/** Roles that may submit a time-off request. See spec §4.3. */
const SUBMITTER_ROLES = new Set(["owner", "super_admin", "admin", "editor"]);

/**
 * Only real team members book time off. `viewer`, `client` and `pending` are
 * rejected explicitly so that adding a read-only account later cannot
 * accidentally grant it the ability to book days off.
 */
export function canSubmitTimeOff(role: string): boolean {
  return SUBMITTER_ROLES.has(role);
}

/**
 * True for any of the permanent approvers (spec D2, revised 2026-08-07 — two
 * approvers, still no delegation and no timeout escalation).
 *
 * Note this is NOT the gate that fills the approver queue: GET /api/time-off
 * branches on hasAdminPowers(role), not on this. Both current approvers hold
 * admin-level roles so the two agree today, but a future non-admin approver
 * would get the nav badge over an empty queue.
 */
/** Who decides time off: NEXT_PUBLIC_TIME_OFF_APPROVER_EMAILS (comma separated; the nav reads it too) when set, else the built-in list. */
export function timeOffApproverEmails(): readonly string[] {
  const env = process.env.NEXT_PUBLIC_TIME_OFF_APPROVER_EMAILS?.split(",").map((e) => e.trim()).filter(Boolean);
  return env?.length ? env : TIME_OFF_APPROVER_EMAILS;
}

export function isApprover(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalised = email.toLowerCase();
  return timeOffApproverEmails().some((a) => a.toLowerCase() === normalised);
}

/**
 * The first of the user's own active requests that overlaps a proposed range,
 * or null. Callers pass only pending and approved rows — a denied or
 * cancelled request is free to be superseded.
 */
export function findConflict(
  newStart: string,
  newEnd: string,
  existing: { id: string; startDate: string; endDate: string }[]
): { id: string; startDate: string; endDate: string } | null {
  for (const row of existing) {
    if (overlaps(newStart, newEnd, row.startDate, row.endDate)) return row;
  }
  return null;
}

/**
 * Whether the owner may still cancel.
 *
 * Pending is always cancellable. Approved is cancellable only while the start
 * date is still in the future (spec D10) — once time off has begun, undoing it
 * is a conversation, not a button. Denied and cancelled are terminal.
 *
 * `today` is passed in rather than read from the clock so this stays pure.
 */
export function canCancel(
  status: string,
  startDate: string,
  today: string
): boolean {
  if (status === "pending") return true;
  if (status === "approved") return startDate > today;
  return false;
}

/**
 * Whether an approver may revoke a request.
 *
 * Approved only — pending already has Deny, and denied/cancelled are terminal.
 *
 * Deliberately takes no date. Spec D10 ("once time off has begun, undoing it
 * is a conversation, not a button") still governs the OWNER path in
 * `canCancel` and is unchanged; it was reversed for approvers only on
 * 2026-08-10, so an approver may revoke approved leave of any date. The
 * required decision note is what carries the conversation D10 assumed.
 *
 * Approver authority is enforced at the route, not here — mirroring
 * `canCancel`, which likewise does not check ownership.
 *
 * Consequence, intended and not an oversight: an approver who is also the
 * requester can revoke their own already-started leave, because the owner
 * path rejects it first and this path then accepts it.
 */
export function canRevoke(status: string): boolean {
  return status === "approved";
}

/**
 * "Today" as YYYY-MM-DD in the given IANA timezone.
 *
 * `now` is injected rather than read from the clock, so the cancel window is
 * pure and its timezone boundaries are testable (ruling P3). Built from
 * `formatToParts` rather than a locale format string so the output is
 * deterministic regardless of the host's ICU locale data.
 *
 * The zone comes straight from `users.residence_timezone`, so it is validated
 * first: `Intl.DateTimeFormat` throws `RangeError` on a typo'd zone, and one
 * person's typo must not break the cancel button for everyone. NULL, empty and
 * unrecognised all fall back to UTC — a day boundary a few hours off, which
 * self-corrects the moment the field is set and writes no permanent data.
 */
export function todayInZone(timeZone: string | null, now: Date): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => {
    const value = parts.find((p) => p.type === type)?.value;
    if (value === undefined) {
      // Practically unreachable with these fixed `formatToParts` options,
      // but a malformed key like "2026-08-" from a silently-missing part
      // is exactly the kind of swallowed failure `canCancel` would then
      // string-compare instead of failing loudly on. This is an internal
      // invariant, a different class from bad stored input — it still throws.
      throw new Error(
        `Intl.DateTimeFormat produced no "${type}" part for time zone "${zone}"`
      );
    }
    return value;
  };
  return `${part("year")}-${part("month")}-${part("day")}`;
}

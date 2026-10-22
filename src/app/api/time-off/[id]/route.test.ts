import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  buildTimeOffDecisionEmail: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
}));

import { PgDialect } from "drizzle-orm/pg-core";
import { DELETE, PATCH } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { buildTimeOffDecisionEmail, sendEmail } from "@/lib/email";
import { TIME_OFF_APPROVER_EMAILS } from "@/lib/constants";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const REQ_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const APPROVER_ID = "44444444-4444-4444-8444-444444444444";
const APPROVER_EMAIL = TIME_OFF_APPROVER_EMAILS[0];

function delReq() {
  return new Request(`http://localhost/api/time-off/${REQ_ID}`, {
    method: "DELETE",
  }) as unknown as import("next/server").NextRequest;
}

function patchReq(body: unknown) {
  return new Request(`http://localhost/api/time-off/${REQ_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}
const ctx = { params: Promise.resolve({ id: REQ_ID }) };

/**
 * The route issues two `db.select(...).from(...).where(...).limit(1)` reads in
 * order: the request row, then the user's own row. Queue their results.
 */
function mockSelects(...results: unknown[][]) {
  const queue = [...results];
  asMock(db.select).mockImplementation(() => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(queue.shift() ?? []),
  }));
}

function mockUpdateOk() {
  asMock(db.update).mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: REQ_ID, status: "cancelled" }]),
  });
}

/** An approved request starting 2026-08-04, owned by the session user. */
const APPROVED_TOMORROW = {
  id: REQ_ID,
  userId: USER_ID,
  status: "approved",
  startDate: "2026-08-04",
  endDate: "2026-08-05",
};

describe("DELETE /api/time-off/[id] — day boundary follows residence_timezone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 04:30Z on Aug 4 is 21:30 Aug 3 in Los Angeles but 00:30 Aug 4 in New
    // York — the single instant where the old one-zone-per-country map was
    // provably wrong for half the US.
    vi.setSystemTime(new Date("2026-08-04T04:30:00Z"));
    asMock(getAuthSession).mockResolvedValue({
      user: { id: USER_ID, role: "editor", email: "jo@marketfoundry.agency" },
    });
  });
  afterEach(() => vi.useRealTimers());

  it("lets a Los Angeles user cancel a request starting 2026-08-04", async () => {
    mockSelects([APPROVED_TOMORROW], [{ residenceTimezone: "America/Los_Angeles" }]);
    mockUpdateOk();
    const res = await DELETE(delReq(), ctx);
    // Today in LA is still 2026-08-03, so the start date is future.
    expect(res.status).toBe(200);
  });

  it("refuses the same request at the same instant for a New York user", async () => {
    mockSelects([APPROVED_TOMORROW], [{ residenceTimezone: "America/New_York" }]);
    const res = await DELETE(delReq(), ctx);
    // Today in NY is already 2026-08-04, so the request has started.
    expect(res.status).toBe(409);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("falls back to UTC when no zone is stored", async () => {
    mockSelects([APPROVED_TOMORROW], [{ residenceTimezone: null }]);
    const res = await DELETE(delReq(), ctx);
    // Today in UTC is 2026-08-04 — same verdict as New York here.
    expect(res.status).toBe(409);
  });

  it("does not 500 on a typo'd stored zone", async () => {
    // Intl.DateTimeFormat throws RangeError on this string. Unvalidated, this
    // request would be a 500 rather than a decision.
    mockSelects([APPROVED_TOMORROW], [{ residenceTimezone: "America/Los_Angles" }]);
    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(409);
  });
});

// PATCH does not read the clock for its gating (canRevoke takes no date), so
// this gets its own describe rather than sharing the DELETE block's fake-timer
// beforeEach above — that timer setup is irrelevant here and would only be
// noise.
describe("PATCH revoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getAuthSession).mockResolvedValue({
      user: { id: APPROVER_ID, role: "admin", email: APPROVER_EMAIL },
    });
  });

  it("lets an approver revoke an approved request", async () => {
    mockSelects([APPROVED_TOMORROW], [{ email: "jo@marketfoundry.agency" }]);
    const set = vi.fn().mockReturnThis();
    asMock(db.update).mockReturnValue({
      set,
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ ...APPROVED_TOMORROW, status: "cancelled" }]),
    });

    const res = await PATCH(
      patchReq({ status: "cancelled", decisionNote: "Covering an urgent client escalation" }),
      ctx
    );

    expect(res.status).toBe(200);
    // `decisionNote` is named in BOTH objects deliberately. It is the entire
    // audit trail for a revoke — there is no activity-log write in this route,
    // so the stored note and the requester's email are the only record of why
    // granted leave was pulled. `objectContaining` only checks the keys it is
    // given, so omitting it here let the DB write store null and the email
    // render noteless with the whole suite green.
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        decidedBy: APPROVER_ID,
        decisionNote: "Covering an urgent client escalation",
      })
    );
    expect(buildTimeOffDecisionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        decisionNote: "Covering an urgent client escalation",
      })
    );
  });

  // The revoke UPDATE is conditioned on the status the route just READ, not on
  // the literal "pending" the approve/deny path carried before this branch.
  // Nothing else in this suite can see that argument: `where` is a
  // `vi.fn().mockReturnThis()`, so it accepts the condition and discards it,
  // and reverting the clause to "pending" leaves every other test green while
  // every real revoke would match zero rows and 409. Drizzle's public
  // `PgDialect.sqlToQuery` — the same call `.toSQL()` makes — renders the
  // captured condition back to `{ sql, params }`, which is all the pin needs.
  it("conditions the revoke UPDATE on the row's actual status, not on 'pending'", async () => {
    mockSelects([APPROVED_TOMORROW], [{ email: "jo@marketfoundry.agency" }]);
    const where = vi.fn().mockReturnThis();
    asMock(db.update).mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where,
      returning: vi
        .fn()
        .mockResolvedValue([{ ...APPROVED_TOMORROW, status: "cancelled" }]),
    });

    const res = await PATCH(
      patchReq({ status: "cancelled", decisionNote: "needs coverage" }),
      ctx
    );

    expect(res.status).toBe(200);
    const { sql, params } = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(sql).toContain('"time_off_requests"."status" =');
    expect(params).toContain("approved");
    expect(params).not.toContain("pending");
  });

  // The other half of that mechanism: the clause makes a lost race match zero
  // rows, and this branch turns that into a 409 rather than a crash on
  // `updated.userId`. Every other test queues a successful `returning()`, so
  // without this one the guard — condition and handler both — is deletable
  // with the suite still green.
  it("409s and sends no email when the UPDATE matches no rows", async () => {
    mockSelects([APPROVED_TOMORROW], [{ email: "jo@marketfoundry.agency" }]);
    asMock(db.update).mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    });

    const res = await PATCH(
      patchReq({ status: "cancelled", decisionNote: "needs coverage" }),
      ctx
    );

    expect(res.status).toBe(409);
    // Asserted by message, not just by code: the `allowed` gate above returns
    // 409 too, so a bare status check would pass for the wrong reason.
    expect((await res.json()).error).toBe("Request was decided by someone else");
    expect(buildTimeOffDecisionEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects a revoke from a non-approver", async () => {
    // Role stays valid (admin) so only the approver-email check is under
    // test — a 403 for the wrong reason would pass this test for free.
    asMock(getAuthSession).mockResolvedValue({
      user: { id: APPROVER_ID, role: "admin", email: "notanapprover@marketfoundry.agency" },
    });

    const res = await PATCH(
      patchReq({ status: "cancelled", decisionNote: "note" }),
      ctx
    );

    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a revoke with no note", async () => {
    const res = await PATCH(patchReq({ status: "cancelled" }), ctx);

    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a revoke with a whitespace-only note", async () => {
    const res = await PATCH(
      patchReq({ status: "cancelled", decisionNote: "   " }),
      ctx
    );

    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects revoking a pending request", async () => {
    mockSelects([{ ...APPROVED_TOMORROW, status: "pending" }]);

    const res = await PATCH(
      patchReq({ status: "cancelled", decisionNote: "note" }),
      ctx
    );

    expect(res.status).toBe(409);
    // This state is reachable in the wild: PUT (owner edit, untouched by this
    // branch) sends an approved request back to pending, so an approver whose
    // list has not refetched can click Revoke on it. The generic copy would
    // say "Request is already pending", which reads as if pending were a
    // terminal decided state — it is the opposite, the request is waiting for
    // this very approver.
    expect((await res.json()).error).toBe(
      "Only approved time off can be revoked"
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects revoking an already-cancelled request", async () => {
    mockSelects([{ ...APPROVED_TOMORROW, status: "cancelled" }]);

    const res = await PATCH(
      patchReq({ status: "cancelled", decisionNote: "note" }),
      ctx
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Only approved time off can be revoked"
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  // Guards the OTHER branch of that message. The approve/deny copy is
  // pre-existing and correct, but nothing pinned it — so once the string
  // becomes conditional, collapsing it back to one unconditional message in
  // either direction would be free. This is the half that would go silent.
  it("keeps the original copy when approving an already-decided request", async () => {
    mockSelects([APPROVED_TOMORROW]);

    const res = await PATCH(patchReq({ status: "approved" }), ctx);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Request is already approved");
    expect(db.update).not.toHaveBeenCalled();
  });
});

// Ruling R7 (2026-08-10): self-approval is DELIBERATELY allowed. Both
// permanent approvers are also requesters, and blocking it would make each a
// hard dependency for the other's time off. This test pins the behaviour so a
// future reader does not "fix" it. Kept outside "PATCH revoke" (and fully
// self-contained) because it exercises the original approve path, not the
// revoke path, and must not inherit that describe's approver-only session
// default.
it("lets an approver decide their own request", async () => {
  vi.clearAllMocks();
  asMock(getAuthSession).mockResolvedValue({
    user: { id: APPROVER_ID, role: "admin", email: APPROVER_EMAIL },
  });
  mockSelects(
    [{ ...APPROVED_TOMORROW, userId: APPROVER_ID, status: "pending" }],
    [{ email: APPROVER_EMAIL }]
  );
  mockUpdateOk();

  const res = await PATCH(patchReq({ status: "approved" }), ctx);

  expect(res.status).toBe(200);
});

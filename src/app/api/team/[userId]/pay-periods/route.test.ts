import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/team/access-db", () => ({ readIsSuperAdmin: vi.fn() }));
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[periodId]/route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { readIsSuperAdmin } from "@/lib/team/access-db";
import { logEventAsync } from "@/lib/event-logger";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";

const EXISTING = [
  {
    id: "p1",
    userId: THEM,
    effectiveFrom: "2025-01-01",
    effectiveTo: "2025-06-30",
    contractType: "hourly",
    rateAmount: "40.00",
    rateCurrency: "USD",
    ratePeriod: "hour",
    note: null,
  },
];

const VALID_BODY = {
  effectiveFrom: "2025-07-01",
  effectiveTo: null,
  contractType: "salaried",
  rateAmount: "5200.00",
  rateCurrency: "EUR",
  ratePeriod: "month",
  note: "Promotion",
};

function queueSelects(...results: unknown[][]) {
  const q = [...results];
  asMock(db.select).mockImplementation(() => {
    const rows = q.shift() ?? [];
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
      orderBy: vi.fn().mockResolvedValue(rows),
      then: (r: (v: unknown) => unknown) => Promise.resolve(rows).then(r),
    };
  });
}

function ctx(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

function periodCtx(userId: string, periodId: string) {
  return { params: Promise.resolve({ userId, periodId }) };
}

function req(method: string, body?: unknown) {
  return new Request("http://localhost/api/team/x/pay-periods", {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  }) as unknown as import("next/server").NextRequest;
}

function signIn(role: string, isSuperAdmin: boolean) {
  asMock(getAuthSession).mockResolvedValue({
    user: { id: ME, role, email: "me@marketfoundry.agency", name: "Me" },
  });
  asMock(readIsSuperAdmin).mockResolvedValue(isSuperAdmin);
}

/** Returns the `.values()` mock so a test can inspect what was persisted. */
function mockInsertOk() {
  const values = vi.fn().mockReturnThis();
  asMock(db.insert).mockReturnValue({
    values,
    returning: vi.fn().mockResolvedValue([{ id: "p2", ...VALID_BODY, userId: THEM }]),
  });
  return values;
}

/** Makes the INSERT reject with a real-shaped exclusion violation. */
function mockInsertExclusionViolation() {
  const err = Object.assign(new Error("conflicting key value violates exclusion constraint"), {
    code: "23P01",
  });
  asMock(db.insert).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockRejectedValue(err),
  });
}

function mockUpdateOk() {
  asMock(db.update).mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  });
}

/** DELETE matched one row. `.returning()` is what makes the 404 possible. */
function mockDeleteOk() {
  asMock(db.delete).mockReturnValue({
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "p1" }]),
  });
}

/** DELETE matched nothing — a stale or bogus periodId. */
function mockDeleteMissing() {
  asMock(db.delete).mockReturnValue({
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  signIn("admin", true);
  queueSelects(EXISTING);
  mockInsertOk();
});

describe("pay-period access", () => {
  it("401s when there is no session", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET(req("GET"), ctx(THEM));
    expect(res.status).toBe(401);
  });

  it("403s a plain admin who is not a super-admin", async () => {
    signIn("admin", false);
    const res = await GET(req("GET"), ctx(THEM));
    expect(res.status).toBe(403);
  });

  it("403s when the session claims super-admin but the database says no", async () => {
    // Ruling F3 — the JWT copy is written at sign-in and never refreshed.
    asMock(getAuthSession).mockResolvedValue({
      user: { id: ME, role: "admin", email: "me@marketfoundry.agency", isSuperAdmin: true },
    });
    asMock(readIsSuperAdmin).mockResolvedValue(false);
    const res = await GET(req("GET"), ctx(THEM));
    expect(res.status).toBe(403);
  });

  it("403s DELETE for a non-super-admin", async () => {
    signIn("admin", false);
    const res = await DELETE(req("DELETE"), periodCtx(THEM, "p1"));
    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });
});

describe("GET pay periods", () => {
  it("returns the periods for a super-admin", async () => {
    const res = await GET(req("GET"), ctx(THEM));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });
});

describe("POST pay period", () => {
  it("400s a malformed date", async () => {
    const res = await POST(req("POST", { ...VALID_BODY, effectiveFrom: "01/07/2025" }), ctx(THEM));
    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("400s when effectiveTo precedes effectiveFrom", async () => {
    const res = await POST(
      req("POST", { ...VALID_BODY, effectiveFrom: "2025-07-01", effectiveTo: "2025-06-01" }),
      ctx(THEM)
    );
    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  // Alone among the four write handlers on this branch, POST used to destructure
  // its seven known keys and silently drop everything else. A typo'd
  // `effectiveto` then produced a 201 for an OPEN-ENDED period, which 409s every
  // later add — the user sees a save that "worked" and a card that is stuck.
  it("400s an unknown top-level key alongside an otherwise valid body, before any database access", async () => {
    const res = await POST(
      req("POST", { ...VALID_BODY, effectiveto: "2025-12-31" }),
      ctx(THEM)
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("effectiveto");
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  // Number(null) is 0, which sails past the finite/non-negative check and
  // silently stores a real $0.00 pay rate. Deleting the typeof guard in the
  // route leaves every other test in this file green.
  it("400s a null rateAmount instead of storing a 0.00 rate", async () => {
    const res = await POST(req("POST", { ...VALID_BODY, rateAmount: null }), ctx(THEM));
    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("409s on an overlap the pre-check can see, without touching the database", async () => {
    // 2025-06-30 is the inclusive end of the existing period, so a new period
    // starting that day overlaps by exactly one day.
    const res = await POST(req("POST", { ...VALID_BODY, effectiveFrom: "2025-06-30" }), ctx(THEM));
    expect(res.status).toBe(409);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("409s when Postgres raises SQLSTATE 23P01", async () => {
    // The race the pre-check cannot see: two concurrent POSTs both read an
    // empty conflict set before either writes. The EXCLUDE constraint is the
    // only thing that closes it, and its error must not surface as a 500.
    queueSelects([]);
    mockInsertExclusionViolation();
    const res = await POST(req("POST", VALID_BODY), ctx(THEM));
    expect(res.status).toBe(409);
  });

  it("201s on a clean insert, writing rateAmount as a two-decimal string, rateCurrency upper-cased, createdBy set, and never logging the rate", async () => {
    queueSelects([]);
    const values = mockInsertOk();
    // Lowercase input proves the .toUpperCase() actually runs, not just that
    // the stored value happens to already be uppercase.
    const res = await POST(req("POST", { ...VALID_BODY, rateCurrency: "eur" }), ctx(THEM));
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        rateAmount: "5200.00",
        rateCurrency: "EUR",
        createdBy: ME,
      })
    );
    // The plan's own invariant: the rate never reaches admin_event_log.
    const detail = asMock(logEventAsync).mock.calls[0][0].detail;
    expect(detail).not.toHaveProperty("rateAmount");
    expect(detail).not.toHaveProperty("rateCurrency");
    expect(detail).not.toHaveProperty("contractType");
    expect(detail).not.toHaveProperty("ratePeriod");
  });
});

describe("PATCH pay period", () => {
  it("400s rateAmount/contractType/rateCurrency/ratePeriod and never touches the database", async () => {
    const res = await PATCH(
      req("PATCH", {
        rateAmount: "999.00",
        contractType: "hourly",
        rateCurrency: "GBP",
        ratePeriod: "year",
      }),
      periodCtx(THEM, "p1")
    );
    expect(res.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("200s a dates/note update, logging only the fields actually written and never the rate", async () => {
    queueSelects([EXISTING[0]], []);
    mockUpdateOk();
    const res = await PATCH(
      req("PATCH", { effectiveFrom: "2025-02-01", note: "Backdated" }),
      periodCtx(THEM, "p1")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(db.update).toHaveBeenCalledTimes(1);
    const detail = asMock(logEventAsync).mock.calls[0][0].detail;
    expect(detail).toEqual({
      payPeriodId: "p1",
      fields: ["effectiveFrom", "effectiveTo", "note"],
    });
  });
});

describe("DELETE pay period", () => {
  it("200s a delete, logging the period id and never the rate", async () => {
    mockDeleteOk();
    const res = await DELETE(req("DELETE"), periodCtx(THEM, "p1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(db.delete).toHaveBeenCalledTimes(1);
    const detail = asMock(logEventAsync).mock.calls[0][0].detail;
    expect(detail).toEqual({ payPeriodId: "p1" });
  });

  // The audit log must never record a deletion that did not happen. PATCH 404s
  // on a periodId that does not exist; DELETE used to discard its result, so it
  // answered 200 AND wrote `user:pay-period:delete` for zero rows.
  it("404s and writes NO audit row when the period does not exist", async () => {
    mockDeleteMissing();
    const res = await DELETE(req("DELETE"), periodCtx(THEM, "ghost"));
    expect(res.status).toBe(404);
    expect(logEventAsync).not.toHaveBeenCalled();
  });
});

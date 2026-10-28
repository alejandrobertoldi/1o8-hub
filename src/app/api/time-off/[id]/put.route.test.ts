import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/time-off/team-calendar", () => ({ publishTimeOff: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((task: () => unknown) => { void task(); }) };
});
vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  buildTimeOffDecisionEmail: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
  buildTimeOffRequestEmail: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
}));
vi.mock("@/lib/time-off/queries", () => ({
  getHolidayDates: vi.fn().mockResolvedValue(new Set()),
  getOwnActiveRequests: vi.fn().mockResolvedValue([]),
}));

import { PUT } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { getOwnActiveRequests } from "@/lib/time-off/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const REQ_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

function putReq(body: unknown) {
  const request = new Request(`http://localhost/api/time-off/${REQ_ID}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return request as unknown as import("next/server").NextRequest;
}
const ctx = { params: Promise.resolve({ id: REQ_ID }) };

function mockSelects(...results: unknown[][]) {
  const queue = [...results];
  asMock(db.select).mockImplementation(() => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(queue.shift() ?? []),
  }));
}

const APPROVED_FUTURE = {
  id: REQ_ID,
  userId: USER_ID,
  status: "approved",
  startDate: "2026-08-10",
  endDate: "2026-08-14",
  reason: "trip",
  workingDays: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
  asMock(getAuthSession).mockResolvedValue({
    user: {
      id: USER_ID,
      role: "editor",
      email: "jo@marketfoundry.agency",
      name: "Jo",
    },
  });
  asMock(getOwnActiveRequests).mockResolvedValue([
    { id: REQ_ID, startDate: "2026-08-10", endDate: "2026-08-14" },
  ]);
});

afterEach(() => vi.useRealTimers());

describe("PUT /api/time-off/[id]", () => {
  it("401s when unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await PUT(
      putReq({ startDate: "2026-08-11", endDate: "2026-08-12", reason: "x" }),
      ctx
    );
    expect(res.status).toBe(401);
  });

  it("403s when editing someone else's request", async () => {
    mockSelects([{ ...APPROVED_FUTURE, userId: OTHER }]);
    const res = await PUT(
      putReq({ startDate: "2026-08-11", endDate: "2026-08-12", reason: "changed" }),
      ctx
    );
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("409s when an approved request has already started", async () => {
    mockSelects(
      [{ ...APPROVED_FUTURE, startDate: "2026-08-01", endDate: "2026-08-05" }],
      [{ name: "Jo", countryCode: "ES", residenceTimezone: "UTC" }]
    );
    const res = await PUT(
      putReq({ startDate: "2026-08-11", endDate: "2026-08-12", reason: "changed" }),
      ctx
    );
    expect(res.status).toBe(409);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("resets an approved future request to pending and returns wasApproved", async () => {
    mockSelects(
      [APPROVED_FUTURE],
      [{ name: "Jo", countryCode: "ES", residenceTimezone: "UTC" }]
    );
    const set = vi.fn().mockReturnThis();
    asMock(db.update).mockReturnValue({
      set,
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([
        {
          ...APPROVED_FUTURE,
          startDate: "2026-08-11",
          endDate: "2026-08-13",
          reason: "changed",
          status: "pending",
          workingDays: 3,
        },
      ]),
    });

    const res = await PUT(
      putReq({
        startDate: "2026-08-11",
        endDate: "2026-08-13",
        reason: "changed",
      }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wasApproved).toBe(true);
    expect(body.status).toBe("pending");
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
        startDate: "2026-08-11",
        endDate: "2026-08-13",
        reason: "changed",
      })
    );
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  buildTimeOffRequestEmail: vi.fn().mockReturnValue({ subject: "s", html: "h" }),
}));
vi.mock("@/lib/time-off/queries", () => ({
  getAllRequests: vi.fn(),
  getMyRequests: vi.fn(),
  getOwnActiveRequests: vi.fn(),
  getHolidayDates: vi.fn(),
}));

import { GET, POST } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { getAllRequests, getHolidayDates, getMyRequests, getOwnActiveRequests } from "@/lib/time-off/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const USER_ID = "22222222-2222-4222-8222-222222222222";

function postReq(body: unknown) {
  return new Request("http://localhost/api/time-off", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const VALID_BODY = {
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  reason: "Family trip",
};

/** Mocks the single `db.select({name, countryCode})...limit(1)` read. */
function mockMe(rows: unknown[]) {
  asMock(db.select).mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  });
}

function mockInsertOk() {
  asMock(db.insert).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([
      { id: "req-1", workingDays: 3, status: "pending" },
    ]),
  });
}

describe("POST /api/time-off — holiday-calendar gate (design D-C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getAuthSession).mockResolvedValue({
      user: { id: USER_ID, role: "editor", email: "jo@marketfoundry.agency" },
    });
    asMock(getOwnActiveRequests).mockResolvedValue([]);
    asMock(getHolidayDates).mockResolvedValue(new Set<string>());
  });

  it("422s when the submitter has no holiday calendar", async () => {
    mockMe([{ name: "Jo Carticiano", countryCode: null }]);
    const res = await POST(postReq(VALID_BODY));

    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/holiday calendar isn't set/i);
    // The whole point: no working_days snapshot is ever frozen from an empty
    // holiday set, because the snapshot is never recomputed.
    expect(db.insert).not.toHaveBeenCalled();
    expect(getHolidayDates).not.toHaveBeenCalled();
  });

  it("422s when there is no users row at all", async () => {
    mockMe([]);
    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(422);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("201s and counts the days when a calendar is assigned", async () => {
    mockMe([{ name: "Amir Zeb", countryCode: "PK" }]);
    asMock(getHolidayDates).mockResolvedValue(new Set(["2026-09-02"]));
    mockInsertOk();

    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(201);
    expect(getHolidayDates).toHaveBeenCalledWith("PK", "2026-09-01", "2026-09-03");
  });

  it("still returns the friendly 409 for an overlap, calendar or not", async () => {
    // The gate must sit AFTER the conflict check, so the more specific error
    // wins for a user who has both problems.
    asMock(getOwnActiveRequests).mockResolvedValue([
      { id: "old", startDate: "2026-09-02", endDate: "2026-09-04" },
    ]);
    mockMe([{ name: "Jo Carticiano", countryCode: null }]);

    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(409);
  });
});

describe("GET /api/time-off — reshaped response (§4.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("401s when unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("403s a role that cannot submit time off", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: USER_ID, role: "viewer" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("wraps getMyRequests + live countryCode + today for a non-admin", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: USER_ID, role: "editor" } });
    asMock(getMyRequests).mockResolvedValue([{ id: "r1" }]);
    mockMe([{ countryCode: "PK", residenceTimezone: "UTC" }]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      requests: [{ id: "r1" }],
      countryCode: "PK",
      today: "2026-08-07",
    });
    expect(getMyRequests).toHaveBeenCalledWith(USER_ID);
    expect(getAllRequests).not.toHaveBeenCalled();
  });

  it("wraps getAllRequests for an admin", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: USER_ID, role: "admin" } });
    asMock(getAllRequests).mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    mockMe([{ countryCode: "US", residenceTimezone: "UTC" }]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.requests).toHaveLength(2);
    expect(body.today).toBe("2026-08-07");
    expect(getAllRequests).toHaveBeenCalled();
  });

  it("returns null countryCode when the user has none set", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: USER_ID, role: "editor" } });
    asMock(getMyRequests).mockResolvedValue([]);
    mockMe([{ countryCode: null, residenceTimezone: null }]);
    const res = await GET();
    const body = await res.json();
    expect(body.countryCode).toBeNull();
    expect(body.today).toBe("2026-08-07");
  });
});

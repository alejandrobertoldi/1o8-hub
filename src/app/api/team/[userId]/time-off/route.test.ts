import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/team/access-db", () => ({ readIsSuperAdmin: vi.fn() }));
vi.mock("@/lib/time-off/queries", () => ({
  getApprovedRequestsForUser: vi.fn(),
  getDaysTakenByUser: vi.fn(),
}));

import { GET } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { readIsSuperAdmin } from "@/lib/team/access-db";
import {
  getApprovedRequestsForUser,
  getDaysTakenByUser,
} from "@/lib/time-off/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";

const APPROVED = {
  id: "r1",
  userId: THEM,
  userName: "Amir",
  userEmail: "amir@marketfoundry.agency",
  startDate: "2026-03-01",
  endDate: "2026-03-05",
  reason: "family visit",
  status: "approved" as const,
  workingDays: 5,
  decidedAt: "2026-02-01T00:00:00.000Z",
  decisionNote: "ok",
  createdAt: "2026-01-15T00:00:00.000Z",
};

function ctx(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

function req(year: string | null) {
  const url = year
    ? `http://localhost/api/team/${THEM}/time-off?year=${year}`
    : `http://localhost/api/team/${THEM}/time-off`;
  const request = new Request(url);
  Object.defineProperty(request, "nextUrl", {
    value: new URL(url),
    writable: true,
  });
  return request as unknown as import("next/server").NextRequest;
}

function queueTarget(exists: boolean) {
  asMock(db.select).mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(exists ? [{ id: THEM }] : []),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  asMock(readIsSuperAdmin).mockResolvedValue(false);
  asMock(getApprovedRequestsForUser).mockResolvedValue([APPROVED]);
  asMock(getDaysTakenByUser).mockResolvedValue(5);
  queueTarget(true);
});

describe("GET /api/team/[userId]/time-off", () => {
  it("401s when unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET(req("2026"), ctx(THEM));
    expect(res.status).toBe(401);
  });

  it("400s when year is missing or out of range", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: ME, role: "editor", email: "me@x.com" },
    });
    expect((await GET(req(null), ctx(THEM))).status).toBe(400);
    expect((await GET(req("1999"), ctx(THEM))).status).toBe(400);
  });

  it("404s when the user does not exist", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: ME, role: "editor", email: "me@x.com" },
    });
    queueTarget(false);
    const res = await GET(req("2026"), ctx(THEM));
    expect(res.status).toBe(404);
  });

  it("strips reason for a peer editor viewing someone else", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: ME, role: "editor", email: "me@x.com" },
    });
    const res = await GET(req("2026"), ctx(THEM));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.daysTaken).toBe(5);
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0]).toMatchObject({
      id: "r1",
      startDate: "2026-03-01",
      endDate: "2026-03-05",
      workingDays: 5,
    });
    expect(body.requests[0].reason).toBeUndefined();
    expect(body.requests[0].decisionNote).toBeUndefined();
  });

  it("includes reason for self", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: THEM, role: "editor", email: "amir@x.com" },
    });
    const res = await GET(req("2026"), ctx(THEM));
    const body = await res.json();
    expect(body.requests[0].reason).toBe("family visit");
    expect(body.requests[0].decisionNote).toBe("ok");
  });

  it("includes reason for an admin viewer", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: ME, role: "admin", email: "admin@x.com" },
    });
    const res = await GET(req("2026"), ctx(THEM));
    const body = await res.json();
    expect(body.requests[0].reason).toBe("family visit");
  });
});

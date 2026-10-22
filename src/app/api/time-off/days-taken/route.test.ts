import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/time-off/queries", () => ({
  getDaysTakenByUser: vi.fn(),
  getDaysTakenBreakdown: vi.fn(),
}));

import { GET } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { getDaysTakenByUser, getDaysTakenBreakdown } from "@/lib/time-off/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function getReq(qs: string) {
  const url = `http://localhost/api/time-off/days-taken${qs}`;
  const req = new Request(url);
  Object.defineProperty(req, 'nextUrl', {
    value: new URL(url),
    writable: true,
  });
  return req as unknown as import("next/server").NextRequest;
}

describe("GET /api/time-off/days-taken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getDaysTakenByUser).mockResolvedValue(5);
    asMock(getDaysTakenBreakdown).mockResolvedValue([
      { userId: "u1", userName: "Jo", days: 5 },
    ]);
  });

  it("401s when unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET(getReq("?year=2026"));
    expect(res.status).toBe(401);
  });

  it("403s a role that cannot submit time off", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "u1", role: "viewer", email: "v@marketfoundry.agency" },
    });
    const res = await GET(getReq("?year=2026"));
    expect(res.status).toBe(403);
  });

  it("400s on a missing year", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "u1", role: "editor", email: "jo@marketfoundry.agency" },
    });
    const res = await GET(getReq(""));
    expect(res.status).toBe(400);
  });

  it("400s on an out-of-range year", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "u1", role: "editor", email: "jo@marketfoundry.agency" },
    });
    const res = await GET(getReq("?year=1899"));
    expect(res.status).toBe(400);
  });

  it("returns only ownDays for a non-approver", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "u1", role: "editor", email: "jo@marketfoundry.agency" },
    });
    const res = await GET(getReq("?year=2026"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ year: 2026, ownDays: 5 });
    expect(getDaysTakenBreakdown).not.toHaveBeenCalled();
  });

  it("includes breakdown for Jake", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "jake-id", role: "admin", email: "jake@marketfoundry.agency" },
    });
    const res = await GET(getReq("?year=2026"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.breakdown).toEqual([{ userId: "u1", userName: "Jo", days: 5 }]);
  });
});

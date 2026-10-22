import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/time-off/queries", () => ({ getApprovedInRange: vi.fn() }));

import { GET } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { getApprovedInRange } from "@/lib/time-off/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function getReq(qs: string) {
  const url = `http://localhost/api/time-off/approved${qs}`;
  const req = new Request(url);
  Object.defineProperty(req, 'nextUrl', {
    value: new URL(url),
    writable: true,
  });
  return req as unknown as import("next/server").NextRequest;
}

describe("GET /api/time-off/approved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "u1", role: "editor", email: "jo@marketfoundry.agency" },
    });
  });

  it("401s when unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET(getReq("?from=2026-08-01&to=2026-08-31"));
    expect(res.status).toBe(401);
  });

  it("403s a role that cannot submit time off", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "u1", role: "viewer" } });
    const res = await GET(getReq("?from=2026-08-01&to=2026-08-31"));
    expect(res.status).toBe(403);
  });

  it("400s on a malformed date", async () => {
    const res = await GET(getReq("?from=2026-08-01&to=not-a-date"));
    expect(res.status).toBe(400);
  });

  it("400s on missing params", async () => {
    const res = await GET(getReq(""));
    expect(res.status).toBe(400);
  });

  it("400s when to is before from", async () => {
    const res = await GET(getReq("?from=2026-08-31&to=2026-08-01"));
    expect(res.status).toBe(400);
  });

  it("returns the rows for a valid range", async () => {
    asMock(getApprovedInRange).mockResolvedValue([
      { id: "a", userId: "u2", userName: "Amir", startDate: "2026-08-10", endDate: "2026-08-14" },
    ]);
    const res = await GET(getReq("?from=2026-08-01&to=2026-08-31"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(getApprovedInRange).toHaveBeenCalledWith("2026-08-01", "2026-08-31");
  });
});

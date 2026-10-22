import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/queries", () => ({
  summaryRows: vi.fn(),
  categoriesInRange: vi.fn().mockResolvedValue([]),
  internalBreakdownRows: vi.fn().mockResolvedValue([]),
}));

import { GET } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { summaryRows } from "@/lib/hours/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function req(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/hours/summary");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const RANGE = { from: "2026-07-01", to: "2026-07-31" };

describe("GET /api/hours/summary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 for admin without super-admin", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin", isSuperAdmin: false } });
    const res = await GET(req(RANGE));
    expect(res.status).toBe(403);
  });

  it("401 unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET(req(RANGE));
    expect(res.status).toBe(401);
  });

  it("400 with missing/invalid range", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin", isSuperAdmin: true } });
    const res = await GET(req({ from: "2026-07-01" }));
    expect(res.status).toBe(400);
  });

  it("pivots rows into byMember and byClient, sorted by hours desc", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin", isSuperAdmin: true } });
    asMock(summaryRows).mockResolvedValue([
      { userId: "u1", userName: "Ana", userEmail: "ana@mf.io", clientIdCode: "PURA", totalHours: "10.50" },
      { userId: "u1", userName: "Ana", userEmail: "ana@mf.io", clientIdCode: "INTERNAL", totalHours: "2.00" },
      { userId: "u2", userName: "Bo", userEmail: "bo@mf.io", clientIdCode: "PURA", totalHours: "20.00" },
    ]);

    const res = await GET(req(RANGE));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.byMember).toEqual([
      {
        userId: "u2", name: "Bo", email: "bo@mf.io", totalHours: 20,
        clients: [{ clientIdCode: "PURA", hours: 20 }],
      },
      {
        userId: "u1", name: "Ana", email: "ana@mf.io", totalHours: 12.5,
        clients: [
          { clientIdCode: "PURA", hours: 10.5 },
          { clientIdCode: "INTERNAL", hours: 2 },
        ],
      },
    ]);

    expect(json.byClient).toEqual([
      {
        clientIdCode: "PURA", totalHours: 30.5,
        members: [
          { userId: "u2", name: "Bo", hours: 20 },
          { userId: "u1", name: "Ana", hours: 10.5 },
        ],
      },
      {
        clientIdCode: "INTERNAL", totalHours: 2,
        members: [{ userId: "u1", name: "Ana", hours: 2 }],
      },
    ]);
  });
});

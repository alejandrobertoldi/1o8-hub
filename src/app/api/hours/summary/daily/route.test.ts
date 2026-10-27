import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/analytics-queries", () => ({ summaryByDay: vi.fn() }));

import { GET } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { summaryByDay } from "@/lib/hours/analytics-queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function req(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/hours/summary/daily");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const RANGE = { from: "2026-07-01", to: "2026-07-31" };

describe("GET /api/hours/summary/daily", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    expect((await GET(req(RANGE))).status).toBe(401);
  });

  it("403 for non-super-admin", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "editor", isSuperAdmin: false } });
    expect((await GET(req(RANGE))).status).toBe(403);
  });

  it("400 with missing/invalid range", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin", isSuperAdmin: false } });
    expect((await GET(req({ from: "2026-07-01" }))).status).toBe(400);
  });

  it("defaults dimension to member and returns rows", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin", isSuperAdmin: false } });
    asMock(summaryByDay).mockResolvedValue([
      { key: "u1", keyName: "Ana", entryDate: "2026-07-01", totalHours: "4.00" },
    ]);
    const res = await GET(req(RANGE));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dimension).toBe("member");
    expect(summaryByDay).toHaveBeenCalledWith("2026-07-01", "2026-07-31", "member", []);
    expect(json.rows).toEqual([
      { key: "u1", keyName: "Ana", entryDate: "2026-07-01", totalHours: "4.00" },
    ]);
  });

  it("passes dimension=client and category filters through", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin", isSuperAdmin: false } });
    asMock(summaryByDay).mockResolvedValue([]);
    await GET(req({ ...RANGE, dimension: "client" }));
    expect(summaryByDay).toHaveBeenCalledWith("2026-07-01", "2026-07-31", "client", []);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/queries", () => ({ listActiveCategories: vi.fn() }));
import { GET } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { listActiveCategories } from "@/lib/hours/queries";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

describe("GET /api/hours/categories", () => {
  beforeEach(() => vi.clearAllMocks());
  it("401 unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it("403 for a non-team role", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "c1", role: "client" } });
    expect((await GET()).status).toBe(403);
  });
  it("200 returns active categories", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "v1", role: "viewer" } });
    asMock(listActiveCategories).mockResolvedValue([{ id: "1", name: "PPC" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).categories).toEqual([{ id: "1", name: "PPC" }]);
  });
});

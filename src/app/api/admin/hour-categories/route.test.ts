import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/queries", () => ({
  listAllCategories: vi.fn(), insertCategory: vi.fn(), updateCategory: vi.fn(),
}));
import { GET, POST, PATCH } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { listAllCategories, insertCategory, updateCategory } from "@/lib/hours/queries";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const SUPER = { user: { id: "a1", role: "admin", isSuperAdmin: true } };
const req = (body: unknown, method = "POST") =>
  new NextRequest("http://localhost/api/admin/hour-categories", { method, body: JSON.stringify(body) });

describe("admin hour-categories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 for a viewer", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "v1", role: "viewer", isSuperAdmin: false } });
    expect((await GET()).status).toBe(403);
  });

  it("403 for a plain admin without super-admin", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin", isSuperAdmin: false } });
    expect((await GET()).status).toBe(403);
  });

  it("GET lists all categories for a super-admin", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    asMock(listAllCategories).mockResolvedValue([{ id: "1", name: "PPC", active: true, sortOrder: 0 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).categories).toHaveLength(1);
  });

  it("POST 400 on empty name", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    expect((await POST(req({ name: "  " }))).status).toBe(400);
  });

  it("POST adds a category", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    asMock(insertCategory).mockResolvedValue({ id: "9", name: "Legal", active: true, sortOrder: 9 });
    const res = await POST(req({ name: "Legal", sortOrder: 9 }));
    expect(res.status).toBe(201);
    expect(asMock(insertCategory).mock.calls[0][0]).toMatchObject({ name: "Legal" });
  });

  it("PATCH toggles active", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    asMock(updateCategory).mockResolvedValue({ id: "1", name: "PPC", active: false, sortOrder: 0 });
    const res = await PATCH(req({ id: "1", active: false }, "PATCH"));
    expect(res.status).toBe(200);
    expect(asMock(updateCategory).mock.calls[0][1]).toMatchObject({ active: false });
  });

  it("PATCH 400 without id", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    expect((await PATCH(req({ active: false }, "PATCH"))).status).toBe(400);
  });

  it("PATCH 400 when no updatable field is provided", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    const res = await PATCH(req({ id: "1" }, "PATCH"));
    expect(res.status).toBe(400);
    expect(asMock(updateCategory)).not.toHaveBeenCalled();
  });
});

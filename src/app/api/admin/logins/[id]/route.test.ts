import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/shared-logins/store", () => ({
  updateSharedLogin: vi.fn(),
  deleteSharedLogin: vi.fn(),
}));
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((task: () => unknown) => { void task(); }) };
});

import { PATCH, DELETE } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { deleteSharedLogin, updateSharedLogin } from "@/lib/shared-logins/store";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const ADMIN = {
  user: { id: "a1", role: "admin", email: "a@x.com", name: "A" },
};
const ctx = { params: Promise.resolve({ id: "abc" }) };

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/admin/logins/abc", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/logins/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 for a viewer", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "v1", role: "viewer" },
    });
    expect((await PATCH(patchReq({ name: "Claude" }), ctx)).status).toBe(403);
  });

  it("404 when the login is missing", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(updateSharedLogin).mockResolvedValue(null);
    expect((await PATCH(patchReq({ name: "Claude" }), ctx)).status).toBe(404);
  });

  it("updates for an admin", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(updateSharedLogin).mockResolvedValue({
      id: "abc",
      name: "Claude",
      category: "ai",
      url: null,
      username: null,
      hasSecret: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const res = await PATCH(patchReq({ name: "Claude", category: "ai" }), ctx);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/logins/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 for a viewer", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "v1", role: "viewer" },
    });
    expect((await DELETE(new NextRequest("http://localhost/x"), ctx)).status).toBe(
      403
    );
  });

  it("deletes for an admin", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(deleteSharedLogin).mockResolvedValue(true);
    const res = await DELETE(new NextRequest("http://localhost/x"), ctx);
    expect(res.status).toBe(200);
    expect(asMock(deleteSharedLogin)).toHaveBeenCalledWith("abc");
  });
});

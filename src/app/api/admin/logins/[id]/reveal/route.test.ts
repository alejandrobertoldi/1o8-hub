import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/shared-logins/store", () => ({
  revealSharedLogin: vi.fn(),
}));
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((task: () => unknown) => { void task(); }) };
});

import { POST } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { revealSharedLogin } from "@/lib/shared-logins/store";
import { logEventAsync } from "@/lib/event-logger";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const ctx = { params: Promise.resolve({ id: "abc" }) };

describe("POST /api/admin/logins/:id/reveal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 for a client", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "c1", role: "client" },
    });
    expect(
      (await POST(new NextRequest("http://localhost/x", { method: "POST" }), ctx))
        .status
    ).toBe(403);
  });

  it("returns the password for hub staff and audits the reveal", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: {
        id: "v1",
        role: "viewer",
        email: "v@x.com",
        name: "V",
      },
    });
    asMock(revealSharedLogin).mockResolvedValue({
      public: {
        id: "abc",
        name: "Claude",
        category: "ai",
        url: null,
        username: "team@x.com",
        accounts: [
          {
            username: "team@x.com",
            hasSecret: true,
            subscriptions: [
              {
                subscriptionId: "sub_1",
                plan: "Team",
                activationCode: null,
                userLimit: 3,
                assignedUsers: [],
              },
            ],
          },
        ],
        subscriptions: [],
        activationCode: null,
        subscriptionId: null,
        notes: "seat 3",
        hasSecret: true,
        accessRestricted: false,
        allowedUsers: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      secret: {
        password: "hunter2",
        notes: "seat 3",
        accountPasswords: ["hunter2"],
        subscriptionPasswords: [["hunter2"]],
      },
    });
    const res = await POST(
      new NextRequest("http://localhost/x", { method: "POST" }),
      ctx
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.password).toBe("hunter2");
    expect(json.accounts).toEqual([
      {
        username: "team@x.com",
        password: "hunter2",
        subscriptions: [
          {
            subscriptionId: "sub_1",
            plan: "Team",
            activationCode: null,
            userLimit: 3,
          },
        ],
      },
    ]);
    expect(json.notes).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("ciphertext");
    expect(asMock(logEventAsync)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "shared-login:reveal" })
    );
  });

  it("403 when the viewer is not allowed this login", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "v1", role: "viewer" },
    });
    asMock(revealSharedLogin).mockResolvedValue("forbidden");
    expect(
      (await POST(new NextRequest("http://localhost/x", { method: "POST" }), ctx))
        .status
    ).toBe(403);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/shared-logins/store", () => ({
  listSharedLogins: vi.fn(),
  createSharedLogin: vi.fn(),
}));
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((task: () => unknown) => { void task(); }) };
});

import { GET, POST } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { createSharedLogin, listSharedLogins } from "@/lib/shared-logins/store";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const ADMIN = {
  user: {
    id: "a1",
    role: "admin",
    email: "manu@marketfoundry.agency",
    name: "Manu",
  },
};
const VIEWER = {
  user: { id: "v1", role: "viewer", email: "v@x.com", name: "V" },
};
const CLIENT = {
  user: { id: "c1", role: "client", email: "c@x.com", name: "C" },
};

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/admin/logins", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/logins", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 without a session", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("403 for a client", async () => {
    asMock(getAuthSession).mockResolvedValue(CLIENT);
    expect((await GET()).status).toBe(403);
  });

  it("lists logins for hub staff without ciphertext", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(listSharedLogins).mockResolvedValue({
      logins: [
        {
          id: "1",
          name: "Claude",
          category: "ai",
          url: "https://claude.ai",
          username: "team@marketfoundry.agency",
          activationCode: null,
          subscriptionId: null,
          notes: "Shared seat",
          hasSecret: true,
          accessRestricted: false,
          allowedUsers: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      staff: [],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.logins).toHaveLength(1);
    expect(json.logins[0].notes).toBe("Shared seat");
    expect(JSON.stringify(json)).not.toContain("ciphertext");
    expect(json.logins[0].hasSecret).toBe(true);
  });
});

describe("POST /api/admin/logins", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 for a viewer", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    expect((await POST(postReq({ name: "Claude" }))).status).toBe(403);
  });

  it("400 without a name", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    expect((await POST(postReq({ name: "  " }))).status).toBe(400);
  });

  it("creates a login for an admin", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(createSharedLogin).mockResolvedValue({
      id: "9",
      name: "ExpressVPN",
      category: "vpn",
      url: "https://expressvpn.com",
      username: "team@marketfoundry.agency",
      activationCode: null,
      subscriptionId: null,
      notes: null,
      hasSecret: true,
      accessRestricted: false,
      allowedUsers: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const res = await POST(
      postReq({
        name: "ExpressVPN",
        category: "vpn",
        url: "expressvpn.com",
        username: "team@marketfoundry.agency",
        password: "secret",
      })
    );
    expect(res.status).toBe(201);
    expect(asMock(createSharedLogin).mock.calls[0][0]).toMatchObject({
      name: "ExpressVPN",
      category: "vpn",
      url: "https://expressvpn.com",
    });
  });
});

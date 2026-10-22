import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { update: vi.fn(), select: vi.fn(), insert: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
// `after()` outside a real request scope is not something a unit test should
// depend on, so run the task immediately instead. This keeps NextResponse real.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((task: unknown) => { void task; }) };
});

import { PUT } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { logEventAsync } from "@/lib/event-logger";
import { VALID_COUNTRY_CODES } from "@/lib/constants";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function putReq(body: unknown) {
  return new Request("http://localhost/api/admin/users", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function mockUpdateOk(email = "jake@marketfoundry.agency") {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ email }]),
  };
  asMock(db.update).mockReturnValue(chain);
  return chain;
}

describe("PUT /api/admin/users — role hierarchy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 when an admin tries to assign super_admin", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "a1", role: "admin", isSuperAdmin: false },
    });
    const res = await PUT(putReq({ userId: "u2", role: "super_admin" }));
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("403 when a super_admin tries to assign owner", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "a1", role: "super_admin", isSuperAdmin: true },
    });
    const res = await PUT(putReq({ userId: "u2", role: "owner" }));
    expect(res.status).toBe(403);
  });

  it("400 when anyone tries to change their own role", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "a1", role: "super_admin", isSuperAdmin: true },
    });
    const res = await PUT(putReq({ userId: "a1", role: "admin" }));
    expect(res.status).toBe(400);
  });

  it("200 when a super_admin grants super_admin to another user", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "a1", role: "super_admin", isSuperAdmin: true },
    });
    const chain = mockUpdateOk();
    const res = await PUT(putReq({ userId: "u2", role: "super_admin" }));
    expect(res.status).toBe(200);
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ role: "super_admin", isSuperAdmin: true })
    );
  });

  it("200 when an owner grants owner to another user", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "a1", role: "owner", isSuperAdmin: true },
    });
    const chain = mockUpdateOk();
    const res = await PUT(putReq({ userId: "u2", role: "owner" }));
    expect(res.status).toBe(200);
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ role: "owner", isSuperAdmin: true })
    );
  });
});

const SUPER = {
  user: {
    id: "a1",
    role: "super_admin",
    isSuperAdmin: true,
    email: "manu@marketfoundry.agency",
    name: "Manu Lancharro",
  },
};

describe("PUT /api/admin/users — holiday calendar + residence timezone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getAuthSession).mockResolvedValue(SUPER);
  });

  it("400s on a countryCode that is not a seeded calendar", async () => {
    const res = await PUT(putReq({ userId: "u2", countryCode: "UK" }));
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("accepts a seeded calendar", async () => {
    const chain = mockUpdateOk();
    const res = await PUT(putReq({ userId: "u2", countryCode: "MX" }));
    expect(res.status).toBe(200);
    expect(chain.set).toHaveBeenCalledWith({ countryCode: "MX" });
  });

  // 1o8: one holiday calendar per country the team works from. This walks
  // the whole list rather than naming codes, so every calendar in
  // VALID_COUNTRY_CODES must be accepted.
  it("accepts every seeded calendar", async () => {
    expect([...VALID_COUNTRY_CODES]).toEqual(["US", "MX", "BO", "BR", "PE", "PH", "TN"]);
    for (const code of VALID_COUNTRY_CODES) {
      vi.clearAllMocks();
      asMock(getAuthSession).mockResolvedValue(SUPER);
      const chain = mockUpdateOk();
      const res = await PUT(putReq({ userId: "u2", countryCode: code }));
      expect(res.status, `countryCode ${code} should be accepted`).toBe(200);
      expect(chain.set).toHaveBeenCalledWith({ countryCode: code });
    }
  });

  it("accepts an explicit null to clear the calendar", async () => {
    const chain = mockUpdateOk();
    const res = await PUT(putReq({ userId: "u2", countryCode: null }));
    expect(res.status).toBe(200);
    expect(chain.set).toHaveBeenCalledWith({ countryCode: null });
  });

  it("400s on a typo'd timezone", async () => {
    const res = await PUT(
      putReq({ userId: "u2", residenceTimezone: "America/Los_Angles" })
    );
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  // UTC and Europe/Kyiv are both ABSENT from Intl.supportedValuesOf but both
  // accepted by DateTimeFormat. These two cases are what a membership-based
  // validator would wrongly reject.
  it("accepts UTC", async () => {
    const chain = mockUpdateOk();
    const res = await PUT(putReq({ userId: "u2", residenceTimezone: "UTC" }));
    expect(res.status).toBe(200);
    expect(chain.set).toHaveBeenCalledWith({ residenceTimezone: "UTC" });
  });

  it("accepts Europe/Kyiv", async () => {
    const chain = mockUpdateOk();
    const res = await PUT(
      putReq({ userId: "u2", residenceTimezone: "Europe/Kyiv" })
    );
    expect(res.status).toBe(200);
    expect(chain.set).toHaveBeenCalledWith({ residenceTimezone: "Europe/Kyiv" });
  });

  it("accepts an explicit null to clear the timezone", async () => {
    const chain = mockUpdateOk();
    const res = await PUT(putReq({ userId: "u2", residenceTimezone: null }));
    expect(res.status).toBe(200);
    expect(chain.set).toHaveBeenCalledWith({ residenceTimezone: null });
  });
});

describe("PUT /api/admin/users — audit log (design D-F)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getAuthSession).mockResolvedValue(SUPER);
  });

  it("logs the actor, the target and only the fields that changed", async () => {
    mockUpdateOk("jake@marketfoundry.agency");
    await PUT(putReq({ userId: "u2", countryCode: "MX", role: "editor" }));

    expect(logEventAsync).toHaveBeenCalledTimes(1);
    expect(logEventAsync).toHaveBeenCalledWith({
      userEmail: "manu@marketfoundry.agency",
      userName: "Manu Lancharro",
      section: "admin",
      action: "user:update",
      status: "success",
      resourceType: "user",
      resourceId: "u2",
      resourceLabel: "jake@marketfoundry.agency",
      detail: { countryCode: "MX", role: "editor", isSuperAdmin: false },
    });
  });

  it("does not log when the request is rejected", async () => {
    const res = await PUT(putReq({ userId: "u2" }));
    expect(res.status).toBe(400); // "Nothing to update"
    expect(logEventAsync).not.toHaveBeenCalled();
  });
});

import { GET as GET_USERS } from "./route";

const asMock2 = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/** Exactly the fields the /admin/users page's `User` type consumes. */
const EXPECTED = [
  "id",
  "email",
  "name",
  "image",
  "role",
  "isSuperAdmin",
  "allowedSections",
  "clientIdCode",
  "asanaEmail",
  "countryCode",
  "residenceTimezone",
  "lastLoginAt",
  "createdAt",
];

describe("GET /api/admin/users projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock2(getAuthSession).mockResolvedValue({
      user: { id: "a1", role: "admin", email: "admin@marketfoundry.agency" },
    });
    asMock2(db.select).mockReturnValue({ from: vi.fn().mockResolvedValue([]) });
  });

  it("projects exactly the 13 fields the page consumes and nothing more", async () => {
    // This route used to be an unprojected select().from(users). Migration
    // 0090 adds five columns to `users`, and an unprojected select would ship
    // every future column to the browser by default. Tier-0 fields are safe
    // here; the unprojected habit is what makes the NEXT field unsafe.
    await GET_USERS();
    const projection = asMock2(db.select).mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(projection).sort()).toEqual([...EXPECTED].sort());
  });
});

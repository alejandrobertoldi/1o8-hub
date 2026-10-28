import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => {
  // `db.update`/`db.insert` are SENTINELS the route must never call directly —
  // every real write goes through the `tx` object that `db.transaction` hands
  // to its callback (wired fresh per test in beforeEach below). That is what
  // gives the transaction wrap itself positive test coverage: a regression
  // that dropped the `db.transaction(...)` wrap, or wrote via `db.insert`/
  // `db.update` instead of `tx.insert`/`tx.update` inside it, now fires the
  // sentinel and fails the "never called directly" assertions instead of
  // passing invisibly (previously `tx` WAS `db`, so every write — in or out
  // of the transaction — looked identical to the tests).
  const db: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  };
  return { db };
});
vi.mock("@/lib/team/access-db", () => ({ readIsSuperAdmin: vi.fn() }));
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  // after() needs a live request scope; the audit assertion targets
  // logEventAsync's arguments instead.
  return { ...actual, after: vi.fn() };
});

import { eq, and, notInArray } from "drizzle-orm";
import { GET, PATCH } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { users, userProfiles, userDepartmentLeads } from "@/lib/db/schema";
import { readIsSuperAdmin } from "@/lib/team/access-db";
import { logEventAsync } from "@/lib/event-logger";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";

const TARGET_ROW = {
  id: THEM,
  name: "Amir Zeb",
  email: "amir@marketfoundry.agency",
  image: null,
  role: "editor",
  clientIdCode: "1o8-marketplace",
  jobTitle: "PPC Specialist",
  jobTitles: ["PPC Specialist"],
  departments: ["paid_media"],
  startDate: "2024-03-01",
  employmentStatus: "active",
  phone: "+92 300 0000000",
  slackHandle: "@amir",
  countryCode: "MX",
  residenceTimezone: "Asia/Karachi",
  lastLoginAt: null,
  createdAt: "2024-03-01T00:00:00.000Z",
};

const PROFILE_ROW = { userId: THEM, personalEmail: "a@example.com", city: "Karachi" };
const PAY_ROWS = [
  { id: "p1", userId: THEM, effectiveFrom: "2025-01-01", effectiveTo: null, rateAmount: "40.00" },
];
const PAYMENT_ROW = {
  userId: THEM,
  paymentMethod: "wise",
  paymentCadence: "monthly",
  invoicesRequired: true,
  payeeName: "Amir Zeb",
  bankName: "Meezan",
  bankCountry: "PK",
  accountIdentifierCiphertext: "SUPER-SECRET-CIPHERTEXT",
  accountIdentifierLast4: "4821",
  taxIdCiphertext: "ANOTHER-SECRET",
  taxIdLast4: "9931",
  wiseQrUrl: "data:image/png;base64,abc",
  keyVersion: 1,
};

/**
 * Resolves each db.select() in call order. GET's order is:
 *   1. the target users row
 *   2. user_department_leads (unconditional — leadsDepartments for THIS user)
 *   3. user_profiles   (only when isSelf || isSuperAdmin)
 *   4. user_pay_periods, 5. user_payment_details (only when isSuperAdmin)
 * readIsSuperAdmin is mocked separately and consumes no slot.
 */
function queueSelects(...results: unknown[][]) {
  const q = [...results];
  asMock(db.select).mockImplementation(() => {
    const rows = q.shift() ?? [];
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
      orderBy: vi.fn().mockResolvedValue(rows),
      then: (r: (v: unknown) => unknown) => Promise.resolve(rows).then(r),
    };
  });
}

function ctx(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

function patchReq(body: unknown) {
  return new Request("http://localhost/api/team/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function getReq() {
  return new Request("http://localhost/api/team/x") as unknown as import("next/server").NextRequest;
}

/** Signs in as `id` with `role`; `isSuperAdmin` is what the DB will report. */
function signIn(id: string, role: string, isSuperAdmin = false) {
  asMock(getAuthSession).mockResolvedValue({
    user: { id, role, email: `${id}@marketfoundry.agency`, name: "Viewer" },
  });
  asMock(readIsSuperAdmin).mockResolvedValue(isSuperAdmin);
}

// Named spies (rather than anonymous vi.fn()s buried inline in mockReturnValue)
// so a test can assert on the ARGUMENTS a write call received, not just that
// it happened — a PATCH that updates/upserts the wrong user id would still
// show these mocks as "called" and the test would stay green without this.
let updateSetSpy: ReturnType<typeof vi.fn>;
let updateWhereSpy: ReturnType<typeof vi.fn>;
let insertValuesSpy: ReturnType<typeof vi.fn>;
let insertOnConflictSpy: ReturnType<typeof vi.fn>;
let deleteWhereSpy: ReturnType<typeof vi.fn>;
// `tx` is a DISTINCT object from `db`, rebuilt fresh every test — it is what
// `db.transaction`'s callback receives. Every assertion that used to target
// db.update/db.insert for a REAL write now targets tx.update/tx.insert
// instead; db.update/db.insert are left chain-less on purpose (see the mock
// factory above) so a direct call to either throws immediately instead of
// silently succeeding.
let tx: {
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  signIn(ME, "editor", false);
  queueSelects([TARGET_ROW]);

  updateSetSpy = vi.fn().mockReturnThis();
  updateWhereSpy = vi.fn().mockResolvedValue(undefined);
  insertValuesSpy = vi.fn().mockReturnThis();
  insertOnConflictSpy = vi.fn().mockResolvedValue(undefined);
  deleteWhereSpy = vi.fn().mockResolvedValue(undefined);

  tx = {
    update: vi.fn().mockReturnValue({
      set: updateSetSpy,
      where: updateWhereSpy,
    }),
    insert: vi.fn().mockReturnValue({
      values: insertValuesSpy,
      onConflictDoUpdate: insertOnConflictSpy,
    }),
    delete: vi.fn().mockReturnValue({
      where: deleteWhereSpy,
    }),
  };
  asMock(db.transaction).mockImplementation((cb: (tx: unknown) => unknown) =>
    cb(tx)
  );
});

describe("GET /api/team/[userId]", () => {
  it("401s without a session", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET(getReq(), ctx(THEM));
    expect(res.status).toBe(401);
  });

  it("404s for a user that does not exist", async () => {
    signIn(ME, "owner", false); // owner clears the new ownership gate first
    queueSelects([]);
    const res = await GET(getReq(), ctx(THEM));
    expect(res.status).toBe(404);
  });

  it("gives an admin who isn't super-admin pay, but no profile or payment", async () => {
    // Owner clears the route-level ownership gate; the tier logic under test
    // here is independent of that gate. 1o8: admins and above read Financial;
    // Payment stays super-admin only.
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW], [], PAY_ROWS);
    const body = await (await GET(getReq(), ctx(THEM))).json();
    // Omitted, NOT rendered locked — a greyed-out box tells an admin there is
    // something to go looking for (spec §5).
    expect(body).not.toHaveProperty("profile");
    expect(body.pay).toHaveLength(1);
    expect(body).not.toHaveProperty("payment");
    expect(body.user.id).toBe(THEM);
  });

  it("includes profile and pay for the target themselves, but not payment", async () => {
    signIn(THEM, "editor", false);
    // junction, then profile, then pay (payment omitted — not super-admin)
    queueSelects([TARGET_ROW], [], [PROFILE_ROW], PAY_ROWS);
    const body = await (await GET(getReq(), ctx(THEM))).json();
    expect(body.profile).toMatchObject({ city: "Karachi" });
    expect(body.pay).toHaveLength(1);
    expect(body).not.toHaveProperty("payment");
  });

  it("includes pay and payment for a super-admin", async () => {
    // Role "owner" clears the ownership gate; the superadmin DB flag drives
    // the actual pay/payment tier access being tested here.
    signIn(ME, "owner", true);
    queueSelects([TARGET_ROW], [], [PROFILE_ROW], PAY_ROWS, [PAYMENT_ROW]);
    const body = await (await GET(getReq(), ctx(THEM))).json();
    expect(body.pay).toHaveLength(1);
    expect(body.payment.accountIdentifierLast4).toBe("4821");
    expect(body.payment.hasAccountIdentifier).toBe(true);
    expect(body.payment.wiseQrUrl).toBe("data:image/png;base64,abc");
  });

  it("never puts ciphertext in the response body", async () => {
    signIn(ME, "owner", true);
    queueSelects([TARGET_ROW], [], [PROFILE_ROW], PAY_ROWS, [PAYMENT_ROW]);
    const raw = await (await GET(getReq(), ctx(THEM))).text();
    expect(raw).not.toContain("Ciphertext");
    expect(raw).not.toContain("SUPER-SECRET-CIPHERTEXT");
    expect(raw).not.toContain("ANOTHER-SECRET");
  });

  it("trusts the database over the session for isSuperAdmin (ruling F3)", async () => {
    // The session flag is JWT-sourced and never refreshed, so a revoked
    // super-admin would otherwise keep pay access until they signed out.
    asMock(getAuthSession).mockResolvedValue({
      // Role "owner" clears the ownership gate; the point of this test is
      // that a claimed `isSuperAdmin: true` on the session object itself is
      // never trusted — only readIsSuperAdmin()'s DB answer is.
      user: { id: ME, role: "owner", email: "me@marketfoundry.agency", isSuperAdmin: true },
    });
    asMock(readIsSuperAdmin).mockResolvedValue(false);
    queueSelects([TARGET_ROW], [], PAY_ROWS);
    const body = await (await GET(getReq(), ctx(THEM))).json();
    expect(readIsSuperAdmin).toHaveBeenCalledWith(ME);
    expect(body).not.toHaveProperty("payment");
    expect(body.access.isSuperAdmin).toBe(false);
  });

  it("returns departments (array) and leadsDepartments (from the junction) on body.user", async () => {
    signIn(ME, "owner", false);
    queueSelects(
      [TARGET_ROW],
      [{ department: "seo" }, { department: "social_media" }]
    );
    const body = await (await GET(getReq(), ctx(THEM))).json();
    expect(body.user.departments).toEqual(["paid_media"]);
    expect(body.user.leadsDepartments).toEqual(["seo", "social_media"]);
  });

  it("returns an empty leadsDepartments array when the user leads nothing", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW], []);
    const body = await (await GET(getReq(), ctx(THEM))).json();
    expect(body.user.leadsDepartments).toEqual([]);
  });

  it("401s without a session even for the caller's own id", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET(getReq(), ctx(ME));
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/team/[userId]", () => {
  it("400s for fields absent from FIELD_TIERS, including inherited keys", async () => {
    for (const field of ["salary", "toString", "__proto__", "constructor"]) {
      queueSelects([TARGET_ROW]);
      signIn(ME, "owner", true);
      const res = await PATCH(patchReq({ [field]: "x" }), ctx(THEM));
      expect(res.status, `field ${field}`).toBe(400);
      expect(db.update).not.toHaveBeenCalled();
    }
  });

  it("400s for a known field carrying an invalid value", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(patchReq({ employmentStatus: "retired" }), ctx(THEM));
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("lets an owner set holiday calendar + timezone on someone else's team page", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(
      patchReq({ countryCode: "MX", residenceTimezone: "America/Mexico_City" }),
      ctx(THEM)
    );
    expect(res.status).toBe(200);
    expect(tx.update).toHaveBeenCalled();
  });

  it("400s an invalid residenceTimezone", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(
      patchReq({ residenceTimezone: "Not/AZone" }),
      ctx(THEM)
    );
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("403s when an owner without the superadmin flag edits someone ELSE'S self-tier field", async () => {
    // Owner clears the route-level ownership gate; this test isolates the
    // FIELD-tier rule underneath it (self-tier fields need isSelf or the DB
    // superadmin flag — being "owner" alone is not enough).
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(patchReq({ phone: "+1 555 0000" }), ctx(THEM));
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("lets a plain admin edit their OWN self-tier field", async () => {
    signIn(ME, "admin", false);
    queueSelects([{ ...TARGET_ROW, id: ME }]);
    const res = await PATCH(patchReq({ phone: "+1 555 0000" }), ctx(ME));
    expect(res.status).toBe(200);
    expect(tx.update).toHaveBeenCalledTimes(1);
    // The write must go through the transaction's tx, never db directly.
    expect(db.update).not.toHaveBeenCalled();
  });

  it("audits changed field NAMES only, never their values", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    await PATCH(patchReq({ jobTitle: "Head of PPC" }), ctx(THEM));
    const logged = asMock(logEventAsync).mock.calls[0][0];
    expect(logged.action).toBe("user:profile:update");
    expect(logged.resourceId).toBe(THEM);
    expect(logged.detail).toEqual({ fields: ["jobTitle"] });
    expect(JSON.stringify(logged)).not.toContain("Head of PPC");
  });

  it("routes a tier-1 field to the user_profiles UPSERT, not the users UPDATE, and targets the correct user", async () => {
    // Owner clears the ownership gate; the superadmin DB flag is what grants
    // the self-tier write for someone ELSE underneath it.
    signIn(ME, "owner", true);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(patchReq({ city: "Lahore" }), ctx(THEM));
    expect(res.status).toBe(200);
    expect(tx.insert).toHaveBeenCalledWith(userProfiles);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: THEM, city: "Lahore" })
    );
    // Finding B: a bare toHaveBeenCalled() would stay green even if the route
    // dropped or emptied the `set:` clause — which silently breaks every
    // REPEAT profile edit (the first edit inserts fine; the second conflicts
    // and does nothing).
    expect(insertOnConflictSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        target: userProfiles.userId,
        set: expect.objectContaining({ city: "Lahore" }),
      })
    );
    // The crux: a bug that upserted against the CALLER's id instead of the
    // target's would still pass every assertion above except this one.
    expect(insertValuesSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: ME })
    );
    // Both must go through tx, never db directly.
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("targets the correct user id in the users UPDATE where clause, not the caller's", async () => {
    signIn(ME, "owner", false); // owner editing someone ELSE'S admin-tier field
    queueSelects([TARGET_ROW]);
    const res = await PATCH(patchReq({ jobTitle: "Head of PPC" }), ctx(THEM));
    expect(res.status).toBe(200);
    expect(tx.update).toHaveBeenCalledWith(users);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ jobTitle: "Head of PPC" })
    );
    // toEqual against the real (unmocked) eq() output, not a substring match:
    // a bug that used the caller's id (ME) instead of the route param (THEM)
    // here would produce a structurally different SQL condition and fail this.
    expect(updateWhereSpy).toHaveBeenCalledWith(eq(users.id, THEM));
    expect(updateWhereSpy).not.toHaveBeenCalledWith(eq(users.id, ME));
    // The write must go through the transaction's tx, never db directly.
    expect(db.update).not.toHaveBeenCalled();
  });

  it("400s a phone value over the varchar(40) limit, naming the field, before any write", async () => {
    signIn(ME, "admin", false);
    queueSelects([{ ...TARGET_ROW, id: ME }]);
    const res = await PATCH(patchReq({ phone: "1".repeat(41) }), ctx(ME));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("phone");
    expect(db.update).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("wraps a combined tier-0 + tier-1 patch in one transaction, routing both writes through tx and never through db directly", async () => {
    // jobTitle lives on `users` (tier "admin"); city lives on `user_profiles`
    // (tier "self") — a super-admin editing someone else can write both, and
    // this is exactly the scenario db.transaction exists to make atomic.
    // Owner clears the ownership gate; the superadmin DB flag grants the
    // self-tier ("city") write for someone else underneath it.
    signIn(ME, "owner", true);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(
      patchReq({ jobTitle: "Head of PPC", city: "Lahore" }),
      ctx(THEM)
    );
    expect(res.status).toBe(200);

    // The transaction wrap itself: previously untested, since `tx` aliased
    // `db` and every write looked the same with or without it.
    expect(db.transaction).toHaveBeenCalledTimes(1);

    // The users UPDATE happened, through tx, against the correct user.
    expect(tx.update).toHaveBeenCalledWith(users);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ jobTitle: "Head of PPC" })
    );
    expect(updateWhereSpy).toHaveBeenCalledWith(eq(users.id, THEM));
    expect(updateWhereSpy).not.toHaveBeenCalledWith(eq(users.id, ME));

    // The user_profiles UPSERT happened, through tx, against the correct user.
    expect(tx.insert).toHaveBeenCalledWith(userProfiles);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: THEM, city: "Lahore" })
    );
    expect(insertValuesSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: ME })
    );
    expect(insertOnConflictSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        target: userProfiles.userId,
        set: expect.objectContaining({ city: "Lahore" }),
      })
    );

    // Neither write went through db directly — both must have gone via tx.
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();

    // The audit log names both changed fields and neither field's value.
    const logged = asMock(logEventAsync).mock.calls[0][0];
    expect(logged.detail).toEqual({ fields: ["jobTitle", "city"] });
    expect(JSON.stringify(logged)).not.toContain("Head of PPC");
    expect(JSON.stringify(logged)).not.toContain("Lahore");
  });

  it("syncs jobTitles onto jobTitle (first entry) and stores the full array", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(
      patchReq({ jobTitles: ["President", "Head of Catalog"] }),
      ctx(THEM)
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTitle: "President",
        jobTitles: ["President", "Head of Catalog"],
      })
    );
  });

  it("clears both title columns when jobTitles is an empty array", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(patchReq({ jobTitles: [] }), ctx(THEM));
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ jobTitle: null, jobTitles: [] })
    );
  });

  it("keeps jobTitles in sync when only jobTitle is patched", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(patchReq({ jobTitle: "Head of PPC" }), ctx(THEM));
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTitle: "Head of PPC",
        jobTitles: ["Head of PPC"],
      })
    );
  });

  it("accepts a departments array from an owner", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(
      patchReq({ departments: ["creative", "seo"] }),
      ctx(THEM)
    );
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ departments: ["creative", "seo"] })
    );
  });

  it("clears departments with an empty array", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(patchReq({ departments: [] }), ctx(THEM));
    expect(res.status).toBe(200);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ departments: [] })
    );
  });

  it("400s a departments array with an unknown id", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(
      patchReq({ departments: ["creative", "engineering"] }),
      ctx(THEM)
    );
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("400s isDepartmentLead (no longer a known field)", async () => {
    signIn(ME, "owner", true);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(patchReq({ isDepartmentLead: true }), ctx(THEM));
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("accepts a leadsDepartments array from an owner and reconciles the junction (steal, then drop, then insert)", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(
      patchReq({ leadsDepartments: ["seo", "social_media"] }),
      ctx(THEM)
    );
    expect(res.status).toBe(200);

    // Steal: delete-by-department for each target department (before insert).
    expect(deleteWhereSpy).toHaveBeenCalledWith(
      eq(userDepartmentLeads.department, "seo")
    );
    expect(deleteWhereSpy).toHaveBeenCalledWith(
      eq(userDepartmentLeads.department, "social_media")
    );
    // Drop: this user's rows for departments no longer in the new set.
    expect(deleteWhereSpy).toHaveBeenCalledWith(
      and(
        eq(userDepartmentLeads.userId, THEM),
        notInArray(userDepartmentLeads.department, ["seo", "social_media"])
      )
    );
    expect(tx.delete).toHaveBeenCalledTimes(3);

    // Insert the new set for this user.
    expect(insertValuesSpy).toHaveBeenCalledWith({
      userId: THEM,
      department: "seo",
    });
    expect(insertValuesSpy).toHaveBeenCalledWith({
      userId: THEM,
      department: "social_media",
    });
    expect(tx.insert).toHaveBeenCalledTimes(2);

    // Order: every delete (steal + drop) must precede every insert.
    const lastDeleteOrder = Math.max(
      ...(tx.delete as ReturnType<typeof vi.fn>).mock.invocationCallOrder
    );
    const firstInsertOrder = Math.min(
      ...(tx.insert as ReturnType<typeof vi.fn>).mock.invocationCallOrder
    );
    expect(lastDeleteOrder).toBeLessThan(firstInsertOrder);
  });

  it("clears all led departments when leadsDepartments is set to an empty array", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(patchReq({ leadsDepartments: [] }), ctx(THEM));
    expect(res.status).toBe(200);
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(deleteWhereSpy).toHaveBeenCalledWith(
      eq(userDepartmentLeads.userId, THEM)
    );
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("400s a leadsDepartments array with an unknown id", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(
      patchReq({ leadsDepartments: ["creative", "engineering"] }),
      ctx(THEM)
    );
    expect(res.status).toBe(400);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe("authorization gate: only owner may view/edit ANOTHER member (else self only)", () => {
  it("GET: an owner viewing ANOTHER user's detail proceeds (not 403)", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW], []);
    const res = await GET(getReq(), ctx(THEM));
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it("PATCH: an owner patching ANOTHER user's detail proceeds (not 403)", async () => {
    signIn(ME, "owner", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(patchReq({ jobTitle: "New Title" }), ctx(THEM));
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  // 1o8: any internal user may open ANOTHER member's card, but only the tier-0
  // directory view — no user_profiles, pay or payment, and no MF field writes.
  it("GET: a non-owner (e.g. admin) viewing ANOTHER user's detail gets the restricted tier-0 card", async () => {
    signIn(ME, "admin", false);
    queueSelects([TARGET_ROW], [], PAY_ROWS, [{ userId: THEM, location: "Puebla, MX" }]);
    const res = await GET(getReq(), ctx(THEM));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.restricted).toBe(true);
    expect(body.canEditDirectory).toBe(true);
    expect(body.directory).toMatchObject({ location: "Puebla, MX" });
    // admin-tier fields stay writable for an admin; self/superadmin tiers do not
    expect(body.access).toEqual({ isSelf: false, isAdmin: true, isSuperAdmin: false });
    expect(body).not.toHaveProperty("profile");
    // 1o8: admins read Financial on the restricted card; Payment stays super-admin.
    expect(body.pay).toHaveLength(1);
    expect(body).not.toHaveProperty("payment");
  });

  it("GET: a client viewing ANOTHER user's detail is 403, before any DB lookup", async () => {
    signIn(ME, "client", false);
    const res = await GET(getReq(), ctx(THEM));
    expect(res.status).toBe(403);
    // The gate must sit before the target-row lookup so it can't be used to
    // enumerate which user ids exist.
    expect(db.select).not.toHaveBeenCalled();
  });

  // 1o8: admins may edit ANOTHER member's admin-tier fields, never their self-tier data.
  it("PATCH: an admin patching ANOTHER user's self-tier field is 403, before any DB lookup", async () => {
    signIn(ME, "admin", false);
    const res = await PATCH(patchReq({ phone: "+1 555 0000" }), ctx(THEM));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("PATCH: an admin may edit ANOTHER user's admin-tier field (job title)", async () => {
    signIn(ME, "admin", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(patchReq({ jobTitle: "New Title" }), ctx(THEM));
    expect(res.status).toBe(200);
  });

  it("PATCH: a non-admin (editor) patching ANOTHER user's detail is 403, before any DB lookup", async () => {
    signIn(ME, "editor", false);
    const res = await PATCH(patchReq({ jobTitle: "New Title" }), ctx(THEM));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("GET: a non-owner viewing THEIR OWN detail proceeds (not 403)", async () => {
    signIn(ME, "viewer", false);
    queueSelects([{ ...TARGET_ROW, id: ME }], [], [], []);
    const res = await GET(getReq(), ctx(ME));
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it("PATCH: a non-owner patching THEIR OWN detail proceeds (not 403)", async () => {
    signIn(ME, "viewer", false);
    queueSelects([{ id: ME, email: "me@marketfoundry.agency" }]);
    const res = await PATCH(patchReq({ phone: "+1 555 1234" }), ctx(ME));
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it("PATCH: 401s without a session, even for the caller's own id", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await PATCH(patchReq({ phone: "+1 555 1234" }), ctx(ME));
    expect(res.status).toBe(401);
  });
});

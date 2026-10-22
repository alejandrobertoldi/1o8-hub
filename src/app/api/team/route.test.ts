import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));

import { GET } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/**
 * Every field GET /api/team is allowed to return. Tier-0 only: proxy.ts blocks
 * client and prospect roles from /api/* outside a fixed allowlist and /api/team
 * is on neither list, but this route is still readable by every internal role,
 * so anything above tier 0 appearing here is a leak.
 */
const TIER0_ALLOWLIST = new Set([
  "id",
  "name",
  "email",
  "asanaEmail",
  "image",
  "role",
  "clientIdCode",
  "jobTitle",
  "jobTitles",
  "departments",
  "employmentStatus",
  "phone",
  "slackHandle",
]);

let whereSpy: ReturnType<typeof vi.fn>;

// Two db.select calls now happen: the users select (from().where()) and the
// user_department_leads select (from() resolves directly, no where()). Mock
// them positionally with mockReturnValueOnce so each call gets its own rows.
// mockReset() first so a test that calls mockSelect() again to override the
// beforeEach default REPLACES the queued once-values instead of appending
// after them (which would make GET() consume the stale defaults first).
function mockSelect(rows: unknown[], leadRows: unknown[] = []) {
  asMock(db.select).mockReset();
  whereSpy = vi.fn().mockResolvedValue(rows);
  asMock(db.select)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: whereSpy,
    })
    .mockReturnValueOnce({
      from: vi.fn().mockResolvedValue(leadRows),
    });
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks): mockSelect queues db.select's TWO
  // sequential calls with mockReturnValueOnce, and the 401 test never
  // consumes them (GET short-circuits before any select). clearAllMocks only
  // wipes call history, not that once-queue, so leftover entries would bleed
  // into later tests and desync which mocked rows a later GET() sees.
  vi.resetAllMocks();
  asMock(getAuthSession).mockResolvedValue({
    user: { id: "u1", role: "editor", email: "jo@marketfoundry.agency" },
  });
  mockSelect([]);
});

describe("GET /api/team", () => {
  it("401s without a session", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("projects the four new directory fields", async () => {
    await GET();
    const projection = asMock(db.select).mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(projection)).toEqual(
      expect.arrayContaining([
        "jobTitle",
        "jobTitles",
        "departments",
        "employmentStatus",
        "phone",
        "slackHandle",
      ])
    );
  });

  it("projects nothing outside the tier-0 allowlist", async () => {
    await GET();
    const projection = asMock(db.select).mock.calls[0][0] as Record<string, unknown>;
    const leaked = Object.keys(projection).filter((k) => !TIER0_ALLOWLIST.has(k));
    expect(leaked).toEqual([]);
  });

  it("combines both filters into a single where() call", async () => {
    // Drizzle's .where() REPLACES rather than ANDs, so chaining a second call
    // would silently drop a filter — either exposing the 1o8-era duplicates
    // (if the active-status filter were dropped) or hiding shared 1o8 members
    // like Bruna in finance (if the @marketfoundry-or-has-department filter
    // were dropped). The SQL predicate itself isn't asserted here since db is
    // mocked — see "shapes whatever rows the DB returns" below for the
    // documented inclusion rule.
    await GET();
    expect(whereSpy).toHaveBeenCalledTimes(1);
    expect(whereSpy.mock.calls[0][0]).toBeDefined();
  });

  it("returns departments array and aggregated leadsDepartments", async () => {
    // first select -> users; second select -> user_department_leads rows
    mockSelect(
      [
        {
          id: "u-manu",
          name: "Manu",
          email: "manu@marketfoundry.agency",
          asanaEmail: null,
          image: null,
          role: "admin",
          clientIdCode: null,
          jobTitle: "Founder",
          jobTitles: ["Founder"],
          departments: ["account_management"],
          employmentStatus: "active",
          phone: null,
          slackHandle: null,
        },
      ],
      [
        { userId: "u-manu", department: "seo" },
        { userId: "u-manu", department: "data" },
      ]
    );
    const res = await GET();
    const body = await res.json();
    const manu = body.find((u: { email: string }) => u.email.startsWith("manu"));
    expect(manu.departments).toEqual(["account_management"]);
    expect(manu.leadsDepartments.sort()).toEqual(["data", "seo"]);
    expect("isDepartmentLead" in manu).toBe(false);
  });

  it("shapes whatever rows the DB returns, including shared-1o8 members with a department (filtering is the DB's job)", async () => {
    // The route no longer filters rows itself — that's the WHERE clause's job,
    // which is opaque to this mocked db. This test documents the intended
    // inclusion rule (active + (@marketfoundry OR has a department)) by
    // showing the route faithfully maps a mixed result set: a
    // @marketfoundry.agency user, a shared @1o8.agency member who opted in via
    // a department assignment (e.g. Bruna in finance), and a stale @1o8.agency
    // rebrand duplicate with no department. If the DB applied the rule
    // correctly, only the first two would ever reach this mapping step — but
    // the route's job is just to shape rows, not re-filter them.
    mockSelect([
      {
        id: "u-mf",
        name: "Jo",
        email: "jo@marketfoundry.agency",
        asanaEmail: null,
        image: null,
        role: "editor",
        clientIdCode: null,
        jobTitle: "Editor",
        jobTitles: ["Editor"],
        departments: [],
        employmentStatus: "active",
        phone: null,
        slackHandle: null,
      },
      {
        id: "u-bruna",
        name: "Bruna Freire",
        email: "bruna.freire@1o8.agency",
        asanaEmail: null,
        image: null,
        role: "editor",
        clientIdCode: null,
        jobTitle: "Finance",
        jobTitles: ["Finance"],
        departments: ["finance"],
        employmentStatus: "active",
        phone: null,
        slackHandle: null,
      },
      {
        id: "u-dup",
        name: "Stale Duplicate",
        email: "stale.dup@1o8.agency",
        asanaEmail: null,
        image: null,
        role: "editor",
        clientIdCode: null,
        jobTitle: null,
        jobTitles: [],
        departments: [],
        employmentStatus: "active",
        phone: null,
        slackHandle: null,
      },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body.map((u: { email: string }) => u.email)).toEqual([
      "jo@marketfoundry.agency",
      "bruna.freire@1o8.agency",
      "stale.dup@1o8.agency",
    ]);
    const bruna = body.find((u: { email: string }) => u.email === "bruna.freire@1o8.agency");
    expect(bruna.departments).toEqual(["finance"]);
  });
});

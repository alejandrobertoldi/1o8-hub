import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/holiday-deals/store", () => ({
  listHolidayDeals: vi.fn(),
  createHolidayDeals: vi.fn(),
  lookupProduct: vi.fn(),
  HolidayDealConflictError: class HolidayDealConflictError extends Error {
    constructor() {
      super("This product is already on that event.");
      this.name = "HolidayDealConflictError";
    }
  },
}));
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((task: () => unknown) => { void task(); }) };
});

import { GET, POST } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { createHolidayDeals, listHolidayDeals } from "@/lib/holiday-deals/store";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const ADMIN = {
  user: { id: "a1", role: "admin", email: "manu@marketfoundry.agency", name: "Manu" },
};
const VIEWER = {
  user: { id: "v1", role: "viewer", email: "v@x.com", name: "V" },
};
const CLIENT = {
  user: { id: "c1", role: "client", email: "c@x.com", name: "C" },
};

function getReq(qs = "") {
  return new NextRequest(`http://localhost/api/holiday-deals${qs}`);
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/holiday-deals", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/holiday-deals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 without a session", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    expect((await GET(getReq())).status).toBe(401);
  });

  it("403 for a client-role user", async () => {
    asMock(getAuthSession).mockResolvedValue(CLIENT);
    expect((await GET(getReq())).status).toBe(403);
  });

  it("lists the sheet for hub staff", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(listHolidayDeals).mockResolvedValue({
      rows: [],
      summary: { total: 0, enrolled: 0, notSubmitted: 0, inventoryAtRisk: 0, adBudget: 0, estimatedFees: 0 },
    });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toHaveLength(3);
    expect(json.canEdit).toBe(false);
    expect(json.summary.total).toBe(0);
  });
});

describe("POST /api/holiday-deals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 for a viewer", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    expect((await POST(postReq({ clientIdCode: "AAC", event: "pbdd", asin: "B00" }))).status).toBe(403);
  });

  it("400 without a product identifier", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    expect((await POST(postReq({ clientIdCode: "AAC", event: "pbdd" }))).status).toBe(400);
  });

  it("creates a row for an editor", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(createHolidayDeals).mockResolvedValue([
      { id: "1", asin: "B00TEST001", event: "pbdd" },
    ]);
    const res = await POST(
      postReq({ clientIdCode: "AAC", event: "pbdd", asin: "B00TEST001" }),
    );
    expect(res.status).toBe(201);
    expect(asMock(createHolidayDeals).mock.calls[0][0][0]).toMatchObject({
      clientIdCode: "AAC",
      event: "pbdd",
      asin: "B00TEST001",
      startDate: "2026-10-06",
    });
  });
});

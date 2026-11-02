import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/holiday-deals/store", () => ({
  updateHolidayDeal: vi.fn(),
  deleteHolidayDeal: vi.fn(),
  HolidayDealConflictError: class HolidayDealConflictError extends Error {
    constructor() {
      super("This product is already on that event.");
      this.name = "HolidayDealConflictError";
    }
  },
  HolidayDealNotFoundError: class HolidayDealNotFoundError extends Error {
    constructor() {
      super("Deal plan not found.");
      this.name = "HolidayDealNotFoundError";
    }
  },
}));
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((task: () => unknown) => { void task(); }) };
});

import { PATCH, DELETE } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import {
  HolidayDealNotFoundError,
  deleteHolidayDeal,
  updateHolidayDeal,
} from "@/lib/holiday-deals/store";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const ADMIN = {
  user: { id: "a1", role: "admin", email: "manu@marketfoundry.agency", name: "Manu" },
};
const ctx = { params: Promise.resolve({ id: "row-1" }) };

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/holiday-deals/row-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/holiday-deals/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 without a session", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    expect((await PATCH(patchReq({ adBudget: 100 }), ctx)).status).toBe(401);
  });

  it("updates a cell", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(updateHolidayDeal).mockResolvedValue({ id: "row-1", adBudget: 100 });
    const res = await PATCH(patchReq({ adBudget: 100 }), ctx);
    expect(res.status).toBe(200);
    expect(asMock(updateHolidayDeal)).toHaveBeenCalledWith(
      "row-1",
      { adBudget: 100 },
      "a1",
    );
  });

  it("404 when the row is gone", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(updateHolidayDeal).mockRejectedValue(new HolidayDealNotFoundError());
    expect((await PATCH(patchReq({ adBudget: 1 }), ctx)).status).toBe(404);
  });
});

describe("DELETE /api/holiday-deals/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes a row", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(deleteHolidayDeal).mockResolvedValue(undefined);
    const res = await DELETE(
      new NextRequest("http://localhost/api/holiday-deals/row-1", { method: "DELETE" }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(asMock(deleteHolidayDeal)).toHaveBeenCalledWith("row-1");
  });
});

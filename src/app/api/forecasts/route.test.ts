import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: mocks.getAuthSession }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ orderBy: async () => [] }) }),
    }),
  },
}));

import { GET } from "./route";

function reqFor(clientIdCode: string) {
  return new NextRequest(`http://localhost/api/forecasts?clientIdCode=${clientIdCode}`);
}

describe("GET /api/forecasts client-role guard", () => {
  beforeEach(() => {
    mocks.getAuthSession.mockReset();
  });

  it("lets a multi-client user (Trejo's) request each assigned code", async () => {
    mocks.getAuthSession.mockResolvedValue({
      user: { role: "client", clientIdCode: "TRS_SC_US,TRT_SC_US" },
    });
    for (const code of ["TRT_SC_US", "TRS_SC_US"]) {
      const res = await GET(reqFor(code));
      expect(res.status, `code ${code}`).toBe(200);
      expect(await res.json()).toEqual({ forecasts: [] });
    }
  });

  it("still forbids a code the user is not assigned", async () => {
    mocks.getAuthSession.mockResolvedValue({
      user: { role: "client", clientIdCode: "TRS_SC_US,TRT_SC_US" },
    });
    expect((await GET(reqFor("HAL_SC_US"))).status).toBe(403);
  });

  it("keeps working for a single-code assignment", async () => {
    mocks.getAuthSession.mockResolvedValue({
      user: { role: "client", clientIdCode: "HAL_SC_US" },
    });
    expect((await GET(reqFor("HAL_SC_US"))).status).toBe(200);
    expect((await GET(reqFor("TRT_SC_US"))).status).toBe(403);
  });
});

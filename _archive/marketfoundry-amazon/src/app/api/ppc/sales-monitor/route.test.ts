import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: mocks.getAuthSession }));
// The guard under test fires before any data access; an empty aac lookup makes
// a passed guard surface as 404 "Client not found", which is all we need.
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }),
  },
}));
vi.mock("@/lib/redshift", () => ({ queryRedshift: vi.fn(async () => []) }));

import { GET } from "./route";

function reqFor(clientIdCode: string) {
  return new NextRequest(`http://localhost/api/ppc/sales-monitor?clientIdCode=${clientIdCode}`);
}

describe("GET /api/ppc/sales-monitor client-role guard", () => {
  beforeEach(() => {
    mocks.getAuthSession.mockReset();
  });

  it("lets a multi-client user (Trejo's) request each assigned code", async () => {
    mocks.getAuthSession.mockResolvedValue({
      user: { role: "client", clientIdCode: "TRS_SC_US,TRT_SC_US" },
    });
    for (const code of ["TRT_SC_US", "TRS_SC_US"]) {
      const res = await GET(reqFor(code));
      // 404 = guard passed, aac lookup (mocked empty) failed. 403 = the bug.
      expect(res.status, `code ${code}`).toBe(404);
    }
  });

  it("still forbids a code the user is not assigned", async () => {
    mocks.getAuthSession.mockResolvedValue({
      user: { role: "client", clientIdCode: "TRS_SC_US,TRT_SC_US" },
    });
    const res = await GET(reqFor("HAL_SC_US"));
    expect(res.status).toBe(403);
  });

  it("keeps working for a single-code assignment", async () => {
    mocks.getAuthSession.mockResolvedValue({
      user: { role: "client", clientIdCode: "HAL_SC_US" },
    });
    expect((await GET(reqFor("HAL_SC_US"))).status).toBe(404);
    expect((await GET(reqFor("TRT_SC_US"))).status).toBe(403);
  });
});

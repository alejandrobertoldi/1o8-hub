import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("@/lib/seo/sqp", () => ({ getProjectSqp: vi.fn() }));

import { GET } from "./route";
import { getProjectSqp } from "@/lib/seo/sqp";
import { getAuthSession } from "@/lib/auth-db";

function makeReq() {
  return new Request("http://localhost/api/seo/projects/p1/sqp") as any;
}
const ctx = { params: Promise.resolve({ id: "p1" }) };

describe("GET /api/seo/projects/[id]/sqp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s when unauthenticated", async () => {
    (getAuthSession as any).mockResolvedValueOnce(null);
    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns the getProjectSqp payload", async () => {
    (getProjectSqp as any).mockResolvedValueOnce({ available: false, reason: "no-account-mapping" });
    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, reason: "no-account-mapping" });
    expect(getProjectSqp).toHaveBeenCalledWith("p1");
  });
});

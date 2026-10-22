// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ access: vi.fn(), select: vi.fn(), update: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/helium10/access", () => ({ requireSeoOperator: mocks.access, integrationError: () => NextResponse.json({ error: "upstream failed" }, { status: 502 }) }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select, update: mocks.update } }));
vi.mock("@/lib/helium10/store", () => ({ withSharedConnection: (fn: (p: object) => unknown) => fn({}) }));
vi.mock("@/lib/helium10/client", () => ({ withMcp: (_p: object, fn: (c: object) => unknown) => fn({}), fetchAsinKeywords: mocks.fetch }));
import { POST } from "./route";
const params = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };
const request = (body: unknown) => new NextRequest("https://hub.test/api/seo/projects/11111111-1111-4111-8111-111111111111/helium10", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_HELIUM10_ENABLED", "true");
  mocks.access.mockResolvedValue({ userId: "u" });
  mocks.select.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [{ s1ApprovedAt: new Date() }] }) }) })
    .mockReturnValueOnce({ from: () => ({ where: async () => [{ asin: "B000000001", parentageLevel: "Child" }] }) });
  mocks.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });
});
describe("project Helium 10 acquisition", () => {
  it("refuses with 409 and never calls Helium 10 while the switch is off (CSV mode)", async () => {
    vi.stubEnv("NEXT_PUBLIC_HELIUM10_ENABLED", "");
    const res = await POST(request({ marketplace: "US" }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Cerebro CSV/);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("denies access before reading projects or calling Helium 10", async () => {
    mocks.access.mockResolvedValue({ error: NextResponse.json({}, { status: 403 }) });
    expect((await POST(request({ marketplace: "US" }), params)).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects unsupported marketplaces before research", async () => {
    expect((await POST(request({ marketplace: "XX" }), params)).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("preserves existing inputs if provider research fails", async () => {
    mocks.fetch.mockRejectedValue(new Error("provider failed"));
    expect((await POST(request({ marketplace: "US" }), params)).status).toBe(502);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("returns normalized research and saves only acquisition inputs", async () => {
    mocks.fetch.mockResolvedValue([{ phrase: "tea", search_volume: 900 }]);
    const response = await POST(request({ marketplace: "US" }), params);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.client.keywords[0]).toMatchObject({ keyword_phrase: "tea", search_volume: 900 });
    expect(body.marketplace).toBe("US");
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { HeliumProvider } from "@/lib/helium10/client";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), connection: vi.fn() }));
vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({ auth: mocks.auth }));
vi.mock("@/lib/helium10/access", () => ({ requireSeoReconnect: async () => ({ userId: "u" }) }));
vi.mock("@/lib/helium10/store", () => ({ hubOrigin: () => "https://hub.test", withSharedConnection: mocks.connection }));
import { GET } from "./route";
let provider: HeliumProvider;
beforeEach(() => {
  vi.clearAllMocks();
  provider = new HeliumProvider({ pending: { state: "state", expiresAt: Date.now() + 1000, projectId: "11111111-1111-4111-8111-111111111111", authorizedBy: "u" }, verifier: "verifier" }, "https://hub.test");
  mocks.connection.mockImplementation((fn) => fn(provider));
  mocks.auth.mockResolvedValue("AUTHORIZED");
});
describe("Helium 10 OAuth callback", () => {
  it("consumes state once and returns to the originating project", async () => {
    const req = new NextRequest("https://hub.test/api/seo/helium10/callback?state=state&code=code");
    const response = await GET(req);
    expect(response.headers.get("location")).toBe("https://hub.test/seo/11111111-1111-4111-8111-111111111111/keywords?helium10=connected");
    expect(provider.data.pending).toBeUndefined();
    expect(provider.data.verifier).toBeUndefined();
    await GET(req);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
  });
  it("does not exchange a code for mismatched state", async () => {
    await GET(new NextRequest("https://hub.test/api/seo/helium10/callback?state=other&code=code"));
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("consumes declined consent without leaking provider error text", async () => {
    const response = await GET(new NextRequest("https://hub.test/api/seo/helium10/callback?state=state&error=private_detail"));
    expect(response.headers.get("location")).toBe("https://hub.test/seo/11111111-1111-4111-8111-111111111111/keywords?helium10=error");
    expect(provider.data.pending).toBeUndefined();
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});

it("does not exchange another user's authorization", async () => {
  provider.data.pending!.authorizedBy = "other-admin";
  await GET(new NextRequest("https://hub.test/api/seo/helium10/callback?state=state&code=code"));
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(provider.data.pending).toBeDefined();
});

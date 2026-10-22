// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), section: vi.fn(), connection: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mocks.session, canAccessSection: mocks.section }));
vi.mock("@/lib/helium10/store", () => ({ hubOrigin: () => "https://hub.test", sharedConnectionStatus: async () => false, withSharedConnection: mocks.connection }));
vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({ auth: mocks.auth }));
import { POST, DELETE } from "./route";
const projectId = "11111111-1111-4111-8111-111111111111";
let provider: { data: Record<string, unknown>; authorizationUrl: string };
beforeEach(() => {
  vi.clearAllMocks(); mocks.section.mockReturnValue(true);
  provider = { data: {}, authorizationUrl: "https://provider.test/authorize" };
  mocks.connection.mockImplementation(fn => fn(provider)); mocks.auth.mockResolvedValue("REDIRECT");
});
it.each(["editor", "viewer", "admin"])("lets an SEO %s begin OAuth with user-bound state", async role => {
  mocks.session.mockResolvedValue({ user: { id: "u", role } });
  const response = await POST(new NextRequest("https://hub.test/api/seo/helium10", { method: "POST", headers: { origin: "https://hub.test" }, body: JSON.stringify({ projectId }) }));
  expect(response.status).toBe(200);
  expect(provider.data.pending).toMatchObject({ authorizedBy: "u", projectId });
  expect(await response.json()).toEqual({ authorizationUrl: provider.authorizationUrl });
});
it("rejects users without SEO access and foreign origins before touching credentials", async () => {
  mocks.session.mockResolvedValue({ user: { id: "u", role: "viewer" } });
  mocks.section.mockReturnValue(false);
  expect((await POST(new NextRequest("https://hub.test/api", { method: "POST", headers: { origin: "https://hub.test" } }))).status).toBe(403);
  mocks.section.mockReturnValue(true);
  expect((await POST(new NextRequest("https://hub.test/api", { method: "POST", headers: { origin: "https://evil.test" } }))).status).toBe(403);
  expect(mocks.connection).not.toHaveBeenCalled();
});
it("keeps explicit disconnection administrator-only", async () => {
  mocks.session.mockResolvedValue({ user: { id: "u", role: "editor" } });
  expect((await DELETE(new NextRequest("https://hub.test/api", { method: "DELETE", headers: { origin: "https://hub.test" } }))).status).toBe(403);
  expect(mocks.connection).not.toHaveBeenCalled();
});

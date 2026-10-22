// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), section: vi.fn() }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mocks.session, canAccessSection: mocks.section }));
vi.mock("./store", () => ({ hubOrigin: () => "https://hub.test" }));
import { requireSeoOperator, requireHeliumAdmin, requireSeoReconnect } from "./access";
beforeEach(() => { mocks.section.mockReturnValue(true); });
describe("Helium 10 authorization", () => {
  it.each(["viewer", "client", "prospect", "pending"])("rejects %s", async role => {
    mocks.session.mockResolvedValue({ user: { id: "u", role } });
    expect((await requireSeoOperator()).error?.status).toBe(403);
  });
  it("rejects unauthenticated users and editors without SEO access", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await requireSeoOperator()).error?.status).toBe(401);
    mocks.session.mockResolvedValue({ user: { id: "u", role: "editor" } });
    mocks.section.mockReturnValue(false);
    expect((await requireSeoOperator()).error?.status).toBe(403);
  });
  it("requires the configured origin on mutations", async () => {
    mocks.session.mockResolvedValue({ user: { id: "u", role: "editor" } });
    expect((await requireSeoOperator(new NextRequest("https://hub.test/api", { headers: { origin: "https://evil.test" } }))).error?.status).toBe(403);
    expect(await requireSeoOperator(new NextRequest("https://hub.test/api", { headers: { origin: "https://hub.test" } }))).toEqual({ userId: "u" });
  });
});

it("allows SEO editors to research but not manage shared credentials", async () => {
  mocks.session.mockResolvedValue({ user: { id: "u", role: "editor" } });
  expect((await requireHeliumAdmin()).error?.status).toBe(403);
  mocks.session.mockResolvedValue({ user: { id: "u", role: "owner" } });
  expect((await requireHeliumAdmin()).userId).toBe("u");
});

it.each(["editor", "viewer"])("allows %s with SEO access to reconnect", async role => {
  mocks.section.mockReturnValue(true);
  mocks.session.mockResolvedValue({ user: { id: "u", role } });
  expect((await requireSeoReconnect()).userId).toBe("u");
  mocks.section.mockReturnValue(false);
  expect((await requireSeoReconnect()).error?.status).toBe(403);
});

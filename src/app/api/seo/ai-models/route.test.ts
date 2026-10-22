// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ session: null as unknown, cfg: {} as Record<string, { model: string; enabled: boolean }> }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/ai-config.server", () => ({ getAiFeatureConfig: async (k: string) => h.cfg[k] ?? { model: "claude-opus-4-7", enabled: true } }));
import { GET } from "./route";

beforeEach(() => { h.cfg = {}; h.session = { user: { role: "editor" } }; });

it("returns each SEO step's effective model and a one-model summary", async () => {
  const body = await (await GET()).json();
  expect(body.steps).toHaveLength(6);
  expect(body.steps[0]).toEqual({ step: "S2 Keywords", model: "claude-opus-4-7", label: "Opus 4.7", enabled: true });
  expect(body.summary).toBe("Opus 4.7");
});
it("an admin override on one step shows as Mixed models", async () => {
  h.cfg.seo_audit = { model: "claude-haiku-4-5", enabled: true };
  const body = await (await GET()).json();
  expect(body.steps.find((s: { step: string }) => s.step === "S6 Audit").label).toBe("Haiku 4.5");
  expect(body.summary).toBe("Mixed models");
});
it("401 signed out, 403 for client users", async () => {
  h.session = null;
  expect((await GET()).status).toBe(401);
  h.session = { user: { role: "client" } };
  expect((await GET()).status).toBe(403);
});

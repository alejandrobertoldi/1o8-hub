// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { seal, unseal } from "./credentials";
const state = vi.hoisted(() => ({ ciphertext: "", written: "", transaction: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { transaction: state.transaction } }));
import { withConnection, sharedConnectionOwner } from "./store";
afterEach(() => vi.unstubAllEnvs());
it("commits rotated credentials after a failed tool and creates the row under the lock timeout", async () => {
  vi.stubEnv("NEXTAUTH_URL", "https://hub.test");
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
  state.ciphertext = seal({ tokens: { access_token: "old", token_type: "Bearer", refresh_token: "r" } }, "u");
  const tx = {
    execute: vi.fn(),
    insert: state.insert.mockReturnValue({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
    select: () => ({ from: () => ({ where: () => ({ for: async () => [{ ciphertext: state.ciphertext }] }) }) }),
    update: () => ({ set: ({ ciphertext }: { ciphertext: string }) => ({ where: async () => { state.written = ciphertext; } }) }),
  };
  state.transaction.mockImplementation(fn => fn(tx));
  await expect(withConnection("u", async provider => {
    provider.saveTokens({ access_token: "rotated", refresh_token: "rotated-refresh", token_type: "Bearer" });
    throw new Error("query failed");
  })).rejects.toThrow("query failed");
  expect(unseal<{ tokens: { access_token: string } }>(state.written, "u").tokens.access_token).toBe("rotated");
  expect(tx.execute.mock.invocationCallOrder[0]).toBeLessThan(state.insert.mock.invocationCallOrder[0]);
});

it("requires an explicit shared owner instead of using the requesting user", () => {
  vi.stubEnv("HELIUM10_CONNECTION_OWNER_ID", "");
  expect(() => sharedConnectionOwner()).toThrow();
  vi.stubEnv("HELIUM10_CONNECTION_OWNER_ID", "11111111-1111-4111-8111-111111111111");
  expect(sharedConnectionOwner()).toBe("11111111-1111-4111-8111-111111111111");
});

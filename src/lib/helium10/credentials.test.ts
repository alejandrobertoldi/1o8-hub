// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { seal, unseal, consumeState } from "./credentials";

afterEach(() => vi.unstubAllEnvs());
describe("Helium 10 credentials", () => {
  it("encrypts credentials and binds them to the Hub user", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
    const encrypted = seal({ token: "private-token" }, "alice");
    expect(encrypted).not.toContain("private-token");
    expect(unseal(encrypted, "alice")).toEqual({ token: "private-token" });
    expect(() => unseal(encrypted, "bob")).toThrow();
    expect(() => unseal(encrypted.slice(0, -4) + "AAAA", "alice")).toThrow();
  });
  it("fails closed without a secret", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(() => seal({}, "alice")).toThrow();
  });
  it("accepts only a matching, unexpired, single-use OAuth state", () => {
    const data = { pending: { state: "abc", expiresAt: Date.now() + 1000, projectId: "p" }, verifier: "v" };
    expect(() => consumeState(data, "bad")).toThrow();
    expect(consumeState(data, "abc")).toBe("p");
    expect(() => consumeState(data, "abc")).toThrow();
    expect(() => consumeState({ pending: { state: "abc", expiresAt: 1, projectId: "p" } }, "abc")).toThrow();
  });
});

it("uses the dedicated encryption key independently of the login secret", () => {
  vi.stubEnv("HELIUM10_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("NEXTAUTH_SECRET", "old-login-secret");
  const encrypted = seal({ token: "t" }, "u");
  vi.stubEnv("NEXTAUTH_SECRET", "new-login-secret");
  expect(unseal(encrypted, "u")).toEqual({ token: "t" });
  vi.stubEnv("HELIUM10_ENCRYPTION_KEY", "invalid");
  expect(() => unseal(encrypted, "u")).toThrow();
});

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { sealSharedLoginSecret, unsealSharedLoginSecret } from "./shared-logins";

afterEach(() => vi.unstubAllEnvs());

describe("shared login secrets", () => {
  it("encrypts a password and notes without leaking plaintext", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
    const encrypted = sealSharedLoginSecret({
      password: "super-secret",
      notes: "2FA on amazon@marketfoundry.agency",
      accountPasswords: ["super-secret"],
    });
    expect(encrypted).not.toContain("super-secret");
    expect(encrypted).not.toContain("2FA");
    expect(unsealSharedLoginSecret(encrypted)).toEqual({
      password: "super-secret",
      notes: "2FA on amazon@marketfoundry.agency",
      accountPasswords: ["super-secret"],
      subscriptionPasswords: [["super-secret"]],
    });
  });

  it("produces a different ciphertext every call", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
    const a = sealSharedLoginSecret({
      password: "same",
      notes: "",
      accountPasswords: ["same"],
    });
    const b = sealSharedLoginSecret({
      password: "same",
      notes: "",
      accountPasswords: ["same"],
    });
    expect(a).not.toBe(b);
  });

  it("throws when the payload is tampered with", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
    const encrypted = sealSharedLoginSecret({
      password: "x",
      notes: "",
      accountPasswords: ["x"],
    });
    expect(() => unsealSharedLoginSecret(encrypted.slice(0, -4) + "AAAA")).toThrow();
  });

  it("fails closed without a secret", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(() =>
      sealSharedLoginSecret({ password: "x", notes: "", accountPasswords: ["x"] })
    ).toThrow();
  });

  it("uses the dedicated encryption key independently of the login secret", () => {
    vi.stubEnv(
      "SHARED_LOGINS_ENCRYPTION_KEY",
      Buffer.alloc(32, 9).toString("base64")
    );
    vi.stubEnv("NEXTAUTH_SECRET", "old-login-secret");
    const encrypted = sealSharedLoginSecret({
      password: "t",
      notes: "n",
      accountPasswords: ["t"],
    });
    vi.stubEnv("NEXTAUTH_SECRET", "new-login-secret");
    expect(unsealSharedLoginSecret(encrypted)).toEqual({
      password: "t",
      notes: "n",
      accountPasswords: ["t"],
      subscriptionPasswords: [["t"]],
    });
    vi.stubEnv("SHARED_LOGINS_ENCRYPTION_KEY", "invalid");
    expect(() => unsealSharedLoginSecret(encrypted)).toThrow();
  });

  it("keeps a password per user on the same service", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
    const encrypted = sealSharedLoginSecret({
      password: "one",
      notes: "",
      accountPasswords: ["one", "two"],
    });
    expect(unsealSharedLoginSecret(encrypted)).toEqual({
      password: "one",
      notes: "",
      accountPasswords: ["one", "two"],
      subscriptionPasswords: [["one", "two"]],
    });
  });

  it("keeps passwords nested under each subscription", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
    const encrypted = sealSharedLoginSecret({
      password: "one",
      notes: "",
      accountPasswords: ["one", "two", "three"],
      subscriptionPasswords: [["one", "two"], ["three"]],
    });
    expect(unsealSharedLoginSecret(encrypted)).toEqual({
      password: "one",
      notes: "",
      accountPasswords: ["one", "two", "three"],
      subscriptionPasswords: [["one", "two"], ["three"]],
    });
  });
});

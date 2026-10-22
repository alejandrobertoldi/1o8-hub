import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptPii,
  decryptPii,
  last4,
  PiiKeyMissingError,
  PII_KEY_VERSION,
} from "./pii";

// Two distinct 32-byte keys, written as base64 exactly as the env var will be.
const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

const original = process.env.USER_PII_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.USER_PII_ENCRYPTION_KEY = KEY_A;
});

afterEach(() => {
  if (original === undefined) delete process.env.USER_PII_ENCRYPTION_KEY;
  else process.env.USER_PII_ENCRYPTION_KEY = original;
});

describe("last4", () => {
  it("returns the final four characters", () => {
    expect(last4("GB29NWBK60161331926819")).toBe("6819");
  });

  it("strips whitespace before slicing, so a spaced IBAN masks correctly", () => {
    expect(last4("GB29 NWBK 6016 1331 9268 19")).toBe("6819");
  });

  it("returns the whole value when it is shorter than four characters", () => {
    // The column is varchar(4), so a 1-3 char result still fits.
    expect(last4("42")).toBe("42");
  });
});

describe("encryptPii / decryptPii", () => {
  it("round-trips a plaintext", () => {
    const { ciphertext, keyVersion } = encryptPii("GB29NWBK60161331926819");
    expect(decryptPii(ciphertext, keyVersion)).toBe("GB29NWBK60161331926819");
  });

  it("stamps the current key version and the last4", () => {
    const out = encryptPii("GB29NWBK60161331926819");
    expect(out.keyVersion).toBe(PII_KEY_VERSION);
    expect(out.last4).toBe("6819");
  });

  it("produces a different ciphertext every call, because the IV is random", () => {
    const a = encryptPii("same-value");
    const b = encryptPii("same-value");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(decryptPii(a.ciphertext, a.keyVersion)).toBe("same-value");
    expect(decryptPii(b.ciphertext, b.keyVersion)).toBe("same-value");
  });

  it("throws when the auth tag has been tampered with", () => {
    const { ciphertext } = encryptPii("GB29NWBK60161331926819");
    const buf = Buffer.from(ciphertext, "base64");
    buf[12] ^= 0xff; // first byte of the 16-byte tag, which starts at offset 12
    expect(() => decryptPii(buf.toString("base64"), PII_KEY_VERSION)).toThrow();
  });

  it("throws when the ciphertext body has been tampered with", () => {
    const { ciphertext } = encryptPii("GB29NWBK60161331926819");
    const buf = Buffer.from(ciphertext, "base64");
    buf[buf.length - 1] ^= 0xff;
    expect(() => decryptPii(buf.toString("base64"), PII_KEY_VERSION)).toThrow();
  });

  it("throws when decrypted under a different key", () => {
    const { ciphertext } = encryptPii("GB29NWBK60161331926819");
    process.env.USER_PII_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptPii(ciphertext, PII_KEY_VERSION)).toThrow();
  });

  it("throws PiiKeyMissingError when the env var is absent", () => {
    delete process.env.USER_PII_ENCRYPTION_KEY;
    expect(() => encryptPii("x")).toThrow(PiiKeyMissingError);
  });

  it("throws PiiKeyMissingError when the key does not decode to 32 bytes", () => {
    // Buffer.from(…, "base64") never throws — it silently drops invalid
    // characters — so the decoded LENGTH is the only real guard.
    process.env.USER_PII_ENCRYPTION_KEY = Buffer.alloc(16, 3).toString("base64");
    expect(() => encryptPii("x")).toThrow(PiiKeyMissingError);
  });

  it("throws for a key version it has no key for", () => {
    const { ciphertext } = encryptPii("x");
    expect(() => decryptPii(ciphertext, 99)).toThrow(PiiKeyMissingError);
  });
});

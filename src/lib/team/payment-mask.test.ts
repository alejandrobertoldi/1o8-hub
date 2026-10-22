import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { encryptPii } from "@/lib/crypto/pii";
import { maskPayment, resolveWiseQrUrl } from "./payment-mask";

const KEY = Buffer.alloc(32, 7).toString("base64");
const original = process.env.USER_PII_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.USER_PII_ENCRYPTION_KEY = KEY;
});

afterEach(() => {
  if (original === undefined) delete process.env.USER_PII_ENCRYPTION_KEY;
  else process.env.USER_PII_ENCRYPTION_KEY = original;
});

describe("resolveWiseQrUrl", () => {
  it("returns legacy plaintext data URLs unchanged", () => {
    const plain = "data:image/png;base64,abc";
    expect(resolveWiseQrUrl(plain, 1)).toBe(plain);
  });

  it("decrypts ciphertext for the authorized viewer", () => {
    const plain = "data:image/png;base64,abc";
    const { ciphertext, keyVersion } = encryptPii(plain);
    expect(resolveWiseQrUrl(ciphertext, keyVersion)).toBe(plain);
  });

  it("never returns ciphertext when the key is missing", () => {
    const { ciphertext, keyVersion } = encryptPii("data:image/png;base64,abc");
    delete process.env.USER_PII_ENCRYPTION_KEY;
    expect(resolveWiseQrUrl(ciphertext, keyVersion)).toBeNull();
  });
});

describe("maskPayment", () => {
  it("never exposes ciphertext column names", () => {
    const enc = encryptPii("data:image/png;base64,abc");
    const masked = maskPayment({
      userId: "u1",
      paymentMethod: "wise",
      paymentCadence: "monthly",
      invoicesRequired: false,
      payeeName: "Manu",
      bankName: null,
      bankCountry: null,
      accountIdentifierCiphertext: "SECRET",
      accountIdentifierLast4: "1234",
      taxIdCiphertext: null,
      taxIdLast4: null,
      wiseQrUrl: enc.ciphertext,
      keyVersion: enc.keyVersion,
      createdAt: new Date(),
      updatedAt: null,
      updatedBy: null,
    });
    expect(masked).not.toHaveProperty("accountIdentifierCiphertext");
    expect(masked).not.toHaveProperty("taxIdCiphertext");
    expect(JSON.stringify(masked)).not.toContain("SECRET");
    expect(masked.wiseQrUrl).toBe("data:image/png;base64,abc");
    expect(masked.hasAccountIdentifier).toBe(true);
  });
});

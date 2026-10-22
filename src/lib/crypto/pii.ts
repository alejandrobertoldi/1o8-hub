import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-layer encryption for bank and tax identifiers (spec D4).
 *
 * Supabase has no per-column encryption, and this repo has already shipped one
 * SQL-injection read bug, so a database-only leak vector is real. The cost is
 * accepted deliberately: these fields can never be searched or sorted.
 *
 * There is NO plaintext fallback. A missing or wrong-length key throws
 * PiiKeyMissingError at call time and the route maps that to 503 — storing a
 * plaintext IBAN in a column named `..._ciphertext` would be worse than
 * refusing the write, because nothing downstream would ever notice.
 */

/** 96-bit IV, the size AES-GCM is specified for. */
const IV_BYTES = 12;
/** 128-bit GCM auth tag, Node's default. */
const TAG_BYTES = 16;

/**
 * The key version stamped onto every new ciphertext. `key_version` exists on
 * user_payment_details so the key can be rotated without a schema change: a
 * future rotation adds version 2 here and keeps a decrypt path for 1.
 */
export const PII_KEY_VERSION = 1;

export class PiiKeyMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiiKeyMissingError";
  }
}

function loadKey(): Buffer {
  const raw = process.env.USER_PII_ENCRYPTION_KEY;
  if (!raw) {
    throw new PiiKeyMissingError(
      "USER_PII_ENCRYPTION_KEY is not set — payment details are unavailable"
    );
  }
  // Buffer.from(…, "base64") silently discards characters outside the base64
  // alphabet instead of throwing, so garbage in produces a short buffer rather
  // than an error. The length check below is therefore the only real guard.
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new PiiKeyMissingError(
      `USER_PII_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`
    );
  }
  return key;
}

/**
 * The plaintext tail stored alongside the ciphertext so the masked display
 * (`••••4821`) never needs to decrypt. Whitespace is stripped first, so a
 * hand-typed "GB29 NWBK … 68 19" masks the same as the unspaced form. Inputs
 * shorter than four characters return whole — the column is varchar(4).
 */
export function last4(plaintext: string): string {
  return plaintext.replace(/\s+/g, "").slice(-4);
}

/** Encrypts to `base64(iv ‖ authTag ‖ ciphertext)`. */
export function encryptPii(plaintext: string): {
  ciphertext: string;
  last4: string;
  keyVersion: number;
} {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([iv, tag, body]).toString("base64"),
    last4: last4(plaintext),
    keyVersion: PII_KEY_VERSION,
  };
}

/** Reverses `encryptPii`. Throws on a tampered payload — GCM authenticates. */
export function decryptPii(ciphertext: string, keyVersion: number): string {
  if (keyVersion !== PII_KEY_VERSION) {
    throw new PiiKeyMissingError(
      `No decryption key for key_version ${keyVersion}`
    );
  }
  const key = loadKey();
  const buf = Buffer.from(ciphertext, "base64");
  if (buf.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Stored ciphertext is too short to be valid");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

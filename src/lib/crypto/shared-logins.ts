import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const AAD = Buffer.from("mfhub-shared-logins-v1");
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  const configured = process.env.SHARED_LOGINS_ENCRYPTION_KEY;
  if (configured) {
    const bytes = Buffer.from(configured, "base64");
    if (bytes.length !== 32) {
      throw new Error("SHARED_LOGINS_ENCRYPTION_KEY must decode to 32 bytes.");
    }
    return bytes;
  }
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET must be configured for shared logins.");
  }
  return Buffer.from(hkdfSync("sha256", secret, "mfhub", "shared-logins-v1", 32));
}

export type SharedLoginSecret = {
  password: string;
  notes: string;
  accountPasswords: string[];
  subscriptionPasswords: string[][];
};

function asPasswordList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => (typeof item === "string" ? item : ""));
}

function normalizeSecret(data: Partial<SharedLoginSecret>): SharedLoginSecret {
  const password = typeof data.password === "string" ? data.password : "";
  let subscriptionPasswords: string[][] = Array.isArray(data.subscriptionPasswords)
    ? data.subscriptionPasswords.map((group) => asPasswordList(group))
    : [];
  let accountPasswords = asPasswordList(data.accountPasswords);
  if (subscriptionPasswords.length === 0) {
    if (accountPasswords.length > 0) subscriptionPasswords = [accountPasswords];
    else if (password) subscriptionPasswords = [[password]];
  }
  accountPasswords = subscriptionPasswords.flat();
  return {
    password: password || accountPasswords[0] || "",
    notes: typeof data.notes === "string" ? data.notes : "",
    accountPasswords,
    subscriptionPasswords,
  };
}

export function sealSharedLoginSecret(data: Partial<SharedLoginSecret> & {
  password: string;
  notes: string;
}): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(AAD);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(normalizeSecret(data)), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function unsealSharedLoginSecret(value: string): SharedLoginSecret {
  const buffer = Buffer.from(value, "base64");
  if (buffer.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Stored shared-login ciphertext is too short to be valid.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    buffer.subarray(0, IV_BYTES)
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(buffer.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  const parsed = JSON.parse(
    Buffer.concat([
      decipher.update(buffer.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8")
  ) as Partial<SharedLoginSecret>;
  return normalizeSecret(parsed);
}

export function emptySharedLoginSecret(): SharedLoginSecret {
  return {
    password: "",
    notes: "",
    accountPasswords: [],
    subscriptionPasswords: [],
  };
}


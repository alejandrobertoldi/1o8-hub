import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

function key() {
  const configured = process.env.HELIUM10_ENCRYPTION_KEY;
  if (configured) {
    const bytes = Buffer.from(configured, "base64");
    if (bytes.length !== 32) throw new Error("Invalid Helium 10 encryption key.");
    return bytes;
  }
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET must be configured for Helium 10 connections.");
  return Buffer.from(hkdfSync("sha256", secret, "mfhub", "helium10-oauth-v1", 32));
}
export function seal(data: unknown, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(userId));
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
export function unseal<T>(value: string, userId: string): T {
  const buffer = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buffer.subarray(0, 12));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString("utf8")) as T;
}
export type PendingState = { state: string; expiresAt: number; projectId: string; authorizedBy?: string };
export function consumeState(data: { pending?: PendingState }, state: string | null): string {
  const pending = data.pending;
  if (!pending || !state || pending.expiresAt < Date.now()) throw new Error("Helium 10 connection expired. Please connect again.");
  const actual = Buffer.from(state), expected = Buffer.from(pending.state);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid Helium 10 authorization state.");
  delete data.pending;
  return pending.projectId;
}

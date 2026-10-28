import fs from "node:fs";
import path from "node:path";

/**
 * The hub's Google service account (AAC sheet sync, shared time off calendar).
 * GOOGLE_SERVICE_ACCOUNT_JSON holds the key file's JSON, raw or base64
 * (Vercel); locally ./google-service-account.json (gitignored).
 */
export type ServiceAccount = { client_email: string; private_key: string };

export function googleServiceAccount(): ServiceAccount | null {
  const env = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (env) {
    try {
      const json = env.startsWith("{") ? env : Buffer.from(env, "base64").toString("utf8");
      return JSON.parse(json) as ServiceAccount;
    } catch {
      console.error("[google] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (raw or base64)");
      return null;
    }
  }
  const file = path.join(process.cwd(), "google-service-account.json");
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as ServiceAccount) : null;
}


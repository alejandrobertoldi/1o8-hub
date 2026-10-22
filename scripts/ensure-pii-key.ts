/**
 * Ensures USER_PII_ENCRYPTION_KEY exists in .env.local.
 * Safe to re-run — never overwrites an existing key.
 *
 *   npx tsx scripts/ensure-pii-key.ts
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.cwd(), ".env.local");

function main() {
  if (!existsSync(path)) {
    console.error(".env.local not found — create it from .env.example first");
    process.exit(1);
  }
  const current = readFileSync(path, "utf8");
  if (/^USER_PII_ENCRYPTION_KEY=\S+/m.test(current)) {
    console.log("USER_PII_ENCRYPTION_KEY already set in .env.local — left untouched.");
    console.log("Restart the Next.js dev server if payment save still 503s.");
    return;
  }
  const key = randomBytes(32).toString("base64");
  const block =
    "\n# AES-256-GCM for payment identifiers (Wise ID, tax ID, Wise QR).\n" +
    `USER_PII_ENCRYPTION_KEY=${key}\n`;
  writeFileSync(path, current.replace(/\s*$/, "") + block, "utf8");
  console.log("Added USER_PII_ENCRYPTION_KEY to .env.local");
  console.log("Restart `npm run dev`, then retry Save on the Payment card.");
  console.log(
    "Also add the same value to Vercel production before deploying payment writes."
  );
}

main();

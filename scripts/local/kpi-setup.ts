/**
 * Moves the Main KPI setup between databases (local → production on release).
 *
 *   npm run kpi:setup -- --export            # local clients' KPI config → scripts/kpi-setup.json
 *   npm run kpi:setup -- --apply             # scripts/kpi-setup.json → local DB
 *   npm run kpi:setup -- --apply --prod      # scripts/kpi-setup.json → production DB
 *   npm run kpi:setup -- --secrets --prod    # connected accounts (GA4, Meta, Klaviyo keys) → production
 *
 * The JSON holds no secrets: each client's Main KPIs, GA4 properties, Meta ad
 * accounts and Shopify store. --secrets copies the sealed integration tokens
 * as they are, so it only runs when production uses the same
 * USER_PII_ENCRYPTION_KEY as local (compared, never printed); otherwise
 * reconnect them in production's Sync & Export → KPIs.
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { parse } from "dotenv";

const FILE = path.join(process.cwd(), "scripts", "kpi-setup.json");
const KEYS = ["MainKPIs", "Main KPI", "GA4Property", "MetaAdAccount", "ShopifyStore"];
const args = process.argv.slice(2);
const prod = args.includes("--prod");

function db(target: "local" | "prod") {
  const url = target === "prod" ? process.env.SUPABASE_DATABASE_URL?.replace(":6543/", ":5432/") : process.env.DATABASE_URL;
  if (!url) throw new Error(`${target === "prod" ? "SUPABASE_DATABASE_URL" : "DATABASE_URL"} is missing from .env.local`);
  return postgres(url, { prepare: false, max: 1 });
}

async function exportSetup() {
  const sql = db("local");
  const rows = await sql<{ code: string; raw: Record<string, string> | null }[]>`select client_id_code as code, raw_data as raw from aac order by client_id_code`;
  const setup: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    // "Main KPI" is the AAC sheet's column: carry it only when the hub's own
    // list (MainKPIs) wrote it, never an older copy of the sheet's text.
    const keys = KEYS.filter((k) => r.raw?.[k]?.trim() && (k !== "Main KPI" || r.raw?.MainKPIs?.trim()));
    const picked = Object.fromEntries(keys.map((k) => [k, r.raw![k]]));
    if (Object.keys(picked).length) setup[r.code] = picked;
  }
  fs.writeFileSync(FILE, JSON.stringify(setup, null, 2) + "\n");
  console.log(`Exported ${Object.keys(setup).length} clients to scripts/kpi-setup.json`);
  await sql.end();
}

async function applySetup() {
  const setup = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, Record<string, string>>;
  const sql = db(prod ? "prod" : "local");
  let n = 0;
  for (const [code, values] of Object.entries(setup)) {
    const res = await sql`update aac set raw_data = coalesce(raw_data, '{}'::jsonb) || ${sql.json(values)}, updated_at = now() where client_id_code = ${code}`;
    if (res.count) n++;
    else console.log(`  ${code}: not found in ${prod ? "production" : "local"}`);
  }
  console.log(`Applied KPI setup to ${n} clients in ${prod ? "production" : "local"}`);
  await sql.end();
}

async function copySecrets() {
  if (!prod) throw new Error("--secrets only copies local → production (add --prod)");
  const vercel = path.join(process.cwd(), ".env.vercel");
  const prodKey = fs.existsSync(vercel) ? parse(fs.readFileSync(vercel)).USER_PII_ENCRYPTION_KEY : undefined;
  if (!prodKey || prodKey !== process.env.USER_PII_ENCRYPTION_KEY) {
    console.log("Production's USER_PII_ENCRYPTION_KEY differs from local (or .env.vercel has none): reconnect Google Analytics, Meta and the Klaviyo keys in production instead.");
    return;
  }
  const local = db("local");
  const remote = db("prod");
  const rows = await local`select * from integration_tokens where provider = 'google_analytics' or provider = 'meta' or provider like 'klaviyo:%'`;
  for (const r of rows) {
    await remote`insert into integration_tokens ${remote(r)} on conflict (provider) do update set sealed = excluded.sealed, key_version = excluded.key_version, meta = excluded.meta, expires_at = excluded.expires_at, updated_at = now()`;
    console.log(`  copied ${r.provider}`);
  }
  console.log(`Copied ${rows.length} connections to production`);
  await local.end();
  await remote.end();
}

async function main() {
  if (args.includes("--export")) return exportSetup();
  if (args.includes("--apply")) return applySetup();
  if (args.includes("--secrets")) return copySecrets();
  console.log("Use --export, --apply [--prod] or --secrets --prod");
}
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });

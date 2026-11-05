/**
 * Fills each active client's Google Ads customer ID (GoogleAdsCustomerId)
 * from 1o8's MCC (359-589-4352), matched by account name on 2026-11-05.
 * Only fills clients that have none; prints what it would do unless --apply.
 *
 *   npm run google-ads:ids                    # local DB, dry run
 *   npm run google-ads:ids -- --prod --apply  # production
 */
import { config } from "dotenv";
config({ path: ".env.local" });

/** Hub client code → its Google Ads account(s) under the MCC (several are summed). */
const IDS: Record<string, { ids: string; account: string }> = {
  BOU: { ids: "202-947-7492", account: "Shop Bouclier" },
  CHS: { ids: "454-636-1960", account: "Chicago Strength" },
  ELK: { ids: "245-632-8992", account: "ELK Wellness" },
  KSS: { ids: "392-062-4532", account: "K9 Sport Sack" },
  LBC: { ids: "171-313-9739", account: "Loam Blocks LLC" },
  LPS: { ids: "200-426-2368", account: "Le Petit Sucre Ltd." },
  MKI: { ids: "536-623-6205", account: "MakeInspires Team Building" },
  MSN: { ids: "484-099-4127", account: "Mission Cooling - Active" },
  MSP: { ids: "648-160-8529", account: "Mauser Packaging" },
  NND: { ids: "463-795-1552", account: "nobody's nobody" },
  NNG: { ids: "644-894-3231", account: "Naf Naf Grill" },
  PKI: { ids: "246-353-2305", account: "Pikos Institute" },
  PLB: { ids: "261-575-1392", account: "Pillar Booth" },
  PUR: { ids: "531-336-2280", account: "Pura" },
  RFJ: { ids: "362-815-7713", account: "RFJ Packaging, LLC" },
  SKM: { ids: "763-402-1150", account: "SKM" },
  SLP: { ids: "837-622-7811", account: "SOULOPOP" },
  SPF: { ids: "334-376-5862, 579-710-3723", account: "Smack Pet Food + Smack Pet Food USA" },
  STS: { ids: "728-783-3305", account: "Star Sweat" },
};

async function main() {
  const apply = process.argv.includes("--apply");
  if (process.argv.includes("--prod")) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is missing from .env.local");
    process.env.DATABASE_URL = url;
    process.env.DB_POOLER = "transaction";
  }
  const { db } = await import("@/lib/db");
  const { aac } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = await db.select({ code: aac.clientIdCode, name: aac.clientName, raw: aac.rawData }).from(aac);
  for (const [code, { ids, account }] of Object.entries(IDS)) {
    const row = rows.find((r) => r.code.toUpperCase() === code);
    if (!row) {
      console.log(`${code.padEnd(4)} not in the hub`);
      continue;
    }
    const raw = (row.raw ?? {}) as Record<string, string>;
    const current = raw.GoogleAdsCustomerId?.trim();
    if (current) {
      console.log(`${code.padEnd(4)} already ${current}${current === ids ? "" : `  (MCC says ${ids})`}`);
      continue;
    }
    console.log(`${code.padEnd(4)} ${apply ? "set" : "would set"} ${ids}  ← ${account}  (${row.name})`);
    if (!apply) continue;
    // A hub-only raw_data key: no typed column, sheet or BigQuery mirror to update.
    await db.update(aac).set({ rawData: { ...raw, GoogleAdsCustomerId: ids }, updatedAt: new Date() }).where(eq(aac.clientIdCode, row.code));
  }
  if (!apply) console.log("\nDry run. Add --apply to write.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

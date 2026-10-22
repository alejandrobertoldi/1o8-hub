/**
 * One-time production data migration: rename the 9 team-role keys in
 * aac.raw_data from the old _1o8M suffix to _MF, matching the app-code
 * rename in src/lib/constants.ts (TEAM_ROLES) and its consumers.
 *
 * _1o8A keys (1o8 Agency) are untouched — separate entity, not renamed.
 *
 * Run: npx tsx scripts/migrations/2026-08-03-team-role-suffix-rename/rename-1o8m-keys-to-mf.ts
 */
import { config } from "dotenv";
config({ path: "/Users/manu/MFHub/.env.local" });
import postgres from "postgres";

const KEYS = [
  "ExecutiveStrategist_1o8M",
  "AccountManager_1o8M",
  "ProjectManager_1o8M",
  "ProjectManagerAsana_1o8M",
  "DesignManager_1o8M",
  "SEOManager_1o8M",
  "PPCManager_1o8M",
  "CatalogManager_1o8M",
  "DesignUploadManager_1o8M",
];

const directUrl = (process.env.DATABASE_URL || "").replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function counts(keys: string[]) {
  return sql<{ key: string; cnt: number }[]>`
    SELECT key, COUNT(*)::int AS cnt
    FROM aac, jsonb_object_keys(raw_data) AS key
    WHERE jsonb_typeof(raw_data) = 'object' AND key = ANY(${keys})
    GROUP BY key
    ORDER BY key
  `;
}

async function main() {
  console.log("BEFORE (old _1o8M keys):");
  for (const r of await counts(KEYS)) console.log(`  ${r.key}\t${r.cnt}`);

  await sql.begin(async (tx) => {
    for (const oldKey of KEYS) {
      const newKey = oldKey.replace(/_1o8M$/, "_MF");
      const result = await tx`
        UPDATE aac SET raw_data =
          (raw_data - ${oldKey}::text) || jsonb_build_object(${newKey}::text, raw_data->${oldKey}::text)
        WHERE raw_data ? ${oldKey}::text
      `;
      console.log(`renamed ${oldKey} -> ${newKey}: ${result.count} rows`);
    }
  });

  const newKeys = KEYS.map((k) => k.replace(/_1o8M$/, "_MF"));
  console.log("\nAFTER (new _MF keys):");
  for (const r of await counts(newKeys)) console.log(`  ${r.key}\t${r.cnt}`);
  console.log("\nAFTER (old _1o8M keys, should be empty):");
  const remaining = await counts(KEYS);
  if (remaining.length === 0) console.log("  (none remain)");
  for (const r of remaining) console.log(`  ${r.key}\t${r.cnt}`);

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});

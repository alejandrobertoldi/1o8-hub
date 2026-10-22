/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Seed intentwise_accounts by discovering account IDs from Redshift.
 *
 * NOT seeded from REPORT_CLIENTS (spec §4 says to; that is a deliberate
 * deviation). As of 2026-07-31 that array is wrong for 8 of 23 distinct
 * accounts: six live accounts are missing from it and two of its entries no
 * longer exist upstream. Seeding from it would silently omit six clients
 * from archival. Redshift itself is the authoritative answer to the only
 * question archival cares about — which account_id values have rows in the
 * cluster we are archiving.
 *
 * REPORT_CLIENTS is used only as a mapping hint to attribute an account_id
 * to a client_id_code. Unmapped accounts are inserted with a NULL client
 * code and reported loudly.
 *
 * Idempotent: re-running upserts and never deletes.
 *
 * Run: npm run seed-intentwise-accounts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { queryRedshiftOrThrow } from "../src/lib/redshift";
import { toNumber, assertSafeIdentifier } from "../src/lib/archive/catalog";
import { REPORT_CLIENTS } from "../src/lib/report-clients";

/**
 * Discovery source: the account-grain ads table present for every client.
 *
 * Validated at module load even though these are compile-time constants —
 * the Global Constraint is that NO identifier reaches a SQL string without
 * passing assertSafeIdentifier, with no "but this one is safe" exceptions.
 * An exception is how the next one gets written.
 */
const DISCOVERY_SCHEMA = assertSafeIdentifier("intentwise_ecommerce_graph");
const DISCOVERY_TABLE = assertSafeIdentifier("account_summary");

async function main() {
  const { db } = await import("../src/lib/db");
  const { intentwiseAccounts, aac } = await import("../src/lib/db/schema");
  const { sql } = await import("drizzle-orm");

  console.log(`=== Discovering account IDs from ${DISCOVERY_SCHEMA}.${DISCOVERY_TABLE} ===\n`);

  // Identifiers are compile-time constants here, not user input. Still no
  // interpolation of anything dynamic.
  const discovered = await queryRedshiftOrThrow<{ account_id: string; n: string; min_date: string; max_date: string }>(
    `SELECT account_id,
            COUNT(*)          AS n,
            MIN(report_date)  AS min_date,
            MAX(report_date)  AS max_date
       FROM ${DISCOVERY_SCHEMA}.${DISCOVERY_TABLE}
      GROUP BY account_id
      ORDER BY account_id`
  );

  if (discovered.length === 0) {
    throw new Error("Discovery returned zero accounts — refusing to seed. Check Redshift connectivity.");
  }
  console.log(`Found ${discovered.length} distinct account IDs in Redshift.\n`);

  // Build the mapping hint: account_id -> client display name, then resolve
  // that name to a client_id_code via aac.
  const nameByAccountId = new Map<string, string>();
  for (const rc of REPORT_CLIENTS) {
    for (const id of rc.accountIds) nameByAccountId.set(id, rc.name);
  }

  const aacRows = await db.select({ code: aac.clientIdCode, name: aac.clientName }).from(aac);
  const codeByName = new Map<string, string>();
  for (const r of aacRows) {
    if (r.name) codeByName.set(r.name.trim().toLowerCase(), r.code);
  }

  const unmapped: string[] = [];
  let inserted = 0;
  let updated = 0;

  for (const row of discovered) {
    const accountId = String(row.account_id);
    const hintName = nameByAccountId.get(accountId) ?? null;
    const clientIdCode = hintName ? codeByName.get(hintName.trim().toLowerCase()) ?? null : null;
    if (!clientIdCode) unmapped.push(accountId);

    const result = await db
      .insert(intentwiseAccounts)
      .values({
        accountId,
        clientIdCode,
        label: hintName,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: intentwiseAccounts.accountId,
        // Never clobber a client code a human has already set by hand.
        //
        // is_active and stopped_at are DELIBERATELY absent from this set list.
        // is_active is the capture gate for lifecycle-gated archival, so
        // re-running this script must never resurrect capture for an account
        // the offboarding gate has stopped. isActive: true above therefore
        // applies to brand-new rows only. Do not "complete" this set block.
        set: {
          clientIdCode: sql`COALESCE(${intentwiseAccounts.clientIdCode}, EXCLUDED.client_id_code)`,
          label: sql`COALESCE(${intentwiseAccounts.label}, EXCLUDED.label)`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: intentwiseAccounts.id, addedAt: intentwiseAccounts.addedAt });

    const isNew = result[0] && Date.now() - new Date(result[0].addedAt).getTime() < 5000;
    if (isNew) inserted++; else updated++;

    console.log(
      `  ${accountId.padEnd(10)} ${(clientIdCode ?? "UNMAPPED").padEnd(24)} ` +
      `rows=${toNumber(row.n).toLocaleString().padStart(12)} ` +
      `${row.min_date} → ${row.max_date}`
    );
  }

  console.log(`\nUpserted: ${inserted} new, ${updated} existing.`);

  // Reconciliation against REPORT_CLIENTS, in both directions.
  const discoveredIds = new Set(discovered.map((d) => String(d.account_id)));
  const staleInArray = [...nameByAccountId.keys()].filter((id) => !discoveredIds.has(id));

  if (unmapped.length) {
    console.log(`\n⚠️  ${unmapped.length} account(s) have Redshift data but NO client_id_code.`);
    console.log(`   These will be skipped by archival until a human attributes them:`);
    for (const id of unmapped) console.log(`     ${id}`);
    console.log(`   Fix: UPDATE intentwise_accounts SET client_id_code = '<code>' WHERE account_id = '<id>';`);
  }

  if (staleInArray.length) {
    console.log(`\n🔍 ${staleInArray.length} account(s) in REPORT_CLIENTS have NO rows in Redshift:`);
    for (const id of staleInArray) console.log(`     ${id} (${nameByAccountId.get(id)})`);
    console.log(`   Known former clients as of 2026-07-31: 3629290 (Brad's), 563510 (This PKN).`);
    console.log(`   If these are absent, deactivation likely PURGES history → spec §13.4 answered YES,`);
    console.log(`   and the nightly job is the only chance we ever get.`);
  } else {
    console.log(`\n🔍 Every REPORT_CLIENTS account still has rows in Redshift, including any`);
    console.log(`   deactivated ones. That is evidence deactivation does NOT purge → spec §13.4.`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

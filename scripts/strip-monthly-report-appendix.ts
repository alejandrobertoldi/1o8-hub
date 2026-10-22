/**
 * Strip appendix from stored monthly report JSON (no Redshift regenerate).
 * Run with: npx tsx scripts/strip-monthly-report-appendix.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
import postgres from "postgres";
import { reportHasAppendix, stripAppendixFromReport } from "../src/lib/monthly-report/strip-appendix";

config({ path: resolve(process.cwd(), ".env.local") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1 });

async function main() {
  const rows = await sql<{
    id: string;
    client_id_code: string;
    period: string;
    report: unknown;
  }[]>`
    SELECT id, client_id_code, period, report
    FROM monthly_reports
    WHERE report IS NOT NULL
  `;

  let updated = 0;
  for (const row of rows) {
    if (!reportHasAppendix(row.report)) continue;
    const next = stripAppendixFromReport(row.report);
    await sql`
      UPDATE monthly_reports
      SET report = ${sql.json(next as Parameters<typeof sql.json>[0])}, updated_at = now()
      WHERE id = ${row.id}::uuid
    `;
    updated += 1;
    console.log(`stripped ${row.client_id_code} ${row.period}`);
  }

  console.log(`Done. ${updated} of ${rows.length} reports updated.`);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});

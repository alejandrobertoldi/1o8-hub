/**
 * ONE-OFF (2026-09-28, Thread AB): delete the legacy 13-section case studies before the
 * two-format rebuild. Approved by Manu in chat 2026-09-28 ("2 go ahead").
 * Expected: exactly C23_SC_US, GLO_SC_US, REA_SC_US (all draft). Sections cascade.
 * Dry run by default; pass --confirm to delete. Aborts if the rows differ from expectation.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const EXPECTED = ["C23_SC_US", "GLO_SC_US", "REA_SC_US"];

async function main() {
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const confirm = process.argv.includes("--confirm");

  const rows = (await db.execute(sql`
    select cs.id, cs.client_id_code, cs.status,
      (select count(*)::int from case_study_sections s where s.case_study_id = cs.id) as sections
    from case_studies cs order by cs.client_id_code`)) as unknown as {
    id: string; client_id_code: string; status: string; sections: number;
  }[];
  console.log(JSON.stringify(rows, null, 1));

  const codes = rows.map((r) => r.client_id_code).sort();
  if (JSON.stringify(codes) !== JSON.stringify(EXPECTED) || rows.some((r) => r.status !== "draft")) {
    console.error("ABORT: rows differ from the approved set; nothing deleted.");
    process.exit(2);
  }
  if (!confirm) {
    console.log(`DRY RUN: would delete ${rows.length} case studies + ${rows.reduce((a, r) => a + r.sections, 0)} sections. Re-run with --confirm.`);
    process.exit(0);
  }
  const del = (await db.execute(sql`
    delete from case_studies where client_id_code in ('C23_SC_US','GLO_SC_US','REA_SC_US') and status = 'draft'
    returning client_id_code`)) as unknown as { client_id_code: string }[];
  const left = (await db.execute(sql`select count(*)::int as n from case_study_sections`)) as unknown as { n: number }[];
  console.log(`DELETED ${del.length}: ${del.map((d) => d.client_id_code).join(", ")}; case_study_sections remaining: ${left[0].n}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

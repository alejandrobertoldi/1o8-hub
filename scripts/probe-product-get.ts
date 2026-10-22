/**
 * Reproduce GET /api/products/[id] logic against the live DB to surface
 * the 500 we're seeing in Vercel.
 *
 * Tests BOTH connection modes:
 *   - Direct (port 5432) — what scripts/lookup-uuids.ts uses
 *   - Pooler (port 6543, pgBouncer) — what the app uses on Vercel
 *
 * Read-only.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

const TARGET_ID = process.argv[2] ?? "b092e3bc-7799-45aa-9062-9c50c6e73e06";

async function probe(label: string, connStr: string, options: postgres.Options<{}>) {
  console.log(`\n══════════════════════════════════════════════════════════════════`);
  console.log(`  ${label}`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  const sql = postgres(connStr, options);
  try {
    console.log(`→ Step 1: SELECT * FROM master WHERE id = '${TARGET_ID}'`);
    const product = await sql`SELECT * FROM master WHERE id = ${TARGET_ID} LIMIT 1`;
    if (product.length === 0) {
      console.log("  ✗ no row");
      return;
    }
    const p = product[0];
    console.log(`  ✓ found  client=${p.client_id_code}  sku=${p.sku}`);

    console.log("→ Step 2: comment counts");
    const commentRows = await sql`
      SELECT bq_name,
             COUNT(*)::int AS total,
             COUNT(CASE WHEN resolved = false THEN 1 END)::int AS open
      FROM field_comments
      WHERE product_id = ${TARGET_ID}
      GROUP BY bq_name
    `;
    console.log(`  ✓ ${commentRows.length} groups`);

    console.log("→ Step 3: AAC lookup");
    if (p.client_id_code) {
      const aacRows = await sql`
        SELECT raw_data FROM aac WHERE client_id_code = ${p.client_id_code} LIMIT 1
      `;
      console.log(`  ✓ aac rows=${aacRows.length}`);
    }

    console.log("→ Step 4: build response & JSON.stringify");
    const body = {
      ...p,
      _commentCounts: {},
      _aacData: { intentwiseId: null, marketplace: null, country: null, brandName: null },
      _parentInfo: null,
    };
    const s = JSON.stringify(body);
    console.log(`  ✓ ${s.length} bytes — full handler logic completed cleanly`);
  } catch (e) {
    console.log(`✗✗✗ THROWS: ${(e as Error).name}: ${(e as Error).message}`);
    if ((e as { code?: string }).code) {
      console.log(`    code=${(e as { code?: string }).code}`);
    }
  } finally {
    await sql.end();
  }
}

async function main() {
  const url = process.env.DATABASE_URL!;
  const direct = url.replace(":6543/", ":5432/");
  const pooler = url.replace(":5432/", ":6543/");

  console.log(`Target id: ${TARGET_ID}`);
  console.log(`URL ports: direct=${direct.match(/:(\d+)\//)?.[1]}  pooler=${pooler.match(/:(\d+)\//)?.[1]}`);

  await probe("DIRECT (port 5432)", direct, { ssl: "require" });

  // pgBouncer transaction mode requires prepare:false (which is what src/lib/db sets)
  await probe("POOLER (port 6543, prepare:false)", pooler, {
    ssl: "require",
    prepare: false,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("fatal:", err);
    process.exit(1);
  });

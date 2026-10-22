/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
/**
 * Reproduce GET /api/products/[id] using the actual src/lib/db Drizzle
 * client — same code path as the handler. Skips auth.
 *
 * Uses dynamic import to ensure dotenv loads before src/lib/db is evaluated.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

const TARGET_ID = process.argv[2] ?? "b092e3bc-7799-45aa-9062-9c50c6e73e06";

async function main() {
  // Dynamic imports so dotenv runs before src/lib/db reads DATABASE_URL
  const { db } = await import("../src/lib/db");
  const { master, fieldComments, aac } = await import("../src/lib/db/schema");
  const { eq, and, sql, count } = await import("drizzle-orm");

  console.log(`Probing handler logic with Drizzle for ${TARGET_ID}\n`);

  console.log("→ Step 1: select master");
  const product = await db
    .select()
    .from(master)
    .where(eq(master.id, TARGET_ID))
    .limit(1);
  if (product.length === 0) {
    console.log("  ✗ no row");
    process.exit(0);
  }
  const p = product[0];
  console.log(`  ✓ found ${p.clientIdCode}/${p.sku}  level=${p.parentageLevel}`);

  console.log("\n→ Step 2: comment counts (Drizzle count(sql\`CASE WHEN...\`))");
  const commentRows = await db
    .select({
      bqName: fieldComments.bqName,
      total: count(),
      open: count(sql`CASE WHEN ${fieldComments.resolved} = false THEN 1 END`),
    })
    .from(fieldComments)
    .where(eq(fieldComments.productId, TARGET_ID))
    .groupBy(fieldComments.bqName);
  console.log(`  ✓ ${commentRows.length} groups`);

  console.log("\n→ Step 3: AAC");
  if (p.clientIdCode) {
    const [aacRow] = await db
      .select({ rawData: aac.rawData })
      .from(aac)
      .where(eq(aac.clientIdCode, p.clientIdCode))
      .limit(1);
    console.log(`  ✓ ${aacRow ? "found" : "none"}`);
  }

  console.log("\n→ Step 4: parent lookup if child");
  const level = p.parentageLevel?.toLowerCase();
  if (level === "child" && !p.parentSku && p.variationRef) {
    const [parentRow] = await db
      .select({ sku: master.sku, asin: master.asin })
      .from(master)
      .where(
        and(
          eq(master.variationRef, p.variationRef),
          sql`lower(${master.parentageLevel}) = 'parent'`
        )
      )
      .limit(1);
    console.log(`  ✓ parent=${parentRow?.sku ?? "none"}`);
  } else {
    console.log("  (skipped)");
  }

  console.log("\n→ Step 5: assemble response");
  const body = { ...p, _commentCounts: {}, _aacData: {}, _parentInfo: null };
  const s = JSON.stringify(body);
  console.log(`  ✓ ${s.length} bytes`);

  console.log("\n✓ All handler steps complete with Drizzle client.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗✗✗ THREW:", err);
  console.error("\nStack:\n" + (err as Error).stack);
  process.exit(1);
});

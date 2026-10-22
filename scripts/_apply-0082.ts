import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");

  // 1. Enum value add — MUST be its own statement (cannot run in a txn block).
  console.log("Adding enum value split_section ...");
  await db.execute(sql`ALTER TYPE storefront_module_type ADD VALUE IF NOT EXISTS 'split_section'`);

  // 2. Tiles table.
  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0082_storefront_split_section.sql",
    "utf8"
  );
  console.log("Applying 0082_storefront_split_section.sql ...");
  await db.execute(sql.raw(migSql));

  // 3. Verify.
  const tbl = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'storefront_module_tiles'
  `);
  const enumVal = await db.execute(sql`
    SELECT 1 AS ok FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'storefront_module_type' AND e.enumlabel = 'split_section'
  `);
  console.log("storefront_module_tiles table:", tbl);
  console.log("split_section enum value rows:", enumVal);
  if ((tbl as unknown[]).length !== 1) throw new Error("storefront_module_tiles table missing");
  if ((enumVal as unknown[]).length !== 1) throw new Error("split_section enum value missing");
  console.log("0082 applied OK.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

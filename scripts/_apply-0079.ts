import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");
  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0079_storefront_module_fields.sql",
    "utf8"
  );
  console.log("Applying 0079_storefront_module_fields.sql ...");
  await db.execute(sql.raw(migSql));

  const cols = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'storefront_modules'
      AND column_name IN (
        'contains_ai_people',
        'section_layout',
        'poster_drive_file_id',
        'poster_mime_type',
        'poster_filename'
      )
    ORDER BY column_name
  `);
  console.log("Columns present:", cols);
  if ((cols as unknown[]).length !== 5) {
    throw new Error(`expected 5 new columns, found ${(cols as unknown[]).length}`);
  }
  console.log("0079 applied OK.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

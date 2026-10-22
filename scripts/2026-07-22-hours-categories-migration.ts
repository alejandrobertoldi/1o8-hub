import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS hour_categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const seed = ["PPC", "SEO", "Design", "Asana", "Gmail", "Drive", "Markup", "Meetings", "Other"];
  for (let i = 0; i < seed.length; i++) {
    await db.execute(sql`
      INSERT INTO hour_categories (name, sort_order)
      VALUES (${seed[i]}, ${i})
      ON CONFLICT (name) DO NOTHING
    `);
  }

  await db.execute(sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS category text`);

  const cats = await db.execute(sql`SELECT name, sort_order FROM hour_categories ORDER BY sort_order`);
  console.log("hour_categories:", cats);
  const col = await db.execute(sql`
    SELECT column_name, is_nullable, data_type FROM information_schema.columns
    WHERE table_name = 'time_entries' AND column_name = 'category'
  `);
  console.log("time_entries.category:", col);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

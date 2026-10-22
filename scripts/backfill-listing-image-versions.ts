import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function main() {
  console.log("Backfilling listing_image_slot_versions...");

  const result = await db.execute(sql`
    INSERT INTO listing_image_slot_versions
      (id, client_id_code, product_id, slot, version_number, drive_file_id, created_by)
    SELECT
      gen_random_uuid(),
      df2.client_id_code,
      df.entity_id::text,
      split_part(df.display_name, '.', 2),
      1,
      df.id,
      df.uploaded_by
    FROM drive_files df
    JOIN drive_folders df2 ON df2.id = df.folder_id
    WHERE df.entity_type = 'listing_image'
      AND split_part(df.display_name, '.', 2) IN (
        'MAIN','PT01','PT02','PT03','PT04','PT05','PT06','PT07','PT08','PT09'
      )
    ON CONFLICT (product_id, slot, version_number) DO NOTHING
    RETURNING id
  `);

  console.log(`Backfilled ${result.length} rows.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

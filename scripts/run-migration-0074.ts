/**
 * Migration 0074: Create listing_image_slot_versions table
 * Run with: npx tsx scripts/run-migration-0074.ts
 */
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
  console.log("Running migration 0074: Create listing_image_slot_versions...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "listing_image_slot_versions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "client_id_code" text NOT NULL,
      "product_id" text NOT NULL,
      "slot" text NOT NULL,
      "version_number" integer NOT NULL,
      "drive_file_id" uuid REFERENCES "drive_files"("id") ON DELETE SET NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "created_by" text,
      CONSTRAINT "lisv_product_slot_version_unique" UNIQUE("product_id", "slot", "version_number")
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_lisv_client" ON "listing_image_slot_versions" ("client_id_code")
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_lisv_product" ON "listing_image_slot_versions" ("product_id")
  `);

  console.log("Migration 0074 applied successfully.");
  await client.end();
}

main().catch((err) => {
  console.error("Migration 0074 failed:", err);
  process.exit(1);
});

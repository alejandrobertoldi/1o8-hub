/**
 * One-time script: rename existing listing image files that lack a version tag.
 * B01XXXXX.MAIN.jpg  →  B01XXXXX.MAIN.V01.jpg
 * Updates both Google Drive and the drive_files.display_name column.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and } from "drizzle-orm";
import * as dotenv from "dotenv";
import path from "path";
import { driveFiles } from "../src/lib/db/schema";
import { driveClient } from "../src/lib/drive-client";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

const VALID_SLOTS = new Set(["MAIN", "PT01", "PT02", "PT03", "PT04", "PT05", "PT06", "PT07", "PT08", "PT09"]);

async function main() {
  // Find listing images whose displayName does NOT already contain .V0 or .V1 etc.
  const rows = await db
    .select({ id: driveFiles.id, driveFileId: driveFiles.driveFileId, displayName: driveFiles.displayName })
    .from(driveFiles)
    .where(eq(driveFiles.entityType, "listing_image"));

  const toRename = rows.filter((r) => {
    const parts = r.displayName.split(".");
    // Old format: ASIN.SLOT.ext (3 parts) — no version tag
    // New format: ASIN.SLOT.V01.ext (4 parts) — already versioned
    return parts.length === 3 && VALID_SLOTS.has(parts[1]);
  });

  console.log(`Found ${toRename.length} files to rename.`);

  let success = 0;
  let failed = 0;

  for (const row of toRename) {
    const parts = row.displayName.split(".");
    const newName = `${parts[0]}.${parts[1]}.V01.${parts[2]}`;
    try {
      await driveClient.renameFile(row.driveFileId, newName);
      await db
        .update(driveFiles)
        .set({ displayName: newName })
        .where(eq(driveFiles.id, row.id));
      console.log(`  ✓ ${row.displayName} → ${newName}`);
      success++;
    } catch (err) {
      console.error(`  ✗ ${row.displayName}: ${err}`);
      failed++;
    }
  }

  console.log(`\nDone. ${success} renamed, ${failed} failed.`);
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  await client.end();
  process.exit(1);
});

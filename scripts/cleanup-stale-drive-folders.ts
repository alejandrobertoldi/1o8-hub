#!/usr/bin/env tsx
// ═══════════════════════════════════════════════════════════════
// Find drive_folders rows (asin_li + li_upload) whose Google Drive
// folder is trashed or deleted, and remove the orphaned DB rows.
//
// drive_files cascades automatically (ON DELETE CASCADE on folder_id).
// asin_li children of a deleted li_upload row get parent_folder_id=NULL
// via the SET NULL self-ref FK — they're handled in the same pass when
// their own Drive folder is also dead (which it is, since Drive trash
// cascades through containment).
//
// --all-types widens the scan beyond asin_li + li_upload to EVERY folder_type.
// Safe because the only ON DELETE CASCADE off drive_folders is drive_files (whose
// rows describe files inside a folder that no longer exists in Drive anyway);
// brand_story_versions, aplus2_versions and storefront_versions all reference
// drive_folders.id ON DELETE SET NULL, so those business rows survive and merely
// drop a pointer to a dead folder. Structural folders are re-created on demand by
// the get-or-create paths that own them (e.g. reports → monthly/pdf/drive/route.ts).
//
// Usage:
//   npx tsx scripts/cleanup-stale-drive-folders.ts            # dry-run
//   npx tsx scripts/cleanup-stale-drive-folders.ts --apply    # actually delete
//   npx tsx scripts/cleanup-stale-drive-folders.ts --client REA_SC_US
//   npx tsx scripts/cleanup-stale-drive-folders.ts --all-types
// ═══════════════════════════════════════════════════════════════

import { config } from "dotenv";
config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const ALL_TYPES = process.argv.includes("--all-types");
const clientFlagIdx = process.argv.indexOf("--client");
const CLIENT_FILTER = clientFlagIdx >= 0 ? process.argv[clientFlagIdx + 1] : null;

async function main() {
  const { db } = await import("@/lib/db");
  const { driveFolders } = await import("@/lib/db/schema");
  const { driveClient } = await import("@/lib/drive-client");
  const { eq, inArray, and } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: driveFolders.id,
      clientIdCode: driveFolders.clientIdCode,
      driveFolderId: driveFolders.driveFolderId,
      folderType: driveFolders.folderType,
      path: driveFolders.path,
      name: driveFolders.name,
    })
    .from(driveFolders)
    .where(
      and(
        ALL_TYPES ? undefined : inArray(driveFolders.folderType, ["asin_li", "li_upload"]),
        CLIENT_FILTER ? eq(driveFolders.clientIdCode, CLIENT_FILTER) : undefined
      )
    );

  console.log(
    `Scanning ${rows.length} drive_folders rows (${
      ALL_TYPES ? "ALL folder_types" : "asin_li + li_upload"
    })${CLIENT_FILTER ? ` for client ${CLIENT_FILTER}` : ""} — mode: ${
      APPLY ? "APPLY" : "dry-run"
    }\n`
  );

  const stale: typeof rows = [];
  const alive: typeof rows = [];
  const errors: { row: (typeof rows)[number]; error: string }[] = [];

  for (const row of rows) {
    try {
      const isAlive = await driveClient.isFolderAlive(row.driveFolderId);
      if (isAlive) {
        alive.push(row);
      } else {
        stale.push(row);
        console.log(
          `  STALE ${row.folderType.padEnd(10)} ${row.clientIdCode.padEnd(15)} ${row.name}  (drive=${row.driveFolderId})`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ row, error: message });
      console.warn(
        `  ERROR ${row.folderType.padEnd(10)} ${row.clientIdCode.padEnd(15)} ${row.name}: ${message}`
      );
    }
  }

  console.log(`\nSummary: alive=${alive.length} stale=${stale.length} errors=${errors.length}`);

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to delete stale rows.");
    return;
  }

  if (stale.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  console.log(`\nDeleting ${stale.length} stale rows (cascade will drop drive_files)…`);
  let deleted = 0;
  for (const row of stale) {
    await db.delete(driveFolders).where(eq(driveFolders.id, row.id));
    deleted++;
  }
  console.log(`Deleted ${deleted} rows.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

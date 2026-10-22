/**
 * 01-sanity-check.ts
 *
 * Originally planned as a backfill that would migrate existing screenview
 * uploads into the new per-version Drive subfolders + brand_story_assets
 * rows. After inspecting prod state at 2026-05-29 we found:
 *
 *   - 0 files in drive_folders.folder_type IN ('brand_story','bs_upload','bs_master')
 *   - 0 rows in brand_story_versions
 *
 * So there is nothing to backfill. This script just asserts that state is
 * still empty (in case anything was added between then and run-time) and
 * exits. If it ever finds rows, it bails so a human can decide whether to
 * extend it into a real backfill.
 *
 * Run:
 *   bash -c 'set -a && . .env.local && set +a && \
 *     npx tsx scripts/migrations/2026-05-29-brand-story-per-version/01-sanity-check.ts'
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  const [{ count: fileCount }] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM drive_files f
    JOIN drive_folders df ON df.id = f.folder_id
    WHERE df.folder_type IN ('brand_story', 'bs_upload', 'bs_master')
  `;

  const [{ count: versionCount }] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM brand_story_versions
  `;

  console.log(
    `Brand-story drive files in legacy folders: ${fileCount}\n` +
      `Existing brand_story_versions rows:       ${versionCount}`
  );

  if (fileCount > 0 || versionCount > 0) {
    console.error(
      "\n[abort] State is not empty. Backfill was not designed for this — " +
        "extend this script before running again."
    );
    await sql.end();
    process.exit(1);
  }

  console.log(
    "\n[ok] Nothing to backfill. The new upload endpoint will create" +
      " {CLIENT}_Brandstory_V01/ subfolders + brand_story_versions rows" +
      " lazily on first screenview upload."
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

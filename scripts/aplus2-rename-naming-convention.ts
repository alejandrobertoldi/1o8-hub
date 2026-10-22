// One-off, idempotent migration to the new A+2 Drive naming convention.
// Spec: docs/superpowers/specs/2026-06-01-aplus2-naming-convention-design.md
//
// Renames the Drive folder + every asset file for a single A+2 version and
// updates drive_folders.name/.path, drive_files.display_name, and
// aplus2_assets.filename. Idempotent: a name already matching is skipped.
//
// Usage:
//   npx tsx scripts/aplus2-rename-naming-convention.ts           # dry-run (default)
//   npx tsx scripts/aplus2-rename-naming-convention.ts --apply   # execute
//
// NOTE: .env.local DATABASE_URL points at production Supabase, and renameFile
// hits the real Google Drive. Run the dry-run and review before --apply.

import { config } from "dotenv";
config({ path: ".env.local" });

const VERSION_ID = "e93ba0a2-ca97-4a30-be45-551360540989";
const APPLY = process.argv.includes("--apply");

async function main() {
  const { db } = await import("@/lib/db");
  const { eq } = await import("drizzle-orm");
  const {
    aplus2Assets,
    aplus2ModuleItems,
    aplus2Modules,
    aplus2Sets,
    aplus2Versions,
    driveFiles,
    driveFolders,
  } = await import("@/lib/db/schema");
  const { driveClient } = await import("@/lib/drive-client");
  const { aplus2VersionSlug, aplus2AssetFilename } = await import(
    "@/lib/aplus2/drive-naming"
  );

  console.log(
    `[aplus2 rename] mode=${APPLY ? "APPLY" : "DRY-RUN"} version=${VERSION_ID}`
  );

  // 1. Version + set + folder.
  const [v] = await db
    .select({
      versionNumber: aplus2Versions.versionNumber,
      folderRowId: driveFolders.id,
      driveFolderGid: driveFolders.driveFolderId,
      folderName: driveFolders.name,
      folderPath: driveFolders.path,
      clientIdCode: aplus2Sets.clientIdCode,
      scopeIdentifier: aplus2Sets.scopeIdentifier,
      contentType: aplus2Versions.contentType,
    })
    .from(aplus2Versions)
    .innerJoin(driveFolders, eq(driveFolders.id, aplus2Versions.driveFolderId))
    .innerJoin(aplus2Sets, eq(aplus2Sets.id, aplus2Versions.setId))
    .where(eq(aplus2Versions.id, VERSION_ID))
    .limit(1);
  if (!v) throw new Error(`Version ${VERSION_ID} not found (or has no Drive folder)`);

  const slug = aplus2VersionSlug({
    clientIdCode: v.clientIdCode,
    scopeIdentifier: v.scopeIdentifier,
    contentType: v.contentType,
    versionNumber: v.versionNumber,
  });

  // 2. Rename the folder (idempotent).
  if (v.folderName === slug) {
    console.log(`[folder] already named "${slug}" — skip`);
  } else {
    console.log(`[folder] "${v.folderName}" -> "${slug}"`);
    if (APPLY) {
      await driveClient.renameFile(v.driveFolderGid, slug);
      const newPath = v.folderPath.replace(/[^/]+$/, slug);
      await db
        .update(driveFolders)
        .set({ name: slug, path: newPath })
        .where(eq(driveFolders.id, v.folderRowId));
    }
  }

  // 3. Assets.
  const assets = await db
    .select({
      assetId: aplus2Assets.id,
      kind: aplus2Assets.kind,
      slotKey: aplus2Assets.slotKey,
      variant: aplus2Assets.variant,
      filename: aplus2Assets.filename,
      driveFileRowId: aplus2Assets.driveFileId,
      driveFileGid: driveFiles.driveFileId,
      modulePosition: aplus2Modules.position,
      moduleType: aplus2Modules.moduleType,
      itemPosition: aplus2ModuleItems.position,
    })
    .from(aplus2Assets)
    .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
    .innerJoin(aplus2Modules, eq(aplus2Modules.id, aplus2Assets.moduleId))
    .leftJoin(
      aplus2ModuleItems,
      eq(aplus2ModuleItems.id, aplus2Assets.moduleItemId)
    )
    .where(eq(aplus2Assets.versionId, VERSION_ID));

  console.log(`[assets] ${assets.length} rows`);
  let renamed = 0;
  let skipped = 0;
  for (const a of assets) {
    const ext = a.filename.split(".").pop() ?? "png";
    const newName = aplus2AssetFilename({
      slug,
      modulePosition: a.modulePosition,
      moduleType: a.moduleType,
      kind: a.kind as "image" | "video",
      slotKey: a.slotKey,
      itemPosition: a.itemPosition ?? undefined,
      variant: a.variant as "desktop" | "mobile",
      ext,
    });
    if (newName === a.filename) {
      skipped++;
      continue;
    }
    console.log(`  ${a.filename}  ->  ${newName}`);
    if (APPLY) {
      await driveClient.renameFile(a.driveFileGid, newName);
      await db.transaction(async (tx) => {
        await tx
          .update(aplus2Assets)
          .set({ filename: newName })
          .where(eq(aplus2Assets.id, a.assetId));
        await tx
          .update(driveFiles)
          .set({ displayName: newName })
          .where(eq(driveFiles.id, a.driveFileRowId));
      });
    }
    renamed++;
  }
  console.log(
    `[done] ${APPLY ? "renamed" : "would rename"} ${renamed}, skipped ${skipped}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

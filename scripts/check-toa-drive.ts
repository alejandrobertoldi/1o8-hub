import { db } from "@/lib/db";
import { driveFolders } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { eq, and } from "drizzle-orm";

const ACTIVE_FOLDER_ID = process.env.GOOGLE_SHARED_DRIVE_ID!;

async function main() {
  const [rootRow] = await db
    .select({ driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(and(eq(driveFolders.clientIdCode, "TOA_SC_US"), eq(driveFolders.folderType, "client")))
    .limit(1);

  if (!rootRow) { console.error("No client folder found"); process.exit(1); }
  console.log("Client folder ID:", rootRow.driveFolderId);

  const file = await driveClient.getFile(rootRow.driveFolderId, "id,parents");
  const oldParentId = file.parents?.[0];
  console.log("Current parent:", oldParentId);

  if (!oldParentId) { console.error("No parent found"); process.exit(1); }
  if (oldParentId === ACTIVE_FOLDER_ID) { console.log("Already in active folder"); process.exit(0); }

  const result = await driveClient.moveFile(rootRow.driveFolderId, ACTIVE_FOLDER_ID, oldParentId);
  console.log("Moved back to active:", result.id, result.name);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

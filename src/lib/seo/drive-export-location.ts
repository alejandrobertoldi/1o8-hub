import { driveClient } from "@/lib/drive-client";
import { seoExportTarget } from "@/lib/seo/project-naming";

/**
 * Where an SEO export goes inside the brand folder. New-convention projects
 * (`…_SEO_V##`) get a `{name}/` folder, mirroring the A+ per-version folders;
 * legacy projects keep `SEO-{name}` directly in the brand folder so a
 * re-export still finds and replaces the doc it made before.
 */
export async function resolveSeoExportLocation(
  brandFolderId: string,
  projectName: string
): Promise<{ parentId: string; docName: string }> {
  const { folderName, docName } = seoExportTarget(projectName);
  if (!folderName) return { parentId: brandFolderId, docName };

  const existing = await driveClient.listFiles(
    `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${brandFolderId}' in parents and trashed=false`,
  );
  const parentId = existing.files.length
    ? existing.files[0].id
    : (await driveClient.createFolder(folderName, brandFolderId)).id;
  return { parentId, docName };
}

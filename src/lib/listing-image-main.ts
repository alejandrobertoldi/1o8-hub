import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { driveFiles, listingImageSlotVersions } from "@/lib/db/schema";

/** Newest MAIN listing image per product (highest version_number). */
export async function listingMainDriveFileIds(
  productIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (productIds.length === 0) return map;

  const rows = await db
    .selectDistinctOn([listingImageSlotVersions.productId], {
      productId: listingImageSlotVersions.productId,
      driveFileId: driveFiles.driveFileId,
    })
    .from(listingImageSlotVersions)
    .innerJoin(driveFiles, eq(driveFiles.id, listingImageSlotVersions.driveFileId))
    .where(
      and(
        inArray(listingImageSlotVersions.productId, productIds),
        eq(listingImageSlotVersions.slot, "MAIN"),
      ),
    )
    .orderBy(
      listingImageSlotVersions.productId,
      desc(listingImageSlotVersions.versionNumber),
    );

  for (const row of rows) {
    if (row.productId && row.driveFileId) map.set(row.productId, row.driveFileId);
  }
  return map;
}

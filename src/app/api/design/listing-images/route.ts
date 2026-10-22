import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientIdCode = searchParams.get("clientIdCode");
    const productId = searchParams.get("productId");

    if (!clientIdCode && !productId) {
      return NextResponse.json(
        { error: "Missing clientIdCode or productId" },
        { status: 400 }
      );
    }

    // Per (product_id, slot): always show the newest version (highest
    // version_number). Live is a status on a version, not which file the grid
    // thumbnails — editors need to see what they just uploaded.
    const images = productId
      ? await db.execute(sql`
          SELECT DISTINCT ON (v.product_id, v.slot)
            df.id               AS "id",
            df.drive_file_id    AS "driveFileId",
            df.display_name     AS "displayName",
            df.folder_id        AS "folderId",
            fol.drive_folder_id AS "driveFolderId",
            v.version_number    AS "versionNumber",
            v.status            AS "status",
            v.product_id        AS "productId",
            v.slot              AS "slot"
          FROM listing_image_slot_versions v
          JOIN drive_files df ON df.id = v.drive_file_id
          LEFT JOIN drive_folders fol ON fol.id = df.folder_id
          WHERE v.product_id = ${productId}
          ORDER BY v.product_id, v.slot, v.version_number DESC
        `)
      : await db.execute(sql`
          SELECT DISTINCT ON (v.product_id, v.slot)
            df.id               AS "id",
            df.drive_file_id    AS "driveFileId",
            df.display_name     AS "displayName",
            df.folder_id        AS "folderId",
            fol.drive_folder_id AS "driveFolderId",
            v.version_number    AS "versionNumber",
            v.status            AS "status",
            v.product_id        AS "productId",
            v.slot              AS "slot"
          FROM listing_image_slot_versions v
          JOIN drive_files df ON df.id = v.drive_file_id
          LEFT JOIN drive_folders fol ON fol.id = df.folder_id
          WHERE v.client_id_code = ${clientIdCode}
          ORDER BY v.product_id, v.slot, v.version_number DESC
        `);

    return NextResponse.json(images);
  } catch (err) {
    console.error("[listing-images] error:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

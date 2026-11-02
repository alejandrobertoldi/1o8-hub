import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { driveFiles, listingImageSlotVersions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

// GET /api/design/listing-images/versions?productId=<uuid>&slot=MAIN
// Returns all version records for one (productId, slot), newest first.
export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    const slot = searchParams.get("slot");

    if (!productId || !slot) {
      return NextResponse.json({ error: "Missing productId or slot" }, { status: 400 });
    }

    const versions = await db
      .select({
        id: driveFiles.id,
        driveFileId: driveFiles.driveFileId,
        displayName: driveFiles.displayName,
        versionNumber: listingImageSlotVersions.versionNumber,
        status: listingImageSlotVersions.status,
        createdAt: listingImageSlotVersions.createdAt,
        createdBy: listingImageSlotVersions.createdBy,
      })
      .from(listingImageSlotVersions)
      .innerJoin(driveFiles, eq(listingImageSlotVersions.driveFileId, driveFiles.id))
      .where(
        and(
          eq(listingImageSlotVersions.productId, productId),
          eq(listingImageSlotVersions.slot, slot)
        )
      )
      .orderBy(desc(listingImageSlotVersions.versionNumber));

    return NextResponse.json(versions);
  } catch (err) {
    console.error("[listing-images/versions] error:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

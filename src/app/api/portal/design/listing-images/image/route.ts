import { hasAdminPowers } from "@/lib/roles";
/**
 * GET /api/portal/design/listing-images/image?driveFileId=…[&thumb=1]
 * (whitelisted for client/prospect roles)
 *
 * Client-scoped mirror of the Hub's /api/design/listing-images/image proxy.
 * Unlike the generic /api/drive/file proxy, this one verifies the requested
 * Drive file is a listing image belonging to the caller's own client
 * (admins may fetch any) before streaming it, so one client can never pull
 * another client's unreleased designs.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { driveFiles, listingImageSlotVersions } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { listingImageThumbPx } from "@/lib/listing-image-slots";
import { sessionHasClient } from "@/lib/client-codes";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const driveFileId = searchParams.get("driveFileId");
    const thumb = searchParams.get("thumb") === "1";

    if (!driveFileId) {
      return NextResponse.json({ error: "Missing driveFileId" }, { status: 400 });
    }

    // Scope check: the Drive file must back a listing-image version of the
    // caller's client. Admins (portal preview) skip the ownership pin.
    const isAdmin = hasAdminPowers(session.user.role);
    const [owner] = await db
      .select({ clientIdCode: sql<string>`min(${listingImageSlotVersions.clientIdCode})` })
      .from(listingImageSlotVersions)
      .innerJoin(driveFiles, eq(driveFiles.id, listingImageSlotVersions.driveFileId))
      .where(eq(driveFiles.driveFileId, driveFileId));

    if (!owner?.clientIdCode) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!isAdmin && !sessionHasClient(session.user.clientIdCode, owner.clientIdCode)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { bytes, contentType } = await driveClient.getThumbnail(
      driveFileId,
      listingImageThumbPx(thumb)
    );
    return new NextResponse(new Blob([new Uint8Array(bytes)], { type: contentType }), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err) {
    console.error("[portal listing-images/image] error:", err);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}

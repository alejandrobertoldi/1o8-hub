// A Listing Images picture for the client's review preview. Access-checked: the client must be allowed
// this revision, and the product must be this client's and in the revision. Drive ids never leave the server.
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { getRevisionWithProject } from "@/lib/seo/revision-db";
import { portalClientAllowed, seoSectionEnabled } from "@/lib/seo/revision-portal";
import { listingImageDriveId } from "@/lib/seo/revision-products";
import { driveClient } from "@/lib/drive-client";
import { listingImageThumbPx } from "@/lib/listing-image-slots";

const SLOTS = new Set(["MAIN", "PT01", "PT02", "PT03", "PT04", "PT05", "PT06", "PT07", "PT08"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { revisionId } = await params;
  const found = await getRevisionWithProject(revisionId);
  if (!found?.project.clientIdCode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const clientIdCode = found.project.clientIdCode;
  if (!portalClientAllowed(session, clientIdCode) || !(await seoSectionEnabled(clientIdCode))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId") ?? "";
  const slot = searchParams.get("slot") ?? "";
  if (!productId || !SLOTS.has(slot)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const [product] = await db.select({ id: master.id, asin: master.asin }).from(master)
    .where(and(eq(master.id, productId), eq(master.clientIdCode, clientIdCode))).limit(1);
  const content = (found.revision.content ?? {}) as Record<string, unknown>;
  if (!product?.asin || !(product.asin in content)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const driveFileId = await listingImageDriveId(productId, slot);
  if (!driveFileId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { bytes, contentType } = await driveClient.getThumbnail(driveFileId, listingImageThumbPx(false));
    return new NextResponse(new Blob([new Uint8Array(bytes)], { type: contentType }), {
      headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    console.error("[portal revision image] error:", err);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}

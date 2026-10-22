import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aplusModuleImages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 60;

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      productId: string;
      moduleId: string;
      imageId: string;
    }>;
  }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { imageId } = await params;

  try {

  const body = await req.json();

  // Whitelist allowed fields
  const updates: Record<string, unknown> = {};

  if ("altText" in body) {
    updates.altText = body.altText;
  }

  if ("imageDescription" in body) {
    updates.imageDescription = body.imageDescription;
  }

  if ("aiImagePrompt" in body) {
    updates.aiImagePrompt = body.aiImagePrompt;
  }

  if ("driveFileId" in body) {
    updates.driveFileId = body.driveFileId;
  }

  if ("mobileDriveFileId" in body) {
    updates.mobileDriveFileId = body.mobileDriveFileId;
  }

  if ("panelData" in body) {
    updates.panelData = body.panelData;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updatedAt = new Date();

  const [updated] = await db
    .update(aplusModuleImages)
    .set(updates)
    .where(eq(aplusModuleImages.id, imageId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  return NextResponse.json(updated);

  } catch (err) {
    console.error("[aplus image PATCH] Error:", err);
    return NextResponse.json(
      { error: "Failed to update image" },
      { status: 500 }
    );
  }
}

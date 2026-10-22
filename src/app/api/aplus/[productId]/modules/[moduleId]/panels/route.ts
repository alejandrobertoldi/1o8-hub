import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aplusModules, aplusModuleImages, master } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import {
  APLUS_MODULE_SPECS,
  type AplusModuleType,
} from "@/lib/aplus-module-specs";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 60;

// POST — add a new panel image row
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string; moduleId: string }> }
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

  const { productId, moduleId } = await params;

  try {

  // Get module to determine type and spec
  const [mod] = await db
    .select()
    .from(aplusModules)
    .where(and(eq(aplusModules.id, moduleId), eq(aplusModules.productId, productId)))
    .limit(1);

  if (!mod) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  const spec = APLUS_MODULE_SPECS[mod.moduleType as AplusModuleType];
  if (!spec.repeatableGroup?.image) {
    return NextResponse.json({ error: "Module type has no panel images" }, { status: 400 });
  }

  const rg = spec.repeatableGroup;

  // Count existing panel images
  const existingImages = await db
    .select()
    .from(aplusModuleImages)
    .where(eq(aplusModuleImages.moduleId, moduleId));

  const panelImages = existingImages.filter((img) =>
    img.customLabel?.startsWith("panel_")
  );

  if (panelImages.length >= rg.maxItems) {
    return NextResponse.json(
      { error: `Maximum ${rg.maxItems} panels allowed` },
      { status: 400 }
    );
  }

  // Find next slot number
  const maxSlot = existingImages.reduce((max, img) => Math.max(max, img.imageSlot), 0);
  const panelNumber = panelImages.length + 1;

  // Get product info for image row
  const [product] = await db
    .select({
      clientIdCode: master.clientIdCode,
      asin: master.asin,
      sku: master.sku,
    })
    .from(master)
    .where(eq(master.id, productId))
    .limit(1);

  const [newImage] = await db
    .insert(aplusModuleImages)
    .values({
      moduleId,
      imageSlot: maxSlot + 1,
      customLabel: `panel_${panelNumber}_${rg.image!.key}`,
      clientIdCode: product?.clientIdCode ?? null,
      asin: product?.asin ?? null,
      sku: product?.sku ?? null,
    })
    .returning();

  return NextResponse.json({ image: newImage }, { status: 201 });

  } catch (err) {
    console.error("[aplus panels POST] Error:", err);
    return NextResponse.json({ error: "Failed to add panel" }, { status: 500 });
  }
}

// DELETE — remove the last panel image row
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string; moduleId: string }> }
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

  const { productId, moduleId } = await params;

  try {

  const [mod] = await db
    .select()
    .from(aplusModules)
    .where(and(eq(aplusModules.id, moduleId), eq(aplusModules.productId, productId)))
    .limit(1);

  if (!mod) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  const spec = APLUS_MODULE_SPECS[mod.moduleType as AplusModuleType];
  if (!spec.repeatableGroup?.image) {
    return NextResponse.json({ error: "Module type has no panel images" }, { status: 400 });
  }

  const rg = spec.repeatableGroup;

  const existingImages = await db
    .select()
    .from(aplusModuleImages)
    .where(eq(aplusModuleImages.moduleId, moduleId));

  const panelImages = existingImages
    .filter((img) => img.customLabel?.startsWith("panel_"))
    .sort((a, b) => b.imageSlot - a.imageSlot);

  if (panelImages.length <= rg.minItems) {
    return NextResponse.json(
      { error: `Minimum ${rg.minItems} panels required` },
      { status: 400 }
    );
  }

  // Remove the last panel image
  const lastPanel = panelImages[0];
  await db
    .delete(aplusModuleImages)
    .where(eq(aplusModuleImages.id, lastPanel.id));

  return NextResponse.json({ success: true, removedId: lastPanel.id });

  } catch (err) {
    console.error("[aplus panels DELETE] Error:", err);
    return NextResponse.json({ error: "Failed to remove panel" }, { status: 500 });
  }
}

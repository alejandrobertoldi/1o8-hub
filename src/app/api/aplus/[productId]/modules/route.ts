import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aplusModules, aplusModuleImages, master, activityLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import {
  APLUS_MODULE_TYPES,
  APLUS_MODULE_SPECS,
  type AplusModuleType,
} from "@/lib/aplus-module-specs";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
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

  const { productId } = await params;

  try {

  const body = await req.json();
  const { moduleType, moduleNumber } = body as {
    moduleType: string;
    moduleNumber: number;
  };

  // Validate moduleType
  if (!APLUS_MODULE_TYPES.includes(moduleType as AplusModuleType)) {
    return NextResponse.json(
      { error: "Invalid moduleType" },
      { status: 400 }
    );
  }

  // Validate moduleNumber is 1-7
  if (
    typeof moduleNumber !== "number" ||
    moduleNumber < 1 ||
    moduleNumber > 7 ||
    !Number.isInteger(moduleNumber)
  ) {
    return NextResponse.json(
      { error: "moduleNumber must be an integer between 1 and 7" },
      { status: 400 }
    );
  }

  // Check that moduleNumber is not already taken for this product
  const existing = await db
    .select({ id: aplusModules.id })
    .from(aplusModules)
    .where(
      and(
        eq(aplusModules.productId, productId),
        eq(aplusModules.moduleNumber, moduleNumber)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: `Module number ${moduleNumber} is already taken for this product` },
      { status: 409 }
    );
  }

  const [module] = await db
    .insert(aplusModules)
    .values({
      productId,
      moduleNumber,
      moduleType: moduleType as AplusModuleType,
      status: "draft",
    })
    .returning();

  // Auto-create image stub rows for each slot in the module spec
  const spec = APLUS_MODULE_SPECS[moduleType as AplusModuleType];
  let images: (typeof aplusModuleImages.$inferSelect)[] = [];

  // Look up product for clientIdCode/asin/sku to populate image rows
  const [product] = await db
    .select({
      clientIdCode: master.clientIdCode,
      asin: master.asin,
      sku: master.sku,
    })
    .from(master)
    .where(eq(master.id, productId))
    .limit(1);

  const imageRows: Array<{
    moduleId: string;
    imageSlot: number;
    customLabel: string;
    clientIdCode: string | null;
    asin: string | null;
    sku: string | null;
  }> = [];

  // Standard image slots
  for (let idx = 0; idx < spec.imageSlots.length; idx++) {
    imageRows.push({
      moduleId: module.id,
      imageSlot: idx + 1,
      customLabel: spec.imageSlots[idx].key,
      clientIdCode: product?.clientIdCode ?? null,
      asin: product?.asin ?? null,
      sku: product?.sku ?? null,
    });
  }

  // Repeatable group panel images (create min items)
  if (spec.repeatableGroup?.image) {
    const rg = spec.repeatableGroup;
    const baseSlot = spec.imageSlots.length + 1;
    for (let i = 0; i < rg.minItems; i++) {
      imageRows.push({
        moduleId: module.id,
        imageSlot: baseSlot + i,
        customLabel: `panel_${i + 1}_${rg.image!.key}`,
        clientIdCode: product?.clientIdCode ?? null,
        asin: product?.asin ?? null,
        sku: product?.sku ?? null,
      });
    }
  }

  if (imageRows.length > 0) {
    images = await db.insert(aplusModuleImages).values(imageRows).returning();
  }

  // Log activity
  await db.insert(activityLog).values({
    productId,
    asin: product?.asin ?? null,
    sku: product?.sku ?? null,
    clientIdCode: product?.clientIdCode ?? null,
    itemName: null,
    fieldLabel: `A+ Module ${moduleNumber}`,
    bqName: `aplus_module_${moduleNumber}`,
    oldValue: null,
    newValue: moduleType,
    changedBy: session.user.email ?? "",
    editType: "aplus",
  });

  return NextResponse.json({ ...module, images }, { status: 201 });

  } catch (err) {
    console.error("[aplus modules POST] Error:", err);
    return NextResponse.json(
      { error: "Failed to create module" },
      { status: 500 }
    );
  }
}

/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { master, aplusModules, aplusModuleImages, aplusSets } from "@/lib/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";

export const maxDuration = 60;

/** Retry a fn up to `n` times on CONNECTION_CLOSED / CONNECTION_ENDED errors */
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const code = (err as { cause?: { code?: string } })?.cause?.code;
      if (i < retries && (code === "CONNECTION_CLOSED" || code === "CONNECTION_ENDED")) {
        await new Promise((r) => setTimeout(r, 200 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { productId } = await params;

  try {

  // Fetch the product row for the page header
  const [product] = await withRetry(() =>
    db
      .select({
        id: master.id,
        name: master.itemName,
        asin: master.asin,
        clientIdCode: master.clientIdCode,
        marketplace: master.marketplace,
      })
      .from(master)
      .where(eq(master.id, productId))
      .limit(1)
  );

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Fetch or auto-create the A+ set config
  let [setConfig] = await withRetry(() =>
    db
      .select()
      .from(aplusSets)
      .where(eq(aplusSets.productId, productId))
      .limit(1)
  );

  if (!setConfig) {
    [setConfig] = await withRetry(() =>
      db
        .insert(aplusSets)
        .values({
          productId,
          scopeType: "ASIN",
          scopeIdentifier: product.asin || productId,
          platform: "SC",
          contentType: "PA+",
          version: 1,
        })
        .returning()
    );
  }

  // Fetch all modules for this product ordered by moduleNumber
  const modules = await withRetry(() =>
    db
      .select()
      .from(aplusModules)
      .where(eq(aplusModules.productId, productId))
      .orderBy(asc(aplusModules.moduleNumber))
  );

  // Fetch all images for these modules in one query
  let images: (typeof aplusModuleImages.$inferSelect)[] = [];
  if (modules.length > 0) {
    const moduleIds = modules.map((m) => m.id);
    images = await withRetry(() =>
      db
        .select()
        .from(aplusModuleImages)
        .where(inArray(aplusModuleImages.moduleId, moduleIds))
        .orderBy(asc(aplusModuleImages.imageSlot))
    );
  }

  // Attach images to their parent modules
  const imagesByModuleId = images.reduce<
    Record<string, (typeof aplusModuleImages.$inferSelect)[]>
  >((acc, img) => {
    if (!acc[img.moduleId]) acc[img.moduleId] = [];
    acc[img.moduleId].push(img);
    return acc;
  }, {});

  const modulesWithImages = modules.map((m) => ({
    ...m,
    images: imagesByModuleId[m.id] ?? [],
  }));

  return NextResponse.json({
    product,
    modules: modulesWithImages,
    setConfig: {
      id: setConfig.id,
      scopeType: setConfig.scopeType,
      scopeIdentifier: setConfig.scopeIdentifier,
      platform: setConfig.platform,
      contentType: setConfig.contentType,
      version: setConfig.version,
      groupNumber: setConfig.groupNumber,
      parentAsin: setConfig.parentAsin,
      coveredAsins: setConfig.coveredAsins,
    },
  });

  } catch (err) {
    console.error("[aplus GET] Error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to load A+ content", detail: message },
      { status: 500 }
    );
  }
}

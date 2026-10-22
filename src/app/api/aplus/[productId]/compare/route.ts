import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  master,
  aplusModules,
  aplusModuleImages,
  amazonSyncSnapshots,
} from "@/lib/db/schema";
import { eq, asc, inArray, and, desc } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import type { RainforestProduct } from "@/types/rainforest";

export const maxDuration = 60;

// Normalize text for comparison: lowercase + trim whitespace
function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text.toLowerCase().trim().replace(/\s+/g, " ");
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

  // 1. Fetch the product
  const [product] = await db
    .select({
      id: master.id,
      asin: master.asin,
      itemName: master.itemName,
      clientIdCode: master.clientIdCode,
    })
    .from(master)
    .where(eq(master.id, productId))
    .limit(1);

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // 2. Fetch all modules for this product
  const moduleRows = await db
    .select()
    .from(aplusModules)
    .where(eq(aplusModules.productId, productId))
    .orderBy(asc(aplusModules.moduleNumber));

  // 3. Fetch all module images
  const moduleIds = moduleRows.map((m) => m.id);
  const imageRows =
    moduleIds.length > 0
      ? await db
          .select()
          .from(aplusModuleImages)
          .where(inArray(aplusModuleImages.moduleId, moduleIds))
          .orderBy(asc(aplusModuleImages.imageSlot))
      : [];

  // 4. Fetch the latest Rainforest snapshot for this product
  const [snapshot] = await db
    .select()
    .from(amazonSyncSnapshots)
    .where(
      and(
        eq(amazonSyncSnapshots.productId, productId),
        eq(amazonSyncSnapshots.provider, "rainforest")
      )
    )
    .orderBy(desc(amazonSyncSnapshots.fetchedAt))
    .limit(1);

  const hasSnapshot = !!snapshot;

  // 5. Extract Amazon A+ images from snapshot
  const snapshotData = snapshot?.snapshotData as RainforestProduct | undefined;
  const hasAmazonAplus =
    hasSnapshot && (snapshotData?.a_plus_content?.has_a_plus_content ?? false);
  const amazonImages: { link: string; name: string }[] =
    snapshotData?.a_plus_content?.all_images ?? [];
  const amazonImageCount = hasSnapshot ? amazonImages.length : null;

  // 6. Build a map from moduleId -> moduleNumber
  const moduleNumberMap = new Map<string, number>(
    moduleRows.map((m) => [m.id, m.moduleNumber])
  );

  // 7. Build imageDiff array
  type DiffStatus = "match" | "mismatch" | "hub_only" | "amazon_only";
  type DiffEntry = {
    slot: string;
    hubAltText: string | null;
    amazonAltText: string | null;
    status: DiffStatus;
  };

  const diffEntries: DiffEntry[] = [];
  const matchedAmazonIndices = new Set<number>();

  for (const image of imageRows) {
    const moduleNumber = moduleNumberMap.get(image.moduleId) ?? 0;
    const slot = `module_${moduleNumber}/image_${image.imageSlot}`;
    const hubAltText = image.altText ?? null;
    const normalizedHub = normalizeText(hubAltText);

    if (!hasSnapshot) {
      diffEntries.push({
        slot,
        hubAltText,
        amazonAltText: null,
        status: "hub_only",
      });
      continue;
    }

    // Find best Amazon match by normalized text
    let bestMatchIdx = -1;
    if (normalizedHub) {
      for (let i = 0; i < amazonImages.length; i++) {
        if (matchedAmazonIndices.has(i)) continue;
        if (normalizeText(amazonImages[i].name) === normalizedHub) {
          bestMatchIdx = i;
          break;
        }
      }
    }

    if (bestMatchIdx >= 0) {
      matchedAmazonIndices.add(bestMatchIdx);
      diffEntries.push({
        slot,
        hubAltText,
        amazonAltText: amazonImages[bestMatchIdx].name,
        status: "match",
      });
    } else {
      // No match found
      const amazonAltText =
        hasAmazonAplus && amazonImages.length > 0
          ? null // Amazon has A+ but no matching alt text
          : null;
      diffEntries.push({
        slot,
        hubAltText,
        amazonAltText,
        status: hasAmazonAplus ? "mismatch" : "hub_only",
      });
    }
  }

  // Add Amazon-only entries (images in Amazon snapshot not matched to any Hub image)
  for (let i = 0; i < amazonImages.length; i++) {
    if (!matchedAmazonIndices.has(i)) {
      diffEntries.push({
        slot: `amazon_only/${i + 1}`,
        hubAltText: null,
        amazonAltText: amazonImages[i].name || null,
        status: "amazon_only",
      });
    }
  }

  // 8. Compute match rate
  const hubImageCount = imageRows.length;
  const matchCount = diffEntries.filter((e) => e.status === "match").length;
  const matchRate =
    hubImageCount > 0 ? Math.round((matchCount / hubImageCount) * 100) : 0;

  return NextResponse.json({
    product: {
      id: product.id,
      asin: product.asin,
      name: product.itemName,
    },
    snapshotFetchedAt: snapshot?.fetchedAt?.toISOString() ?? null,
    hubImageCount,
    amazonImageCount,
    hasSnapshot,
    hasAmazonAplus,
    imageDiff: diffEntries,
    matchRate,
  });
}

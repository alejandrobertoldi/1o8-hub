/**
 * POST /api/storefront/pages/[pageId]/modules
 *   Body: { moduleType: StorefrontModuleType }
 *   Validates moduleType, inserts at max(position)+1 (starting at 1).
 *   Returns the created module row.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, max } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { storefrontModules, storefrontPages, storefrontModuleTiles } from "@/lib/db/schema";
import { ADDABLE_MODULE_TYPES, DEFAULT_SPLIT_LAYOUT, splitTileCount } from "@/lib/storefront/module-specs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pageId } = await params;

  const body = await req.json().catch(() => null);
  if (!body || !(ADDABLE_MODULE_TYPES as readonly string[]).includes(body.moduleType)) {
    return NextResponse.json(
      { error: `Invalid moduleType. Must be one of: ${ADDABLE_MODULE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Verify the page exists
  const [page] = await db
    .select({ id: storefrontPages.id })
    .from(storefrontPages)
    .where(eq(storefrontPages.id, pageId))
    .limit(1);

  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  // Compute next position: max(position) + 1, defaulting to 1 if no modules yet
  const [{ maxPos }] = await db
    .select({ maxPos: max(storefrontModules.position) })
    .from(storefrontModules)
    .where(eq(storefrontModules.pageId, pageId));

  const position = (maxPos ?? 0) + 1;

  const isSplit = body.moduleType === "split_section";

  const [created] = await db
    .insert(storefrontModules)
    .values({
      pageId,
      moduleType: body.moduleType,
      position,
      ...(isSplit ? { sectionLayout: DEFAULT_SPLIT_LAYOUT } : {}),
    })
    .returning();

  // Split Section seeds empty tiles to match the default layout's tile count.
  if (isSplit) {
    const n = splitTileCount(DEFAULT_SPLIT_LAYOUT);
    await db.insert(storefrontModuleTiles).values(
      Array.from({ length: n }, (_, i) => ({ moduleId: created.id, position: i + 1 }))
    );
  }

  return NextResponse.json(created, { status: 201 });
}

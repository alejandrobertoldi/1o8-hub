/**
 * PATCH /api/storefront/modules/[moduleId]/tiles/[tileId]
 *   Body: any subset of { title, linkUrl, linkLabel }
 *   Validates the tile belongs to the module. Returns the updated tile row.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { storefrontModuleTiles } from "@/lib/db/schema";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string; tileId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { moduleId, tileId } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const [tile] = await db
    .select()
    .from(storefrontModuleTiles)
    .where(and(eq(storefrontModuleTiles.id, tileId), eq(storefrontModuleTiles.moduleId, moduleId)))
    .limit(1);
  if (!tile) return NextResponse.json({ error: "Tile not found" }, { status: 404 });

  const updates: Partial<typeof storefrontModuleTiles.$inferInsert> = {};
  if ("title" in body) updates.title = body.title ? String(body.title) : null;
  if ("linkUrl" in body) updates.linkUrl = body.linkUrl ? String(body.linkUrl) : null;
  if ("linkLabel" in body) updates.linkLabel = body.linkLabel ? String(body.linkLabel) : null;

  const [updated] = await db
    .update(storefrontModuleTiles)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(storefrontModuleTiles.id, tileId))
    .returning();

  return NextResponse.json(updated);
}

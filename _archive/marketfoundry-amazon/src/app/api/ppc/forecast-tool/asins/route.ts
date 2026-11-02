/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { forecastToolAsins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const versionId = req.nextUrl.searchParams.get("versionId");
  if (!versionId) return NextResponse.json({ error: "versionId required" }, { status: 400 });

  const asins = await db
    .select()
    .from(forecastToolAsins)
    .where(eq(forecastToolAsins.versionId, versionId))
    .orderBy(forecastToolAsins.sortOrder);

  return NextResponse.json({ asins });
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !isEditorOrAbove(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { versionId, asins } = await req.json() as {
    versionId: string;
    asins: Array<{
      id?: string;
      asin?: string;
      sku?: string;
      productName: string;
      productPrice: number;
      sharePct: number;
      variationAttributes?: Record<string, string> | null;
      isNew: boolean;
      sortOrder: number;
    }>;
  };

  if (!versionId || !asins)
    return NextResponse.json({ error: "versionId and asins required" }, { status: 400 });

  // Delete existing ASINs for this version that aren't in the new list
  const existingIds = asins.filter(a => a.id).map(a => a.id!);
  const allExisting = await db
    .select({ id: forecastToolAsins.id })
    .from(forecastToolAsins)
    .where(eq(forecastToolAsins.versionId, versionId));

  for (const existing of allExisting) {
    if (!existingIds.includes(existing.id)) {
      await db.delete(forecastToolAsins).where(eq(forecastToolAsins.id, existing.id));
    }
  }

  // Upsert each ASIN
  const results = [];
  for (const asin of asins) {
    if (asin.id) {
      const [updated] = await db
        .update(forecastToolAsins)
        .set({
          asin: asin.asin || null,
          sku: asin.sku || null,
          productName: asin.productName,
          productPrice: String(asin.productPrice),
          sharePct: String(asin.sharePct),
          variationAttributes: asin.variationAttributes ?? undefined,
          isNew: asin.isNew,
          sortOrder: asin.sortOrder,
        })
        .where(eq(forecastToolAsins.id, asin.id))
        .returning();
      results.push(updated);
    } else {
      const [created] = await db
        .insert(forecastToolAsins)
        .values({
          versionId,
          asin: asin.asin || null,
          sku: asin.sku || null,
          productName: asin.productName,
          productPrice: String(asin.productPrice),
          sharePct: String(asin.sharePct),
          variationAttributes: asin.variationAttributes ?? null,
          isNew: asin.isNew,
          sortOrder: asin.sortOrder,
        })
        .returning();
      results.push(created);
    }
  }

  return NextResponse.json({ asins: results });
}

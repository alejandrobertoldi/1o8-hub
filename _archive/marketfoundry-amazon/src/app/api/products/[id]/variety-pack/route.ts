/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { varietyPackItems, master } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

// GET /api/products/[id]/variety-pack — get pack composition
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const items = await db
    .select({
      id: varietyPackItems.id,
      packProductId: varietyPackItems.packProductId,
      includedProductId: varietyPackItems.includedProductId,
      flavor: varietyPackItems.flavor,
      size: varietyPackItems.size,
      color: varietyPackItems.color,
      style: varietyPackItems.style,
      customLabel: varietyPackItems.customLabel,
      units: varietyPackItems.units,
      sortOrder: varietyPackItems.sortOrder,
      // Joined included product info
      includedAsin: master.asin,
      includedSku: master.sku,
      includedTitle: master.itemName,
      includedImage: master.mainImageUrl,
    })
    .from(varietyPackItems)
    .leftJoin(master, eq(varietyPackItems.includedProductId, master.id))
    .where(eq(varietyPackItems.packProductId, id))
    .orderBy(varietyPackItems.sortOrder);

  return NextResponse.json(items);
}

// PUT /api/products/[id]/variety-pack — replace entire pack composition
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { items } = body as {
    items: Array<{
      includedProductId?: string | null;
      flavor?: string;
      size?: string;
      color?: string;
      style?: string;
      customLabel?: string;
      units?: number;
    }>;
  };

  if (!Array.isArray(items))
    return NextResponse.json({ error: "items array required" }, { status: 400 });

  await db.transaction(async (tx) => {
    // Clear existing
    await tx.delete(varietyPackItems).where(eq(varietyPackItems.packProductId, id));

    // Insert new
    if (items.length > 0) {
      await tx.insert(varietyPackItems).values(
        items.map((item, i) => ({
          packProductId: id,
          includedProductId: item.includedProductId || null,
          flavor: item.flavor || null,
          size: item.size || null,
          color: item.color || null,
          style: item.style || null,
          customLabel: item.customLabel || null,
          units: item.units ?? 1,
          sortOrder: i,
        }))
      );
    }
  });

  return NextResponse.json({ ok: true, count: items.length });
}

// DELETE /api/products/[id]/variety-pack — remove all pack items
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.delete(varietyPackItems).where(eq(varietyPackItems.packProductId, id));
  return NextResponse.json({ ok: true });
}

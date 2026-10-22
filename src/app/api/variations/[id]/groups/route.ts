/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { variationGroups } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

// POST /api/variations/[id]/groups — create a group within this variation
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, dimension, sortOrder } = body;

  if (!name || !dimension)
    return NextResponse.json(
      { error: "name and dimension are required" },
      { status: 400 }
    );

  // Auto-assign next sortOrder if not provided
  let order = sortOrder;
  if (order === undefined || order === null) {
    const [maxRow] = await db
      .select({ max: sql<number>`COALESCE(MAX(sort_order), -1) + 1` })
      .from(variationGroups)
      .where(eq(variationGroups.variationId, id));
    order = maxRow?.max ?? 0;
  }

  const [row] = await db
    .insert(variationGroups)
    .values({
      variationId: id,
      name,
      dimension,
      sortOrder: order,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}

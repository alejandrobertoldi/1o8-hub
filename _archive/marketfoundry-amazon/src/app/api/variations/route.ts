import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { variations } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// GET /api/variations?clientId=XXX — list all variations for a client
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");

  const query = db
    .select({
      id: variations.id,
      clientId: variations.clientId,
      name: variations.name,
      code: variations.code,
      amazonVariationId: variations.amazonVariationId,
      themeAttributes: variations.themeAttributes,
      primaryDimension: variations.primaryDimension,
      description: variations.description,
      status: variations.status,
      lockedAt: variations.lockedAt,
      createdAt: variations.createdAt,
      updatedAt: variations.updatedAt,
      groupCount: sql<number>`(
        SELECT COUNT(*)::int FROM variation_groups
        WHERE variation_id = "variations"."id"
      )`.as("groupCount"),
      productCount: sql<number>`(
        SELECT COUNT(*)::int FROM master
        WHERE variation_ref = "variations"."id"
      )`.as("productCount"),
      seoProjectCount: sql<number>`(
        SELECT COUNT(*)::int FROM seo_projects
        WHERE variation_id = "variations"."id"
      )`.as("seoProjectCount"),
      vpCount: sql<number>`(
        SELECT count(DISTINCT vpi.pack_product_id)::int
        FROM variety_pack_items vpi
        JOIN master m ON m.id = vpi.pack_product_id
        WHERE m.variation_ref = "variations"."id"
      )`.as("vpCount"),
    })
    .from(variations);

  const rows = clientId
    ? await query.where(eq(variations.clientId, clientId)).orderBy(variations.name)
    : await query.orderBy(variations.name);

  return NextResponse.json(rows);
}

// POST /api/variations — create a new variation
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { clientId, name, code, amazonVariationId, themeAttributes, primaryDimension, description } = body;

  if (!clientId || !name || !code)
    return NextResponse.json(
      { error: "clientId, name, and code are required" },
      { status: 400 }
    );

  try {
    const [row] = await db
      .insert(variations)
      .values({
        clientId,
        name,
        code,
        amazonVariationId: amazonVariationId || null,
        themeAttributes: themeAttributes || [],
        primaryDimension: primaryDimension || null,
        description: description || null,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/variations] Failed query:", message);
    const isDupe = message.includes("unique") || message.includes("duplicate") || message.includes("23505");
    return NextResponse.json(
      { error: isDupe ? `Code "${code}" already exists` : "Failed to create variation" },
      { status: isDupe ? 409 : 500 }
    );
  }
}

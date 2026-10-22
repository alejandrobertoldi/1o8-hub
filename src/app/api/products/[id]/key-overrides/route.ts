import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { productKeyOverrides } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: productId } = await params;
  const overrides = await db
    .select()
    .from(productKeyOverrides)
    .where(eq(productKeyOverrides.productId, productId));

  return NextResponse.json({ overrides });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Editors or admins only" }, { status: 403 });
  }

  const { id: productId } = await params;
  const { attributeName, isKey, categoryDefinitionId } = await req.json();

  if (!attributeName) {
    return NextResponse.json({ error: "attributeName is required" }, { status: 400 });
  }

  const [result] = await db
    .insert(productKeyOverrides)
    .values({
      productId,
      attributeName,
      isKey: isKey !== false,
      categoryDefinitionId: categoryDefinitionId || null,
      createdBy: session.user.email ?? "unknown",
    })
    .onConflictDoUpdate({
      target: [productKeyOverrides.productId, productKeyOverrides.attributeName],
      set: { isKey: isKey !== false },
    })
    .returning();

  return NextResponse.json({ override: result });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Editors or admins only" }, { status: 403 });
  }

  const { id: productId } = await params;
  const { attributeName } = await req.json();

  await db
    .delete(productKeyOverrides)
    .where(
      and(
        eq(productKeyOverrides.productId, productId),
        eq(productKeyOverrides.attributeName, attributeName)
      )
    );

  return NextResponse.json({ success: true });
}

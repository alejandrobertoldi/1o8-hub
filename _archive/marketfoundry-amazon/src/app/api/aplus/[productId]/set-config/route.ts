import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aplusSets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";

export const maxDuration = 60;

export async function PATCH(
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
  if (session.user.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot edit" }, { status: 403 });
  }

  const { productId } = await params;

  try {

  const body = await req.json();

  // Validate allowed fields
  const allowedFields = [
    "scopeType",
    "scopeIdentifier",
    "platform",
    "contentType",
    "version",
    "groupNumber",
    "parentAsin",
    "coveredAsins",
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Validate scopeType
  if (updates.scopeType && !["ASIN", "VAR", "GRP"].includes(updates.scopeType as string)) {
    return NextResponse.json({ error: "Invalid scope type" }, { status: 400 });
  }

  // Validate platform
  if (updates.platform && !["SC", "VC"].includes(updates.platform as string)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  // Validate version
  if (updates.version !== undefined) {
    const v = updates.version as number;
    if (!Number.isInteger(v) || v < 1 || v > 99) {
      return NextResponse.json({ error: "Version must be 1-99" }, { status: 400 });
    }
  }

  // Validate groupNumber
  if (updates.groupNumber !== undefined && updates.groupNumber !== null) {
    const g = updates.groupNumber as number;
    if (!Number.isInteger(g) || g < 1 || g > 99) {
      return NextResponse.json({ error: "Group number must be 1-99" }, { status: 400 });
    }
  }

  // Validate coveredAsins is an array of strings
  if (updates.coveredAsins !== undefined && updates.coveredAsins !== null) {
    if (!Array.isArray(updates.coveredAsins) || !updates.coveredAsins.every((a: unknown) => typeof a === "string")) {
      return NextResponse.json({ error: "coveredAsins must be an array of strings" }, { status: 400 });
    }
  }

  updates.updatedAt = new Date();

  const [updated] = await db
    .update(aplusSets)
    .set(updates)
    .where(eq(aplusSets.productId, productId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Set config not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: updated.id,
    scopeType: updated.scopeType,
    scopeIdentifier: updated.scopeIdentifier,
    platform: updated.platform,
    contentType: updated.contentType,
    version: updated.version,
    groupNumber: updated.groupNumber,
    parentAsin: updated.parentAsin,
    coveredAsins: updated.coveredAsins,
  });

  } catch (err) {
    console.error("[aplus set-config PATCH] Error:", err);
    return NextResponse.json({ error: "Failed to update set config" }, { status: 500 });
  }
}

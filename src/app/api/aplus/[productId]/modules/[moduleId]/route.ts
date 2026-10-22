import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/async-parallel */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aplusModules, activityLog, master } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";

export const maxDuration = 60;

const EDITOR_ALLOWED_STATUSES = ["draft", "in_review"] as const;
const ADMIN_ONLY_STATUSES = ["approved", "uploaded"] as const;
const ALL_ALLOWED_STATUSES = [
  ...EDITOR_ALLOWED_STATUSES,
  ...ADMIN_ONLY_STATUSES,
] as const;

type AllowedStatus = (typeof ALL_ALLOWED_STATUSES)[number];

const TEXT_FIELDS = [
  "headlineText",
  "subheadlineText",
  "bodyText",
  "altText",
  "overlayText",
  "imageDescription",
  "aiImagePrompt",
  "cosmoRelationType",
  "figmaUrl",
  "markupUrl",
  "videoDriveFileId",
  "videoTitle",
  "videoDescription",
  "textPosition",
  "fontColor",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string; moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { productId, moduleId } = await params;

  try {

  const body = await req.json();

  // Build whitelisted update object
  const updates: Record<string, unknown> = {};

  for (const field of TEXT_FIELDS) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  // Handle status field with role check
  if ("status" in body) {
    const newStatus = body.status as string;
    if (!ALL_ALLOWED_STATUSES.includes(newStatus as AllowedStatus)) {
      return NextResponse.json(
        { error: `Invalid status value: ${newStatus}` },
        { status: 400 }
      );
    }
    if (
      ADMIN_ONLY_STATUSES.includes(newStatus as "approved" | "uploaded") &&
      !hasAdminPowers(role)
    ) {
      return NextResponse.json(
        { error: "Only admins can set status to approved or uploaded" },
        { status: 403 }
      );
    }
    updates.status = newStatus;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Fetch current module for logging
  const [current] = await db
    .select({
      moduleNumber: aplusModules.moduleNumber,
      status: aplusModules.status,
      moduleType: aplusModules.moduleType,
    })
    .from(aplusModules)
    .where(and(eq(aplusModules.id, moduleId), eq(aplusModules.productId, productId)))
    .limit(1);

  if (!current) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  updates.updatedAt = new Date();

  const [updated] = await db
    .update(aplusModules)
    .set(updates)
    .where(
      and(eq(aplusModules.id, moduleId), eq(aplusModules.productId, productId))
    )
    .returning();

  // Log status changes to activity log
  if ("status" in updates && updates.status !== current.status) {
    const [product] = await db
      .select({ asin: master.asin, sku: master.sku, clientIdCode: master.clientIdCode })
      .from(master)
      .where(eq(master.id, productId))
      .limit(1);

    await db.insert(activityLog).values({
      productId,
      asin: product?.asin ?? null,
      sku: product?.sku ?? null,
      clientIdCode: product?.clientIdCode ?? null,
      itemName: null,
      fieldLabel: `A+ Module ${current.moduleNumber} Status`,
      bqName: `aplus_module_${current.moduleNumber}_status`,
      oldValue: current.status,
      newValue: String(updates.status),
      changedBy: session.user.email ?? "",
      editType: "aplus",
    });
  }

  return NextResponse.json(updated);

  } catch (err) {
    console.error("[aplus module PATCH] Error:", err);
    return NextResponse.json(
      { error: "Failed to update module" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string; moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { productId, moduleId } = await params;

  try {

  // Fetch module info before deletion for logging
  const [toDelete] = await db
    .select({ moduleNumber: aplusModules.moduleNumber, moduleType: aplusModules.moduleType })
    .from(aplusModules)
    .where(and(eq(aplusModules.id, moduleId), eq(aplusModules.productId, productId)))
    .limit(1);

  if (!toDelete) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  await db
    .delete(aplusModules)
    .where(
      and(eq(aplusModules.id, moduleId), eq(aplusModules.productId, productId))
    );

  // Log deletion
  const [product] = await db
    .select({ asin: master.asin, sku: master.sku, clientIdCode: master.clientIdCode })
    .from(master)
    .where(eq(master.id, productId))
    .limit(1);

  await db.insert(activityLog).values({
    productId,
    asin: product?.asin ?? null,
    sku: product?.sku ?? null,
    clientIdCode: product?.clientIdCode ?? null,
    itemName: null,
    fieldLabel: `A+ Module ${toDelete.moduleNumber}`,
    bqName: `aplus_module_${toDelete.moduleNumber}_deleted`,
    oldValue: toDelete.moduleType,
    newValue: null,
    changedBy: session.user.email ?? "",
    editType: "aplus",
  });

  return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("[aplus module DELETE] Error:", err);
    return NextResponse.json(
      { error: "Failed to delete module" },
      { status: 500 }
    );
  }
}

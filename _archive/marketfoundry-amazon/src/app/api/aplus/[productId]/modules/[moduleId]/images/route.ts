import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { aplusModuleImages } from "@/lib/db/schema";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";

async function requireEditor() {
  const session = await getAuthSession();
  if (!session) return null;
  if (!canAccessSection(session, "aplus")) return null;
  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) return null;
  return session;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string; moduleId: string }> }
) {
  const session = await requireEditor();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { moduleId } = await params;
  const body = await req.json();

  const { imageSlot, customLabel, driveFileId, panelData } = body as {
    imageSlot: number;
    customLabel?: string;
    driveFileId?: string;
    panelData?: Record<string, string>;
  };

  if (typeof imageSlot !== "number") {
    return NextResponse.json({ error: "imageSlot is required" }, { status: 400 });
  }

  const [created] = await db
    .insert(aplusModuleImages)
    .values({
      moduleId,
      imageSlot,
      customLabel: customLabel ?? null,
      driveFileId: driveFileId ?? null,
      panelData: panelData ?? null,
    })
    .onConflictDoUpdate({
      target: [aplusModuleImages.moduleId, aplusModuleImages.imageSlot],
      set: {
        ...(driveFileId !== undefined ? { driveFileId: driveFileId ?? null } : {}),
        ...(panelData !== undefined ? { panelData: panelData ?? null } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string; moduleId: string }> }
) {
  const session = await requireEditor();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { moduleId } = await params;
  const body = await req.json();

  const { imageSlot, panelData } = body as {
    imageSlot: number;
    panelData: Record<string, string>;
  };

  if (typeof imageSlot !== "number") {
    return NextResponse.json({ error: "imageSlot is required" }, { status: 400 });
  }

  const [updated] = await db
    .update(aplusModuleImages)
    .set({ panelData, updatedAt: new Date() })
    .where(
      and(
        eq(aplusModuleImages.moduleId, moduleId),
        eq(aplusModuleImages.imageSlot, imageSlot)
      )
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Image slot not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

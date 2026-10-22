import { hasAdminPowers } from "@/lib/roles";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelines, driveFiles } from "@/lib/db/schema";

const bodySchema = z
  .object({
    driveFileId: z.string().min(1),
    folderId: z.string().uuid(),
    displayName: z.string().min(1),
    originalName: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative().nullable().optional(),
    slot: z.enum(["primary", "secondary", "monochrome", "additional"]),
    label: z.string().min(1).max(100).optional(),
  })
  .refine((d) => d.slot !== "additional" || (d.label && d.label.trim().length > 0), {
    message: "label is required when slot='additional'",
    path: ["label"],
  });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { driveFileId, folderId, displayName, originalName, mimeType, sizeBytes, slot, label } = parsed.data;

  // Ensure brand_guidelines row exists (logos can be uploaded before a PDF).
  const [bg] = await db.insert(clientBrandGuidelines).values({ clientIdCode })
    .onConflictDoUpdate({
      target: clientBrandGuidelines.clientIdCode,
      set: { updatedAt: new Date() },
    })
    .returning();

  // For additional logos, the user-supplied label is what's shown in the UI;
  // overwrite the auto-generated displayName with it so the gallery has a name.
  const finalDisplayName = slot === "additional" && label ? label.trim() : displayName;

  await db.insert(driveFiles).values({
    driveFileId,
    folderId,
    originalName,
    displayName: finalDisplayName,
    mimeType,
    sizeBytes: sizeBytes ?? null,
    entityType: "brand_logo",
    entityId: bg.id,
    uploadedBy: session.user.email!,
  });

  // Build the public URL: drive uses a webViewLink; for now store a stable
  // openable URL using the file id (front-end can use it).
  const url = `https://drive.google.com/file/d/${driveFileId}/view`;

  // Additional logos are tracked only via drive_files; they don't write into
  // the structured summaryLogo JSONB (which is reserved for primary/secondary/monochrome).
  if (slot !== "additional") {
    const summaryLogo = bg.summaryLogo ?? {
      primary_description: null, secondary_description: null, monochrome_description: null,
      clearspace_notes: null, misuse_notes: null,
      primary_url: null, secondary_url: null, monochrome_url: null,
    };
    const updated = { ...summaryLogo, [`${slot}_url`]: url };

    await db.update(clientBrandGuidelines)
      .set({ summaryLogo: updated, updatedAt: new Date() })
      .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode));
  }

  return NextResponse.json({ ok: true, slot, url });
}

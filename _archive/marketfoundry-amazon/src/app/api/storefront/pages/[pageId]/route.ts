/**
 * PATCH  /api/storefront/pages/[pageId]
 *   Body: { name: string }
 *   Updates the page name (and re-slugifies). Returns the updated row.
 *
 * DELETE /api/storefront/pages/[pageId]
 *   Best-effort trashes each module's Drive file, then deletes the page row
 *   (modules cascade via FK). Returns { ok: true }.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { storefrontPages, storefrontModules } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";

// ── helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  const s = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "page";
}

/** Ensure a unique slug within the client by appending -2, -3, … on collision. */
async function uniqueSlug(clientIdCode: string, base: string, excludePageId: string): Promise<string> {
  const slugRows = await db
    .select({ id: storefrontPages.id, slug: storefrontPages.slug })
    .from(storefrontPages)
    .where(eq(storefrontPages.clientIdCode, clientIdCode))
    .limit(200);

  const taken = new Set(
    slugRows.filter((r) => r.id !== excludePageId).map((r) => r.slug)
  );

  let candidate = base;
  let attempt = 1;
  while (taken.has(candidate)) {
    attempt++;
    candidate = `${base}-${attempt}`;
  }
  return candidate;
}

// ── handlers ──────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pageId } = await params;

  const body = await req.json().catch(() => null);
  const hasName = body && typeof body.name === "string" && body.name.trim();
  const hasMeta = body && typeof body.metaDescription === "string";
  if (!hasName && !hasMeta) {
    return NextResponse.json(
      { error: "Invalid body: name or metaDescription is required" },
      { status: 400 }
    );
  }

  const [existing] = await db
    .select({ id: storefrontPages.id, clientIdCode: storefrontPages.clientIdCode })
    .from(storefrontPages)
    .where(eq(storefrontPages.id, pageId))
    .limit(1);

  if (!existing) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const set: Partial<typeof storefrontPages.$inferInsert> = { updatedAt: new Date() };
  if (hasName) {
    const baseSlug = slugify(body.name);
    set.name = body.name.trim();
    set.slug = await uniqueSlug(existing.clientIdCode, baseSlug, pageId);
  }
  if (hasMeta) {
    const trimmed = body.metaDescription.trim();
    set.metaDescription = trimmed || null; // ponytail: empty textarea clears the field
  }

  const [updated] = await db
    .update(storefrontPages)
    .set(set)
    .where(eq(storefrontPages.id, pageId))
    .returning();

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    metaDescription: updated.metaDescription,
    isHomepage: updated.isHomepage,
    position: updated.position,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pageId } = await params;

  const [page] = await db
    .select({ id: storefrontPages.id })
    .from(storefrontPages)
    .where(eq(storefrontPages.id, pageId))
    .limit(1);

  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  // Collect all modules with Drive files for best-effort trash
  const modules = await db
    .select({ driveFileId: storefrontModules.driveFileId })
    .from(storefrontModules)
    .where(eq(storefrontModules.pageId, pageId));

  // Delete the page (modules cascade via FK)
  await db.delete(storefrontPages).where(eq(storefrontPages.id, pageId));

  // Best-effort: trash each module's Drive file
  for (const mod of modules) {
    if (!mod.driveFileId) continue;
    try {
      await driveClient.deleteFile(mod.driveFileId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[storefront DELETE page] Drive trash failed for ${mod.driveFileId}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true });
}

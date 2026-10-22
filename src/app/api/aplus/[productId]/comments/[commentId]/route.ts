import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aplusComments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 60;

// PATCH — update comment (resolve/reopen/edit body)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string; commentId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { commentId } = await params;

  try {

  const body = await req.json();
  const role = session.user.role;
  const userEmail = session.user.email ?? "";

  // Fetch comment to check ownership
  const [existing] = await db
    .select({ authorEmail: aplusComments.authorEmail })
    .from(aplusComments)
    .where(eq(aplusComments.id, commentId))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  // Only the author, editors, or admins can modify a comment
  const isOwner = existing.authorEmail === userEmail;
  if (!isOwner && role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};

  if (body.status === "resolved") {
    updates.status = "resolved";
    updates.resolvedBy = userEmail;
    updates.resolvedAt = new Date();
  } else if (body.status === "active") {
    updates.status = "active";
    updates.resolvedBy = null;
    updates.resolvedAt = null;
  }

  if (body.body !== undefined) {
    updates.body = body.body.trim();
  }

  updates.updatedAt = new Date();

  const [updated] = await db
    .update(aplusComments)
    .set(updates)
    .where(eq(aplusComments.id, commentId))
    .returning();

  return NextResponse.json({ comment: updated });

  } catch (err) {
    console.error("[aplus comment PATCH] Error:", err);
    return NextResponse.json({ error: "Failed to update comment" }, { status: 500 });
  }
}

// DELETE — remove a comment
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string; commentId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { commentId } = await params;

  try {

  const role = session.user.role;
  const userEmail = session.user.email ?? "";

  // Fetch comment to check ownership
  const [existing] = await db
    .select({ authorEmail: aplusComments.authorEmail })
    .from(aplusComments)
    .where(eq(aplusComments.id, commentId))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  // Only the author or admins can delete a comment
  const isOwner = existing.authorEmail === userEmail;
  if (!isOwner && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
  }

  await db
    .delete(aplusComments)
    .where(eq(aplusComments.id, commentId));

  return NextResponse.json({ success: true });

  } catch (err) {
    console.error("[aplus comment DELETE] Error:", err);
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}

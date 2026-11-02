import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { fieldComments } from "@/lib/db/schema";
import { eq, and, sql, count } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const field = searchParams.get("field");
  const resolvedParam = searchParams.get("resolved");

  const conditions = [eq(fieldComments.productId, id)];
  if (field) {
    conditions.push(eq(fieldComments.bqName, field));
  }
  if (resolvedParam !== null) {
    conditions.push(eq(fieldComments.resolved, resolvedParam === "true"));
  }

  const comments = await db
    .select()
    .from(fieldComments)
    .where(and(...conditions))
    .orderBy(fieldComments.createdAt);

  // Compute counts
  const countRows = await db
    .select({
      total: count(),
      open: count(
        sql`CASE WHEN ${fieldComments.resolved} = false THEN 1 END`
      ),
      resolved: count(
        sql`CASE WHEN ${fieldComments.resolved} = true THEN 1 END`
      ),
    })
    .from(fieldComments)
    .where(
      and(
        eq(fieldComments.productId, id),
        ...(field ? [eq(fieldComments.bqName, field)] : [])
      )
    );

  return NextResponse.json({
    comments,
    counts: countRows[0] ?? { total: 0, open: 0, resolved: 0 },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "viewer") {
    return NextResponse.json(
      { error: "Forbidden: viewers cannot add comments" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const { bqName, comment } = (await req.json()) as {
    bqName: string;
    comment: string;
  };

  if (!bqName || !comment?.trim()) {
    return NextResponse.json(
      { error: "bqName and comment are required" },
      { status: 400 }
    );
  }

  const [newComment] = await db
    .insert(fieldComments)
    .values({
      productId: id,
      bqName,
      comment: comment.trim(),
      author: session.user.email!,
      authorName: session.user.name || null,
    })
    .returning();

  return NextResponse.json(newComment, { status: 201 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "viewer") {
    return NextResponse.json(
      { error: "Forbidden: viewers cannot modify comments" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const { commentId, action, comment } = (await req.json()) as {
    commentId: number;
    action: "resolve" | "reopen" | "edit" | "delete";
    comment?: string;
  };

  if (!commentId || !action) {
    return NextResponse.json(
      { error: "commentId and action are required" },
      { status: 400 }
    );
  }

  // Fetch existing comment
  const [existing] = await db
    .select()
    .from(fieldComments)
    .where(
      and(eq(fieldComments.id, commentId), eq(fieldComments.productId, id))
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  // Edit and delete restricted to author or admin
  if (
    (action === "edit" || action === "delete") &&
    existing.author !== session.user.email &&
    !hasAdminPowers(session.user.role)
  ) {
    return NextResponse.json(
      { error: "Only the author or an admin can perform this action" },
      { status: 403 }
    );
  }

  if (action === "delete") {
    await db
      .delete(fieldComments)
      .where(eq(fieldComments.id, commentId));
    return NextResponse.json({ success: true });
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (action === "resolve") {
    updates.resolved = true;
    updates.resolvedBy = session.user.email;
    updates.resolvedAt = new Date();
  } else if (action === "reopen") {
    updates.resolved = false;
    updates.resolvedBy = null;
    updates.resolvedAt = null;
  } else if (action === "edit") {
    if (!comment?.trim()) {
      return NextResponse.json(
        { error: "comment is required for edit" },
        { status: 400 }
      );
    }
    updates.comment = comment.trim();
  }

  const [updated] = await db
    .update(fieldComments)
    .set(updates)
    .where(eq(fieldComments.id, commentId))
    .returning();

  return NextResponse.json(updated);
}

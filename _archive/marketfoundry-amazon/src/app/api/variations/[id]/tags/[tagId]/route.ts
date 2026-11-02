/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { variationTags, variationTagAssignments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string; tagId: string }> };

// PATCH /api/variations/[id]/tags/[tagId] — update a tag
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { tagId } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.dimension !== undefined) updates.dimension = body.dimension;
  if (body.value !== undefined) updates.value = body.value;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const [row] = await db
    .update(variationTags)
    .set(updates)
    .where(eq(variationTags.id, tagId))
    .returning();

  if (!row)
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });

  return NextResponse.json(row);
}

// DELETE /api/variations/[id]/tags/[tagId] — delete tag (cascades assignments)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { tagId } = await params;

  // Tag assignments cascade-delete via FK, so just delete the tag
  await db.delete(variationTags).where(eq(variationTags.id, tagId));

  return NextResponse.json({ ok: true });
}

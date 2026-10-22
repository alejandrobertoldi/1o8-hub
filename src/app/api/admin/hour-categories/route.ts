import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { listAllCategories, insertCategory, updateCategory } from "@/lib/hours/queries";

async function requireSuperAdmin() {
  const session = await getAuthSession();
  if (!session || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const categories = await listAllCategories();
  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A category name is required" }, { status: 400 });
  const sortOrder = typeof body.sortOrder === "number" ? body.sortOrder : undefined;
  try {
    const category = await insertCategory({ name, sortOrder });
    return NextResponse.json({ category }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "That category already exists" }, { status: 409 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const patch: { name?: string; active?: boolean; sortOrder?: number } = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const category = await updateCategory(id, patch);
  return NextResponse.json({ category });
}

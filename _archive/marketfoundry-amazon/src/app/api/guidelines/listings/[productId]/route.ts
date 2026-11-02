import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { ContentGuidelines } from "@/lib/variation-guidelines";

type Params = { params: Promise<{ productId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { productId } = await params;
  const body = await req.json() as { contentGuidelines: ContentGuidelines | null };

  const [product] = await db
    .select({ id: master.id, clientIdCode: master.clientIdCode })
    .from(master)
    .where(eq(master.id, productId))
    .limit(1);

  if (!product)
    return NextResponse.json({ error: "Product not found" }, { status: 404 });

  await db
    .update(master)
    .set({ contentGuidelines: body.contentGuidelines })
    .where(eq(master.id, productId));

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isEditorOrAbove } from "@/lib/roles";
import { classifyClrSkus } from "@/lib/product-excel-import";

const MAX_SKUS = 2000;

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditorOrAbove(session.user.role)) {
    return NextResponse.json(
      { error: "Forbidden: viewers cannot create products" },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    clientIdCode?: unknown;
    skus?: unknown;
  } | null;
  const clientIdCode =
    typeof body?.clientIdCode === "string" ? body.clientIdCode.trim() : "";
  const skus = Array.isArray(body?.skus)
    ? body.skus.filter((s): s is string => typeof s === "string" && s.trim() !== "")
    : [];

  if (!clientIdCode) {
    return NextResponse.json(
      { error: "Select a client before comparing SKUs" },
      { status: 400 }
    );
  }
  if (skus.length === 0) {
    return NextResponse.json(
      { error: "No SKUs found in the Category Listing Report" },
      { status: 400 }
    );
  }
  if (skus.length > MAX_SKUS) {
    return NextResponse.json(
      { error: `Too many SKUs to compare. Maximum is ${MAX_SKUS}.` },
      { status: 400 }
    );
  }

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of skus) {
    const sku = raw.trim();
    const key = sku.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(sku);
  }
  const existingRows = await db
    .select({ sku: master.sku })
    .from(master)
    .where(eq(master.clientIdCode, clientIdCode));

  const diff = classifyClrSkus(
    unique,
    existingRows.map((r) => r.sku ?? "")
  );
  return NextResponse.json({
    total: unique.length,
    existing: diff.existing,
    missing: diff.missing,
  });
}

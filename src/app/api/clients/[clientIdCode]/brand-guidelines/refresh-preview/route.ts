import { hasAdminPowers } from "@/lib/roles";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelineVersions } from "@/lib/db/schema";
import { snapshotActiveVersionAiPreview } from "@/lib/brand-guidelines/snapshot";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;
  const result = await snapshotActiveVersionAiPreview(clientIdCode);
  if (!result) return NextResponse.json({ error: "No active version" }, { status: 404 });

  const [active] = await db
    .select({ md: clientBrandGuidelineVersions.aiPreviewMd })
    .from(clientBrandGuidelineVersions)
    .where(and(
      eq(clientBrandGuidelineVersions.clientIdCode, clientIdCode),
      isNull(clientBrandGuidelineVersions.archivedAt),
    ))
    .limit(1);

  return new NextResponse(active?.md ?? "", {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelineVersions } from "@/lib/db/schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string; versionId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIdCode, versionId } = await params;
  const [version] = await db
    .select({
      id: clientBrandGuidelineVersions.id,
      versionNumber: clientBrandGuidelineVersions.versionNumber,
      aiPreviewMd: clientBrandGuidelineVersions.aiPreviewMd,
      archivedAt: clientBrandGuidelineVersions.archivedAt,
    })
    .from(clientBrandGuidelineVersions)
    .where(and(
      eq(clientBrandGuidelineVersions.id, versionId),
      eq(clientBrandGuidelineVersions.clientIdCode, clientIdCode),
    ))
    .limit(1);

  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  return new NextResponse(version.aiPreviewMd ?? "", {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

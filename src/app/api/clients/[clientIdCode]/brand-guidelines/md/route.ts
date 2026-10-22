export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelineVersions } from "@/lib/db/schema";
import { renderBrandGuidelinesMd } from "@/lib/brand-guidelines/render";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientIdCode } = await params;

  // Prefer the persisted snapshot on the active version (faster, consistent
  // with what AI agents will read when a project is created from this client).
  // Fall back to a live render if the snapshot hasn't been written yet —
  // happens for clients that existed before the ai_preview_md column was added.
  const [active] = await db
    .select({ aiPreviewMd: clientBrandGuidelineVersions.aiPreviewMd })
    .from(clientBrandGuidelineVersions)
    .where(and(
      eq(clientBrandGuidelineVersions.clientIdCode, clientIdCode),
      isNull(clientBrandGuidelineVersions.archivedAt),
    ))
    .limit(1);

  const md = active?.aiPreviewMd ?? (await renderBrandGuidelinesMd(clientIdCode));
  return new NextResponse(md, {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

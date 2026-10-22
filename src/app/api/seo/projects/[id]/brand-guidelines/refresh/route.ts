import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  seoProjects,
  clientBrandGuidelines,
  clientBrandGuidelineVersions,
} from "@/lib/db/schema";
import { renderBrandGuidelinesMd } from "@/lib/brand-guidelines/render";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [project] = await db.select().from(seoProjects)
    .where(eq(seoProjects.id, id)).limit(1);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.clientIdCode) {
    return NextResponse.json({ error: "Project has no clientIdCode" }, { status: 400 });
  }

  const [clientBg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, project.clientIdCode)).limit(1);
  if (!clientBg?.activeVersionId) {
    return NextResponse.json({ error: "Client has no active brand guidelines" }, { status: 400 });
  }

  const md = await renderBrandGuidelinesMd(project.clientIdCode);
  const [activeVersion] = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.id, clientBg.activeVersionId)).limit(1);

  await db.update(seoProjects).set({
    brandGuidelines: md,
    brandGuidelinesLock: {
      status: "locked",
      brand_voice: clientBg.summaryVoice?.attributes?.join(", ") || null,
      language_preferences: null,
      words_to_avoid: clientBg.summaryVoice?.donts ?? [],
      audience_notes: null,
      positioning: null,
      raw_text: activeVersion?.extractedMd ?? null,
    },
    updatedAt: new Date(),
  }).where(eq(seoProjects.id, id));

  return NextResponse.json({ ok: true });
}

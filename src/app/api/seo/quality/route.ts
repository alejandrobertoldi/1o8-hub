import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoQualityScores } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq, desc } from "drizzle-orm";
import { unauthorized, serverError } from "@/lib/api-utils";

// GET /api/seo/quality?projectId=xxx — fetch quality score history
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  try {
    const scores = await db
      .select()
      .from(seoQualityScores)
      .where(eq(seoQualityScores.projectId, projectId))
      .orderBy(desc(seoQualityScores.createdAt));

    return NextResponse.json(scores);
  } catch (err: unknown) {
    return serverError(err);
  }
}

// POST /api/seo/quality — persist audit score
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();

  try {
    const body = await req.json();
    const { projectId, overallScore, complianceScore, keywordCoverage,
      cosmoDensity, rufusCoverage, humanVoice, buyerJourney,
      variationConsistency, eeatScore, readabilityScore, citabilityScore,
      geoScore, findingsCount } = body;

    if (!projectId || overallScore === undefined) {
      return NextResponse.json({ error: "projectId and overallScore required" }, { status: 400 });
    }

    const [score] = await db
      .insert(seoQualityScores)
      .values({
        projectId,
        overallScore: Math.round(overallScore),
        complianceScore: complianceScore != null ? Math.round(complianceScore) : null,
        keywordCoverage: keywordCoverage != null ? Math.round(keywordCoverage) : null,
        cosmoDensity: cosmoDensity != null ? Math.round(cosmoDensity) : null,
        rufusCoverage: rufusCoverage != null ? Math.round(rufusCoverage) : null,
        humanVoice: humanVoice != null ? Math.round(humanVoice) : null,
        buyerJourney: buyerJourney != null ? Math.round(buyerJourney) : null,
        variationConsistency: variationConsistency != null ? Math.round(variationConsistency) : null,
        eeatScore: eeatScore != null ? Math.round(eeatScore) : null,
        readabilityScore: readabilityScore != null ? Math.round(readabilityScore) : null,
        citabilityScore: citabilityScore != null ? Math.round(citabilityScore) : null,
        geoScore: geoScore != null ? Math.round(geoScore) : null,
        findingsCount: findingsCount || 0,
      })
      .returning();

    return NextResponse.json(score);
  } catch (err: unknown) {
    return serverError(err);
  }
}

// GET /api/seo/projects/[id]/reviews/import — stored Hub reviews for the
// project's ASINs, as the CSV the S3 parser already understands. Replaces the
// manual scraper-export upload when the Reviews store has been synced.
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { seoAsins, seoProjects } from "@/lib/db/schema";
import { requireSeoReconnect } from "@/lib/helium10/access";
import { reviewsForAsins } from "@/lib/reviews/insights";
import { reviewsToS3Csv } from "@/lib/reviews/normalize";

export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const access = await requireSeoReconnect();
  if (access.error) return access.error;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  const [project] = await db.select({ id: seoProjects.id, clientIdCode: seoProjects.clientIdCode }).from(seoProjects).where(eq(seoProjects.id, id)).limit(1);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const rows = await db.select({ asin: seoAsins.asin, parentageLevel: seoAsins.parentageLevel }).from(seoAsins).where(eq(seoAsins.projectId, id));
  const children = rows.filter((r) => r.parentageLevel?.toLowerCase() !== "parent");
  const asins = [...new Set((children.length ? children : rows).map((r) => r.asin.trim().toUpperCase()).filter((a) => /^[A-Z0-9]{10}$/.test(a)))];
  if (!asins.length) return NextResponse.json({ error: "Save project ASINs in S1 before importing reviews." }, { status: 400 });

  const reviews = await reviewsForAsins(asins, 3000);
  const covered = new Set(reviews.map((r) => r.asin));
  return NextResponse.json(
    {
      csv: reviewsToS3Csv(reviews),
      count: reviews.length,
      asins,
      coveredAsins: [...covered],
      missingAsins: asins.filter((a) => !covered.has(a)),
      clientIdCode: project.clientIdCode,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

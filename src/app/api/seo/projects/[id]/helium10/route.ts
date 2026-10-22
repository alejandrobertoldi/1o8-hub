import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { seoAsins, seoProjects } from "@/lib/db/schema";
import { requireSeoOperator, integrationError } from "@/lib/helium10/access";
import { withHelium10 } from "@/lib/helium10/session";
import { helium10Enabled } from "@/lib/helium10/enabled";
import { fetchAsinKeywords } from "@/lib/helium10/client";
import { acquisitionInput, normalizeKeywords, selectProjectAsins, savedResearchDefaults } from "@/lib/helium10/keywords";

export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: NextRequest, { params }: Context) {
  try {
    const access = await requireSeoOperator();
    if (access.error) return access.error;
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, id)).limit(1);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const saved = project.contentRules?.s2_helium10_data?.dimensions?.[0];
    return NextResponse.json({ snapshot: saved ? JSON.parse(saved) : null, defaults: savedResearchDefaults(project.clientIdCode, project.competitors) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return integrationError(); }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const access = await requireSeoOperator(req);
    if (access.error) return access.error;
    // Switched off: S2 uses the Cerebro CSV upload; never spend Helium 10 calls from here
    if (!helium10Enabled()) return NextResponse.json({ error: "Helium 10 is disabled — upload the Cerebro CSV instead." }, { status: 409 });
    const { id } = await params;
    const parsed = acquisitionInput.safeParse(await req.json());
    if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Select a supported marketplace and up to 10 valid competitor ASINs." }, { status: 400 });
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, id)).limit(1);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    if (!project.s1ApprovedAt) return NextResponse.json({ error: "Approve S1 intake before fetching keywords." }, { status: 400 });
    const rows = await db.select().from(seoAsins).where(eq(seoAsins.projectId, id));
    let asins: string[];
    try { asins = selectProjectAsins(rows); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
    const { marketplace } = parsed.data;
    const competitorAsins = [...new Set(parsed.data.competitorAsins)].filter(asin => !asins.includes(asin));
    const snapshot = await withHelium10(async client => {
      const deadline = Date.now() + 220_000;
      const productRows = await fetchAsinKeywords(client, asins, marketplace, deadline);
      const competitorRows = competitorAsins.length ? await fetchAsinKeywords(client, competitorAsins, marketplace, deadline) : [];
      const source = `Helium 10 MCP (${marketplace})`;
      const result = normalizeKeywords(productRows, source);
      if (!result.keywords.length) throw new Error("No usable product keywords returned");
      return { client: result, competitors: competitorAsins.length ? [normalizeKeywords(competitorRows, `${source} competitors`)] : [], marketplace, asins, competitorAsins, fetchedAt: new Date().toISOString() };
    });
    const entry = JSON.stringify({ mode: "shared", dimensions: [JSON.stringify(snapshot)] });
    // Atomic JSONB key update preserves other concurrently edited content rules.
    await db.update(seoProjects).set({ contentRules: sql`jsonb_set(coalesce(${seoProjects.contentRules}, '{}'::jsonb), '{s2_helium10_data}', ${entry}::jsonb)`, updatedAt: new Date() }).where(eq(seoProjects.id, id));
    return NextResponse.json(snapshot);
  } catch { return integrationError(); }
}

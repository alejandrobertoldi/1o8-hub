import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { getAiFeatureConfig } from "@/lib/ai-config.server";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { seoProjects, seoKeywords, seoRufus } from "@/lib/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";

export const maxDuration = 300;

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: 10 requests per minute per user
  const rl = checkRateLimit(session.user.email, 10, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const aiConfig = await getAiFeatureConfig("aplus_video_title");
  if (!aiConfig.enabled) {
    return NextResponse.json({ error: "Video title suggestion is disabled" }, { status: 403 });
  }

  const body = await req.json();
  const { productId, productName, videoDescription } = body;

  if (!productName) {
    return NextResponse.json({ error: "productName is required" }, { status: 400 });
  }

  // ── Optional SEO context ──────────────────────────────────────
  let seoContext = "";
  if (productId) {
    try {
      const [seoProject] = await db
        .select({ id: seoProjects.id, brandName: seoProjects.brandName })
        .from(seoProjects)
        .where(eq(seoProjects.linkedProductId, productId))
        .orderBy(desc(seoProjects.updatedAt))
        .limit(1);

      if (seoProject) {
        const parts: string[] = [];
        if (seoProject.brandName) parts.push(`Brand: ${seoProject.brandName}`);

        const keywords = await db
          .select({ text: seoKeywords.text, tier: seoKeywords.priorityTier })
          .from(seoKeywords)
          .where(and(eq(seoKeywords.projectId, seoProject.id), inArray(seoKeywords.priorityTier, ["T1"])))
          .limit(5);

        if (keywords.length > 0) {
          parts.push(`Top keywords: ${keywords.map((k) => k.text).join(", ")}`);
        }

        try {
          const [rufus] = await db
            .select({ optimizationSummary: seoRufus.optimizationSummary })
            .from(seoRufus)
            .where(eq(seoRufus.projectId, seoProject.id))
            .limit(1);
          if (rufus) {
            const summary = rufus.optimizationSummary as { audience_segmentation?: string } | null;
            if (summary?.audience_segmentation) parts.push(`Audience: ${summary.audience_segmentation}`);
          }
        } catch { /* non-fatal */ }

        if (parts.length > 0) {
          seoContext = "\n\nSEO context (use if relevant):\n" + parts.join("\n");
        }
      }
    } catch { /* non-fatal */ }
  }

  const prompt = `Suggest a compelling video title for an Amazon A+ Premium Content video module.

Product: ${productName}
${videoDescription ? `Video description: ${videoDescription}` : ""}${seoContext}

Requirements:
- Max 60 characters (Amazon limit for video titles)
- Engaging and specific to the product
- Should make shoppers want to watch the video
- If SEO keywords are available, incorporate one naturally — only if it fits
- No clickbait, no ALL CAPS

Return ONLY the title string, nothing else.`;

  try {
    const response = await getAnthropicClient().messages.create({
      model: aiConfig.model,
      max_tokens: aiConfig.maxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    return NextResponse.json({ title: text });
  } catch (err) {
    console.error("Video title generation error:", err);
    return NextResponse.json({ error: "Failed to generate video title" }, { status: 500 });
  }
}

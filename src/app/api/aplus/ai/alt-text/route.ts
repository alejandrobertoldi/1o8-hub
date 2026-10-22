/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/js-combine-iterations */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { getAccessToken } from "@/lib/gcp-auth";
import { getAiFeatureConfig } from "@/lib/ai-config.server";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { seoProjects, seoKeywords, seoRufus, seoCosmopMaps } from "@/lib/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";

export const maxDuration = 300;

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

/** Download image from Drive and return as base64 + media type */
async function fetchDriveImage(
  fileId: string
): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const token = await getAccessToken([DRIVE_SCOPE]);

    // Get mime type
    const metaRes = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=mimeType,size`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();

    // Skip files > 5MB to stay within Claude limits
    if (meta.size && Number(meta.size) > 5 * 1024 * 1024) return null;

    // Download bytes
    const dlRes = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!dlRes.ok) return null;

    const buffer = await dlRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mediaType = meta.mimeType || "image/png";

    return { base64, mediaType };
  } catch (err) {
    console.warn("Failed to fetch Drive image for alt text:", err);
    return null;
  }
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

  const body = await req.json();
  const {
    productId,
    productName,
    moduleType,
    slotLabel,
    imageDescription,
    aiImagePrompt,
    driveFileId,
  } = body;

  if (!productName) {
    return NextResponse.json({ error: "productName is required" }, { status: 400 });
  }

  // ── Fetch the actual image if uploaded ────────────────────────
  let imageData: { base64: string; mediaType: string } | null = null;
  if (driveFileId) {
    imageData = await fetchDriveImage(driveFileId);
  }

  // ── Pull SEO + Alexa for Shopping + COSMO data (optional enrichment) ──────
  let seoContext = "";
  if (productId) {
    try {
      const [seoProject] = await db
        .select({
          id: seoProjects.id,
          brandName: seoProjects.brandName,
          brandGuidelinesLock: seoProjects.brandGuidelinesLock,
        })
        .from(seoProjects)
        .where(eq(seoProjects.linkedProductId, productId))
        .orderBy(desc(seoProjects.updatedAt))
        .limit(1);

      if (seoProject) {
        const parts: string[] = [];

        if (seoProject.brandName) {
          parts.push(`Brand: ${seoProject.brandName}`);
        }

        // T1/T2 keywords
        const keywords = await db
          .select({ text: seoKeywords.text, tier: seoKeywords.priorityTier })
          .from(seoKeywords)
          .where(
            and(
              eq(seoKeywords.projectId, seoProject.id),
              inArray(seoKeywords.priorityTier, ["T1", "T2"])
            )
          );

        if (keywords.length > 0) {
          const t1 = keywords.filter((k) => k.tier === "T1").map((k) => k.text);
          const t2 = keywords.filter((k) => k.tier === "T2").map((k) => k.text);
          if (t1.length > 0) parts.push(`Primary keywords: ${t1.join(", ")}`);
          if (t2.length > 0) parts.push(`Secondary keywords: ${t2.slice(0, 10).join(", ")}`);
        }

        const lock = seoProject.brandGuidelinesLock as {
          brand_voice?: string | null;
          words_to_avoid?: string[];
        } | null;
        if (lock?.brand_voice) parts.push(`Brand voice: ${lock.brand_voice}`);
        if (lock?.words_to_avoid?.length) parts.push(`Words to avoid: ${lock.words_to_avoid.join(", ")}`);

        // Alexa for Shopping S4
        try {
          const [rufus] = await db
            .select({ optimizationSummary: seoRufus.optimizationSummary })
            .from(seoRufus)
            .where(eq(seoRufus.projectId, seoProject.id))
            .limit(1);

          if (rufus) {
            const summary = rufus.optimizationSummary as {
              image_strategy?: string;
              audience_segmentation?: string;
            } | null;
            if (summary?.image_strategy) parts.push(`Image strategy (Alexa for Shopping): ${summary.image_strategy}`);
            if (summary?.audience_segmentation) parts.push(`Target audience: ${summary.audience_segmentation}`);
          }
        } catch { /* non-fatal */ }

        // COSMO S5
        try {
          const [cosmo] = await db
            .select({ triples: seoCosmopMaps.triples })
            .from(seoCosmopMaps)
            .where(eq(seoCosmopMaps.projectId, seoProject.id))
            .limit(1);

          if (cosmo) {
            const triples = cosmo.triples as Array<{
              entity1: string; relationship: string; entity2: string; confidence: number;
            }> | null;
            if (triples && triples.length > 0) {
              const top = triples
                .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
                .slice(0, 5)
                .map((t) => `${t.entity1} → ${t.relationship} → ${t.entity2}`)
                .join("; ");
              parts.push(`Product relationships (COSMO): ${top}`);
            }
          }
        } catch { /* non-fatal */ }

        if (parts.length > 0) {
          seoContext = "\n\nSEO RESEARCH (use to enhance the description if relevant — do NOT force keywords that don't match what's in the image):\n" + parts.join("\n");
        }
      }
    } catch (err) {
      console.warn("Failed to fetch SEO context for alt text:", err);
    }
  }

  // ── Build prompt ────────────────────────────────────────────────
  const contextParts: string[] = [];
  if (moduleType) contextParts.push(`Module type: ${moduleType.replace(/_/g, " ")}`);
  if (slotLabel) contextParts.push(`Image slot: ${slotLabel}`);
  if (imageDescription) contextParts.push(`Image description provided by user: ${imageDescription}`);
  if (aiImagePrompt) contextParts.push(`AI image prompt: ${aiImagePrompt}`);

  const hasImage = !!imageData;

  const prompt = hasImage
    ? `Look at this image from an Amazon A+ Content module and describe what it shows. This description will be used as alt text that Amazon's search algorithms (A9/Rufus/COSMO) read to understand the image content.

Product: ${productName}
${contextParts.length > 0 ? contextParts.join("\n") : ""}${seoContext}

Requirements:
- Max 100 characters (Amazon limit)
- Describe what you actually SEE in the image — be accurate and specific
- If SEO research is available and relevant to what's shown, you may naturally incorporate 1-2 keywords — but only if they truthfully describe the image
- No generic filler ("image of", "picture of", "photo showing")
- Focus on the product, its features, or the scene depicted

Return ONLY the alt text string, nothing else.`
    : `Generate alt text for an Amazon A+ Content image (no image uploaded yet — use the context below).

Product: ${productName}
${contextParts.length > 0 ? contextParts.join("\n") : ""}${seoContext}

Requirements:
- Max 100 characters (Amazon limit)
- Describe the likely image content based on the module type, slot, and product
- If SEO research is available, naturally weave in 1-2 relevant keywords
- No generic filler ("image of", "picture of")

Return ONLY the alt text string, nothing else.`;

  try {
    const messages: Anthropic.MessageCreateParamsNonStreaming["messages"] = [];

    if (hasImage) {
      messages.push({
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: imageData!.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: imageData!.base64,
            },
          },
          { type: "text", text: prompt },
        ],
      });
    } else {
      messages.push({ role: "user", content: prompt });
    }

    const aiConfig = await getAiFeatureConfig("aplus_alt_text");
    if (!aiConfig.enabled) {
      return NextResponse.json({ error: "Alt text generation is disabled" }, { status: 403 });
    }

    const response = await getAnthropicClient().messages.create({
      model: aiConfig.model,
      max_tokens: aiConfig.maxTokens,
      messages,
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";

    return NextResponse.json({ altText: text });
  } catch (err) {
    console.error("Alt text generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate alt text" },
      { status: 500 }
    );
  }
}

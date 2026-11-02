/* eslint-disable react-doctor/server-fetch-without-revalidate */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { getAccessToken } from "@/lib/gcp-auth";
import { getAiFeatureConfig } from "@/lib/ai-config.server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  ALT_TEXT_MAX,
  SUGGESTION_MAX,
  buildBrandStoryAltTextPrompt,
} from "@/lib/brand-story/alt-text-prompt";

export const maxDuration = 60;

const MODULE_TYPE_LABELS: Record<string, string> = {
  bg_desktop: "Brand Story desktop background",
  bg_mobile: "Brand Story mobile background",
  "focus-image": "Brand Focus Image",
  "logo-description": "Brand Logo",
  "asin-showcase": "Brand ASIN product image",
};

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

async function fetchDriveImage(
  fileId: string
): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const token = await getAccessToken([DRIVE_SCOPE]);

    const metaRes = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=mimeType,size`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();

    if (meta.size && Number(meta.size) > 5 * 1024 * 1024) return null;

    const dlRes = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!dlRes.ok) return null;

    const buffer = await dlRes.arrayBuffer();
    return {
      base64: Buffer.from(buffer).toString("base64"),
      mediaType: meta.mimeType || "image/png",
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessSection(session, "design")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = checkRateLimit(session.user.email, 20, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  const body = await req.json();
  const {
    driveFileId,
    moduleType,
    headline,
    body: bodyText,
    currentAlt,
    suggestion,
  }: {
    driveFileId?: string;
    moduleType?: string;
    headline?: string;
    body?: string;
    currentAlt?: string;
    suggestion?: string;
  } = body;

  const aiConfig = await getAiFeatureConfig("brand_story_alt_text");
  if (!aiConfig.enabled) {
    return NextResponse.json(
      { error: "Alt text generation is disabled" },
      { status: 403 }
    );
  }

  let imageData: { base64: string; mediaType: string } | null = null;
  if (driveFileId) {
    imageData = await fetchDriveImage(driveFileId);
  }

  const slotLabel = moduleType ? (MODULE_TYPE_LABELS[moduleType] ?? moduleType) : "Brand Story image";

  const prompt = buildBrandStoryAltTextPrompt({
    slotLabel,
    headline,
    body: bodyText,
    currentAlt: typeof currentAlt === "string" ? currentAlt.slice(0, ALT_TEXT_MAX) : undefined,
    suggestion: typeof suggestion === "string" ? suggestion.slice(0, SUGGESTION_MAX) : undefined,
    hasImage: Boolean(imageData),
  });

  try {
    const messages: Anthropic.MessageCreateParamsNonStreaming["messages"] = [];

    if (imageData) {
      messages.push({
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: imageData.mediaType as
                | "image/jpeg"
                | "image/png"
                | "image/gif"
                | "image/webp",
              data: imageData.base64,
            },
          },
          { type: "text", text: prompt },
        ],
      });
    } else {
      messages.push({ role: "user", content: prompt });
    }

    const response = await getAnthropicClient().messages.create({
      model: aiConfig.model,
      max_tokens: aiConfig.maxTokens,
      messages,
    });

    const raw =
      response.content[0].type === "text" ? response.content[0].text.trim() : "";
    // Enforce the 100-char hard limit client-side as a safety net
    const altText = raw.slice(0, ALT_TEXT_MAX);

    return NextResponse.json({ altText });
  } catch (err) {
    console.error("Brand Story alt text generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate alt text" },
      { status: 500 }
    );
  }
}

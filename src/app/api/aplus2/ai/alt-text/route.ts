import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { getAccessToken } from "@/lib/gcp-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { aplus2Assets, driveFiles } from "@/lib/db/schema";
import {
  ALT_TEXT_MAX,
  SUGGESTION_MAX,
  buildAplusAltTextPrompt,
} from "@/lib/aplus2/alt-text-prompt";

export const maxDuration = 120;

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

async function fetchDriveImage(gid: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const token = await getAccessToken([DRIVE_SCOPE]);
    const metaRes = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(gid)}?supportsAllDrives=true&fields=mimeType,size`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    // ponytail: sane upper bound only — we recompress below, so don't silently drop
    // large composites (e.g. 1464×600 full-video thumbnails saved as multi-MB PNG).
    if (meta.size && Number(meta.size) > 50 * 1024 * 1024) return null;
    const dlRes = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(gid)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!dlRes.ok) return null;
    const buffer = Buffer.from(await dlRes.arrayBuffer());
    // Claude caps images at ~5MB / 1568px long edge. Downscale + recompress to JPEG so
    // oversized or odd-format images aren't dropped or rejected by the API media_type.
    const jpeg = await sharp(buffer)
      .rotate()
      .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { base64: jpeg.toString("base64"), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(session.user.email, 10, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 });
  }

  const {
    assetId,
    currentAlt,
    suggestion,
  }: {
    assetId?: string;
    currentAlt?: string;
    suggestion?: string;
  } = await req.json().catch(() => ({}));
  if (!assetId) return NextResponse.json({ error: "assetId is required" }, { status: 400 });

  const [row] = await db
    .select({ gid: driveFiles.driveFileId })
    .from(aplus2Assets)
    .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
    .where(eq(aplus2Assets.id, assetId))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const imageData = await fetchDriveImage(row.gid);
  if (!imageData) return NextResponse.json({ error: "Could not fetch image from Drive" }, { status: 422 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 500 });

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: imageData.mediaType as "image/png" | "image/jpeg" | "image/webp", data: imageData.base64 },
        },
        {
          type: "text",
          text: buildAplusAltTextPrompt({
            slotLabel: "A+ Content image",
            currentAlt: typeof currentAlt === "string" ? currentAlt.slice(0, ALT_TEXT_MAX) : undefined,
            suggestion: typeof suggestion === "string" ? suggestion.slice(0, SUGGESTION_MAX) : undefined,
            hasImage: true,
          }),
        },
      ],
    }],
  });

  const altText = msg.content[0].type === "text" ? msg.content[0].text.trim().slice(0, 100) : "";
  return NextResponse.json({ altText });
}

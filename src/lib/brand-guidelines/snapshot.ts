/* eslint-disable react-doctor/server-sequential-independent-await */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientBrandGuidelines, clientBrandGuidelineVersions } from "@/lib/db/schema";
import { renderBrandGuidelinesMd } from "./render";

/**
 * Render the live AI preview from current DB state and persist it onto the
 * client's currently-active brand book version (the one with archived_at = null).
 * No-op if the client has no active version. Once a version is archived, its
 * ai_preview_md remains frozen at whatever was written last while it was active.
 *
 * Called from every route that mutates the underlying data (extraction, summary
 * patch, note add/edit/delete) so the stored preview tracks current state for
 * the active version, but stays as a true historical snapshot for older versions.
 */
export async function snapshotActiveVersionAiPreview(
  clientIdCode: string
): Promise<{ versionId: string; bytes: number } | null> {
  const [active] = await db
    .select({ id: clientBrandGuidelineVersions.id })
    .from(clientBrandGuidelineVersions)
    .where(and(
      eq(clientBrandGuidelineVersions.clientIdCode, clientIdCode),
      isNull(clientBrandGuidelineVersions.archivedAt),
    ))
    .limit(1);
  if (!active) return null;

  const md = await renderBrandGuidelinesMd(clientIdCode);
  await db
    .update(clientBrandGuidelineVersions)
    .set({ aiPreviewMd: md })
    .where(eq(clientBrandGuidelineVersions.id, active.id));

  return { versionId: active.id, bytes: md.length };
}

export interface BrandGuidelinesSnapshot {
  brandGuidelines: string;
  brandGuidelinesLock:
    | {
        status: "locked";
        brand_voice: string | null;
        language_preferences: string | null;
        words_to_avoid: string[];
        audience_notes: string | null;
        positioning: string | null;
        raw_text: string | null;
      }
    | null;
}

/**
 * Build a snapshot of the client's current brand guidelines for embedding
 * into a new SEO project at creation time. Returns empty values if the
 * client has no guidelines yet — callers should treat that as "leave empty".
 */
export async function snapshotClientBrandGuidelines(
  clientIdCode: string | null | undefined
): Promise<BrandGuidelinesSnapshot> {
  if (!clientIdCode) return { brandGuidelines: "", brandGuidelinesLock: null };

  const [clientBg] = await db
    .select()
    .from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode))
    .limit(1);
  if (!clientBg?.activeVersionId) {
    return { brandGuidelines: "", brandGuidelinesLock: null };
  }

  const md = await renderBrandGuidelinesMd(clientIdCode);
  const [activeVersion] = await db
    .select()
    .from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.id, clientBg.activeVersionId))
    .limit(1);

  return {
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
  };
}

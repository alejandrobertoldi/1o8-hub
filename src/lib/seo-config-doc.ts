// Shared utility — builds the SEO Manager config prompt block to inject
// into every Claude API call as the authoritative rules layer.
//
// Sources (in priority order):
//   1. seo-pipeline-config.ts — code-level rules (always present)
//   2. DB seo_settings.config_doc — optional project-level overrides
//
// Usage:
//   const configBlock = await getConfigDocBlock();
//   systemPrompt = configBlock + "\n\n" + routeSpecificPrompt;

import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildConfigPromptBlock } from "@/lib/seo-pipeline-config";

// DB override char limit to avoid excessive token usage.
const DEFAULT_DB_CHAR_LIMIT = 4000;

let dbCache: { value: string; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min in-process cache

async function fetchDbOverrides(): Promise<string> {
  try {
    const rows = await db
      .select({ value: seoSettings.value })
      .from(seoSettings)
      .where(eq(seoSettings.key, "config_doc"))
      .limit(1);
    return rows[0]?.value ?? "";
  } catch {
    return "";
  }
}

/**
 * Returns a ready-to-prepend system prompt block containing:
 *   1. The pipeline config rules (from seo-pipeline-config.ts)
 *   2. Any DB-stored project overrides (from seo_settings.config_doc)
 *
 * Always returns at least the pipeline config — never an empty string.
 */
export async function getConfigDocBlock(dbCharLimit = DEFAULT_DB_CHAR_LIMIT): Promise<string> {
  // 1. Pipeline config (always present, generated from code)
  const pipelineBlock = buildConfigPromptBlock();

  // 2. DB overrides (optional, project-specific)
  const now = Date.now();
  if (!dbCache || now - dbCache.fetchedAt > CACHE_TTL_MS) {
    const value = await fetchDbOverrides();
    dbCache = { value, fetchedAt: now };
  }

  const dbDoc = dbCache.value.trim();
  if (!dbDoc) return pipelineBlock;

  const truncated = dbDoc.length > dbCharLimit
    ? dbDoc.slice(0, dbCharLimit) + "\n\n[...project overrides truncated for token budget...]"
    : dbDoc;

  return pipelineBlock + "\n\n=== PROJECT-LEVEL OVERRIDES ===\n" + truncated + "\n=== END PROJECT OVERRIDES ===";
}

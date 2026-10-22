// ═══════════════════════════════════════════════════════════════
// AI Configuration — server-only DB functions
// ═══════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AI_DEFAULTS, AVAILABLE_MODELS, type AiFeatureKey, type AiFeatureConfig } from "@/lib/ai-config";

type AiConfigMap = Partial<Record<AiFeatureKey, Partial<AiFeatureConfig>>>;

// In-memory cache with 60s TTL
let cachedConfig: AiConfigMap | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

/** Load the full AI config map from DB (with cache) */
export async function loadAiConfig(): Promise<AiConfigMap> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const [row] = await db
      .select({ value: seoSettings.value })
      .from(seoSettings)
      .where(eq(seoSettings.key, "ai_config"))
      .limit(1);

    if (row?.value) {
      cachedConfig = JSON.parse(row.value) as AiConfigMap;
    } else {
      cachedConfig = {};
    }
    cacheTimestamp = now;
    return cachedConfig;
  } catch {
    return {};
  }
}

/** Get the resolved config for a specific AI feature (defaults merged with overrides) */
export async function getAiFeatureConfig(key: AiFeatureKey): Promise<AiFeatureConfig> {
  const overrides = await loadAiConfig();
  const defaults = AI_DEFAULTS[key];
  const override = overrides[key];

  const validModelIds = AVAILABLE_MODELS.map((m) => m.id);
  const merged = {
    ...defaults,
    ...override,
    label: defaults.label,
    route: defaults.route,
  };
  // Fall back to default model if the DB override has an invalid model ID
  if (!validModelIds.includes(merged.model)) {
    merged.model = defaults.model;
  }
  return merged;
}

/** Invalidate the in-memory cache (call after saving) */
export function invalidateAiConfigCache() {
  cachedConfig = null;
  cacheTimestamp = 0;
}

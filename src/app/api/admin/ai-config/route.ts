import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq } from "drizzle-orm";
import {
  AI_DEFAULTS,
  AI_FEATURE_KEYS,
  type AiFeatureKey,
  type AiFeatureConfig,
} from "@/lib/ai-config";
import { invalidateAiConfigCache } from "@/lib/ai-config.server";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 60;

/** GET — return merged config (defaults + overrides) for all features */
export async function GET() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const [row] = await db
      .select({ value: seoSettings.value, updatedAt: seoSettings.updatedAt, updatedBy: seoSettings.updatedBy })
      .from(seoSettings)
      .where(eq(seoSettings.key, "ai_config"))
      .limit(1);

    const overrides: Partial<Record<AiFeatureKey, Partial<AiFeatureConfig>>> = row?.value
      ? JSON.parse(row.value)
      : {};

    // Merge defaults with overrides
    const features: Record<string, AiFeatureConfig> = {};
    for (const key of AI_FEATURE_KEYS) {
      features[key] = {
        ...AI_DEFAULTS[key],
        ...overrides[key],
        label: AI_DEFAULTS[key].label,
        route: AI_DEFAULTS[key].route,
      };
    }

    return NextResponse.json({
      features,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT — save overrides (only changed fields) */
export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { features } = body as { features: Record<string, Partial<AiFeatureConfig>> };

    if (!features || typeof features !== "object") {
      return NextResponse.json({ error: "features object required" }, { status: 400 });
    }

    // Store all submitted values — always write model/maxTokens/enabled so stale overrides are cleared
    const overrides: Partial<Record<AiFeatureKey, Partial<AiFeatureConfig>>> = {};
    for (const key of AI_FEATURE_KEYS) {
      const submitted = features[key];
      if (!submitted) continue;

      const entry: Partial<AiFeatureConfig> = {};

      if (submitted.model) entry.model = submitted.model;
      if (submitted.maxTokens) entry.maxTokens = submitted.maxTokens;
      if (typeof submitted.enabled === "boolean") entry.enabled = submitted.enabled;

      if (Object.keys(entry).length > 0) {
        overrides[key] = entry;
      }
    }

    const value = JSON.stringify(overrides);

    await db
      .insert(seoSettings)
      .values({ key: "ai_config", value, updatedBy: session.user.email! })
      .onConflictDoUpdate({
        target: seoSettings.key,
        set: { value, updatedAt: new Date(), updatedBy: session.user.email! },
      });

    invalidateAiConfigCache();

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

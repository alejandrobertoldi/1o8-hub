// GET: the Claude model each AI-powered SEO step uses (defaults + admin overrides). Hub staff only.
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { getAiFeatureConfig } from "@/lib/ai-config.server";
import { SEO_MODEL_STEPS, modelShortLabel, summarizeSeoModels } from "@/lib/seo/ai-models";

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const steps = await Promise.all(SEO_MODEL_STEPS.map(async ({ key, step }) => {
    const cfg = await getAiFeatureConfig(key);
    return { step, model: cfg.model, label: modelShortLabel(cfg.model), enabled: cfg.enabled };
  }));
  return NextResponse.json({ steps, summary: summarizeSeoModels(steps) }, { headers: { "Cache-Control": "no-store" } });
}

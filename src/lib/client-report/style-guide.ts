import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { DEFAULT_STYLE_GUIDE } from "./default-style-guide";

/**
 * 1o8's writing style guide (Admin → Configuration → Writing style), stored
 * in seo_settings. Starts as the SEO blog tool's default guide.
 */
export const STYLE_GUIDE_KEY = "writing_style_guide";

export async function getStyleGuide(): Promise<{ text: string; updatedAt: Date | null; updatedBy: string | null; isDefault: boolean }> {
  const [row] = await db.select().from(seoSettings).where(eq(seoSettings.key, STYLE_GUIDE_KEY)).limit(1);
  if (!row?.value.trim()) return { text: DEFAULT_STYLE_GUIDE, updatedAt: null, updatedBy: null, isDefault: true };
  return { text: row.value, updatedAt: row.updatedAt, updatedBy: row.updatedBy || null, isDefault: false };
}

export async function saveStyleGuide(text: string, updatedBy: string) {
  const value = text.trim();
  await db
    .insert(seoSettings)
    .values({ key: STYLE_GUIDE_KEY, value, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({ target: seoSettings.key, set: { value, updatedBy, updatedAt: new Date() } });
}

/** Blog-only parts of the guide (hooks, SEO, CTAs, client extensions) that don't apply to a report. */
const BLOG_ONLY = /intro|hook|seo|cta|closing|how to add/i;

/**
 * The guide's "## ..." sections that apply to a report: writing, formatting,
 * AI-detection and editorial rules. A guide without such headings is used whole.
 */
export function reportRules(guide: string): string {
  const parts = guide.split(/^(?=## )/m);
  const kept = parts.filter((p) => p.startsWith("## ") && !BLOG_ONLY.test(p.split("\n")[0]));
  return (kept.length ? kept.join("\n") : guide).trim();
}

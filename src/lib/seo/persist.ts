import { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";

export type ApprovablePhase =
  | "S1"
  | "S2"
  | "S3"
  | "S4"
  | "S5"
  | "S6"
  | "S7"
  | "S8"
  | "S9";

// Stamp the *_approved_at column for the given phase. Used by §E API routes,
// which approve a phase *outside* the runner transaction. The S6 runner itself
// inlines this update inside its own transaction, so it does NOT use this helper.
export async function stampPhaseApproval(
  projectId: string,
  phase: ApprovablePhase
): Promise<void> {
  const now = new Date();
  const setMap: Record<ApprovablePhase, Partial<typeof seoProjects.$inferInsert>> = {
    S1: { s1ApprovedAt: now, updatedAt: now },
    S2: { s2ApprovedAt: now, updatedAt: now },
    S3: { s3ApprovedAt: now, updatedAt: now },
    S4: { s4ApprovedAt: now, updatedAt: now },
    S5: { s5ApprovedAt: now, updatedAt: now },
    S6: { s6ApprovedAt: now, updatedAt: now },
    S7: { s7ApprovedAt: now, updatedAt: now },
    S8: { s8ApprovedAt: now, updatedAt: now },
    S9: { s9ApprovedAt: now, updatedAt: now },
  };
  await db.update(seoProjects).set(setMap[phase]).where(eq(seoProjects.id, projectId));
}

// Generic version-bump helper for tables keyed by (asin_id, version). Useful for
// seo_listings / seo_aplus_plans / seo_qa / seo_images / seo_passage_map. S6 inlines
// its own lookup today; future executors and §E approval routes will use this helper
// when they need a fresh version number outside a transaction.
export async function getNextVersionForAsin(
  table: AnyPgTable,
  asinId: string
): Promise<number> {
  const result = await db.execute<{ max: number | null }>(
    sql`SELECT COALESCE(MAX(version), 0)::int AS max FROM ${table} WHERE asin_id = ${asinId}`
  );
  const rows =
    (result as unknown as { rows: Array<{ max: number | null }> }).rows ??
    (result as unknown as Array<{ max: number | null }>);
  const maxRow = Array.isArray(rows) ? rows[0] : undefined;
  return (maxRow?.max ?? 0) + 1;
}

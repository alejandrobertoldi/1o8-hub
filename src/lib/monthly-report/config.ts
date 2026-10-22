/* eslint-disable react-doctor/js-set-map-lookups */
import { db } from "@/lib/db";
import { reportSectionConfig } from "@/lib/db/schema";
import { and, eq, or } from "drizzle-orm";
import type { ReportConfig, SectionKey } from "./types";

export const ALL_SECTION_KEYS: readonly SectionKey[] = [
  "kpis",
  "mom",
  "highlights",
  "products",
  "goals",
  "risks",
  "appendix",
] as const;

/**
 * Resolve per-section enabled flags for a given client. Precedence:
 *   per-client row > global row > default (enabled = true).
 *
 * One query fetches both scopes in a single round-trip.
 */
export async function resolveConfig(clientIdCode: string): Promise<ReportConfig> {
  const rows = await db
    .select()
    .from(reportSectionConfig)
    .where(
      or(
        and(eq(reportSectionConfig.scope, "global"), eq(reportSectionConfig.scopeKey, "default")),
        and(eq(reportSectionConfig.scope, "client"), eq(reportSectionConfig.scopeKey, clientIdCode)),
      ),
    );

  const globalMap: Partial<Record<SectionKey, boolean>> = {};
  const clientMap: Partial<Record<SectionKey, boolean>> = {};
  for (const r of rows as Array<{ scope: string; scopeKey: string; sectionKey: string; enabled: boolean }>) {
    const key = r.sectionKey as SectionKey;
    if (!ALL_SECTION_KEYS.includes(key)) continue;
    if (r.scope === "client" && r.scopeKey === clientIdCode) clientMap[key] = r.enabled;
    else if (r.scope === "global" && r.scopeKey === "default") globalMap[key] = r.enabled;
  }

  const enabled = {} as Record<SectionKey, boolean>;
  for (const key of ALL_SECTION_KEYS) {
    enabled[key] = clientMap[key] ?? globalMap[key] ?? true;
  }
  return { enabled };
}

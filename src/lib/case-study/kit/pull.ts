import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { pullRedshiftMetrics } from "./pull-redshift";
import { pullFulfilment } from "./pull-fulfilment";
import { resolveDesignImages } from "./design-images";
import { emptyMetrics, type CaseStudyMetrics, type PulledMetrics } from "./metrics";
import { EMPTY_DESIGN_IMAGES, type DesignImages } from "./slides";

function parseRaw(raw: unknown): Record<string, string> {
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
  return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
}
export async function resolveAccountId(clientIdCode: string): Promise<string | null> {
  const rows = (await db.execute(sql`SELECT raw_data FROM aac WHERE client_id_code = ${clientIdCode} LIMIT 1`)) as unknown as { raw_data: unknown }[];
  const id = parseRaw(rows[0]?.raw_data).IntentwiseID;
  return id && String(id).trim() ? String(id).trim() : null;
}
export async function resolveClientLogoUrl(clientIdCode: string): Promise<string> {
  const rows = (await db.execute(sql`SELECT client_logo_url AS url FROM aac WHERE client_id_code = ${clientIdCode} LIMIT 1`)) as unknown as { url: string | null }[];
  return rows[0]?.url ?? "";
}

export interface FullPull { metrics: CaseStudyMetrics; design: DesignImages; noAccount: boolean }

export async function pullEverything(clientIdCode: string, start: string, end: string, prev?: CaseStudyMetrics): Promise<FullPull> {
  const accountId = await resolveAccountId(clientIdCode);
  const [rs, fulfilment] = await Promise.all([
    accountId ? pullRedshiftMetrics(accountId, start, end) : Promise.resolve({ metrics: {} as Partial<PulledMetrics>, failed: [] as string[] }),
    pullFulfilment(clientIdCode).catch(() => undefined),
  ]);
  const metrics = emptyMetrics(start, end);
  metrics.auto = { ...rs.metrics, ...(fulfilment ? { fulfilment } : {}) };
  metrics.overrides = prev?.overrides ?? {};
  metrics.failed = rs.failed;
  metrics.pulledAt = new Date().toISOString();
  const heroAsin = rs.metrics.topByRevenue?.[0]?.asin ?? null;
  // A Design lookup failure must not block creating the deck: fall back to empty slots and flag it.
  const design = await resolveDesignImages(clientIdCode, heroAsin).catch(() => {
    metrics.failed = [...metrics.failed, "design"];
    return EMPTY_DESIGN_IMAGES;
  });
  return { metrics, design, noAccount: !accountId };
}

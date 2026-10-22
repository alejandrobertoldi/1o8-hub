import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/** The ONLY non-Redshift metric (ruled 2026-09-28): master.fulfillment->>'FulfillmentChannelCodeUS'. */
export function fulfilmentLabel(codes: string[]): string | undefined {
  const clean = codes.map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (!clean.length) return undefined;
  const fba = clean.some((c) => c.startsWith("AMAZON"));
  const fbm = clean.some((c) => !c.startsWith("AMAZON"));
  return fba && fbm ? "FBA + FBM" : fba ? "FBA" : "FBM";
}

export async function pullFulfilment(clientIdCode: string): Promise<string | undefined> {
  const rows = (await db.execute(sql`
    SELECT DISTINCT fulfillment->>'FulfillmentChannelCodeUS' AS code
    FROM master
    WHERE client_id_code = ${clientIdCode} AND fulfillment ? 'FulfillmentChannelCodeUS'`)) as unknown as { code: string | null }[];
  return fulfilmentLabel(rows.map((r) => r.code ?? ""));
}

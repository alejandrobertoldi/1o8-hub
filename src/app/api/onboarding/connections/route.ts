import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { clientServices } from "@/lib/clients/sow";
import { clientsWithGoogleAdsSpend, loadClientChecklists } from "@/lib/onboarding/checklist-server";
import { canUseConnectionsTool } from "@/lib/onboarding/connections-tool";
import { clientsWithKlaviyo } from "@/lib/kpi/secrets";

const FIELDS = ["GA4Property", "MetaAdAccount", "GoogleAdsCustomerId", "ShopifyStore", "SOWURL"] as const;

/** GET /api/onboarding/connections — TEMPORARY bulk table data (see connections-tool.ts). */
export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseConnectionsTool(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [clients, checklists, klaviyo, googleAds] = await Promise.all([
    db.select({ code: aac.clientIdCode, name: aac.clientName, status: aac.clientStatus, raw: aac.rawData }).from(aac),
    loadClientChecklists(),
    clientsWithKlaviyo(),
    clientsWithGoogleAdsSpend(),
  ]);
  const rows = clients
    .filter((c) => (c.status ?? "").toLowerCase() === "active" && checklists.has(c.code))
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((c) => {
      const raw = (c.raw ?? {}) as Record<string, string>;
      const conn = checklists.get(c.code)!.sections.find((s) => s.key === "connections");
      return {
        code: c.code,
        name: c.name ?? c.code,
        services: clientServices(raw),
        fields: Object.fromEntries(FIELDS.map((f) => [f, String(raw[f] ?? "").trim()])),
        klaviyo: klaviyo.has(c.code.toUpperCase()),
        googleAdsSpend: googleAds.get(c.code.toUpperCase()) ?? null,
        // Which connection items apply (by service) and their state.
        items: Object.fromEntries((conn?.items ?? []).map((i) => [i.key, i.state])),
        done: conn?.done ?? 0,
        total: conn?.total ?? 0,
      };
    });
  return NextResponse.json(rows);
}

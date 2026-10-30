export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { googleServiceAccount } from "@/lib/google-service-account";
import { gaConnection, gaOAuthConfigured } from "@/lib/kpi/ga4";
import { lastKpiRuns, syncKpis } from "@/lib/kpi/sync";
import { clientsWithKlaviyo, metaProvider, secretInfo } from "@/lib/kpi/secrets";
import { shopifyConfigured } from "@/lib/kpi/shopify";
import { db } from "@/lib/db";
import { integrationTokens } from "@/lib/db/schema";
import { like } from "drizzle-orm";

async function admin() {
  const s = await getAuthSession();
  return s && hasAdminPowers(s.user.role) ? s : null;
}

/** GET — KPI data sources and recent syncs. */
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Only admins can see the KPI sync" }, { status: 403 });
  const [ga, meta, klaviyo] = await Promise.all([gaConnection(), secretInfo(metaProvider), clientsWithKlaviyo()]);
  return NextResponse.json({
    ga4: { oauthConfigured: gaOAuthConfigured(), connected: !!ga, email: ga?.email ?? null, serviceAccount: googleServiceAccount()?.client_email ?? null },
    meta: { connected: !!meta, adAccounts: (meta?.meta.adAccounts as number | undefined) ?? null, updatedAt: meta?.updatedAt ?? null },
    klaviyo: { clients: [...klaviyo].sort() },
    shopify: {
      configured: shopifyConfigured(),
      stores: (await db.select({ p: integrationTokens.provider }).from(integrationTokens).where(like(integrationTokens.provider, "shopify:%"))).map((r) => r.p.slice("shopify:".length)).sort(),
    },
    runs: await lastKpiRuns(10),
  });
}

/** POST { client? } — pull KPI data now (all clients, or one). */
export async function POST(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Only admins can run the KPI sync" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { client?: string };
  try {
    return NextResponse.json(await syncKpis("manual", body.client || undefined));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

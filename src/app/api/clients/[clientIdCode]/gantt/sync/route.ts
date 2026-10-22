import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { pullSyncFromAsana, registerAsanaWebhook, getAsanaProjectGid } from "@/lib/asana-sync";

type RouteCtx = { params: Promise<{ clientIdCode: string }> };

/**
 * POST — Full bidirectional sync: pull all Asana tasks → update Gantt rows
 */
export async function POST(req: NextRequest, { params }: RouteCtx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;
  const body = await req.json().catch(() => ({}));

  // Optional: register webhook on first sync
  if (body.registerWebhook) {
    const projectGid = await getAsanaProjectGid(clientIdCode);
    if (projectGid) {
      const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL;
      if (baseUrl) {
        const targetUrl = `${baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`}/api/webhooks/asana`;
        const webhookResult = await registerAsanaWebhook(projectGid, targetUrl);
        if ("error" in webhookResult) {
          console.error("[AsanaSync] Webhook registration failed:", webhookResult.error);
        }
      }
    }
  }

  const result = await pullSyncFromAsana(clientIdCode);

  return NextResponse.json({
    ok: true,
    synced: result.synced,
    created: result.created,
    errors: result.errors,
  });
}

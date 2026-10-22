import { z } from "zod";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { requireSeoReconnect, requireHeliumAdmin, integrationError } from "@/lib/helium10/access";
import { withSharedConnection } from "@/lib/helium10/store";
import { helium10ApiKey, helium10Connected } from "@/lib/helium10/session";
import { boundedFetch, SERVER_URL } from "@/lib/helium10/client";

export const maxDuration = 60;
export async function GET() {
  try {
    const access = await requireSeoReconnect();
    if (access.error) return access.error;
    return NextResponse.json({ connected: await helium10Connected(), viaApiKey: !!helium10ApiKey() }, { headers: { "Cache-Control": "no-store" } });
  } catch { return integrationError(); }
}
export async function POST(req: NextRequest) {
  try {
    const access = await requireSeoReconnect(req);
    if (access.error) return access.error;
    const body = await req.text();
    const parsed = z.object({ projectId: z.string().uuid().optional() }).safeParse(body ? JSON.parse(body) : {});
    if (!parsed.success) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
    const authorizationUrl = await withSharedConnection(async provider => {
      delete provider.data.tokens;
      delete provider.data.client; // Register the current environment callback on reauthorization.
      provider.data.pending = { state: randomBytes(32).toString("base64url"), expiresAt: Date.now() + 10 * 60_000, projectId: parsed.data.projectId ?? "manager", authorizedBy: access.userId! };
      const result = await auth(provider, { serverUrl: SERVER_URL, scope: "mcp:tools", fetchFn: boundedFetch });
      if (result !== "REDIRECT" || !provider.authorizationUrl) throw new Error("Authorization URL unavailable");
      return provider.authorizationUrl;
    });
    return NextResponse.json({ authorizationUrl });
  } catch { return integrationError(); }
}
export async function DELETE(req: NextRequest) {
  try {
    const access = await requireHeliumAdmin(req);
    if (access.error) return access.error;
    await withSharedConnection(async provider => { provider.data = {}; });
    return NextResponse.json({ connected: false });
  } catch { return integrationError(); }
}

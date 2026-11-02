import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getAuthSession } from "@/lib/auth-db";
import { hasPortalAudit } from "@/lib/portal-audits";
import { resolvePortalClient } from "@/lib/api-utils";

// Serves a client's static audit HTML behind portal auth. Loaded into an
// iframe by /portal/reports/business-model-audit.
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = resolvePortalClient(session, req.nextUrl.searchParams);
  if (resolved.response) return resolved.response;
  const clientCode = resolved.clientIdCode;

  if (!clientCode || !hasPortalAudit(clientCode)) {
    return NextResponse.json({ error: "No audit for this client" }, { status: 404 });
  }

  // clientCode is whitelisted by hasPortalAudit, so it can't traverse paths.
  const file = path.join(process.cwd(), "src/content/portal-audits", `${clientCode}.html`);
  const html = await readFile(file, "utf8");

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";
import { parseClientIdCodes } from "@/lib/client-codes";
import { CLIENT_NAMES } from "@/lib/constants";
import {
  DEMO_CLIENT_DISPLAY,
} from "@/lib/demo-client-alias";

export type PortalAssignedClient = {
  clientIdCode: string;
  clientName: string;
  allowedSections: string[];
};

/**
 * GET /api/portal/me/clients
 * The caller's assigned AAC rows (or one preview client for hub admins).
 */
export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const isAdmin = hasAdminPowers(session.user.role);
  const previewClient = isAdmin ? url.searchParams.get("client") : null;
  const codes = previewClient
    ? [previewClient]
    : parseClientIdCodes(session.user.clientIdCode);

  if (codes.length === 0) {
    return NextResponse.json({ clients: [] as PortalAssignedClient[] });
  }

  const rows = await db
    .select({
      clientIdCode: aac.clientIdCode,
      clientName: aac.clientName,
      allowedSections: aac.allowedSections,
    })
    .from(aac)
    .where(inArray(aac.clientIdCode, codes));

  const byCode = new Map(rows.map((r) => [r.clientIdCode, r]));
  const clients: PortalAssignedClient[] = codes.map((code) => {
    const row = byCode.get(code);
    const display = DEMO_CLIENT_DISPLAY[code];
    return {
      clientIdCode: code,
      clientName: display?.clientName ?? row?.clientName ?? CLIENT_NAMES[code] ?? code,
      allowedSections: row?.allowedSections ?? [],
    };
  });

  return NextResponse.json({ clients });
}

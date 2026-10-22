import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolvePortalClient } from "@/lib/api-utils";
import {
  DEMO_CLIENT_DISPLAY,
  isDemoAliasedClient,
  resolveDemoDataSource,
} from "@/lib/demo-client-alias";

function parseRawData(raw: unknown): Record<string, string> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object") return raw as Record<string, string>;
  return {};
}

function intentwiseFromRaw(raw: Record<string, string>): string {
  return (
    raw.IntentwiseID ||
    raw["Intentwise ID"] ||
    raw.intentwiseID ||
    ""
  ).trim();
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = resolvePortalClient(session, req.nextUrl.searchParams);
  if (resolved.response) return resolved.response;
  const clientCode = resolved.clientIdCode;

  const [row] = await db
    .select({
      clientIdCode: aac.clientIdCode,
      clientName: aac.clientName,
      clientStatus: aac.clientStatus,
      rawData: aac.rawData,
    })
    .from(aac)
    .where(eq(aac.clientIdCode, clientCode))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  let rawData = parseRawData(row.rawData);

  // Demo aliases (Zingora ← Pura): inject donor IntentwiseID so portal
  // reports / controls resolve an accountId without seeding AAC.
  if (isDemoAliasedClient(clientCode)) {
    const donorCode = resolveDemoDataSource(clientCode);
    if (donorCode !== clientCode) {
      const [donor] = await db
        .select({ rawData: aac.rawData })
        .from(aac)
        .where(eq(aac.clientIdCode, donorCode))
        .limit(1);
      const donorIw = donor ? intentwiseFromRaw(parseRawData(donor.rawData)) : "";
      if (donorIw) {
        rawData = {
          ...rawData,
          IntentwiseID: donorIw,
          "Intentwise ID": donorIw,
        };
      }
    }
  }

  const display = DEMO_CLIENT_DISPLAY[clientCode];

  return NextResponse.json({
    clientIdCode: row.clientIdCode,
    clientName: display?.clientName ?? row.clientName,
    clientStatus: row.clientStatus,
    rawData,
  });
}

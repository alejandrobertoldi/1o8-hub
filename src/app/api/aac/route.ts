import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

/**
 * Compact AAC client list — used by the category-first attributes UI.
 * Mirrors the shape consumed by CategoryAttributesV2: { clients: [{ clientIdCode, clientName }] }.
 * The richer `/api/clients/aac` endpoint returns 100+ columns and is used by the AAC editor.
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      clientIdCode: aac.clientIdCode,
      clientName: aac.clientName,
    })
    .from(aac)
    .orderBy(asc(aac.clientName), asc(aac.clientIdCode));

  return NextResponse.json({
    clients: rows.map((r) => ({
      clientIdCode: r.clientIdCode,
      clientName: r.clientName ?? null,
    })),
  });
}

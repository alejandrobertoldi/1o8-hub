import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { asc, ilike } from "drizzle-orm";

// Lightweight client list — optional ?status=Active filter
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");

  const query = db
    .select({
      clientIdCode: aac.clientIdCode,
      clientName: aac.clientName,
    })
    .from(aac);

  const rows = status
    ? await query.where(ilike(aac.clientStatus, status)).orderBy(asc(aac.clientName))
    : await query.orderBy(asc(aac.clientName));

  return NextResponse.json(
    rows.map((r) => ({
      clientIdCode: r.clientIdCode,
      clientName: r.clientName || r.clientIdCode,
    }))
  );
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { variations } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// GET /api/variations/next-code?clientId=C23_SC_US
// Returns the next sequential code for this client, e.g. C23_SC_US_02
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId)
    return NextResponse.json(
      { error: "clientId is required" },
      { status: 400 }
    );

  // Find all existing codes for this client prefix, extract max number
  const prefix = `${clientId}_`;
  const rows = await db
    .select({ code: variations.code })
    .from(variations)
    .where(sql`${variations.code} LIKE ${prefix + '%'}`);

  let maxNum = 0;
  for (const row of rows) {
    const suffix = row.code.slice(prefix.length);
    const num = parseInt(suffix, 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }

  const next = maxNum + 1;
  const code = `${clientId}_${String(next).padStart(2, "0")}`;


  return NextResponse.json({ code, next });
}

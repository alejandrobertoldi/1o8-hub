import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { syncAllTables } from "@/lib/sync-tables";
import { unauthorized, getErrorMessage } from "@/lib/api-utils";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const tables = body.tables as string[] | undefined;

  try {
    const result = await syncAllTables(
      session.user.email || "admin",
      tables
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: `Sync failed: ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}

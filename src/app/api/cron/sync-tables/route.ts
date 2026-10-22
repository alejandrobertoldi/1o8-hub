import { NextRequest, NextResponse } from "next/server";
import { syncAllTables } from "@/lib/sync-tables";
import { getErrorMessage } from "@/lib/api-utils";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncAllTables("system/cron");
    console.log(
      `[Sync Cron] Complete in ${result.totalDurationMs}ms:`,
      result.tables.map((t) => `${t.table}(${t.inserted}i/${t.updated}u)`).join(", ")
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = getErrorMessage(error);
    console.error("[Sync Cron] Failed:", msg);
    return NextResponse.json({ error: `Sync failed: ${msg}` }, { status: 500 });
  }
}

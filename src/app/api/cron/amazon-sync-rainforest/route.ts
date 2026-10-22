/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { master, amazonSyncRuns } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RAINFOREST_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Rainforest API key not configured" },
      { status: 500 }
    );
  }

  // Get all clients with products that have ASINs
  const clientRows = await db
    .select({
      clientIdCode: master.clientIdCode,
      count: sql<number>`count(*)`,
    })
    .from(master)
    .where(sql`${master.asin} IS NOT NULL AND ${master.asin} != '' AND lower(${master.parentageLevel}) != 'parent'`)
    .groupBy(master.clientIdCode);

  const clients = clientRows.filter((c) => c.clientIdCode);

  const summary: Array<{
    client: string;
    total: number;
    completed: number;
    failed: number;
    credits: number;
  }> = [];

  for (const client of clients) {
    const clientIdCode = client.clientIdCode!;

    const clientProducts = await db
      .select({ id: master.id })
      .from(master)
      .where(
        sql`${master.clientIdCode} = ${clientIdCode} AND ${master.asin} IS NOT NULL AND ${master.asin} != '' AND lower(${master.parentageLevel}) != 'parent'`
      );

    const [run] = await db
      .insert(amazonSyncRuns)
      .values({
        clientIdCode,
        runType: "scheduled",
        status: "running",
        totalProducts: clientProducts.length,
        startedAt: new Date(),
      })
      .returning();

    try {
      const baseUrl = req.nextUrl.origin;
      const runRes = await fetch(`${baseUrl}/api/amazon-sync/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_ids: clientProducts.map((p) => p.id),
          client_id: clientIdCode,
          run_id: run.id,
        }),
      });

      const data = runRes.ok ? await runRes.json() : null;
      const completed =
        data?.results?.filter(
          (r: { status: string }) => r.status === "success"
        ).length ?? 0;
      const failed =
        data?.results?.filter(
          (r: { status: string }) => r.status === "failed"
        ).length ?? 0;

      await db
        .update(amazonSyncRuns)
        .set({
          status: "completed",
          completedProducts: completed,
          failedProducts: failed,
          creditsUsed: data?.credits_used ?? 0,
          completedAt: new Date(),
        })
        .where(sql`${amazonSyncRuns.id} = ${run.id}`);

      summary.push({
        client: clientIdCode,
        total: clientProducts.length,
        completed,
        failed,
        credits: data?.credits_used ?? 0,
      });
    } catch (error) {
      await db
        .update(amazonSyncRuns)
        .set({
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
          completedAt: new Date(),
        })
        .where(sql`${amazonSyncRuns.id} = ${run.id}`);

      summary.push({
        client: clientIdCode,
        total: clientProducts.length,
        completed: 0,
        failed: clientProducts.length,
        credits: 0,
      });
    }
  }

  console.log("[Rainforest Sync Cron] Summary:", JSON.stringify(summary));
  return NextResponse.json({ success: true, summary });
}

/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { master, amazonSyncRuns } from "@/lib/db/schema";
import { eq, and, isNotNull, ne, sql } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { client_id: clientIdCode, amazon_domain = "amazon.com" } = body as {
    client_id: string;
    amazon_domain?: string;
  };

  if (!clientIdCode) {
    return NextResponse.json(
      { error: "client_id is required" },
      { status: 400 }
    );
  }

  // Get all non-parent products with ASINs for this client
  const clientProducts = await db
    .select({ id: master.id, asin: master.asin })
    .from(master)
    .where(
      and(
        eq(master.clientIdCode, clientIdCode),
        eq(master.status, "Active"),
        isNotNull(master.asin),
        ne(master.asin, ""),
        sql`lower(${master.parentageLevel}) != 'parent'`
      )
    );

  if (clientProducts.length === 0) {
    return NextResponse.json(
      { error: "No products with ASINs found for this client" },
      { status: 404 }
    );
  }

  // Create run record
  const [run] = await db
    .insert(amazonSyncRuns)
    .values({
      clientIdCode,
      runType: "manual",
      status: "running",
      totalProducts: clientProducts.length,
      startedAt: new Date(),
    })
    .returning();

  // Process in batches of 5
  const batchSize = 5;
  const productIds = clientProducts.map((p) => p.id);
  let totalCredits = 0;
  let totalCompleted = 0;
  let totalFailed = 0;

  try {
    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);

      const baseUrl = req.nextUrl.origin;
      const fetchRes = await fetch(`${baseUrl}/api/amazon-sync/fetch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: req.headers.get("cookie") || "",
        },
        body: JSON.stringify({
          product_ids: batch,
          client_id: clientIdCode,
          amazon_domain,
          run_id: run.id,
        }),
      });

      if (fetchRes.ok) {
        const data = await fetchRes.json();
        totalCredits += data.credits_used || 0;
        totalCompleted += data.results?.filter(
          (r: { status: string }) => r.status === "success"
        ).length ?? 0;
        totalFailed += data.results?.filter(
          (r: { status: string }) => r.status === "failed"
        ).length ?? 0;
      } else {
        totalFailed += batch.length;
      }
    }

    // Mark run complete
    await db
      .update(amazonSyncRuns)
      .set({
        status: "completed",
        completedProducts: totalCompleted,
        failedProducts: totalFailed,
        creditsUsed: totalCredits,
        completedAt: new Date(),
      })
      .where(eq(amazonSyncRuns.id, run.id));

    return NextResponse.json({
      success: true,
      run_id: run.id,
      total_products: clientProducts.length,
      completed: totalCompleted,
      failed: totalFailed,
      credits_used: totalCredits,
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
      .where(eq(amazonSyncRuns.id, run.id));

    return NextResponse.json(
      { error: "Sync run failed" },
      { status: 500 }
    );
  }
}

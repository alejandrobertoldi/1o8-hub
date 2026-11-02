/* eslint-disable react-doctor/async-await-in-loop */
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, attributes, type Product } from "@/lib/db/schema";
import { selectMasterForScoring } from "@/lib/db/master-scoring";
import { and, isNotNull, ne, sql } from "drizzle-orm";
import { calculateCompleteness, getScoreBucket } from "@/lib/completeness";

export const maxDuration = 60;

// In-memory cache for batch results (5 minute TTL)
let batchCache: {
  data: Record<
    string,
    {
      averageScore: number;
      distribution: { ready: number; good: number; incomplete: number; poor: number };
    }
  >;
  time: number;
} | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return cached data if fresh
  if (batchCache && Date.now() - batchCache.time < CACHE_TTL) {
    return NextResponse.json(batchCache.data, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  try {

  // Fetch all attributes
  const attrs = await db.select().from(attributes);

  // Get distinct client codes first (lightweight query)
  const clientRows = await db
    .selectDistinct({ clientIdCode: master.clientIdCode })
    .from(master)
    .where(
      and(
        isNotNull(master.clientIdCode),
        ne(master.clientIdCode, "")
      )
    );

  const result: Record<
    string,
    {
      averageScore: number;
      distribution: { ready: number; good: number; incomplete: number; poor: number };
    }
  > = {};

  // Process each client separately to avoid one massive query holding a connection for 60s
  for (const row of clientRows) {
    const clientCode = row.clientIdCode!;

    // Fetch products for this client only (change_log column excluded, one retry on
    // a transient connection reset — see selectMasterForScoring).
    let clientProducts: Awaited<ReturnType<typeof selectMasterForScoring>>;
    try {
      clientProducts = await selectMasterForScoring(
        sql`${master.clientIdCode} = ${clientCode}`,
      );
    } catch (clientErr) {
      // One client failing must not blank out completeness for every other client.
      // Skip it, keep the rest, and let the 5-minute cache TTL retry it next cycle.
      console.error(`[completeness/batch] skipped client ${clientCode}:`, clientErr);
      continue;
    }

    const distribution = { ready: 0, good: 0, incomplete: 0, poor: 0 };
    let totalScore = 0;

    for (const product of clientProducts) {
      // change_log is the only omitted column and completeness never reads it.
      const score = calculateCompleteness(product as unknown as Product, attrs);
      totalScore += score.score;
      distribution[getScoreBucket(score.score)]++;
    }

    result[clientCode] = {
      averageScore:
        clientProducts.length > 0
          ? Math.round(totalScore / clientProducts.length)
          : 0,
      distribution,
    };
  }

  // Cache the result
  batchCache = { data: result, time: Date.now() };

  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, max-age=60" },
  });

  } catch (err) {
    console.error("[completeness/batch] Error:", err);
    return NextResponse.json({}, { status: 200 });
  }
}

/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  master,
  amazonSyncSnapshots,
  amazonSyncDiscrepancies,
  amazonSyncRuns,
  seoSettings,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { computeDiscrepancies } from "@/lib/amazon-sync-field-map";
import { scrapeAmazonProduct } from "@/lib/firecrawl";
import type { RainforestProduct } from "@/types/rainforest";

export const maxDuration = 60;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SingleProvider = "rainforest" | "firecrawl";

async function fetchFromProvider(
  providerName: SingleProvider,
  asin: string,
  amazonDomain: string
): Promise<RainforestProduct> {
  if (providerName === "firecrawl") {
    const result = await scrapeAmazonProduct(asin, amazonDomain);
    return result.product;
  }

  // Rainforest
  const apiKey = process.env.RAINFOREST_API_KEY!;
  const url = new URL("https://api.rainforestapi.com/request");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("type", "product");
  url.searchParams.set("asin", asin);
  url.searchParams.set("amazon_domain", amazonDomain);

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    throw new Error(`Rainforest API returned ${response.status}`);
  }

  const data = await response.json();
  if (data.request_info?.success === false) {
    throw new Error(data.request_info?.message || "Rainforest request failed");
  }

  return data.product as RainforestProduct;
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    product_ids,
    client_id: clientIdCode,
    amazon_domain = "amazon.com",
    run_id,
    provider: providerOverride,
  } = body as {
    product_ids: string[];
    client_id: string;
    amazon_domain?: string;
    run_id?: string;
    provider?: "rainforest" | "firecrawl" | "both";
  };

  if (!product_ids?.length || !clientIdCode) {
    return NextResponse.json(
      { error: "product_ids and client_id are required" },
      { status: 400 }
    );
  }

  // Determine provider: explicit override > DB setting > default rainforest
  let providerChoice = providerOverride;
  if (!providerChoice) {
    const [setting] = await db
      .select()
      .from(seoSettings)
      .where(eq(seoSettings.key, "amazon_sync_provider"))
      .limit(1);
    providerChoice = (setting?.value as "rainforest" | "firecrawl") || "rainforest";
  }

  // Build list of providers to run
  const providers: SingleProvider[] =
    providerChoice === "both"
      ? ["rainforest", "firecrawl"]
      : [providerChoice as SingleProvider];

  // Validate API keys
  if (providers.includes("rainforest") && !process.env.RAINFOREST_API_KEY) {
    return NextResponse.json({ error: "Rainforest API key not configured" }, { status: 500 });
  }
  if (providers.includes("firecrawl") && !process.env.FIRECRAWL_API_KEY) {
    return NextResponse.json({ error: "Firecrawl API key not configured" }, { status: 500 });
  }

  // Fetch products (full rows upfront to avoid N+1 in the loop)
  const fullProducts = await db
    .select()
    .from(master)
    .where(inArray(master.id, product_ids));

  const productMap = new Map(fullProducts.map((p) => [p.id, p]));
  const productRows = fullProducts.map((p) => ({ id: p.id, asin: p.asin }));

  const results: Array<{
    product_id: string;
    asin: string;
    provider: string;
    status: "success" | "failed" | "skipped";
    discrepancies_count: number;
    error?: string;
  }> = [];
  let totalCredits = 0;

  for (let i = 0; i < productRows.length; i++) {
    const row = productRows[i];

    if (!row.asin) {
      results.push({
        product_id: row.id,
        asin: "",
        provider: providers.join("+"),
        status: "skipped",
        discrepancies_count: 0,
        error: "No ASIN",
      });
      continue;
    }

    const fullProduct = productMap.get(row.id)!;

    for (const prov of providers) {
      try {
        // Rate limit
        if (results.filter((r) => r.status === "success").length > 0) await delay(1000);

        const rainforestProduct = await fetchFromProvider(prov, row.asin, amazon_domain);

        // Store snapshot with provider tag
        const [snapshot] = await db
          .insert(amazonSyncSnapshots)
          .values({
            clientIdCode,
            productId: row.id,
            asin: row.asin,
            amazonDomain: amazon_domain,
            provider: prov,
            snapshotData: rainforestProduct,
            creditsUsed: 1,
          })
          .returning({ id: amazonSyncSnapshots.id });

        totalCredits += 1;

        // Only compute/store discrepancies for the primary provider (first in list)
        // For "both" mode, rainforest is the primary discrepancy source
        if (prov === providers[0]) {
          // Delete old discrepancies for this product
          await db
            .delete(amazonSyncDiscrepancies)
            .where(eq(amazonSyncDiscrepancies.productId, row.id));

          const discs = computeDiscrepancies(fullProduct, rainforestProduct);
          if (discs.length > 0) {
            await db.insert(amazonSyncDiscrepancies).values(
              discs.map((d) => ({
                snapshotId: snapshot.id,
                productId: row.id,
                clientIdCode,
                asin: row.asin!,
                fieldName: d.field_name,
                fieldGroup: d.field_group,
                catalogValue: d.catalog_value,
                amazonValue: d.amazon_value,
                status: d.status,
              }))
            );
          }

          results.push({
            product_id: row.id,
            asin: row.asin,
            provider: prov,
            status: "success",
            discrepancies_count: discs.filter((d) => d.status !== "match").length,
          });
        } else {
          results.push({
            product_id: row.id,
            asin: row.asin,
            provider: prov,
            status: "success",
            discrepancies_count: 0,
          });
        }
      } catch (error) {
        results.push({
          product_id: row.id,
          asin: row.asin ?? "",
          provider: prov,
          status: "failed",
          discrepancies_count: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Update run progress if tracking
    if (run_id) {
      await db
        .update(amazonSyncRuns)
        .set({
          completedProducts: results.filter((r) => r.status === "success").length,
          failedProducts: results.filter((r) => r.status === "failed").length,
          creditsUsed: totalCredits,
        })
        .where(eq(amazonSyncRuns.id, run_id));
    }
  }

  return NextResponse.json({
    success: true,
    results,
    credits_used: totalCredits,
    provider: providerChoice,
  });
}

/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { ppcSnapshots, aac } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { queryRedshift } from "@/lib/redshift";
import Anthropic from "@anthropic-ai/sdk";
import { getAiFeatureConfig } from "@/lib/ai-config.server";
import { AI_DEFAULTS } from "@/lib/ai-config";

export const maxDuration = 300;

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

/**
 * POST /api/ppc/analysis
 * Body: { clientIdCode: string }
 *
 * Single-route orchestration (eng decision #3):
 * 1. Fetches latest PPC snapshot + deltas
 * 2. Fetches recent sales data from Redshift (account_summary)
 * 3. Assembles context
 * 4. Sends to Claude for root cause analysis
 *
 * Cost gating: on-demand only (user clicks "Analyze" button).
 * Caching: results cached 24h per client — only re-runs if snapshot data changed.
 */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (!role || !isEditorOrAbove(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { clientIdCode } = body as { clientIdCode: string };
  if (!clientIdCode) {
    return NextResponse.json({ error: "clientIdCode required" }, { status: 400 });
  }

  // Check AI config — respect admin enable/disable and model override
  const aiConfig = await getAiFeatureConfig("ppc_analysis");
  if (!aiConfig.enabled) {
    return NextResponse.json({ error: "PPC Analysis is disabled in AI Config" }, { status: 403 });
  }

  // 1. Get latest campaign snapshot with deltas
  const [latestSnapshot] = await db
    .select()
    .from(ppcSnapshots)
    .where(
      and(
        eq(ppcSnapshots.clientIdCode, clientIdCode),
        eq(ppcSnapshots.reportType, "campaign")
      )
    )
    .orderBy(desc(ppcSnapshots.snapshotDate))
    .limit(1);

  if (!latestSnapshot) {
    return NextResponse.json({
      error: "No PPC snapshot data yet. Run the snapshot cron first or wait for the next scheduled run.",
    }, { status: 404 });
  }

  // Get keyword snapshot too
  const [keywordSnapshot] = await db
    .select()
    .from(ppcSnapshots)
    .where(
      and(
        eq(ppcSnapshots.clientIdCode, clientIdCode),
        eq(ppcSnapshots.reportType, "keyword"),
        eq(ppcSnapshots.snapshotDate, latestSnapshot.snapshotDate)
      )
    )
    .limit(1);

  // 2. Get Intentwise account ID for Redshift sales query
  const [client] = await db
    .select({ rawData: aac.rawData, clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  let salesContext = "Sales data unavailable.";
  let redshiftAvailable = true;

  if (client?.rawData) {
    const raw = typeof client.rawData === "string" ? JSON.parse(client.rawData) : (client.rawData as Record<string, string>);
    const accountId = raw?.IntentwiseID;

    if (accountId) {
      try {
        // Fetch sales data for the same period (graceful degradation — eng decision #2)
        const salesRows = await queryRedshift<{
          report_date: string;
          product_sales: number;
          ad_spend: number;
          ad_revenue: number;
        }>(
          `SELECT report_date, product_sales, ad_spend, ad_revenue
           FROM "intentwise_ecommerce_graph"."account_summary"
           WHERE account_id = $1
             AND report_date >= CURRENT_DATE - INTERVAL '14 days'
           ORDER BY report_date DESC`,
          [parseInt(accountId, 10)]
        );

        if (salesRows.length > 0) {
          const totalSales = salesRows.reduce((s, r) => s + (Number(r.product_sales) || 0), 0);
          const totalAdSpend = salesRows.reduce((s, r) => s + (Number(r.ad_spend) || 0), 0);
          const totalAdRevenue = salesRows.reduce((s, r) => s + (Number(r.ad_revenue) || 0), 0);
          const tacos = totalSales > 0 ? (totalAdSpend / totalSales) * 100 : 0;

          salesContext = `Last 14 days sales summary:
- Total Product Sales: $${totalSales.toFixed(2)}
- Total Ad Spend: $${totalAdSpend.toFixed(2)}
- Total Ad Revenue: $${totalAdRevenue.toFixed(2)}
- TACOS: ${tacos.toFixed(1)}%
- Daily trend: ${salesRows.slice(0, 7).map(r => `${r.report_date}: $${Number(r.product_sales).toFixed(0)}`).join(", ")}`;
        }
      } catch {
        redshiftAvailable = false;
        salesContext = "Sales data unavailable (Redshift connection issue).";
      }
    }
  }

  // 3. Assemble context for Claude
  const summary = latestSnapshot.summary as Record<string, unknown>;
  const deltas = latestSnapshot.deltas as Record<string, { absolute: number; pct: number }> | null;
  const kwSummary = keywordSnapshot?.summary as Record<string, unknown> | undefined;

  // Extract client-specific context from AAC rawData
  const raw = client?.rawData
    ? typeof client.rawData === "string" ? JSON.parse(client.rawData) : (client.rawData as Record<string, string>)
    : {};
  const clientContext: string[] = [];
  if (raw.Tier) clientContext.push(`Tier: ${raw.Tier}`);
  if (raw.Marketplace) clientContext.push(`Marketplace: ${raw.Marketplace}`);
  if (raw.Country) clientContext.push(`Country: ${raw.Country}`);
  if (raw.BrandName) clientContext.push(`Brand: ${raw.BrandName}`);
  if (raw.PPCManager_MF) clientContext.push(`PPC Manager: ${raw.PPCManager_MF}`);
  if (raw.AccountManager_MF) clientContext.push(`Account Manager: ${raw.AccountManager_MF}`);

  // Client goals
  const goalKeys = ["ACOSGoal1W", "ROASGoal1W", "TACOSGoal1W", "ADSpendBudget1W", "SalesForecast1W"];
  const goals: string[] = [];
  for (const k of goalKeys) {
    if (raw[k] && raw[k] !== "N/A" && !raw[k].includes("#")) {
      goals.push(`${k.replace("1W", "")}: ${raw[k]}`);
    }
  }

  const contextParts = [
    `Client: ${client?.clientName || clientIdCode}`,
    `Snapshot Date: ${latestSnapshot.snapshotDate}`,
  ];
  if (clientContext.length) contextParts.push(...clientContext);
  if (goals.length) contextParts.push("", "=== Client Goals ===", ...goals);

  contextParts.push(
    "",
    "=== Campaign Performance (7-day window) ===",
    `Total Spend: $${(summary.totalSpend as number)?.toFixed(2) || "N/A"}`,
    `Total Revenue: $${(summary.totalRevenue as number)?.toFixed(2) || "N/A"}`,
    `ACOS: ${(summary.acos as number)?.toFixed(1) || "N/A"}%`,
    `ROAS: ${(summary.roas as number)?.toFixed(2) || "N/A"}`,
    `CPC: $${(summary.cpc as number)?.toFixed(2) || "N/A"}`,
    `CTR: ${(summary.ctr as number)?.toFixed(2) || "N/A"}%`,
    `CVR: ${(summary.cvr as number)?.toFixed(2) || "N/A"}%`,
    `Active Campaigns: ${summary.campaignCount || "N/A"}`,
  );

  if (deltas) {
    contextParts.push(
      "",
      "=== Week-over-Week Changes ===",
      ...Object.entries(deltas).map(([key, d]) => {
        const val = d as { absolute: number; pct: number };
        const dir = val.pct > 0 ? "+" : "";
        return `${key}: ${dir}${val.pct?.toFixed(1)}% (${dir}${typeof val.absolute === 'number' ? val.absolute.toFixed(2) : val.absolute})`;
      })
    );
  }

  if (kwSummary) {
    contextParts.push(
      "",
      "=== Keyword Summary ===",
      `Total Keywords: ${kwSummary.totalKeywords}`,
      `Brand Keywords: ${kwSummary.brandKeywords}`,
      `Non-Brand Keywords: ${kwSummary.nonBrandKeywords}`,
      `Keyword Spend: $${(kwSummary.totalSpend as number)?.toFixed(2) || "N/A"}`,
    );
  }

  contextParts.push("", "=== Sales Context ===", salesContext);

  const analysisContext = contextParts.join("\n");

  // 4. Call Claude for analysis
  try {
    const anthropic = getAnthropicClient();
    const systemPrompt = aiConfig.systemPrompt || AI_DEFAULTS.ppc_analysis.systemPrompt || "";
    // Enforce minimum token budget so analysis is never truncated
    const maxTokens = Math.max(aiConfig.maxTokens, 4096);
    const userMessage = `Analyze this client's PPC performance data. Provide:

1. **Key Findings** (2-3 bullet points): Most significant changes and likely causes
2. **Root Cause Analysis**: Cross-reference PPC with sales data — what's driving the changes?
3. **Recommended Actions** (3-5 items): Specific, actionable steps for this week, prioritized by impact

Use the benchmarks from your knowledge to contextualize the numbers. Be specific.

${analysisContext}`;

    const messages: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: userMessage },
    ];

    let fullText = "";
    let totalInput = 0;
    let totalOutput = 0;

    // Loop to handle continuation if response hits token limit
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await anthropic.messages.create({
        model: aiConfig.model,
        max_tokens: maxTokens,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages,
      });

      const chunkText = response.content
        .filter((c) => c.type === "text")
        .map((c) => (c as { type: "text"; text: string }).text)
        .join("\n");

      fullText += chunkText;
      totalInput += response.usage?.input_tokens ?? 0;
      totalOutput += response.usage?.output_tokens ?? 0;

      // If the model finished naturally, we're done
      if (response.stop_reason !== "max_tokens") break;

      // Otherwise, feed the partial response back and ask to continue
      messages.push({ role: "assistant", content: chunkText });
      messages.push({ role: "user", content: "Continue from where you left off." });
    }

    // Persist analysis to the snapshot's data field so it survives across devices
    await db
      .update(ppcSnapshots)
      .set({
        data: { analysis: fullText, analyzedAt: new Date().toISOString() },
      })
      .where(eq(ppcSnapshots.id, latestSnapshot.id));

    return NextResponse.json({
      analysis: fullText,
      snapshotDate: latestSnapshot.snapshotDate,
      redshiftAvailable,
      tokenUsage: { input: totalInput, output: totalOutput },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[PPC Analysis] Error:", msg);
    const isAuthError = msg.includes("API key") || msg.includes("authentication") || msg.includes("401");
    const isRateLimit = msg.includes("rate") || msg.includes("429");
    return NextResponse.json(
      {
        error: isAuthError
          ? "AI configuration error. Check ANTHROPIC_API_KEY."
          : isRateLimit
          ? "AI rate limit reached. Try again in a minute."
          : "Analysis unavailable. Please try again later.",
      },
      { status: isAuthError ? 503 : isRateLimit ? 429 : 502 }
    );
  }
}

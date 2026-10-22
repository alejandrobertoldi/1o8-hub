import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  adminEventLog,
  master,
  aac,
  users,
  publishHistory,
  activityLog,
  fieldComments,
  amazonSnapshots,
  spApiCredentials,
  categoryDefinitions,
  attributes,
} from "@/lib/db/schema";
import { desc, eq, and, gte, sql, or, ilike, count, Table } from "drizzle-orm";
import { SEO_VERSIONS_DATASET } from "@/lib/bigquery";
import { BigQuery } from "@google-cloud/bigquery";

export const maxDuration = 60;

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// Anthropic pricing per million tokens (as of 2025)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-sonnet-4-5-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
};

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";
const BQ_DATASET = process.env.BQ_DATASET || "1o8 Hub";
const BQ_TABLE = process.env.BQ_TABLE || "Master";

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["claude-haiku-4-5-20251001"];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

function getBigQueryClient(): BigQuery {
  if (process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
    let privateKey = process.env.GCP_PRIVATE_KEY;
    privateKey = privateKey.replace(/\\n/g, "\n");
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = JSON.parse(privateKey);
    }
    return new BigQuery({
      projectId: PROJECT_ID,
      credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: privateKey,
      },
    });
  }
  return new BigQuery({ projectId: PROJECT_ID });
}

async function countTable(table: Table): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(table);
  return Number(row.count);
}

interface TableInfo {
  name: string;
  rows: number;
}

interface CheckResult {
  name: string;
  status: "ok" | "error";
  latencyMs: number;
  details?: string;
  tables?: TableInfo[];
}

async function checkPostgres(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const counts = await Promise.all([
      countTable(users),
      countTable(master),
      countTable(attributes),
      countTable(aac),
      countTable(publishHistory),
      countTable(activityLog),
      countTable(fieldComments),
      countTable(amazonSnapshots),
      countTable(spApiCredentials),
      countTable(categoryDefinitions),
    ]);

    const tableNames = [
      "users",
      "products",
      "attributes",
      "aac_clients",
      "publish_history",
      "activity_log",
      "field_comments",
      "amazon_snapshots",
      "sp_api_credentials",
      "category_definitions",
    ];

    const tables: TableInfo[] = tableNames.map((name, i) => ({
      name,
      rows: counts[i],
    }));

    const totalRows = counts.reduce((a, b) => a + b, 0);

    return {
      name: "PostgreSQL (Supabase)",
      status: "ok",
      latencyMs: Date.now() - start,
      details: `${tables.length} tables, ${totalRows.toLocaleString()} total rows`,
      tables,
    };
  } catch (e) {
    return {
      name: "PostgreSQL (Supabase)",
      status: "error",
      latencyMs: Date.now() - start,
      details: e instanceof Error ? e.message : "Connection failed",
    };
  }
}

async function checkBigQueryTable(
  bq: BigQuery,
  dataset: string,
  table: string
): Promise<CheckResult> {
  const fullName = `${PROJECT_ID}.${dataset}.${table}`;
  const start = Date.now();
  try {
    const [rows] = await bq.query({
      query: `SELECT COUNT(*) as cnt FROM \`${fullName}\``,
      location: "us-west1",
    });
    const cnt = Number(rows[0].cnt);
    return {
      name: `BQ: ${dataset}.${table}`,
      status: "ok",
      latencyMs: Date.now() - start,
      details: `${cnt.toLocaleString()} rows`,
    };
  } catch (e) {
    return {
      name: `BQ: ${dataset}.${table}`,
      status: "error",
      latencyMs: Date.now() - start,
      details: e instanceof Error ? e.message : "Query failed",
    };
  }
}

async function getDataIntegrity() {
  const [totals] = await db
    .select({
      total: sql<number>`count(*)`,
      dirty: sql<number>`count(*) filter (where ${master.isDirty} = true)`,
      missingAsin: sql<number>`count(*) filter (where ${master.asin} is null or ${master.asin} = '')`,
      missingUuid: sql<number>`count(*) filter (where (${master.rawColumnValues}->>'UUID') is null or (${master.rawColumnValues}->>'UUID') = '')`,
      missingItemName: sql<number>`count(*) filter (where ${master.itemName} is null or ${master.itemName} = '')`,
    })
    .from(master);

  const clientRows = await db
    .select({
      client: master.clientIdCode,
      count: sql<number>`count(*)`,
      dirty: sql<number>`count(*) filter (where ${master.isDirty} = true)`,
    })
    .from(master)
    .groupBy(master.clientIdCode)
    .orderBy(sql`count(*) desc`);

  return {
    totalProducts: Number(totals.total),
    dirtyProducts: Number(totals.dirty),
    missingAsin: Number(totals.missingAsin),
    missingUuid: Number(totals.missingUuid),
    missingItemName: Number(totals.missingItemName),
    clientBreakdown: clientRows.map((r) => ({
      client: r.client ?? "Unknown",
      count: Number(r.count),
      dirty: Number(r.dirty),
    })),
  };
}

async function getLastPublish() {
  const [row] = await db
    .select({
      publishedBy: publishHistory.publishedBy,
      publishedAt: publishHistory.publishedAt,
      rowsPublished: publishHistory.rowsPublished,
      dirtyCount: publishHistory.dirtyCount,
    })
    .from(publishHistory)
    .orderBy(desc(publishHistory.publishedAt))
    .limit(1);

  if (!row) return null;
  return {
    publishedBy: row.publishedBy,
    publishedAt: row.publishedAt.toISOString(),
    rowsPublished: row.rowsPublished,
    dirtyCount: row.dirtyCount,
  };
}

async function getSpApiStatus() {
  const rows = await db
    .select({
      clientIdCode: spApiCredentials.clientIdCode,
      marketplaceId: spApiCredentials.marketplaceId,
      isActive: spApiCredentials.isActive,
      lastSyncAt: spApiCredentials.lastSyncAt,
    })
    .from(spApiCredentials)
    .orderBy(spApiCredentials.clientIdCode);

  return rows.map((r) => ({
    clientIdCode: r.clientIdCode,
    marketplaceId: r.marketplaceId,
    isActive: r.isActive,
    lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
  }));
}

async function getCategoryDefSummary() {
  const [defCount] = await db
    .select({ count: count() })
    .from(categoryDefinitions);
  // Post-unification: count attribute rows with non-empty category_meta
  // JSONB instead of rows in the deprecated category_attributes table.
  const [attrCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(attributes)
    .where(sql`${attributes.categoryMeta} != '{}'::jsonb`);
  const [clientCount] = await db
    .select({ count: sql<number>`count(distinct ${categoryDefinitions.clientIdCode})` })
    .from(categoryDefinitions);

  return {
    totalDefinitions: Number(defCount.count),
    totalAttributes: Number(attrCount.count),
    clients: Number(clientCount.count),
  };
}

async function getRecentActivity() {
  const [stats] = await db
    .select({
      today: sql<number>`count(*) filter (where ${activityLog.changedAt} >= now() - interval '24 hours')`,
      week: sql<number>`count(*) filter (where ${activityLog.changedAt} >= now() - interval '7 days')`,
      editors: sql<number>`count(distinct ${activityLog.changedBy}) filter (where ${activityLog.changedAt} >= now() - interval '7 days')`,
    })
    .from(activityLog);

  return {
    editsToday: Number(stats.today),
    editsThisWeek: Number(stats.week),
    activeEditors: Number(stats.editors),
  };
}

export async function GET() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const bq = getBigQueryClient();

  // Run observability + health queries in parallel (15s global timeout)
  const [
    claudeEvents,
    recentErrors,
    serviceHealth,
    activityCount,
    errorCount,
    healthChecks,
    dataIntegrity,
    lastPublish,
    spApiStatus,
    categoryDefs,
    recentActivity,
  ] = await withTimeout(Promise.all([
    // Claude AI usage
    db
      .select()
      .from(adminEventLog)
      .where(
        and(
          ilike(adminEventLog.action, "claude:%"),
          gte(adminEventLog.createdAt, thirtyDaysAgo)
        )
      )
      .orderBy(desc(adminEventLog.createdAt)),
    // Recent errors
    db
      .select({
        id: adminEventLog.id,
        section: adminEventLog.section,
        action: adminEventLog.action,
        message: adminEventLog.message,
        userEmail: adminEventLog.userEmail,
        detail: adminEventLog.detail,
        resourceType: adminEventLog.resourceType,
        resourceId: adminEventLog.resourceId,
        resourceLabel: adminEventLog.resourceLabel,
        createdAt: adminEventLog.createdAt,
      })
      .from(adminEventLog)
      .where(eq(adminEventLog.status, "error"))
      .orderBy(desc(adminEventLog.createdAt))
      .limit(50),
    // Service health
    Promise.all(
      [
        { name: "Redshift (Intentwise)", pattern: "%redshift%" },
        { name: "BigQuery", pattern: "%bigquery%" },
        { name: "Google Drive", pattern: "%drive%" },
        { name: "Claude AI", pattern: "claude:%" },
        { name: "Amazon SP-API", pattern: "%sp-api%" },
        { name: "Rainforest API", pattern: "%rainforest%" },
      ].map(async (svc) => {
        const [lastSuccess] = await db
          .select({
            action: adminEventLog.action,
            createdAt: adminEventLog.createdAt,
            message: adminEventLog.message,
          })
          .from(adminEventLog)
          .where(
            and(
              or(
                ilike(adminEventLog.action, svc.pattern),
                ilike(adminEventLog.section, svc.pattern)
              ),
              eq(adminEventLog.status, "success")
            )
          )
          .orderBy(desc(adminEventLog.createdAt))
          .limit(1);

        const [lastError] = await db
          .select({
            action: adminEventLog.action,
            createdAt: adminEventLog.createdAt,
            message: adminEventLog.message,
          })
          .from(adminEventLog)
          .where(
            and(
              or(
                ilike(adminEventLog.action, svc.pattern),
                ilike(adminEventLog.section, svc.pattern)
              ),
              eq(adminEventLog.status, "error")
            )
          )
          .orderBy(desc(adminEventLog.createdAt))
          .limit(1);

        return {
          name: svc.name,
          lastSuccess: lastSuccess?.createdAt || null,
          lastSuccessAction: lastSuccess?.action || null,
          lastError: lastError?.createdAt || null,
          lastErrorMessage: lastError?.message || null,
          status: !lastSuccess
            ? "unknown"
            : !lastError
              ? "healthy"
              : new Date(lastSuccess.createdAt!) > new Date(lastError.createdAt!)
                ? "healthy"
                : "degraded",
        };
      })
    ),
    // Activity count (7d)
    db
      .select({ count: sql<number>`count(*)` })
      .from(adminEventLog)
      .where(gte(adminEventLog.createdAt, sevenDaysAgo))
      .then(([r]) => r),
    // Error count (7d)
    db
      .select({ count: sql<number>`count(*)` })
      .from(adminEventLog)
      .where(
        and(
          eq(adminEventLog.status, "error"),
          gte(adminEventLog.createdAt, sevenDaysAgo)
        )
      )
      .then(([r]) => r),
    // Health checks (Postgres + BQ with 10s timeout per BQ query)
    Promise.all([
      checkPostgres(),
      withTimeout(checkBigQueryTable(bq, BQ_DATASET, BQ_TABLE), 10_000, { name: `BQ: ${BQ_DATASET}.${BQ_TABLE}`, status: "error" as const, latencyMs: 10000, details: "Timeout (10s)" }),
      withTimeout(checkBigQueryTable(bq, BQ_DATASET, "AAC"), 10_000, { name: `BQ: ${BQ_DATASET}.AAC`, status: "error" as const, latencyMs: 10000, details: "Timeout (10s)" }),
      withTimeout(checkBigQueryTable(bq, BQ_DATASET, "Attributes"), 10_000, { name: `BQ: ${BQ_DATASET}.Attributes`, status: "error" as const, latencyMs: 10000, details: "Timeout (10s)" }),
      withTimeout(checkBigQueryTable(bq, SEO_VERSIONS_DATASET, "SEO"), 10_000, { name: `BQ: ${SEO_VERSIONS_DATASET}.SEO`, status: "error" as const, latencyMs: 10000, details: "Timeout (10s)" }),
    ]),
    withTimeout(getDataIntegrity(), 8_000, { totalProducts: 0, dirtyProducts: 0, missingAsin: 0, missingUuid: 0, missingItemName: 0, clientBreakdown: [] }),
    withTimeout(getLastPublish(), 5_000, null),
    withTimeout(getSpApiStatus(), 5_000, []),
    withTimeout(getCategoryDefSummary(), 5_000, { totalDefinitions: 0, totalAttributes: 0, clients: 0 }),
    withTimeout(getRecentActivity(), 5_000, { editsToday: 0, editsThisWeek: 0, activeEditors: 0 }),
  ]), 20_000, [
    [], // claudeEvents
    [], // recentErrors
    [], // serviceHealth
    { count: 0 }, // activityCount
    { count: 0 }, // errorCount
    [] as unknown as [CheckResult, CheckResult, CheckResult, CheckResult, CheckResult], // healthChecks
    { totalProducts: 0, dirtyProducts: 0, missingAsin: 0, missingUuid: 0, missingItemName: 0, clientBreakdown: [] }, // dataIntegrity
    null, // lastPublish
    [], // spApiStatus
    { totalDefinitions: 0, totalAttributes: 0, clients: 0 }, // categoryDefs
    { editsToday: 0, editsThisWeek: 0, activeEditors: 0 }, // recentActivity
  ] as const);

  // Aggregate Claude feature usage
  const featureUsage: Record<
    string,
    {
      calls: number;
      errors: number;
      inputTokens: number;
      outputTokens: number;
      cost: number;
      avgDurationMs: number;
      totalDurationMs: number;
    }
  > = {};

  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const event of claudeEvents) {
    const feature = event.action;
    if (!featureUsage[feature]) {
      featureUsage[feature] = {
        calls: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        avgDurationMs: 0,
        totalDurationMs: 0,
      };
    }

    const f = featureUsage[feature];
    f.calls++;
    if (event.status === "error") f.errors++;
    if (event.durationMs) f.totalDurationMs += event.durationMs;

    const detail = event.detail as Record<string, unknown> | null;
    const usage = detail?.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    const model = (detail?.model as string) || "claude-haiku-4-5-20251001";

    if (usage) {
      const inp = usage.input_tokens || 0;
      const out = usage.output_tokens || 0;
      f.inputTokens += inp;
      f.outputTokens += out;
      const cost = estimateCost(model, inp, out);
      f.cost += cost;
      totalCost += cost;
      totalInputTokens += inp;
      totalOutputTokens += out;
    }
  }

  for (const f of Object.values(featureUsage)) {
    f.avgDurationMs = f.calls > 0 ? Math.round(f.totalDurationMs / f.calls) : 0;
  }

  // Daily cost breakdown (last 7 days)
  const dailyCostEvents = claudeEvents.filter(
    (e) => e.createdAt && new Date(e.createdAt) >= sevenDaysAgo
  );
  const dailyCosts: Record<string, number> = {};
  for (const event of dailyCostEvents) {
    const day = new Date(event.createdAt!).toISOString().slice(0, 10);
    const detail = event.detail as Record<string, unknown> | null;
    const usage = detail?.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    const model = (detail?.model as string) || "claude-haiku-4-5-20251001";
    if (usage) {
      const cost = estimateCost(
        model,
        usage.input_tokens || 0,
        usage.output_tokens || 0
      );
      dailyCosts[day] = (dailyCosts[day] || 0) + cost;
    }
  }

  const allHealthOk = healthChecks.every((c) => c.status === "ok");

  return NextResponse.json({
    summary: {
      totalCost30d: totalCost,
      totalInputTokens30d: totalInputTokens,
      totalOutputTokens30d: totalOutputTokens,
      totalCalls30d: claudeEvents.length,
      totalErrors30d: claudeEvents.filter((e) => e.status === "error").length,
      eventsLast7d: Number(activityCount.count),
      errorsLast7d: Number(errorCount.count),
    },
    featureUsage,
    dailyCosts,
    serviceHealth,
    recentErrors,
    // System health data
    systemHealth: {
      status: allHealthOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks: healthChecks,
      dataIntegrity,
      lastPublish,
      spApiStatus,
      categoryDefs,
      recentActivity,
      env: {
        GCP_PROJECT_ID: PROJECT_ID,
        BQ_DATASET,
        BQ_TABLE,
        GCP_CLIENT_EMAIL: process.env.GCP_CLIENT_EMAIL
          ? `${process.env.GCP_CLIENT_EMAIL.slice(0, 12)}...`
          : "not set",
        DATABASE_URL: process.env.DATABASE_URL ? "set" : "not set",
      },
    },
  });
}

import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, aac, users } from "@/lib/db/schema";
import { sql, asc, ilike, eq } from "drizzle-orm";
import { CLIENT_NAMES, TEAM_ROLES } from "@/lib/constants";
import { insertClientToBigQuery } from "@/lib/bigquery";
import { withDbTimeout, DbTimeoutError } from "@/lib/db/with-timeout";
import {
  getOrFillClientsCache,
  invalidateClientsCache,
  peekClientsCache,
  clientsCacheKey,
  isLiteClientsCacheKey,
  type ClientsCacheKey,
} from "@/lib/clients-cache";
import {
  accumulateClientProductStats,
  emptyClientProductStats,
  type ClientProductStats,
} from "@/lib/client-product-stats";

export async function GET(req: NextRequest) {
  const lite = req.nextUrl.searchParams.get("lite") === "1";
  const cacheKey = clientsCacheKey(
    req.nextUrl.searchParams.get("status"),
    lite,
  );
  try {
    return await withDbTimeout(
      getClients(cacheKey),
      20_000,
      "GET /api/clients",
    );
  } catch (err) {
    if (err instanceof DbTimeoutError) {
      // Auth already succeeded inside getClients only if we got that far —
      // but a timeout during the fill still leaves the last good payload in
      // the slot. Prefer that over a 503 that empties every dropdown.
      const stale = peekClientsCache(cacheKey);
      if (stale) return NextResponse.json(stale);
      console.error("[api/clients]", err.message);
      return NextResponse.json(
        { error: "Request timed out, please retry" },
        { status: 503 },
      );
    }
    throw err;
  }
}

async function getClients(cacheKey: ClientsCacheKey) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Nothing below is per-user, so one copy per process serves every
  // authenticated caller. Staleness contract: src/lib/clients-cache.ts.
  // getOrFillClientsCache also collapses concurrent misses so a cold cache
  // costs one query set, not one per caller — and serves the last payload
  // immediately once the TTL expires, refreshing in the background.
  const payload = await getOrFillClientsCache(cacheKey, () =>
    buildClientsPayload(cacheKey),
  );
  return NextResponse.json(payload);
}

type AacRow = {
  clientIdCode: string;
  clientName: string | null;
  clientType: string | null;
  clientStatus: string | null;
  rawData: unknown;
  allowedSections: string[] | null;
};

function parseRawData(rawData: unknown): Record<string, string> {
  if (typeof rawData === "string") {
    try {
      return JSON.parse(rawData) as Record<string, string>;
    } catch {
      return {};
    }
  }
  if (rawData && typeof rawData === "object") {
    return rawData as Record<string, string>;
  }
  return {};
}

function teamFromRaw(raw: Record<string, string>): { label: string; name: string }[] {
  const team: { label: string; name: string }[] = [];
  for (const [key, label] of Object.entries(TEAM_ROLES)) {
    const name = raw[key]?.trim();
    if (name) team.push({ label, name });
  }
  return team;
}

function clientPayload(
  clientIdCode: string,
  row: AacRow,
  stats: ClientProductStats,
  userCount: number,
) {
  const raw = parseRawData(row.rawData);
  return {
    clientIdCode,
    count: stats.count,
    activeCount: stats.activeCount,
    userCount,
    clientName: row.clientName || CLIENT_NAMES[clientIdCode] || clientIdCode,
    clientType: row.clientType ?? null,
    clientStatus: row.clientStatus ?? null,
    rawData: raw,
    statusBreakdown: {
      Active: stats.activeCount,
      Inactive: stats.inactiveCount,
      "Out of Stock": stats.outOfStockCount,
      Closed: stats.closedCount,
      Incomplete: stats.incompleteCount,
      Discontinued: stats.discontinuedCount,
      "Replacement ASIN": stats.replacementCount,
    },
    team: teamFromRaw(raw),
    allowedSections: row.allowedSections ?? [],
  };
}

async function buildClientsPayload(cacheKey: ClientsCacheKey) {
  if (cacheKey === "inactive") {
    const inactiveClients = await db
      .select({
        clientIdCode: aac.clientIdCode,
        clientName: aac.clientName,
      })
      .from(aac)
      .where(ilike(aac.clientStatus, "inactive"))
      .orderBy(asc(aac.clientIdCode));

    return inactiveClients.map((c) => ({
      clientIdCode: c.clientIdCode,
      clientName: c.clientName || CLIENT_NAMES[c.clientIdCode] || c.clientIdCode,
    }));
  }

  const includeAllStatuses = cacheKey === "all" || cacheKey === "all-lite";
  const lite = isLiteClientsCacheKey(cacheKey);

  const aacQuery = db
    .select({
      clientIdCode: aac.clientIdCode,
      clientName: aac.clientName,
      clientType: aac.clientType,
      clientStatus: aac.clientStatus,
      rawData: aac.rawData,
      allowedSections: aac.allowedSections,
    })
    .from(aac);

  // One connection at a time. The previous Promise.all of three queries
  // reserved three of the ten local (and all three production) pool slots
  // for a handler whose wall clock is capped at 20s — and withDbTimeout
  // does not cancel the work, so a timed-out fill kept holding those slots
  // while the next request waited. AAC and users are tiny; master is the
  // slow one. Sequential means a starved pool still makes progress.
  const activeClients = includeAllStatuses
    ? await aacQuery
    : await aacQuery.where(ilike(aac.clientStatus, "active"));

  let productStatsMap = new Map<string, ClientProductStats>();
  let userCountMap = new Map<string | null, number>();

  if (!lite) {
    const userCountRows = await db
      .select({
        clientIdCode: users.clientIdCode,
        userCount: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(sql`${users.role} = 'client' AND ${users.clientIdCode} IS NOT NULL`)
      .groupBy(users.clientIdCode);

    userCountMap = new Map(
      userCountRows.map((r) => [r.clientIdCode, r.userCount]),
    );

    const rows = await db
      .select({
        clientIdCode: master.clientIdCode,
        status: master.status,
        count: sql<number>`count(*)::int`,
      })
      .from(master)
      .where(sql`${master.clientIdCode} IS NOT NULL AND ${master.clientIdCode} != ''`)
      .groupBy(master.clientIdCode, master.status);

    productStatsMap = accumulateClientProductStats(rows);
  }

  const filtered = activeClients.map((row) =>
    clientPayload(
      row.clientIdCode,
      row,
      productStatsMap.get(row.clientIdCode) ?? emptyClientProductStats(),
      userCountMap.get(row.clientIdCode) ?? 0,
    ),
  );

  filtered.sort((a, b) =>
    (a.clientIdCode ?? "").localeCompare(b.clientIdCode ?? ""),
  );

  return filtered;
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const clientIdCode = (body.clientIdCode ?? "").trim();
  if (!clientIdCode) {
    return NextResponse.json(
      { error: "Client ID Code is required" },
      { status: 400 }
    );
  }

  // Check uniqueness
  const existing = await db
    .select({ id: aac.id })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Client ID already exists" },
      { status: 409 }
    );
  }

  const clientName = (body.clientName ?? "").trim();
  const clientStatus = (body.clientStatus ?? "Active").trim() || "Active";
  const clientType =
    body.clientType === "AIA" || body.clientType === "NTA" ? body.clientType : null;
  const offboardingDate =
    typeof body.offboardingDate === "string" ? body.offboardingDate.trim() : "";

  if (clientStatus.toLowerCase() === "inactive" && !offboardingDate) {
    return NextResponse.json(
      { error: "An offboarding date is required to mark a client Inactive." },
      { status: 400 }
    );
  }

  const offboardingColumn = offboardingDate ? new Date(offboardingDate + "T00:00:00Z") : null;

  await db.insert(aac).values({
    clientIdCode,
    clientName: clientName || null,
    clientStatus,
    clientType,
    offboardingDate: offboardingColumn,
    rawData: {
      ClientIdCode: clientIdCode,
      ClientName: clientName,
      ClientStatus: clientStatus,
      ...(offboardingDate ? { OffboardingDate: offboardingDate } : {}),
    },
  });

  invalidateClientsCache();

  // Also insert into BigQuery AAC table so SEO manager can see it
  try {
    await insertClientToBigQuery(clientIdCode, clientName, clientStatus);
  } catch (err) {
    console.error("Failed to insert client into BigQuery:", err);
    // Don't fail the request — PG insert succeeded
  }

  return NextResponse.json({ clientIdCode }, { status: 201 });
}

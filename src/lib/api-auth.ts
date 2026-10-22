import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { parseClientIdCodes } from "@/lib/client-codes";
import { resolveDemoDataSource } from "@/lib/demo-client-alias";

/**
 * Dual auth for /api/reports/* routes:
 *   - Cookie-based session for regular logged-in users, OR
 *   - Bearer ${CRON_SECRET} + x-cron-refresh: true for the refresh-reports cron workers.
 *
 * Returns null on success; returns a 401 NextResponse to short-circuit the route on failure.
 *
 * Usage:
 *   const unauthorized = await requireAuthOrCron(req);
 *   if (unauthorized) return unauthorized;
 */
export async function requireAuthOrCron(req: NextRequest): Promise<NextResponse | null> {
  const isCronRequest = req.headers.get("x-cron-refresh") === "true";
  const cronSecret = process.env.CRON_SECRET;

  if (
    isCronRequest &&
    cronSecret &&
    req.headers.get("authorization") === `Bearer ${cronSecret}`
  ) {
    return null;
  }

  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function isAuthorizedCron(req: NextRequest): boolean {
  const isCronRequest = req.headers.get("x-cron-refresh") === "true";
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(
    isCronRequest &&
      cronSecret &&
      req.headers.get("authorization") === `Bearer ${cronSecret}`
  );
}

export function parseRawData(raw: unknown): Record<string, string> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object") return raw as Record<string, string>;
  return {};
}

export function intentwiseFromRaw(raw: Record<string, string>): string | null {
  const id = (
    raw.IntentwiseID ||
    raw["Intentwise ID"] ||
    raw.intentwiseID ||
    ""
  ).trim();
  return id || null;
}

async function intentwiseIdsForAssigned(codes: string[]): Promise<Map<string, string>> {
  const lookupCodes = [...new Set(codes.map((c) => resolveDemoDataSource(c)))];
  if (lookupCodes.length === 0) return new Map();

  const rows = await db
    .select({ clientIdCode: aac.clientIdCode, rawData: aac.rawData })
    .from(aac)
    .where(inArray(aac.clientIdCode, lookupCodes));

  const byLookup = new Map<string, string>();
  for (const row of rows) {
    const id = intentwiseFromRaw(parseRawData(row.rawData));
    if (id) byLookup.set(row.clientIdCode, id);
  }

  const byAssigned = new Map<string, string>();
  for (const code of codes) {
    const id = byLookup.get(resolveDemoDataSource(code));
    if (id) byAssigned.set(code, id);
  }
  return byAssigned;
}

/**
 * Resolve the accountId (IntentwiseID) the current request is authorized to query.
 *
 *   - Cron requests: trust the URL ?accountId= (internal refresh workers).
 *   - Admin/editor/viewer: trust the URL ?accountId= (hub users browse any client).
 *   - Client/prospect: only an assigned client. `?client=` wins when it is in
 *     the assignment list; otherwise `?accountId=` is allowed when it matches
 *     one of those clients' Intentwise IDs. This keeps a client from querying
 *     someone else's Redshift data while still letting the homepage dropdown
 *     switch between TRT and HAL. Demo-aliased clients resolve the donor row.
 *
 * Returns null when no accountId can be resolved (call site should treat as 400).
 */
export async function getEffectiveAccountId(req: NextRequest): Promise<string | null> {
  if (isAuthorizedCron(req)) {
    return req.nextUrl.searchParams.get("accountId");
  }

  const session = await getAuthSession();
  if (!session) return null;

  const role = session.user.role;
  if (role === "client" || role === "prospect") {
    const assigned = parseClientIdCodes(session.user.clientIdCode);
    if (assigned.length === 0) return null;

    const requestedClient = req.nextUrl.searchParams.get("client")?.trim() || null;
    const requestedAccountId = req.nextUrl.searchParams.get("accountId")?.trim() || null;
    const scoped = requestedClient && assigned.includes(requestedClient)
      ? [requestedClient]
      : requestedClient
        ? []
        : assigned;
    if (scoped.length === 0) return null;

    const ids = await intentwiseIdsForAssigned(scoped);
    if (requestedClient) return ids.get(requestedClient) ?? null;
    if (requestedAccountId) {
      for (const id of ids.values()) {
        if (id === requestedAccountId) return requestedAccountId;
      }
      return null;
    }
    return ids.get(assigned[0]!) ?? null;
  }

  return req.nextUrl.searchParams.get("accountId");
}

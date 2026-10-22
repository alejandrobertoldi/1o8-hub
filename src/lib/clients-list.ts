import { sql } from "drizzle-orm";
import { aac } from "@/lib/db/schema";
import { CLIENT_NAMES, TEAM_ROLES } from "@/lib/constants";
import {
  emptyClientProductStats,
  type ClientProductStats,
} from "@/lib/client-product-stats";

/** JSONB keys the list endpoint actually serves. The rest of `aac.raw_data` stays on the row. */
export const CLIENT_LIST_RAW_KEYS = [
  "IntentwiseID",
  ...Object.keys(TEAM_ROLES),
] as const;

const LITE_RAW_KEYS = ["IntentwiseID"] as const;

export function slimRawDataForList(
  raw: Record<string, string>,
  keys: readonly string[] = CLIENT_LIST_RAW_KEYS,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = raw[key]?.trim();
    if (value) out[key] = value;
  }
  return out;
}

export function parseRawData(rawData: unknown): Record<string, string> {
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

export function statusBreakdownFromStats(stats: ClientProductStats) {
  return {
    Active: stats.activeCount,
    Inactive: stats.inactiveCount,
    "Out of Stock": stats.outOfStockCount,
    Closed: stats.closedCount,
    Incomplete: stats.incompleteCount,
    Discontinued: stats.discontinuedCount,
    "Replacement ASIN": stats.replacementCount,
  };
}

export function teamFromRaw(
  raw: Record<string, string>,
): { label: string; name: string }[] {
  const team: { label: string; name: string }[] = [];
  for (const [key, label] of Object.entries(TEAM_ROLES)) {
    const name = raw[key]?.trim();
    if (name) team.push({ label, name });
  }
  return team;
}

export type ClientListItem = {
  clientIdCode: string;
  count: number;
  activeCount: number;
  userCount: number;
  clientName: string;
  clientType: string | null;
  clientStatus: string | null;
  rawData: Record<string, string>;
  statusBreakdown: ReturnType<typeof statusBreakdownFromStats>;
  team: { label: string; name: string }[];
  allowedSections: string[];
};

export function buildClientListItem(
  clientIdCode: string,
  row: {
    clientName: string | null;
    clientType: string | null;
    clientStatus: string | null;
    rawData: unknown;
    allowedSections: string[] | null;
  },
  stats: ClientProductStats,
  userCount: number,
  rawKeys: readonly string[] = CLIENT_LIST_RAW_KEYS,
): ClientListItem {
  const raw = slimRawDataForList(parseRawData(row.rawData), rawKeys);
  return {
    clientIdCode,
    count: stats.count,
    activeCount: stats.activeCount,
    userCount,
    clientName: row.clientName || CLIENT_NAMES[clientIdCode] || clientIdCode,
    clientType: row.clientType ?? null,
    clientStatus: row.clientStatus ?? null,
    rawData: raw,
    statusBreakdown: statusBreakdownFromStats(stats),
    team: teamFromRaw(raw),
    allowedSections: row.allowedSections ?? [],
  };
}

export function mergeProductStatsIntoClients(
  clients: ClientListItem[],
  statsMap: Map<string, ClientProductStats>,
): ClientListItem[] {
  return clients.map((client) => {
    const stats =
      statsMap.get(client.clientIdCode) ?? emptyClientProductStats();
    return {
      ...client,
      count: stats.count,
      activeCount: stats.activeCount,
      statusBreakdown: statusBreakdownFromStats(stats),
    };
  });
}

/**
 * Pull only the list keys out of `aac.raw_data` so the handler never ships the
 * whole JSONB blob (team spreadsheet dump) across the pooler.
 */
export function aacListRawDataSql(lite: boolean) {
  const keys = lite ? LITE_RAW_KEYS : CLIENT_LIST_RAW_KEYS;
  const inList = sql.join(
    keys.map((key) => sql`${key}`),
    sql`, `,
  );
  return sql<Record<string, string> | null>`(
    SELECT jsonb_object_agg(e.key, e.value)
    FROM jsonb_each_text(COALESCE(${aac.rawData}, '{}'::jsonb)) AS e
    WHERE e.key IN (${inList})
  )`;
}

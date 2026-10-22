/* eslint-disable react-doctor/js-flatmap-filter */
import { db } from "@/lib/db";
import { reportsCache } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — cron runs every 6h so cache stays warm

function normalizeAccountId(accountId: string): string {
  return accountId
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
    .join(",");
}

export async function getCachedReport<T>(
  cacheType: string,
  cacheKey: string,
  maxAgeMs: number = MAX_AGE_MS,
): Promise<T | null> {
  const rows = await db
    .select({ data: reportsCache.data, updatedAt: reportsCache.updatedAt })
    .from(reportsCache)
    .where(
      and(
        eq(reportsCache.cacheType, cacheType),
        eq(reportsCache.cacheKey, cacheKey),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  const age = Date.now() - new Date(row.updatedAt).getTime();
  if (age > maxAgeMs) return null;

  return row.data as T;
}

export async function setCachedReport(
  cacheType: string,
  cacheKey: string,
  data: unknown,
): Promise<void> {
  const now = new Date();
  const payload = data as Record<string, unknown>;
  await db
    .insert(reportsCache)
    .values({
      cacheType,
      cacheKey,
      data: payload,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [reportsCache.cacheType, reportsCache.cacheKey],
      set: {
        data: payload,
        updatedAt: now,
      },
    });
}

export function buildDatedKey(
  accountId: string,
  start: string,
  end: string,
): string {
  return `${normalizeAccountId(accountId)}|${start}|${end}`;
}

export function buildAccountKey(accountId: string): string {
  return normalizeAccountId(accountId);
}

export function buildKeywordKey(
  accountId: string,
  start: string,
  end: string,
  keyword: string,
): string {
  return `${normalizeAccountId(accountId)}|${start}|${end}|${keyword}`;
}

export function buildAsinKey(
  accountId: string,
  start: string,
  end: string,
  asin: string,
): string {
  return `${normalizeAccountId(accountId)}|${start}|${end}|${asin}`;
}

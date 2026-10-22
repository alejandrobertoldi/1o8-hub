import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { monthlyReportGenerateFailures as t } from "@/lib/db/schema";

/** Spec L10: after this many generation ERRORS for a client+period the cron stops retrying it. */
export const GENERATE_FAILURE_CAP = 3;
export const isCapped = (attempts: number) => attempts >= GENERATE_FAILURE_CAP;

export async function recordGenerateFailure(clientIdCode: string, period: string, error: string): Promise<void> {
  await db.insert(t).values({ clientIdCode, period, attempts: 1, lastError: error.slice(0, 2000) })
    .onConflictDoUpdate({ target: [t.clientIdCode, t.period], set: { attempts: sql`${t.attempts} + 1`, lastError: error.slice(0, 2000), updatedAt: new Date() } });
}
export async function clearGenerateFailure(clientIdCode: string, period: string): Promise<void> {
  await db.delete(t).where(and(eq(t.clientIdCode, clientIdCode), eq(t.period, period)));
}
export async function cappedClients(period: string) {
  return db.select({ clientIdCode: t.clientIdCode, attempts: t.attempts, lastError: t.lastError })
    .from(t).where(and(eq(t.period, period), gte(t.attempts, GENERATE_FAILURE_CAP)));
}

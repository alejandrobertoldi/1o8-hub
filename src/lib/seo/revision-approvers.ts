import { db } from "@/lib/db";
import { aac, users } from "@/lib/db/schema";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { resolveClientApprovers } from "@/lib/sales-summary-header";
import type { Approvers } from "./revision-rules";

function parseRawData(rawData: unknown): Record<string, string> {
  if (typeof rawData === "string") {
    try { return JSON.parse(rawData); } catch { return {}; }
  }
  if (rawData && typeof rawData === "object") return rawData as Record<string, string>;
  return {};
}

/** The client's assigned PM and AM, matched to users by name (aac.rawData stores names). */
export async function loadClientApprovers(clientIdCode: string): Promise<Approvers> {
  const [row] = await db.select({ rawData: aac.rawData }).from(aac).where(eq(aac.clientIdCode, clientIdCode));
  if (!row) return { pm: null, am: null };
  const team = await db.select({ name: users.name, email: users.email, image: users.image }).from(users).where(isNotNull(users.name));
  return resolveClientApprovers(parseRawData(row.rawData), team);
}

/** loadClientApprovers for many clients at once: two queries in total, whatever the number of clients. */
export async function loadApproversForClients(clientIdCodes: string[]): Promise<Map<string, Approvers>> {
  const out = new Map<string, Approvers>();
  const codes = [...new Set(clientIdCodes.filter(Boolean))];
  if (!codes.length) return out;
  const [rows, team] = await Promise.all([
    db.select({ code: aac.clientIdCode, rawData: aac.rawData }).from(aac).where(inArray(aac.clientIdCode, codes)),
    db.select({ name: users.name, email: users.email, image: users.image }).from(users).where(isNotNull(users.name)),
  ]);
  for (const r of rows) out.set(r.code, resolveClientApprovers(parseRawData(r.rawData), team));
  return out;
}

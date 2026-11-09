import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientHourEstimates } from "@/lib/db/schema";
import { ESTIMATE_DEPARTMENTS } from "./catalog";

/** client code (upper case) → department → monthly estimated hours. */
export type EstimatesByClient = Record<string, Record<string, number>>;

export async function listDepartmentEstimates(): Promise<EstimatesByClient> {
  const rows = await db.select().from(clientHourEstimates);
  const out: EstimatesByClient = {};
  for (const r of rows) (out[r.clientIdCode.toUpperCase()] ??= {})[r.department] = Number(r.monthlyHours);
  return out;
}

/**
 * Replace a client's department estimates. Blank / zero removes a department;
 * unknown departments are ignored. Returns what was saved.
 */
export async function saveDepartmentEstimates(client: string, estimates: Record<string, unknown>, userId: string | null): Promise<Record<string, number>> {
  const code = client.toUpperCase();
  const clean: Record<string, number> = {};
  for (const d of ESTIMATE_DEPARTMENTS) {
    const v = Number(estimates[d]);
    if (Number.isFinite(v) && v > 0) clean[d] = Math.round(v * 100) / 100;
  }
  await db.transaction(async (tx) => {
    const keep = Object.keys(clean);
    await tx
      .delete(clientHourEstimates)
      .where(keep.length ? and(eq(clientHourEstimates.clientIdCode, code), notInArray(clientHourEstimates.department, keep)) : eq(clientHourEstimates.clientIdCode, code));
    for (const [department, hours] of Object.entries(clean)) {
      await tx
        .insert(clientHourEstimates)
        .values({ clientIdCode: code, department, monthlyHours: String(hours), updatedBy: userId, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [clientHourEstimates.clientIdCode, clientHourEstimates.department],
          set: { monthlyHours: String(hours), updatedBy: userId, updatedAt: new Date() },
        });
    }
  });
  return clean;
}

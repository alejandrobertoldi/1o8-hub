import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoAsins, seoProjects } from "@/lib/db/schema";

/** The client's SEO project ids and the distinct ASINs across them. */
export async function loadClientScope(clientId: string): Promise<{ projectIds: string[]; asins: string[] }> {
  const projects = await db.select({ id: seoProjects.id }).from(seoProjects).where(eq(seoProjects.clientIdCode, clientId));
  const projectIds = projects.map((p) => p.id);
  if (projectIds.length === 0) return { projectIds, asins: [] };
  const rows = await db.select({ asin: seoAsins.asin }).from(seoAsins).where(inArray(seoAsins.projectId, projectIds));
  return { projectIds, asins: [...new Set(rows.map((r) => r.asin))].sort() };
}

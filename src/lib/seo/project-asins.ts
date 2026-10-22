// Targeted ASINs per project for project cards, for any number of projects/clients (two queries).
import { db } from "@/lib/db";
import { master, seoAsins } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { projectAsinListByClient, type ProjectAsin } from "./project-asin-list";

export async function loadProjectAsins(projects: Array<{ id: string; clientIdCode: string | null }>): Promise<Map<string, ProjectAsin[]>> {
  if (!projects.length) return new Map();
  const rows = await db.select({ projectId: seoAsins.projectId, asin: seoAsins.asin, sku: seoAsins.sku, parentageLevel: seoAsins.parentageLevel })
    .from(seoAsins).where(inArray(seoAsins.projectId, projects.map((p) => p.id)));
  const asins = [...new Set(rows.map((r) => r.asin))];
  const products = asins.length
    ? await db.select({ id: master.id, clientIdCode: master.clientIdCode, asin: master.asin, sku: master.sku, summarizedTitle: master.summarizedTitle, itemName: master.itemName })
        .from(master).where(inArray(master.asin, asins))
    : [];
  return projectAsinListByClient(projects, rows, products);
}

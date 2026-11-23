import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientReportTexts, users } from "@/lib/db/schema";
import type { TextSection } from "./text";

/** Report texts are append-only versions; the newest per section is current. */

export type TextVersion = {
  id: string;
  section: TextSection;
  html: string;
  source: string;
  instruction: string | null;
  createdAt: string;
  createdBy: string | null;
};

const select = {
  id: clientReportTexts.id,
  section: clientReportTexts.section,
  html: clientReportTexts.html,
  source: clientReportTexts.source,
  instruction: clientReportTexts.instruction,
  createdAt: clientReportTexts.createdAt,
  createdBy: users.name,
};

function shape(r: { id: string; section: string; html: string; source: string; instruction: string | null; createdAt: Date; createdBy: string | null }): TextVersion {
  return { ...r, section: r.section as TextSection, createdAt: r.createdAt.toISOString() };
}

/** Every version, oldest first. */
export async function allTexts(reportId: string): Promise<TextVersion[]> {
  const rows = await db
    .select(select)
    .from(clientReportTexts)
    .leftJoin(users, eq(users.id, clientReportTexts.createdBy))
    .where(eq(clientReportTexts.reportId, reportId))
    .orderBy(asc(clientReportTexts.createdAt));
  return rows.map(shape);
}

/** The current (newest) text per section. */
export async function currentTexts(reportId: string): Promise<Partial<Record<TextSection, TextVersion>>> {
  const out: Partial<Record<TextSection, TextVersion>> = {};
  for (const v of await allTexts(reportId)) out[v.section] = v;
  return out;
}

export async function addTexts(
  reportId: string,
  rows: { section: TextSection; html: string; source: string; instruction?: string | null; createdBy: string | null }[],
) {
  if (!rows.length) return;
  const now = Date.now();
  // Distinct timestamps keep "newest per section" unambiguous within one batch.
  await db.insert(clientReportTexts).values(rows.map((r, i) => ({ reportId, ...r, instruction: r.instruction ?? null, createdAt: new Date(now + i) })));
}

export async function getVersion(reportId: string, id: string) {
  const [row] = await db
    .select(select)
    .from(clientReportTexts)
    .leftJoin(users, eq(users.id, clientReportTexts.createdBy))
    .where(and(eq(clientReportTexts.reportId, reportId), eq(clientReportTexts.id, id)))
    .orderBy(desc(clientReportTexts.createdAt))
    .limit(1);
  return row ? shape(row) : null;
}

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import type { KitCaseStudy, KitSection } from "./types";
import type { DeckFormat } from "./display";
import { emptyMetrics, effective, deriveMetrics, type CaseStudyMetrics } from "./metrics";
import { deckBlockers, type Blocker, type SectionContent, type SlideType } from "./slides";

type Row = Record<string, unknown>;
const SELECT = sql`
  SELECT cs.*, a.client_name, u.name AS owner_name,
    COALESCE((SELECT json_agg(json_build_object('id', s.id, 'sectionType', s.section_type, 'sortOrder', s.sort_order, 'content', s.content)
      ORDER BY s.sort_order) FROM case_study_sections s WHERE s.case_study_id = cs.id), '[]'::json) AS sections
  FROM case_studies cs
  LEFT JOIN aac a ON a.client_id_code = cs.client_id_code
  LEFT JOIN users u ON u.id = cs.owner_id`;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

function toKit(r: Row): KitCaseStudy {
  const m = (r.metrics ?? {}) as Partial<CaseStudyMetrics>;
  const start = day(r.date_range_start), end = day(r.date_range_end);
  return {
    id: String(r.id), clientIdCode: String(r.client_id_code), clientName: String(r.client_name ?? r.client_id_code),
    title: String(r.title), format: r.format as DeckFormat, stage: r.stage as KitCaseStudy["stage"],
    ownerId: (r.owner_id as string | null) ?? null, ownerName: (r.owner_name as string | null) ?? null, sentAt: iso(r.sent_at),
    dateRangeStart: start, dateRangeEnd: end, clientSector: String(r.client_sector ?? ""), contactEmail: String(r.contact_email ?? ""),
    metrics: { ...emptyMetrics(start, end), ...m },
    updatedAt: iso(r.updated_at) ?? "",
    sections: ((r.sections as KitSection[]) ?? []).map((s) => ({ ...s, sectionType: s.sectionType as SlideType,
      content: { copy: {}, designImages: {}, manualImages: {}, ...(s.content as Partial<SectionContent>) } })),
  };
}
export async function loadCaseStudy(id: string): Promise<KitCaseStudy | null> {
  const rows = (await db.execute(sql`${SELECT} WHERE cs.id = ${id} LIMIT 1`)) as unknown as Row[];
  return rows[0] ? toKit(rows[0]) : null;
}
export async function loadCaseStudyFor(clientIdCode: string, format: DeckFormat): Promise<KitCaseStudy | null> {
  const rows = (await db.execute(sql`${SELECT} WHERE cs.client_id_code = ${clientIdCode} AND cs.format = ${format} LIMIT 1`)) as unknown as Row[];
  return rows[0] ? toKit(rows[0]) : null;
}
export async function loadAllCaseStudies(): Promise<KitCaseStudy[]> {
  const rows = (await db.execute(sql`${SELECT}`)) as unknown as Row[];
  return rows.map(toKit);
}
export function blockersFor(cs: KitCaseStudy): Blocker[] {
  const e = effective(cs.metrics);
  return deckBlockers(cs.format, e, deriveMetrics(e), cs.sections);
}

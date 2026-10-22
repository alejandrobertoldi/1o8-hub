import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { caseStudies, caseStudySections } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { isEditorOrAbove, isHubStaff } from "@/lib/roles";
import { pullEverything } from "@/lib/case-study/kit/pull";
import { slidesFor, defaultSectionContent, manualImageCount } from "@/lib/case-study/kit/slides";
import { loadCaseStudyFor, loadAllCaseStudies, blockersFor } from "@/lib/case-study/kit/load";
import type { TrackerCell, TrackerRow, KitCaseStudy } from "@/lib/case-study/kit/types";
import type { DeckFormat } from "@/lib/case-study/kit/display";

export const maxDuration = 300;
const FORMATS: DeckFormat[] = ["high_level", "detailed"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORMAT_LABEL: Record<DeckFormat, string> = { high_level: "High-Level", detailed: "Detailed" };

function cell(cs: KitCaseStudy | undefined): TrackerCell | null {
  if (!cs) return null;
  return { id: cs.id, stage: cs.stage, ownerName: cs.ownerName, dateRangeStart: cs.dateRangeStart, dateRangeEnd: cs.dateRangeEnd,
    updatedAt: cs.updatedAt, blockers: blockersFor(cs).length, manualImages: manualImageCount(cs.sections) };
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  const format = req.nextUrl.searchParams.get("format") as DeckFormat | null;
  if (clientIdCode) {
    if (!format || !FORMATS.includes(format)) return NextResponse.json({ error: "format must be high_level or detailed" }, { status: 400 });
    return NextResponse.json(await loadCaseStudyFor(clientIdCode, format));
  }

  const [clients, all] = await Promise.all([
    db.execute(sql`SELECT client_id_code, client_name FROM aac WHERE client_status = 'Active' ORDER BY client_name NULLS LAST, client_id_code`)
      .then((r) => r as unknown as { client_id_code: string; client_name: string | null }[]),
    loadAllCaseStudies(),
  ]);
  const rows: TrackerRow[] = clients.map((c) => ({
    clientIdCode: c.client_id_code, clientName: c.client_name ?? c.client_id_code,
    highLevel: cell(all.find((x) => x.clientIdCode === c.client_id_code && x.format === "high_level")),
    detailed: cell(all.find((x) => x.clientIdCode === c.client_id_code && x.format === "detailed")),
  }));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientIdCode = String(body?.clientIdCode ?? "").trim();
  const format = body?.format as DeckFormat;
  const start = String(body?.dateRangeStart ?? ""), end = String(body?.dateRangeEnd ?? "");
  if (!clientIdCode || !FORMATS.includes(format) || !DATE.test(start) || !DATE.test(end) || start > end) {
    return NextResponse.json({ error: "clientIdCode, format (high_level|detailed) and YYYY-MM-DD dateRangeStart ≤ dateRangeEnd are required" }, { status: 400 });
  }
  const exists = (await db.execute(sql`SELECT id FROM case_studies WHERE client_id_code = ${clientIdCode} AND format = ${format} LIMIT 1`)) as unknown as { id: string }[];
  if (exists.length) return NextResponse.json({ error: "A case study in this format already exists for this client", id: exists[0].id }, { status: 409 });

  const nameRows = (await db.execute(sql`SELECT client_name FROM aac WHERE client_id_code = ${clientIdCode} LIMIT 1`)) as unknown as { client_name: string | null }[];
  const clientName = nameRows[0]?.client_name ?? clientIdCode;
  const { metrics, design, noAccount } = await pullEverything(clientIdCode, start, end);
  const defs = slidesFor(format);

  let id: string;
  try {
    id = await db.transaction(async (tx) => {
      const [row] = await tx.insert(caseStudies).values({
        clientIdCode, format, title: `${clientName} — ${FORMAT_LABEL[format]} Case Study`,
        dateRangeStart: start, dateRangeEnd: end, sectionsEnabled: defs.map((d) => d.type),
        stage: "drafting", ownerId: session.user.id, metrics: metrics as unknown as Record<string, unknown>,
        generatedAt: new Date(),
      }).returning({ id: caseStudies.id });
      await tx.insert(caseStudySections).values(defs.map((d, i) => ({
        caseStudyId: row.id, sectionType: d.type, sortOrder: i,
        content: defaultSectionContent(d, design) as unknown as Record<string, unknown>,
      })));
      return row.id;
    });
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code
      ?? (err as { cause?: { code?: string } } | undefined)?.cause?.code;
    if (code === "23505") {
      return NextResponse.json({ error: "A case study in this format already exists for this client" }, { status: 409 });
    }
    throw err;
  }
  return NextResponse.json({ id, noAccount, failed: metrics.failed }, { status: 201 });
}

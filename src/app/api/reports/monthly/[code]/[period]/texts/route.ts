export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { canEditReports, canReadReports } from "@/lib/client-report/access";
import { getReport } from "@/lib/client-report/load";
import { isPeriod } from "@/lib/client-report/period";
import { htmlToPlain, isTextSection, sanitizeReportHtml, textSectionsFor, unsupportedFigures } from "@/lib/client-report/text";
import { addTexts, allTexts, getVersion } from "@/lib/client-report/texts-store";
import type { ClientReportData } from "@/lib/client-report/types";

type Ctx = { params: Promise<{ code: string; period: string }> };

async function load(ctx: Ctx, write: boolean) {
  const session = await getAuthSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(write ? canEditReports : canReadReports)(session.user.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const { code, period } = await ctx.params;
  if (!isPeriod(period)) return { error: NextResponse.json({ error: "Bad period" }, { status: 400 }) };
  const row = await getReport(code, period);
  if (!row) return { error: NextResponse.json({ error: "Not generated yet" }, { status: 404 }) };
  return { session, row, data: row.data as ClientReportData };
}

/** GET — the report's written sections: current text, every version, and figures that don't match the data. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const r = await load(ctx, false);
  if ("error" in r) return r.error;
  const versions = await allTexts(r.row.id);
  const current: Record<string, (typeof versions)[number]> = {};
  for (const v of versions) current[v.section] = v;
  const warnings: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(current)) {
    const bad = unsupportedFigures(htmlToPlain(v.html), r.data);
    if (bad.length) warnings[k] = bad;
  }
  return NextResponse.json({ sections: textSectionsFor(r.data), current, versions, warnings });
}

/** PUT { section, html } — saves an edit as a new version. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const r = await load(ctx, true);
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => null)) as { section?: unknown; html?: unknown } | null;
  if (!isTextSection(body?.section) || typeof body?.html !== "string") return NextResponse.json({ error: "section and html are required" }, { status: 400 });
  const html = sanitizeReportHtml(body.html);
  if (html.length > 20_000) return NextResponse.json({ error: "Too long" }, { status: 400 });
  await addTexts(r.row.id, [{ section: body.section, html, source: "edit", createdBy: r.session.user.id ?? null }]);
  return NextResponse.json({ ok: true });
}

/** POST { restore: versionId } — makes an older version current again (as a new version). */
export async function POST(req: NextRequest, ctx: Ctx) {
  const r = await load(ctx, true);
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => null)) as { restore?: unknown } | null;
  if (typeof body?.restore !== "string") return NextResponse.json({ error: "restore (version id) is required" }, { status: 400 });
  const v = await getVersion(r.row.id, body.restore);
  if (!v) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  await addTexts(r.row.id, [{ section: v.section, html: v.html, source: "restore", createdBy: r.session.user.id ?? null }]);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { getIntentwiseAccountId } from "@/lib/forecast-redshift";
import type { AsinWindowSpec } from "@/lib/ppc-queries";
import { loadSearchTerms, loadKeywordInputs } from "@/lib/seo/ppc-status-data";
import { loadAsinTermWindows, loadClientLiveRows, loadS2Keywords, loadVersionTexts, versionKey } from "@/lib/seo/asin-live-data";
import { matchListingKeywords, type ListingText } from "@/lib/seo/listing-match";
import { buildAsinBlockRows, buildKeywordSet, buildSectionB, computeWindows, sectionATotals, type WindowDays } from "@/lib/seo/ppc-status";
import { loadClientScope } from "./client-scope";

export const maxDuration = 120;

const WINDOWS: WindowDays[] = [30, 60, 90];

export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { clientId } = await params;
  const sp = req.nextUrl.searchParams;
  const n = (WINDOWS.find((w) => String(w) === sp.get("window")) ?? 30) as WindowDays;
  const asinFilter = sp.get("asin");
  const today = new Date().toISOString().slice(0, 10);

  const [scope, liveRows] = await Promise.all([loadClientScope(clientId), loadClientLiveRows(clientId)]);
  const liveAsins = new Set(liveRows.map((r) => r.asin));
  const notTracked = scope.asins.filter((a) => !liveAsins.has(a));
  const shown = asinFilter ? liveRows.filter((r) => r.asin === asinFilter) : liveRows;
  const gapWindow = computeWindows(null, n, today).gapWindow;

  let texts: Map<string, ListingText>;
  try {
    texts = await loadVersionTexts(shown.map((r) => ({ asin: r.asin, version: r.versionNumber })));
  } catch {
    return NextResponse.json({ error: "Listing versions unavailable" }, { status: 502 });
  }
  const s2 = await loadS2Keywords([...new Set(shown.map((r) => r.projectId))]);

  const planned = shown.map((r) => {
    const w = computeWindows(r.liveDate, n, today);
    const text = texts.get(versionKey(r.asin, r.versionNumber));
    return {
      r,
      w,
      title: (text?.title ?? "").slice(0, 60),
      tracked: text ? matchListingKeywords(s2.get(r.projectId) ?? [], text) : [],
    };
  });

  const accountId = await getIntentwiseAccountId(clientId);
  const base = { windowDays: n, gapWindow, notTracked };
  if (accountId == null) {
    return NextResponse.json({ ...base, accountId: null, cachedAt: new Date().toISOString(), blocks: [], sectionB: null });
  }

  try {
    const specs: AsinWindowSpec[] = planned
      .filter((p) => p.w.status === "live" && p.w.before && p.w.after)
      .map((p) => ({ asin: p.r.asin, before: p.w.before!, after: p.w.after! }));
    const [win, gap, kwInputs] = await Promise.all([
      loadAsinTermWindows(accountId, specs, shown.map((r) => r.asin)),
      loadSearchTerms(accountId, gapWindow),
      loadKeywordInputs(scope.projectIds),
    ]);
    const shareOf = new Map(win.shares.map((s) => [s.asin, Number(s.shared_with) || 0]));
    const blocks = planned
      .map(({ r, w, title, tracked }) => {
        const isLive = w.status === "live" && w.before && w.after;
        const rows = isLive ? buildAsinBlockRows(tracked, win.rows.filter((x) => x.asin === r.asin), w.before!, w.after!) : [];
        return {
          asin: r.asin,
          title,
          projectId: r.projectId,
          projectName: r.projectName,
          version: r.versionNumber,
          liveDate: r.liveDate,
          status: isLive ? ("live" as const) : ("future" as const),
          windows: { before: w.before, after: w.after },
          // O3: the shares query returns a row for every advertised ASIN, so no row = not advertised.
          advertised: shareOf.has(r.asin),
          sharedWith: shareOf.get(r.asin) ?? 0,
          rows,
          totals: isLive ? sectionATotals(rows, w.before!, w.after!) : null,
        };
      })
      .sort((a, b) => (b.totals?.afterTotals.sales ?? -1) - (a.totals?.afterTotals.sales ?? -1));
    const cachedAt = new Date(Math.min(win.fetchedAt.getTime(), gap.fetchedAt.getTime())).toISOString();
    const { entries } = buildKeywordSet(kwInputs);
    return NextResponse.json({ ...base, accountId, cachedAt, blocks, sectionB: buildSectionB(entries, gap.rows) });
  } catch {
    return NextResponse.json({ error: "PPC data unavailable" }, { status: 502 });
  }
}

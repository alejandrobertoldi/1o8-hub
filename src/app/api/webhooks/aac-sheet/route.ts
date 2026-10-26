export const runtime = "nodejs";
export const maxDuration = 60;

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { parseSheet } from "@/lib/aac-sync/columns";
import { aacSheetConfigured, readAacGrid } from "@/lib/aac-sync/google";
import { syncAac } from "@/lib/aac-sync/sync";

function authorized(req: NextRequest, bodySecret?: string): boolean {
  const expected = process.env.AAC_SYNC_SECRET ?? "";
  const got = req.headers.get("x-aac-sync-secret") ?? bodySecret ?? "";
  if (!expected || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/**
 * POST /api/webhooks/aac-sheet — called by the Apps Script in the AAC sheet
 * when someone edits it (docs: LOCAL.md "AAC sheet sync"). Body: { row } (the
 * edited sheet row) or { full: true }. The sheet's edit is the newest, so it
 * wins a conflict here.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { row?: number; rows?: number[]; full?: boolean; secret?: string };
  if (!authorized(req, body.secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!aacSheetConfigured()) return NextResponse.json({ error: "AAC sheet sync is not configured" }, { status: 503 });

  if (body.full) {
    const r = await syncAac({ trigger: "sheet-edit", prefer: "sheet" });
    return NextResponse.json({ ok: true, toHub: r.toHub.length, toSheet: r.toSheet.length, created: r.createdInHub.length });
  }
  const rows = [...new Set([...(body.rows ?? []), ...(body.row ? [body.row] : [])])].filter((n) => Number.isInteger(n) && n > 0);
  if (!rows.length) return NextResponse.json({ error: "row is required" }, { status: 400 });

  const sheet = parseSheet(await readAacGrid());
  const codes = sheet.rows.filter((r) => rows.includes(r.rowNumber) && r.code).map((r) => r.code);
  if (!codes.length) return NextResponse.json({ ok: true, skipped: "Edited rows have no ClientIDCode yet" });
  const r = await syncAac({ trigger: "sheet-edit", codes, prefer: "sheet" });
  return NextResponse.json({ ok: true, codes, toHub: r.toHub.length, toSheet: r.toSheet.length, created: r.createdInHub.length });
}

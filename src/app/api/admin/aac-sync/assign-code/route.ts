export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { hasAdminPowers } from "@/lib/roles";
import { CODE_HEADER, parseSheet } from "@/lib/aac-sync/columns";
import { readAacGrid, writeAacCells } from "@/lib/aac-sync/google";
import { syncAac } from "@/lib/aac-sync/sync";

const schema = z.object({
  rowNumber: z.number().int().positive(),
  name: z.string().min(1),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,12}$/, "Use 2–12 letters or digits, like KSS"),
});

/**
 * POST — gives a code to a sheet row that has none (e.g. a client someone
 * started in the sheet): writes it into the sheet's code column, then syncs
 * that client, which creates it in the hub.
 */
export async function POST(req: NextRequest) {
  const s = await getAuthSession();
  if (!s || !hasAdminPowers(s.user.role)) return NextResponse.json({ error: "Only admins can do this" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { rowNumber, name, code } = parsed.data;

  const sheet = parseSheet(await readAacGrid());
  const row = sheet.rows.find((r) => r.rowNumber === rowNumber);
  if (!row || row.name !== name) return NextResponse.json({ error: "That sheet row changed. Refresh and try again." }, { status: 409 });
  if (row.code) return NextResponse.json({ error: `That row already has the code ${row.code}` }, { status: 409 });
  const taken =
    sheet.rows.some((r) => r.code.toUpperCase() === code) ||
    (await db.select({ c: aac.clientIdCode }).from(aac).where(sql`upper(${aac.clientIdCode}) = ${code}`).limit(1)).length > 0;
  if (taken) return NextResponse.json({ error: `The code ${code} is already used` }, { status: 409 });

  const codeCol = sheet.columns.find((c) => c.header === CODE_HEADER);
  if (!codeCol) return NextResponse.json({ error: "The sheet has no code column" }, { status: 500 });
  await writeAacCells([{ rowNumber, colIndex: codeCol.index, value: code }]);
  const r = await syncAac({ trigger: "manual", codes: [code], prefer: "sheet" });
  return NextResponse.json({ ok: true, code, created: r.createdInHub.length > 0 });
}

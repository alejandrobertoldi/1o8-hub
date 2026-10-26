import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac, aacSheetBaseline, aacSyncRuns, adminEventLog } from "@/lib/db/schema";
import { invalidateClientsCache } from "@/lib/clients-cache";
import { CODE_HEADER, READ_ONLY_IN_SHEET, columnForKey, hubValue, parseSheet } from "./columns";
import { appendAacRows, readAacGrid, writeAacCells, type CellWrite } from "./google";
import { mergeCell } from "./merge";

export type AacSyncTrigger = "manual" | "script" | "sheet-edit" | "hub-edit" | "daily";

export type AacChange = { code: string; key: string; from: string; to: string; conflict?: boolean };
export type AacSyncReport = {
  trigger: AacSyncTrigger;
  dryRun: boolean;
  toHub: AacChange[];
  toSheet: AacChange[];
  /** Sheet rows with a code the hub didn't have: created in the hub. */
  createdInHub: { code: string; name: string }[];
  /** Hub clients missing from the sheet: appended as new rows. */
  appendedToSheet: { code: string; name: string }[];
  /** Sheet rows without a ClientIDCode (the hub can't create them until one is set). */
  needsCode: { rowNumber: number; name: string; status: string }[];
  duplicates: string[];
};

export type AacSyncOptions = {
  trigger: AacSyncTrigger;
  dryRun?: boolean;
  /** Limit to these client codes (sheet-edit / hub-edit hooks). */
  codes?: string[];
  /** Who wins when both sides changed the same cell since the last sync. */
  prefer?: "hub" | "sheet";
};

const upper = (s: string) => s.trim().toUpperCase();

/** Status/name also live in typed columns; keep them in step with raw_data. */
function typedColumns(raw: Record<string, string>) {
  return { clientName: raw.ClientName || null, clientStatus: raw.ClientStatus || "Active" };
}

/**
 * Two-way sync between the hub's `aac` table and the "AAC 1o8" sheet.
 * Hub-only keys (Figma, socials, …) are never touched; the code column is the
 * identity and is never rewritten; MasterAACRow is sheet bookkeeping.
 */
export async function syncAac(opts: AacSyncOptions): Promise<AacSyncReport> {
  const dryRun = !!opts.dryRun;
  const [run] = await db.insert(aacSyncRuns).values({ trigger: opts.trigger, dryRun }).returning({ id: aacSyncRuns.id });
  try {
    const report = await doSync(opts, dryRun);
    await db.update(aacSyncRuns).set({ finishedAt: new Date(), report }).where(eq(aacSyncRuns.id, run.id));
    return report;
  } catch (err) {
    await db
      .update(aacSyncRuns)
      .set({ finishedAt: new Date(), error: err instanceof Error ? err.message : String(err) })
      .where(eq(aacSyncRuns.id, run.id));
    throw err;
  }
}

async function doSync(opts: AacSyncOptions, dryRun: boolean): Promise<AacSyncReport> {
  const sheet = parseSheet(await readAacGrid());
  const only = opts.codes?.length ? new Set(opts.codes.map(upper)) : null;
  const report: AacSyncReport = {
    trigger: opts.trigger,
    dryRun,
    toHub: [],
    toSheet: [],
    createdInHub: [],
    appendedToSheet: [],
    needsCode: [],
    duplicates: [],
  };

  const [hubRows, baselines, edits] = await Promise.all([
    db.select({ code: aac.clientIdCode, raw: aac.rawData }).from(aac),
    db.select().from(aacSheetBaseline),
    db
      .select({ code: adminEventLog.resourceId, detail: adminEventLog.detail })
      .from(adminEventLog)
      .where(and(eq(adminEventLog.action, "client:edit"), eq(adminEventLog.resourceType, "client"))),
  ]);
  const hubByCode = new Map(hubRows.map((r) => [upper(r.code), { code: r.code, raw: (r.raw ?? {}) as Record<string, string> }]));
  const baseByCode = new Map(baselines.map((b) => [upper(b.clientIdCode), b.values]));
  const hubEdited = new Set<string>();
  for (const e of edits) {
    const field = (e.detail as { field?: string } | null)?.field;
    const col = field ? columnForKey(sheet.columns, field) : undefined;
    if (e.code && col) hubEdited.add(`${upper(e.code)}|${col.key}`);
  }

  const syncable = sheet.columns.filter((c) => c.header !== CODE_HEADER);
  const sheetWrites: CellWrite[] = [];
  const hubUpdates: { code: string; raw: Record<string, string>; changed: AacChange[] }[] = [];
  const hubInserts: { code: string; raw: Record<string, string> }[] = [];
  const newBaselines: { code: string; values: Record<string, string> }[] = [];
  const seen = new Set<string>();

  for (const row of sheet.rows) {
    if (!row.code) {
      if (!only) report.needsCode.push({ rowNumber: row.rowNumber, name: row.name, status: row.values.ClientStatus ?? "" });
      continue;
    }
    const code = upper(row.code);
    if (seen.has(code)) {
      report.duplicates.push(`${row.code} (row ${row.rowNumber}, ${row.name})`);
      continue;
    }
    seen.add(code);
    if (only && !only.has(code)) continue;

    const hub = hubByCode.get(code);
    if (!hub) {
      // New in the sheet → create in the hub with every column (all mirror keys).
      const raw: Record<string, string> = {};
      for (const c of sheet.columns) for (const k of c.keys) if (row.values[c.key]) raw[k] = row.values[c.key];
      raw.ClientIDCode = row.code;
      hubInserts.push({ code: row.code, raw });
      report.createdInHub.push({ code: row.code, name: row.name });
      newBaselines.push({ code: row.code, values: Object.fromEntries(syncable.map((c) => [c.key, row.values[c.key] ?? ""])) });
      continue;
    }

    const base = baseByCode.get(code);
    const raw = { ...hub.raw };
    const agreed: Record<string, string> = {};
    const changed: AacChange[] = [];
    for (const col of syncable) {
      const sheetVal = row.values[col.key] ?? "";
      const hubVal = hubValue(raw, col);
      const d = mergeCell({
        sheet: sheetVal,
        hub: hubVal,
        base: base ? base[col.key] ?? "" : undefined,
        prefer: opts.prefer,
        hubEdited: hubEdited.has(`${code}|${col.key}`),
      });
      if (d.action === "toSheet" && READ_ONLY_IN_SHEET.has(col.header)) {
        agreed[col.key] = sheetVal;
        continue;
      }
      if (d.action === "toHub") {
        for (const k of col.keys) raw[k] = d.value;
        changed.push({ code: hub.code, key: col.key, from: hubVal, to: d.value, conflict: d.conflict });
        agreed[col.key] = d.value;
      } else if (d.action === "toSheet") {
        sheetWrites.push({ rowNumber: row.rowNumber, colIndex: col.index, value: d.value });
        report.toSheet.push({ code: hub.code, key: col.key, from: sheetVal, to: d.value, conflict: d.conflict });
        agreed[col.key] = d.value;
      } else {
        agreed[col.key] = hubVal;
      }
    }
    if (changed.length) {
      hubUpdates.push({ code: hub.code, raw, changed });
      report.toHub.push(...changed);
    }
    newBaselines.push({ code: hub.code, values: agreed });
  }

  // Hub clients the sheet doesn't have yet → append rows (hub is the source of truth).
  const appendRows: Record<number, string>[] = [];
  {
    for (const [code, hub] of hubByCode) {
      if (seen.has(code) || (only && !only.has(code))) continue;
      const cells: Record<number, string> = {};
      for (const c of sheet.columns) {
        const v = c.header === CODE_HEADER ? hub.code : hubValue(hub.raw, c);
        if (v && !READ_ONLY_IN_SHEET.has(c.header)) cells[c.index] = v;
      }
      appendRows.push(cells);
      report.appendedToSheet.push({ code: hub.code, name: hub.raw.ClientName ?? hub.code });
      newBaselines.push({ code: hub.code, values: Object.fromEntries(syncable.map((c) => [c.key, hubValue(hub.raw, c)])) });
    }
  }

  if (dryRun) return report;

  // Sheet first: if Google fails, the hub and the baseline stay as they were and the next run retries.
  await writeAacCells(sheetWrites);
  await appendAacRows(appendRows);

  for (const u of hubUpdates) {
    await db.update(aac).set({ rawData: u.raw, ...typedColumns(u.raw), updatedAt: new Date() }).where(eq(aac.clientIdCode, u.code));
  }
  for (const ins of hubInserts) {
    await db
      .insert(aac)
      .values({ clientIdCode: ins.code, rawData: ins.raw, ...typedColumns(ins.raw) })
      .onConflictDoNothing();
  }
  for (const b of newBaselines) {
    await db
      .insert(aacSheetBaseline)
      .values({ clientIdCode: b.code, values: b.values, syncedAt: new Date() })
      .onConflictDoUpdate({ target: aacSheetBaseline.clientIdCode, set: { values: b.values, syncedAt: new Date() } });
  }
  if (hubUpdates.length || hubInserts.length) invalidateClientsCache();

  // Activity: one line per client that changed on either side.
  const byClient = new Map<string, { toHub: AacChange[]; toSheet: AacChange[] }>();
  for (const c of report.toHub) (byClient.get(c.code) ?? byClient.set(c.code, { toHub: [], toSheet: [] }).get(c.code)!).toHub.push(c);
  for (const c of report.toSheet) (byClient.get(c.code) ?? byClient.set(c.code, { toHub: [], toSheet: [] }).get(c.code)!).toSheet.push(c);
  const logs = [...byClient].map(([code, ch]) => ({
    userEmail: null,
    userName: "AAC sheet sync",
    section: "clients",
    action: "aac-sync",
    status: ch.toHub.some((c) => c.conflict) || ch.toSheet.some((c) => c.conflict) ? "warning" : "success",
    resourceType: "client",
    resourceId: code,
    resourceLabel: `${code} ↔ AAC sheet`,
    message: [
      ch.toHub.length ? `From sheet: ${ch.toHub.map((c) => c.key).join(", ")}` : "",
      ch.toSheet.length ? `To sheet: ${ch.toSheet.map((c) => c.key).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    detail: { trigger: opts.trigger, toHub: ch.toHub, toSheet: ch.toSheet },
  }));
  if (logs.length) await db.insert(adminEventLog).values(logs).catch(() => {});
  return report;
}

/** Latest sync runs, newest first (admin page). */
export async function lastAacRuns(limit = 20) {
  return db.select().from(aacSyncRuns).orderBy(desc(aacSyncRuns.startedAt)).limit(limit);
}

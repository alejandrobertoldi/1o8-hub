/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Bidirectional sync between BigQuery and Supabase.
 *
 * Tables:
 *   - AAC (clients): Postgres is authoritative for existing rows. BQ only
 *     contributes new keys we haven't seen yet; never overwrites edits made
 *     in the hub UI. New clientIdCodes from BQ are INSERTed.
 *   - Attributes (column registry): BQ wins on conflict.
 *
 * Products sync handled separately by /api/cron/sync-bq (dirty-flag publish).
 */
import { BigQuery } from "@google-cloud/bigquery";
import { db } from "@/lib/db";
import { aac, attributes, adminEventLog } from "@/lib/db/schema";
import { invalidateClientsCache } from "@/lib/clients-cache";
import { eq } from "drizzle-orm";
import { bibleAppTable, bibleAppLocation } from "@/lib/bq-datasets";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";

function getBigQueryClient(): BigQuery {
  if (process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
    let privateKey = process.env.GCP_PRIVATE_KEY;
    privateKey = privateKey.replace(/\\n/g, "\n");
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = JSON.parse(privateKey);
    }
    return new BigQuery({
      projectId: PROJECT_ID,
      credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: privateKey,
      },
    });
  }
  return new BigQuery({ projectId: PROJECT_ID });
}

// ── Types ──────────────────────────────────────────────────────────────

export interface SyncTableResult {
  table: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  durationMs: number;
}

export interface SyncResult {
  tables: SyncTableResult[];
  totalDurationMs: number;
  triggeredBy: string;
}

// ── AAC Sync (BQ → Supabase) ──────────────────────────────────────────

async function syncAAC(): Promise<SyncTableResult> {
  const start = Date.now();
  const result: SyncTableResult = {
    table: "aac_clients",
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    const bq = getBigQueryClient();
    const [rows] = await bq.query({
      query: `SELECT * FROM \`${bibleAppTable("AAC")}\``,
      location: bibleAppLocation(),
    });

    for (const row of rows) {
      const clientIdCode = (row.ClientIDCode || "").trim();
      const clientStatus = (row.ClientStatus || "").trim();
      const clientName = (row.ClientName || "").trim();

      if (!clientIdCode) {
        result.skipped++;
        continue;
      }

      // Build raw data from BQ (all columns as strings)
      const bqRawData: Record<string, string> = {};
      for (const [key, val] of Object.entries(row)) {
        bqRawData[key] = val != null ? String(val) : "";
      }

      const powerbiUrl = (row.PowerBIDashboardURL || "").trim() || null;

      try {
        const [existing] = await db
          .select({ id: aac.id, rawData: aac.rawData })
          .from(aac)
          .where(eq(aac.clientIdCode, clientIdCode))
          .limit(1);

        if (existing) {
          // Postgres-authoritative: only fill in BQ keys we don't already have.
          // Never overwrite hub-edited values (status, name, powerbi, etc.).
          let pgRawData: Record<string, string> = {};
          if (typeof existing.rawData === "string") {
            try { pgRawData = JSON.parse(existing.rawData); } catch { /* ignore */ }
          } else if (existing.rawData) {
            pgRawData = existing.rawData as Record<string, string>;
          }

          const newKeys = Object.keys(bqRawData).filter((k) => !(k in pgRawData));
          if (newKeys.length === 0) {
            result.skipped++;
          } else {
            const mergedRawData = { ...bqRawData, ...pgRawData };
            await db
              .update(aac)
              .set({
                rawData: mergedRawData,
                updatedAt: new Date(),
              })
              .where(eq(aac.id, existing.id));
            result.updated++;
          }
        } else {
          await db.insert(aac).values({
            clientIdCode,
            clientStatus,
            clientName: clientName || null,
            powerbiEmbedUrl: powerbiUrl,
            rawData: bqRawData,
          });
          result.inserted++;
        }
      } catch (err) {
        result.errors.push(
          `${clientIdCode}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } catch (err) {
    result.errors.push(
      `BQ query failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // One call for the whole batch, not one per row.
  if (result.inserted > 0 || result.updated > 0) {
    invalidateClientsCache();
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ── Attributes Sync (BQ → Supabase) ───────────────────────────────────

async function syncAttributes(): Promise<SyncTableResult> {
  const start = Date.now();
  const result: SyncTableResult = {
    table: "attributes",
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    const bq = getBigQueryClient();
    const [rows] = await bq.query({
      query: `SELECT * FROM \`${bibleAppTable("Attributes")}\` ORDER BY CAST(MasterAttributeRow AS INT64)`,
      location: bibleAppLocation(),
    });

    for (const row of rows) {
      const generalLabel = (row.GeneralLabel || "").trim();
      if (!generalLabel) {
        result.skipped++;
        continue;
      }

      const values = {
        generalLabel,
        description: row.LabelDetails || null,
        scLabel: row.SpecificLabel || null,
        vcLabel: row.VCLabel || null,
        bqLabel: row.BigqueryLabel || null,
        sbLabel: row.SBLabel || null,
        alrLabel: row.ALRLabel || null,
        clrLabel: row.CLRLabel || null,
        bqDataType: row.BQDataType || "STRING",
        labelMaxOptions: row.LabelMaxOptions || null,
        referenceGroup: row.ReferenceGroup || "",
        subgroup: row.Subgroup || "",
        isEssential: row.Essential === "true",
      };

      try {
        const [existing] = await db
          .select({ id: attributes.id })
          .from(attributes)
          .where(eq(attributes.generalLabel, generalLabel))
          .limit(1);

        if (existing) {
          await db
            .update(attributes)
            .set(values)
            .where(eq(attributes.id, existing.id));
          result.updated++;
        } else {
          await db.insert(attributes).values(values);
          result.inserted++;
        }
      } catch (err) {
        result.errors.push(
          `${generalLabel}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } catch (err) {
    result.errors.push(
      `BQ query failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ── Main sync orchestrator ─────────────────────────────────────────────

export async function syncAllTables(
  triggeredBy: string,
  tables?: string[]
): Promise<SyncResult> {
  const start = Date.now();
  const results: SyncTableResult[] = [];

  const syncAll = !tables || tables.length === 0;

  if (syncAll || tables?.includes("aac_clients")) {
    console.log("[Sync] Starting AAC sync...");
    const r = await syncAAC();
    results.push(r);
    console.log(`[Sync] AAC done: ${r.inserted}i/${r.updated}u/${r.skipped}s in ${r.durationMs}ms`);
  }

  if (syncAll || tables?.includes("attributes")) {
    console.log("[Sync] Starting Attributes sync...");
    const r = await syncAttributes();
    results.push(r);
    console.log(`[Sync] Attributes done: ${r.inserted}i/${r.updated}u/${r.skipped}s in ${r.durationMs}ms`);
  }

  const totalDurationMs = Date.now() - start;

  // Log to admin event log
  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

  await db
    .insert(adminEventLog)
    .values({
      userEmail: triggeredBy,
      userName: triggeredBy,
      section: "sync",
      action: "sync:tables",
      status: totalErrors > 0 ? "warning" : "success",
      resourceType: "sync",
      resourceId: "bq-to-supabase",
      resourceLabel: `Synced ${results.map((r) => r.table).join(", ")}`,
      message: `${totalInserted} inserted, ${totalUpdated} updated, ${totalErrors} errors`,
      detail: { results },
      durationMs: totalDurationMs,
    })
    .catch(() => {});

  return { tables: results, totalDurationMs, triggeredBy };
}

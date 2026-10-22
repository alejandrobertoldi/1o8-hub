import { db } from "@/lib/db";
import { attributes } from "@/lib/db/schema";
import { isNotNull } from "drizzle-orm";

export interface AlrFieldEntry {
  generalLabel: string;
  sbLabel: string | null;
}
export type AlrFieldMap = Record<string, AlrFieldEntry>;

interface Row {
  generalLabel: string;
  alrLabel: string | null;
  sbLabel: string | null;
}

/**
 * Build an ALR header → field-entry map from attribute rows. Pure function:
 * the DB-backed `loadAlrFieldMap` calls this after fetching rows. Rows whose
 * `alrLabel` is null are dropped (they have no ALR mapping).
 */
export function fieldMapFromRows(rows: Row[]): AlrFieldMap {
  const map: AlrFieldMap = {};
  for (const r of rows) {
    if (!r.alrLabel) continue;
    map[r.alrLabel] = { generalLabel: r.generalLabel, sbLabel: r.sbLabel };
  }
  return map;
}

/**
 * Load the ALR header map from the `attributes` table. The map is keyed by
 * the literal ALR header (e.g. "seller-sku") and yields the canonical
 * generalLabel + sb_label — the latter steers which master.* core column the
 * value lands in (see SB_TO_CORE_FIELD in alr-parser.ts).
 */
export async function loadAlrFieldMap(): Promise<AlrFieldMap> {
  const rows = await db
    .select({
      generalLabel: attributes.generalLabel,
      alrLabel: attributes.alrLabel,
      sbLabel: attributes.sbLabel,
    })
    .from(attributes)
    .where(isNotNull(attributes.alrLabel));
  return fieldMapFromRows(rows);
}

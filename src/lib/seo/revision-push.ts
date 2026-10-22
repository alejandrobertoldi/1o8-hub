import { FIELD_MAP } from "@/app/api/seo/projects/[id]/migrate-to-products/field-map";
import { CORE_COLUMNS } from "@/lib/column-registry";
import { bqNameFor, currentValue, overlayProduct, type FieldSource, type RevisionFields } from "./revision-fields";

type PushSource = FieldSource & { rawColumnValues: unknown; changeLog: unknown };
type LogEntry = { field: string; oldValue: string | null; newValue: string; changedBy: string; changedAt: string };

export function buildPushUpdate(product: PushSource, fields: RevisionFields, userEmail: string, nowIso: string) {
  const overlaid = overlayProduct(product, fields);
  const rawValues = { ...((product.rawColumnValues as Record<string, string>) ?? {}) };
  const changeLog: LogEntry[] = [...((Array.isArray(product.changeLog) ? product.changeLog : []) as LogEntry[])];
  let fieldsChanged = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (!FIELD_MAP[key]) continue;
    const bq = bqNameFor(key);
    const oldValue = currentValue(product, key);
    rawValues[bq] = value;
    if (oldValue !== value) changeLog.push({ field: bq, oldValue, newValue: value, changedBy: userEmail, changedAt: nowIso });
    fieldsChanged++;
  }
  const updates: Record<string, unknown> = {
    contentSeo: overlaid.contentSeo,
    rawColumnValues: rawValues,
    changeLog,
    isDirty: true,
    updatedAt: new Date(nowIso),
  };
  for (const key of Object.keys(fields)) {
    const m = FIELD_MAP[key];
    if (m?.target === "core") updates[m.field] = (overlaid as unknown as Record<string, unknown>)[m.field];
  }
  return { updates, fieldsChanged };
}

/** Mapped fields edited in the catalog after the revision was approved (spec §7 drift warning). */
export function findDrift(changeLog: unknown, fields: RevisionFields, approvedAtIso: string) {
  if (!Array.isArray(changeLog)) return [];
  const byBq = new Map<string, string>();
  for (const k of Object.keys(fields)) {
    const m = FIELD_MAP[k];
    if (!m) continue;
    // Map push-log name (from bqNameFor)
    byBq.set(bqNameFor(k), k);
    // Map registry name for core fields (catalog edits log the registry name)
    if (m.target === "core") {
      const registryCol = CORE_COLUMNS.find((c) => c.coreField === m.field);
      if (registryCol) byBq.set(registryCol.bqName, k);
    }
  }
  const latest = new Map<string, { key: string; changedAt: string; changedBy: string; newValue: unknown }>();
  for (const e of changeLog as Array<{ field?: string; changedAt?: string; changedBy?: string; newValue?: unknown }>) {
    const key = e?.field ? byBq.get(e.field) : undefined;
    if (!key || !e.changedAt || e.changedAt <= approvedAtIso) continue;
    const prev = latest.get(key);
    if (!prev || e.changedAt > prev.changedAt) latest.set(key, { key, changedAt: e.changedAt, changedBy: e.changedBy ?? "", newValue: e.newValue });
  }
  // The latest entry only counts as drift if it differs from the text being pushed
  // (a previous push of the same revision logs the same newValue).
  return [...latest.values()]
    .filter((d) => d.newValue !== fields[d.key])
    .map(({ key, changedAt, changedBy }) => ({ key, changedAt, changedBy }));
}

import { and, eq, isNull, sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Legacy names end `_vNN`; the SEO naming convention (project-naming.ts) uses `_VNN`.
const SUFFIX = /_[vV](\d+)$/;

export function stripVersionSuffix(name: string): string {
  return name.replace(SUFFIX, "");
}

/** `base_vNN` where NN is the highest existing suffix for that base + 1. */
export function nextVersionedName(baseName: string, existingNames: string[]): string {
  let max = 0;
  for (const n of existingNames) {
    const m = SUFFIX.exec(n);
    if (m && n.slice(0, m.index) === baseName) max = Math.max(max, Number(m[1]));
  }
  const v = /_SEO$/.test(baseName) ? "V" : "v";
  return `${baseName}_${v}${String(max + 1).padStart(2, "0")}`;
}

const GROUP_PLACEHOLDER = "_G##_";

/**
 * Resolves the `G##` group number in a new-convention base name: reuse the
 * number of an existing group with the same label (a new version of the same
 * group), otherwise the client's highest group number + 1.
 */
export function resolveGroupPlaceholder(baseName: string, clientIdCode: string, existingNames: string[]): string {
  const at = baseName.indexOf(GROUP_PLACEHOLDER);
  if (at === -1) return baseName;
  const rest = baseName.slice(at + GROUP_PLACEHOLDER.length); // "{label}_SEO"
  const prefix = `${clientIdCode}_G`;
  let max = 0;
  for (const n of existingNames) {
    if (!n.startsWith(prefix)) continue;
    const m = /^(\d+)_(.+?)_[vV]\d+$/.exec(n.slice(prefix.length));
    if (!m) continue;
    if (m[2] === rest) return baseName.replace(GROUP_PLACEHOLDER, `_G${m[1]}_`);
    max = Math.max(max, Number(m[1]));
  }
  return baseName.replace(GROUP_PLACEHOLDER, `_G${String(max + 1).padStart(2, "0")}_`);
}

/**
 * Server-authoritative project name for a new version of `requestedName`
 * within a client. Must run inside a transaction: the advisory lock keyed by
 * client+base stops two concurrent creates from picking the same number.
 */
export async function allocateVersionedProjectName(
  tx: Tx,
  clientIdCode: string | null,
  requestedName: string,
  opts: { lock?: boolean } = {}
): Promise<string> {
  let baseName = stripVersionSuffix(requestedName);
  if (clientIdCode && baseName.includes(GROUP_PLACEHOLDER)) {
    const groupRows = await tx
      .select({ name: seoProjects.name })
      .from(seoProjects)
      .where(
        and(
          eq(seoProjects.clientIdCode, clientIdCode),
          sql`${seoProjects.name} ~ ${`^${clientIdCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_G\\d+_`}`
        )
      );
    baseName = resolveGroupPlaceholder(baseName, clientIdCode, groupRows.map((r) => r.name));
  }
  // Preview callers pass lock:false — they run outside a transaction and write nothing.
  if (opts.lock !== false) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${clientIdCode ?? ""}:${baseName}`}))`);
  }
  const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rows = await tx
    .select({ name: seoProjects.name })
    .from(seoProjects)
    .where(
      and(
        clientIdCode == null ? isNull(seoProjects.clientIdCode) : eq(seoProjects.clientIdCode, clientIdCode),
        sql`${seoProjects.name} ~ ${`^${escapedBase}_[vV]\\d+$`}`
      )
    );
  return nextVersionedName(baseName, rows.map((r) => r.name));
}

/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Backfill users.image from Google Workspace profile photos stored in Supabase.
 *
 *   npx tsx scripts/backfill-avatars.ts --dry-run          # read-only: counts only
 *   npx tsx scripts/backfill-avatars.ts                    # LIVE: uploads + prod UPDATEs
 *   npx tsx scripts/backfill-avatars.ts --restore=<file>   # LIVE: roll users.image back
 *
 * Every mode first snapshots SELECT id,email,image FROM users to
 * ~/mfhub-backups/avatars-snapshot-<ISO>.json. LIVE aborts if that fails.
 * Idempotent: the stored URL carries a content hash, so unchanged photos
 * produce no UPDATE on re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Row = { id: string; email: string; image: string | null };

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const restoreArg = args.find((a) => a.startsWith("--restore="));

  if (dryRun && restoreArg) {
    console.error("refusing: --dry-run and --restore cannot be combined");
    return 2;
  }

  // Import AFTER config(): a static import is hoisted above it and the db
  // would silently connect to localhost.
  const { db } = await import("../src/lib/db");
  const { users } = await import("../src/lib/db/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { captureUserAvatar, isOrgEmail } = await import("../src/lib/avatars/capture");
  const { isStoredAvatarUrl } = await import("../src/lib/avatars/url");

  // ── Snapshot (every mode) ────────────────────────────────────────────
  const all: Row[] = await db.select({ id: users.id, email: users.email, image: users.image }).from(users);
  const dir = join(homedir(), "mfhub-backups");
  mkdirSync(dir, { recursive: true });
  const snapPath = join(dir, `avatars-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(snapPath, JSON.stringify(all, null, 2));
  console.log(`snapshot: ${all.length} users → ${snapPath}`);

  // ── Restore ──────────────────────────────────────────────────────────
  if (restoreArg) {
    const file = restoreArg.slice("--restore=".length);
    let rows: Row[];
    try {
      rows = JSON.parse(readFileSync(file, "utf8")) as Row[];
    } catch (e) {
      console.error(`refusing: ${file} is not an avatars snapshot (JSON parse failed)`);
      return 2;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      console.error(`refusing: ${file} is not an avatars snapshot (not a non-empty array)`);
      return 2;
    }
    for (const r of rows) {
      if (typeof r.id !== "string" || typeof r.email !== "string" || (r.image !== null && typeof r.image !== "string")) {
        console.error(`refusing: ${file} is not an avatars snapshot (row has invalid shape)`);
        return 2;
      }
    }
    let restored = 0;
    let missing = 0;
    for (const r of rows) {
      const result = await db.update(users).set({ image: r.image }).where(eq(users.id, r.id)).returning({ id: users.id });
      if (result.length > 0) {
        restored++;
      } else {
        missing++;
      }
    }
    console.log(`restored users.image for ${restored} users from ${file} (${missing} ids not found)`);
    return 0;
  }

  // ── Capture ──────────────────────────────────────────────────────────
  const targets: Row[] = await db
    .select({ id: users.id, email: users.email, image: users.image })
    .from(users)
    .where(sql`${users.employmentStatus} = 'active' and lower(${users.email}) like '%@marketfoundry.agency'`);
  console.log(`mode: ${dryRun ? "DRY-RUN (no uploads, no DB writes)" : "LIVE"}`);
  console.log(`targets: ${targets.length} active org users (of ${all.length} total, ${all.filter((u) => isOrgEmail(u.email)).length} org of any status)`);

  const c = { stored: 0, wouldStore: 0, unchanged: 0, noPhoto: 0, skipped: 0, errors: 0 };
  const replacing = { fromNull: 0, fromGoogleOrOther: 0, fromStored: 0 };
  const noPhoto: string[] = [];
  const errors: string[] = [];

  for (const u of targets) {
    try {
      const r = await captureUserAvatar({ id: u.id, email: u.email }, { dryRun });
      if (r.status === "skipped") { c.skipped++; continue; }
      if (r.status === "no-photo") { c.noPhoto++; noPhoto.push(u.email); continue; }
      if (u.image === null) replacing.fromNull++;
      else if (isStoredAvatarUrl(u.image)) replacing.fromStored++;
      else replacing.fromGoogleOrOther++;
      if (r.status === "would-store") { c.wouldStore++; continue; }
      if (r.url === u.image) { c.unchanged++; continue; }
      await db.update(users).set({ image: r.url }).where(eq(users.id, u.id));
      c.stored++;
    } catch (e) {
      c.errors++;
      errors.push(`${u.email}: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  console.log("\n── summary ──");
  console.log(dryRun ? `would store: ${c.wouldStore}` : `stored (users.image updated): ${c.stored}   unchanged: ${c.unchanged}`);
  console.log(`  of which currently NULL: ${replacing.fromNull} | Google/other URL: ${replacing.fromGoogleOrOther} | already stored: ${replacing.fromStored}`);
  console.log(`no photo in directory (keep current value): ${c.noPhoto}`);
  console.log(`skipped (non-org): ${c.skipped}`);
  console.log(`errors: ${c.errors}`);
  if (noPhoto.length) console.log(`\nno-photo users:\n  ${noPhoto.join("\n  ")}`);
  if (errors.length) console.log(`\nerrors:\n  ${errors.join("\n  ")}`);
  return c.errors ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => { console.error(e); process.exit(1); });

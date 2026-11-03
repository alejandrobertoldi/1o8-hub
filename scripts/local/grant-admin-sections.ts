/**
 * One-off (2026-11-03): super admins and admins stop seeing the hub sections
 * by role and follow their Admin → Users checkboxes instead (sectionBypass in
 * src/lib/permissions.ts). Run this BEFORE deploying that change: it checks
 * the sections they see today, so nothing changes until an owner unticks one.
 *   - admins:       calendar, team, clients, seo, activity
 *   - super admins: the same + new-business (they had it by role)
 * Dry run by default; --apply writes. --prod targets production.
 *
 *   npm run access:admin-sections -- [--prod] [--apply]
 */
import { eq, inArray } from "drizzle-orm";

const ADMIN_SECTIONS = ["calendar", "team", "clients", "seo", "activity"];
const SUPER_ADMIN_SECTIONS = [...ADMIN_SECTIONS, "new-business"];

async function main() {
  const apply = process.argv.includes("--apply");
  if (process.argv.includes("--prod")) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is missing from .env.local");
    process.env.DATABASE_URL = url;
  }
  const { db } = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");

  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, allowedSections: users.allowedSections })
    .from(users)
    .where(inArray(users.role, ["super_admin", "admin"]));

  const changes = rows
    .map((u) => {
      const current = (u.allowedSections as string[] | null) ?? [];
      const grant = u.role === "super_admin" ? SUPER_ADMIN_SECTIONS : ADMIN_SECTIONS;
      const added = grant.filter((s) => !current.includes(s));
      return { ...u, current, added };
    })
    .filter((u) => u.added.length > 0);

  console.log(`Super admins / admins: ${rows.length}`);
  for (const u of changes) console.log(`  ${u.name ?? u.email} (${u.role}): + ${u.added.join(", ")}`);
  if (!changes.length) console.log("  Nothing to add.");

  if (!apply || !changes.length) {
    if (changes.length) console.log("\nDry run — nothing written. Add --apply to make these changes.");
    process.exit(0);
  }
  for (const u of changes) {
    await db.update(users).set({ allowedSections: [...u.current, ...u.added], updatedAt: new Date() }).where(eq(users.id, u.id));
  }
  console.log(`\nApplied to ${changes.length} user(s). Signed-in people pick it up within the hub's short auth-cache window.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

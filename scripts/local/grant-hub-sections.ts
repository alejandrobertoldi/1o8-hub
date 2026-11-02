/**
 * One-off access cleanup (2026-11-02 roles audit):
 *  - every editor with no sections gets the hub's standard ones
 *    (calendar, team, clients, timeline, seo), like the editors set by hand;
 *  - Manu Lancharro's stray client link ("Lancharro", not a client) is cleared.
 * Dry run by default; --apply writes. --prod targets production. Signed-in
 * people pick the change up within the hub's short auth-cache window.
 *
 *   npm run access:cleanup -- [--prod] [--apply]
 */
import { and, eq, sql } from "drizzle-orm";

const STANDARD = ["calendar", "team", "clients", "timeline", "seo"];
const STRAY_CLIENT_LINKS = [{ email: "manuel.lancharro@1o8.agency", client: "Lancharro" }];

async function main() {
  const apply = process.argv.includes("--apply");
  if (process.argv.includes("--prod")) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is missing from .env.local");
    process.env.DATABASE_URL = url;
  }
  const { db } = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");

  const empty = sql`coalesce(jsonb_array_length(${users.allowedSections}), 0) = 0`;
  const editors = await db.select({ email: users.email, name: users.name }).from(users).where(and(eq(users.role, "editor"), empty));
  console.log(`Editors without sections (${editors.length}): ${editors.map((e) => e.name ?? e.email).join(", ") || "none"}`);
  const stray = [];
  for (const s of STRAY_CLIENT_LINKS) {
    const [u] = await db.select({ email: users.email }).from(users).where(and(eq(users.email, s.email), eq(users.clientIdCode, s.client)));
    if (u) stray.push(u.email);
  }
  console.log(`Stray client links to clear: ${stray.join(", ") || "none"}`);

  if (!apply) {
    console.log("\nDry run — nothing written. Add --apply to make these changes.");
    process.exit(0);
  }
  if (editors.length) await db.update(users).set({ allowedSections: STANDARD, updatedAt: new Date() }).where(and(eq(users.role, "editor"), empty));
  for (const email of stray) await db.update(users).set({ clientIdCode: null, updatedAt: new Date() }).where(eq(users.email, email));
  console.log(`\nApplied: ${editors.length} editor(s) got ${STANDARD.join(", ")}; ${stray.length} client link(s) cleared.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Read-only access audit: every hub user with role, extra sections, client
 * link, employment status and last login, plus the things worth a second
 * look (too many owners/admins, ex-employees still holding a staff role,
 * outside emails with staff access, pending sign-ups…). Changes nothing.
 *
 *   npm run audit:roles            # local DB
 *   npm run audit:roles -- --prod  # production DB
 */
import { asc } from "drizzle-orm";

const ORDER = ["owner", "super_admin", "admin", "editor", "viewer", "client", "prospect", "pending"];
const STAFF = new Set(["owner", "super_admin", "admin", "editor", "viewer"]);
const DOMAIN = "@1o8.agency";

async function main() {
  if (process.argv.includes("--prod")) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is missing from .env.local");
    process.env.DATABASE_URL = url;
  }
  // Imported after DATABASE_URL is settled: the db module connects on import.
  const { db } = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");
  const rows = await db
    .select({
      email: users.email,
      name: users.name,
      role: users.role,
      isSuperAdmin: users.isSuperAdmin,
      sections: users.allowedSections,
      client: users.clientIdCode,
      employment: users.employmentStatus,
      lastLogin: users.lastLoginAt,
    })
    .from(users)
    .orderBy(asc(users.name));
  rows.sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || (a.name ?? a.email).localeCompare(b.name ?? b.email));

  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "never");
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
  console.log(`${"ROLE".padEnd(12)} ${"NAME".padEnd(24)} ${"EMAIL".padEnd(36)} ${"EMPLOYMENT".padEnd(10)} ${"LAST LOGIN".padEnd(10)}  CLIENT / SECTIONS`);
  for (const r of rows) {
    const sections = Array.isArray(r.sections) ? (r.sections as string[]) : [];
    const extra = [r.client ? `client=${r.client}` : "", sections.length ? `sections=${sections.join(",")}` : ""].filter(Boolean).join(" ");
    console.log(
      `${cut(r.role + (r.isSuperAdmin ? "*" : ""), 12)} ${cut(r.name ?? "—", 24)} ${cut(r.email, 36)} ${cut(r.employment ?? "—", 10)} ${day(r.lastLogin).padEnd(10)}  ${extra}`,
    );
  }

  const count: Record<string, number> = {};
  for (const r of rows) count[r.role] = (count[r.role] ?? 0) + 1;
  console.log(`\nTotals: ${ORDER.filter((k) => count[k]).map((k) => `${k} ${count[k]}`).join(" · ")}`);

  const flags: string[] = [];
  const top = rows.filter((r) => r.role === "owner" || r.role === "super_admin" || r.isSuperAdmin);
  flags.push(`Owner / super admin (see pay & payment, manage everyone): ${top.map((r) => r.name ?? r.email).join(", ") || "none"}`);
  flags.push(`Admins (manage users, settings, integrations, approve time off): ${rows.filter((r) => r.role === "admin").map((r) => r.name ?? r.email).join(", ") || "none"}`);
  for (const r of rows) {
    const who = `${r.name ?? r.email} <${r.email}>`;
    if (r.isSuperAdmin && r.role !== "super_admin" && r.role !== "owner") flags.push(`${who}: legacy is_super_admin flag set on a ${r.role}`);
    if (STAFF.has(r.role) && r.employment && r.employment !== "active") flags.push(`${who}: ${r.employment} but still has staff role "${r.role}"`);
    if (STAFF.has(r.role) && !r.email.toLowerCase().endsWith(DOMAIN)) flags.push(`${who}: outside email with staff role "${r.role}"`);
    if ((r.role === "client" || r.role === "prospect") && !r.client) flags.push(`${who}: ${r.role} with no client linked`);
    if (r.role === "pending") flags.push(`${who}: pending sign-up waiting for a decision`);
    if (STAFF.has(r.role) && !r.lastLogin) flags.push(`${who}: ${r.role} who has never signed in (placeholder or unused account?)`);
  }
  console.log(`\nWorth a look:\n${flags.map((f) => `  - ${f}`).join("\n")}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

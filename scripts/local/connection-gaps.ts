/**
 * Read-only: for every active client, which connections and accesses are
 * still missing (the "Connections" section of the onboarding checklist, which
 * only asks for what the client's services need). Prints a list per client
 * and a list per connection, to work through.
 *
 *   npm run onboarding:gaps            # local DB
 *   npm run onboarding:gaps -- --prod  # production (SUPABASE_DATABASE_URL)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  if (process.argv.includes("--prod")) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is missing from .env.local");
    process.env.DATABASE_URL = url;
    process.env.DB_POOLER = "transaction";
  }
  const { db } = await import("@/lib/db");
  const { aac } = await import("@/lib/db/schema");
  const { loadClientChecklists } = await import("@/lib/onboarding/checklist-server");

  const clients = await db.select({ code: aac.clientIdCode, name: aac.clientName, status: aac.clientStatus }).from(aac);
  const active = clients.filter((c) => (c.status ?? "").toLowerCase() === "active");
  const checklists = await loadClientChecklists(active.map((c) => c.code));

  const byItem = new Map<string, string[]>();
  console.log("Missing connections / accesses, by client (active clients)\n");
  for (const c of active.sort((a, b) => a.code.localeCompare(b.code))) {
    const conn = checklists.get(c.code)?.sections.find((s) => s.key === "connections");
    if (!conn) continue;
    const missing = conn.items.filter((i) => i.state === "missing");
    for (const i of missing) byItem.set(i.label, [...(byItem.get(i.label) ?? []), c.code]);
    console.log(`${c.code.padEnd(5)} ${(c.name ?? "").slice(0, 26).padEnd(27)} ${conn.done}/${conn.total}  ${missing.length ? missing.map((i) => i.label).join(" · ") : "all connected"}`);
  }
  console.log("\nBy connection\n");
  for (const [label, codes] of [...byItem].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${label} (${codes.length}): ${codes.join(", ")}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

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
  const { serviceNeeds } = await import("@/lib/onboarding/checklist");
  const { clientsWithGoogleAdsSpend, loadClientChecklists } = await import("@/lib/onboarding/checklist-server");

  const clients = await db.select({ code: aac.clientIdCode, name: aac.clientName, status: aac.clientStatus, raw: aac.rawData }).from(aac);
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

  // Google Ads numbers come through GA4 (its Google Ads link), so a client is
  // connected once its GA4 property reports Google Ads spend.
  const spent = await clientsWithGoogleAdsSpend(60);
  console.log("\nGoogle Ads → GA4 (clients whose services include Google Ads; spend in the last 60 days)\n");
  for (const c of active.sort((a, b) => a.code.localeCompare(b.code))) {
    const raw = (c.raw ?? {}) as Record<string, string>;
    const needs = serviceNeeds(raw);
    if (!needs.anyService || !needs.googleAds) continue;
    const id = raw.GoogleAdsCustomerId?.trim();
    const total = spent.get(c.code.toUpperCase());
    const state = total
      ? `linked ✓ ($${Math.round(total).toLocaleString("en-US")} spend)`
      : !raw.GA4Property?.trim()
        ? "pick the GA4 property first"
        : "no Google Ads spend in GA4 → link Google Ads to the GA4 property";
    console.log(`${c.code.padEnd(5)} Ads ID ${(id || "—").padEnd(13)} ${state}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

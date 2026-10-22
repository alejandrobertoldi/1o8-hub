/**
 * Seeds the org chart (org_positions) from the "2026 Org Chart" transcription
 * in src/lib/team/org-chart-seed.ts. Refuses if seats exist; --reset replaces them.
 *
 * Usage: npm run seed:org-chart [-- --reset]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { seedOrgChart } = await import("../../src/lib/team/org-chart");
  const r = await seedOrgChart({ reset: process.argv.includes("--reset") });
  console.log(`Org chart seeded: ${r.seats} seats (${r.open} open).`);
  if (r.unmatched.length) console.log(`Not found in the team (seat left open): ${r.unmatched.join(", ")}`);
  process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

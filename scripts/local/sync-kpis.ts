/**
 * Pulls every client's KPI sources (GA4, Meta, Klaviyo) into kpi_daily, like
 * the daily cron, and prints what came back per client and source.
 *
 *   npm run sync:kpis              # all clients, local DB
 *   npm run sync:kpis -- ELK       # one client
 *   npm run sync:kpis -- --prod    # production DB (first backfill: no Vercel time limit)
 *   npm run sync:kpis -- --full    # re-read the whole ~13 months (after adding a metric)
 */

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--prod")) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is missing from .env.local");
    process.env.DATABASE_URL = url;
  }
  // Imported after DATABASE_URL is settled: the db module connects on import.
  const { syncKpis } = await import("@/lib/kpi/sync");
  const only = args.find((a) => !a.startsWith("--"))?.toUpperCase();
  const r = await syncKpis("script", only, { full: args.includes("--full") });
  for (const c of r.clients) console.log(`${c.code.padEnd(5)} ${c.source.padEnd(8)} ${c.error ? `ERROR ${c.error.slice(0, 160)}` : `${c.days} days`}`);
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

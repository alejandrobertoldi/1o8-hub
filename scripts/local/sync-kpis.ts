/**
 * Pulls every client's KPI sources (GA4, Meta, Klaviyo) into kpi_daily, like
 * the daily cron, and prints what came back per client and source.
 *
 *   npm run sync:kpis              # all clients
 *   npm run sync:kpis -- ELK       # one client
 */
import { syncKpis } from "@/lib/kpi/sync";

async function main() {
  const only = process.argv[2]?.toUpperCase();
  const r = await syncKpis("script", only);
  for (const c of r.clients) console.log(`${c.code.padEnd(5)} ${c.source.padEnd(8)} ${c.error ? `ERROR ${c.error.slice(0, 160)}` : `${c.days} days`}`);
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

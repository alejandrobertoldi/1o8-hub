/**
 * Manual/local runner for the nightly enqueuer.
 *
 * Run: npm run archive-enqueue
 * Scoped smoke test: npm run archive-enqueue -- --only-table=schema.table --only-account=12345
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

async function main() {
  const { runNightlyEnqueue } = await import("../src/lib/archive/enqueuer");

  const args = process.argv.slice(2);
  const onlyTable = args.find((a) => a.startsWith("--only-table="))?.slice("--only-table=".length);
  const onlyAccount = args.find((a) => a.startsWith("--only-account="))?.slice("--only-account=".length);

  const result = await runNightlyEnqueue(new Date(), { onlyTable, onlyAccount });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

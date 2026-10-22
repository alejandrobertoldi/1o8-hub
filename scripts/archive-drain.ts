/**
 * Manual/local runner for the drainer.
 *
 * Run: npm run archive-drain
 * Scoped smoke test (process at most N units): npm run archive-drain -- --limit=1
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

async function main() {
  const { runDrain, DRAIN_BUDGET_MS } = await import("../src/lib/archive/drainer");
  const { parseLimitArg } = await import("../src/lib/archive/cli-args");

  const args = process.argv.slice(2);
  const limit = parseLimitArg(args);

  const result = await runDrain({ budgetMs: DRAIN_BUDGET_MS, limit });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

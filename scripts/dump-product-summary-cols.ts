import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { queryRedshift } from "../src/lib/redshift";

async function main() {
  // svv_external_columns has: schemaname, tablename, columnname, external_type, columnnum
  const cols = await queryRedshift<{ columnname: string; external_type: string }>(
    `SELECT columnname, external_type
     FROM svv_external_columns
     WHERE schemaname='intentwise_ecommerce_graph' AND tablename='product_summary'
     ORDER BY columnnum`
  );
  console.log(`${cols.length} columns:`);
  for (const c of cols) console.log(`  ${c.columnname}  (${c.external_type})`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

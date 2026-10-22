import { config } from "dotenv"; import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!.replace(":6543/", ":5432/"), { ssl: "require" });
(async () => {
  const rows = await sql`
    SELECT sku, asin,
      variations->>'Flavor' as var_flavor,
      variations->>'Size' as var_size,
      raw_column_values->>'Flavor' as raw_flavor,
      raw_column_values->>'Size' as raw_size,
      other_attributes->>'Flavor' as other_flavor,
      jsonb_typeof(variations) as var_type,
      jsonb_typeof(raw_column_values) as raw_type
    FROM master WHERE client_id_code = 'ZIN_SC_US' LIMIT 10`;
  console.log(JSON.stringify(rows, null, 2));
  await sql.end();
})();

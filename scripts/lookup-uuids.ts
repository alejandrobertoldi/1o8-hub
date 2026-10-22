/* eslint-disable react-doctor/async-await-in-loop */
import { config } from "dotenv"; import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!.replace(":6543/", ":5432/"), { ssl: "require" });
(async () => {
  for (const id of ["089e8c8a-95a0-411f-b782-770de027eb20", "b092e3bc-7799-45aa-9062-9c50c6e73e06"]) {
    const r = await sql`SELECT id, sku, client_id_code FROM master WHERE id = ${id}`;
    console.log(id, "→", r.length === 0 ? "NOT FOUND" : r[0]);
  }
  await sql.end();
})();

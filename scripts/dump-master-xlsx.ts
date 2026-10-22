import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";
import * as XLSX from "xlsx";
import { writeFileSync } from "fs";

const sql = postgres(process.env.DATABASE_URL!.replace(":6543/", ":5432/"), { ssl: "require" });

(async () => {
  console.log("Querying master table…");
  const rows = await sql`SELECT * FROM master`;
  console.log(`Got ${rows.length} rows.`);

  // Stringify JSONB columns so XLSX can store them as strings
  const flat = rows.map((r: Record<string, unknown>) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (v === null || v === undefined) {
        o[k] = "";
      } else if (typeof v === "object") {
        o[k] = JSON.stringify(v);
      } else if (v instanceof Date) {
        o[k] = (v as Date).toISOString();
      } else {
        o[k] = v;
      }
    }
    return o;
  });

  const ws = XLSX.utils.json_to_sheet(flat);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "master");

  const out = resolve(__dirname, "../docs/master-table.xlsx");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  writeFileSync(out, buf);
  console.log(`Wrote ${out}`);

  await sql.end();
})();

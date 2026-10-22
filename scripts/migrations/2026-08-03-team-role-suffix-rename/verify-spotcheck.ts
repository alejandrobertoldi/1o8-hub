import { config } from "dotenv";
config({ path: "/Users/manu/MFHub/.env.local" });
import postgres from "postgres";

const directUrl = (process.env.DATABASE_URL || "").replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  const rows = await sql<{ client_id_code: string; raw_data: Record<string, string> }[]>`
    SELECT client_id_code, raw_data
    FROM aac
    WHERE raw_data ? 'SEOManager_MF' OR raw_data ? 'ExecutiveStrategist_MF'
    ORDER BY client_id_code
    LIMIT 5
  `;
  for (const r of rows) {
    console.log(r.client_id_code, {
      ExecutiveStrategist_MF: r.raw_data.ExecutiveStrategist_MF,
      AccountManager_MF: r.raw_data.AccountManager_MF,
      SEOManager_MF: r.raw_data.SEOManager_MF,
    });
  }
  await sql.end();
}
main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });

require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');
async function test() {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    const result = await sql`SELECT "ClientIDCode", "ClientName", "ClientStatus" FROM "AAC_master" WHERE "ClientStatus" ILIKE 'active' LIMIT 5`;
    console.log('Active from AAC_master:', result.map(r => r.ClientIDCode + ' - ' + r.ClientName));

    const result2 = await sql`SELECT count(*) as cnt FROM "aac" WHERE client_status ILIKE 'active'`;
    console.log('Old aac table - active count:', result2[0].cnt);

    const result3 = await sql`SELECT count(*) as cnt FROM "AAC_master"`;
    console.log('AAC_master total count:', result3[0].cnt);
  } catch (e) {
    console.error('Error:', e.message);
  }
  await sql.end();
  process.exit(0);
}
test();
import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-db';
import { hasAdminPowers } from '@/lib/roles';
import { sqlClient } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function GET() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const columns = await sqlClient`
      SELECT table_name AS "table", column_name AS "column", data_type AS "type"
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `;
    return NextResponse.json({ columns, checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Database schema check unavailable. The code map is still usable.' }, { status: 503 });
  }
}

import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth-db';
import { hasAdminPowers } from '@/lib/roles';
import { DataMapCanvas } from '@/components/data-map/data-map';
import manifest from '@/generated/data-map.json';
import type { DataMap } from '@/lib/data-map/types';

export const dynamic = 'force-dynamic';
export default async function DataMapPage() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) redirect('/');
  return <DataMapCanvas map={manifest as DataMap} storageKey={`mfhub:data-map:v1:${session.user.id}`}/>;
}

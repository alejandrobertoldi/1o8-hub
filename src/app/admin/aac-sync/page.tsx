import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { AacSyncAdmin } from "@/components/admin/aac-sync-admin";

export const metadata = { title: "AAC Sheet Sync | 1o8 Hub" };

export default async function AacSyncPage() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) redirect("/");
  return <AacSyncAdmin />;
}

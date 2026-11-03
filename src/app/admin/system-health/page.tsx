import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { SystemHealth } from "@/components/admin/system-health";

export default async function SystemHealthPage() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) redirect("/");
  return <SystemHealth />;
}

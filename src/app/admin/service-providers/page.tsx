import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { ServiceProviders } from "@/components/admin/service-providers";

export default async function ServiceProvidersPage() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) redirect("/");
  return <ServiceProviders />;
}

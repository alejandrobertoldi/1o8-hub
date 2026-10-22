import { redirect } from "next/navigation";
import { helium10Enabled } from "@/lib/helium10/enabled";
import { requireHeliumAdmin } from "@/lib/helium10/access";
import Helium10Settings from "@/components/admin/helium10-settings";

export default async function Helium10AdminPage() {
  const access = await requireHeliumAdmin();
  if (access.error) redirect("/seo/manager");
  if (!helium10Enabled()) {
    return <p className="p-6 text-sm text-muted-foreground">Helium 10 is disabled. SEO keywords (S2) and reviews (S3) use CSV uploads. Set NEXT_PUBLIC_HELIUM10_ENABLED=true to turn it back on.</p>;
  }
  return <Helium10Settings />;
}

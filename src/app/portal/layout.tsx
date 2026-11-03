import type { Metadata } from "next";
import { AdminPreviewToggle } from "@/components/portal/admin-preview-toggle";
import ProspectSampleBadge from "@/components/portal/prospect-sample-badge";
import { PortalUnderConstruction } from "@/components/portal/under-construction";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";

export const metadata: Metadata = {
  title: {
    default: "1o8 Portal",
    absolute: "1o8 Portal",
  },
  description: "Client portal for 1o8",
  icons: {
    icon: "/favicon.png",
  },
};

/** Off until the 1o8 client dashboard exists: every portal page shows "Under construction". */
const PORTAL_ENABLED = false;

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  if (!PORTAL_ENABLED) {
    const session = await getAuthSession();
    return <PortalUnderConstruction staff={isHubStaff(session?.user?.role)} />;
  }
  return (
    <>
      <AdminPreviewToggle />
      <ProspectSampleBadge />
      {children}
    </>
  );
}

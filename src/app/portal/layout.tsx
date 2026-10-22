import type { Metadata } from "next";
import { AdminPreviewToggle } from "@/components/portal/admin-preview-toggle";
import ProspectSampleBadge from "@/components/portal/prospect-sample-badge";

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

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminPreviewToggle />
      <ProspectSampleBadge />
      {children}
    </>
  );
}

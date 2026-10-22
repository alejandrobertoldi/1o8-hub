"use client";

import { useSession } from "next-auth/react";
import { FlaskConical } from "lucide-react";

export default function ProspectSampleBadge() {
  const { data: session } = useSession();
  if (session?.user?.clientStatus !== "Prospect") return null;
  return (
    <div
      /* mf-no-print: rendered by src/app/portal/layout.tsx, which sits outside
         LayoutRouter's print-route exclusion. Being position:fixed, without this
         it would stamp itself onto the printed page. Class defined only in
         src/components/reports/print/print.css (print routes only). */
      className="mf-no-print fixed bottom-4 right-4 z-50 inline-flex items-center gap-1.5 rounded-full border border-portal-accent/30 bg-portal-accent/10 px-3 py-1.5 text-xs font-medium text-portal-accent shadow-sm backdrop-blur-sm"
      role="status"
      aria-label="Sample data"
    >
      <FlaskConical className="size-3.5" />
      Sample data
    </div>
  );
}

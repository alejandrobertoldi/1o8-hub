import { PortalPrintPage } from "@/components/reports/print/portal-print-page";
import { parsePortalPrintParams } from "@/components/reports/print/print-url";
import { formatDate } from "@/lib/report-date-range";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/* parsePortalPrintParams cannot return an accountId or a client name, so this
   route structurally cannot pass one through. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parsePortalPrintParams(await searchParams);
  return <PortalPrintPage sectionId="overview" {...params} generatedAt={formatDate(new Date())} />;
}

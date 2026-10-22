import { HubPrintPage } from "@/components/reports/print/hub-print-page";
import { parseHubPrintParams } from "@/components/reports/print/print-url";
import { formatDate } from "@/lib/report-date-range";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseHubPrintParams(await searchParams);
  return <HubPrintPage sectionId="overview" {...params} generatedAt={formatDate(new Date())} />;
}

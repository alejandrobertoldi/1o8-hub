/* eslint-disable react-doctor/nextjs-no-redirect-in-try-catch */
import { notFound } from "next/navigation";
import { verifyReportToken } from "@/lib/monthly-report/pdf-token";
import { Report as ReportView } from "@/components/monthly-report/Report";
import type { Report } from "@/components/monthly-report/types";
import { AutoPrint } from "./AutoPrint";
import { PrintEmbed } from "./PrintEmbed";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; autoprint?: string }>;
}) {
  const { token, autoprint } = await searchParams;
  if (!token) return <PrintEmbed />;

  let report: Report;
  try {
    report = verifyReportToken<{ report: Report }>(token).report;
  } catch {
    notFound();
  }

  return (
    <>
      <div data-report-ready="true" className="print-ready-sentinel" />
      <ReportView data={report!} printMode={true} />
      {autoprint === "1" && <AutoPrint />}
    </>
  );
}

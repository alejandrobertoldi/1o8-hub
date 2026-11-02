"use client";

import { useEffect, useState } from "react";
import { Report as ReportView } from "@/components/monthly-report/Report";
import type { Report } from "@/components/monthly-report/types";

declare global {
  interface Window {
    __MONTHLY_REPORT__?: Report;
  }
}

/** Puppeteer injects the report onto window so the PDF URL stays short. */
export function PrintEmbed() {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    const injected = window.__MONTHLY_REPORT__;
    if (injected) setReport(injected);
  }, []);

  if (!report) return null;

  return (
    <>
      <div data-report-ready="true" className="print-ready-sentinel" />
      <ReportView data={report} printMode={true} />
    </>
  );
}

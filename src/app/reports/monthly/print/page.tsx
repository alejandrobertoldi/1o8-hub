"use client";

import { useSyncExternalStore } from "react";
import { ClientReportDocument } from "@/components/client-report/client-report-document";
import type { TextSection } from "@/lib/client-report/text";
import type { ClientReportData } from "@/lib/client-report/types";

declare global {
  interface Window {
    __CLIENT_REPORT__?: ClientReportData;
    __CLIENT_REPORT_TEXTS__?: Partial<Record<TextSection, string>>;
  }
}

/**
 * Print target for the PDF renderer (src/lib/client-report/pdf.ts): headless
 * Chrome puts the report on window before the page loads. Holds no data of its
 * own, so it is open without sign-in (src/proxy.ts).
 */
export default function ClientReportPrintPage() {
  // Set once before the page loads, so there's nothing to subscribe to.
  const data = useSyncExternalStore(
    () => () => {},
    () => window.__CLIENT_REPORT__ ?? null,
    () => null,
  );
  if (!data) return null;
  return (
    <>
      <ClientReportDocument data={data} texts={{ html: window.__CLIENT_REPORT_TEXTS__ ?? {} }} />
      <div data-report-ready="true" hidden />
    </>
  );
}

import type { ReactNode } from "react";
import { ReportControlsProvider } from "@/components/reports/v2/use-report-controls";

// Holds the shared report controls (client + date range) above the page
// segment so selections persist when switching between report pages.
export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <ReportControlsProvider>{children}</ReportControlsProvider>;
}

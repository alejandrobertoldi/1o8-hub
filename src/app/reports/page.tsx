import { redirect } from "next/navigation";

// Clients → Client Reports is the monthly client reports; the KPI pages live
// under Clients → KPI Overview (/reports/kpis and its tab strip).
export default function ReportsPage() {
  redirect("/reports/monthly");
}

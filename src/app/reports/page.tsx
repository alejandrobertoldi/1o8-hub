import { redirect } from "next/navigation";

// The reports landing page routes straight to the KPI overview — every section
// is reachable from the report tab strip in the top nav.
export default function ReportsPage() {
  redirect("/reports/kpis");
}

import { redirect } from "next/navigation";

/** Hours Insights is now a tab of Hours Analytics; old links land there. */
export default function HoursInsightsPage() {
  redirect("/hours/analytics?tab=insights");
}

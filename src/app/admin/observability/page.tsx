import { redirect } from "next/navigation";

/** Renamed to System Health (2026-11-03); keeps old bookmarks working. */
export default function ObservabilityRedirect() {
  redirect("/admin/system-health");
}

import type { KitCaseStudy } from "./types";

/** Print page document title — also the browser's default "Save as PDF" filename. */
export function printDocumentTitle(cs: Pick<KitCaseStudy, "clientName" | "format">): string {
  return `${cs.clientName} - ${cs.format === "high_level" ? "High-Level" : "Detailed"} Case Study`;
}

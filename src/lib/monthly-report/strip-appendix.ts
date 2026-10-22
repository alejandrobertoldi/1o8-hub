import type { Report, SectionId } from "@/components/monthly-report/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** True when stored JSON still has an appendix section or payload. */
export function reportHasAppendix(report: unknown): boolean {
  if (!isRecord(report)) return false;
  if (report.appendix != null) return true;
  if (Array.isArray(report.sections) && report.sections.includes("appendix")) return true;
  return isRecord(report.sectionComments) && report.sectionComments.appendix != null;
}

/** Drop appendix from a stored report so existing rows do not need a regenerate. */
export function stripAppendixFromReport<T>(report: T): T {
  if (!isRecord(report)) return report;
  const next: Record<string, unknown> = { ...report };
  delete next.appendix;
  if (Array.isArray(next.sections)) {
    next.sections = next.sections.filter((id) => id !== "appendix") as SectionId[];
  }
  if (isRecord(next.sectionComments)) {
    const comments = { ...next.sectionComments };
    delete comments.appendix;
    next.sectionComments = comments;
  }
  return next as T;
}

export function stripAppendixFromStoredReport(report: unknown): Report | unknown {
  return stripAppendixFromReport(report);
}

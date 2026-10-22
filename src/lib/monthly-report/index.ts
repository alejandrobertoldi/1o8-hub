export { generateReport } from "./orchestrator";
export { resolveConfig, ALL_SECTION_KEYS } from "./config";
export { resolvePeriod, lastCompletedMonth, slugify } from "./period";
export type {
  MonthlyPeriod,
  ReportConfig,
  ClientContext,
  SectionKey,
  AnalyzerResult,
  HeadlineResult,
  ProductsResult,
  B2bResult,
} from "./types";

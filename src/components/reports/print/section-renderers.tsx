"use client";
import type { ReactNode } from "react";
import type { Surface } from "@/components/reports/v2/primitives/palette";
import { PerformanceOverviewV2 } from "@/components/reports/v2/performance-overview-v2";
import type { PrintSectionId } from "./print-sections";

export interface SectionRenderArgs {
  surface: Surface;
  accountId: string;
  /** Empty for snapshot sections; the year-derived bounds for subscribe-save. */
  start: string;
  end: string;
}

/** The one file that knows each section component's prop shape. `refreshKey` is
 *  always 0: a print document is a one-shot render, never manually refreshed.
 *
 *  Tasks 11 and 12 fill in the remaining five entries. Until then their routes
 *  do not exist, so the registry gap is unreachable rather than broken. */
export const SECTION_RENDERERS: Partial<
  Record<PrintSectionId, (a: SectionRenderArgs) => ReactNode>
> = {
  overview: ({ surface, accountId, start, end }) => (
    <PerformanceOverviewV2
      surface={surface}
      accountId={accountId}
      start={start}
      end={end}
      refreshKey={0}
      printMode
    />
  ),
};

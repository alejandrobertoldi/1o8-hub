// kit/types.ts
import type { CaseStudyMetrics } from "./metrics";
import type { Stage } from "./stages";
import type { SlideType, SectionContent } from "./slides";
import type { DeckFormat } from "./display";
export interface KitSection { id: string; sectionType: SlideType; sortOrder: number; content: SectionContent }
export interface KitCaseStudy {
  id: string; clientIdCode: string; clientName: string; title: string; format: DeckFormat; stage: Stage;
  ownerId: string | null; ownerName: string | null; sentAt: string | null;
  dateRangeStart: string; dateRangeEnd: string; clientSector: string; contactEmail: string;
  metrics: CaseStudyMetrics; updatedAt: string; sections: KitSection[];
}
export interface TrackerCell { id: string; stage: Stage; ownerName: string | null; dateRangeStart: string; dateRangeEnd: string;
  updatedAt: string; blockers: number; manualImages: number }
export interface TrackerRow { clientIdCode: string; clientName: string; highLevel: TrackerCell | null; detailed: TrackerCell | null }

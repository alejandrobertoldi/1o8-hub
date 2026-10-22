export const HOLIDAY_EVENT_IDS = ["pbdd", "bf_week", "cyber_monday"] as const;
export type HolidayEventId = (typeof HOLIDAY_EVENT_IDS)[number];

export const DEAL_TYPES = [
  "lightning",
  "best_deal",
  "prime_exclusive",
  "coupon",
  "price_discount",
  "other",
] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export const INBOUND_METHODS = ["awd", "fba_minimal", "fba_optimized"] as const;
export type InboundMethod = (typeof INBOUND_METHODS)[number];

export const SUBMISSION_STATUSES = [
  "not_started",
  "drafting",
  "submitted",
  "approved",
  "enrolled",
  "rejected",
  "skipped",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const INBOUND_STATUSES = [
  "not_planned",
  "po_created",
  "in_transit",
  "received",
  "at_risk",
  "missed",
] as const;
export type InboundStatus = (typeof INBOUND_STATUSES)[number];

export const CLIENT_AGREEMENTS = ["unset", "agreed", "declined"] as const;
export type ClientAgreement = (typeof CLIENT_AGREEMENTS)[number];

export type InboundRisk = "ok" | "due_soon" | "overdue" | "received" | "n/a";
export type SubmissionRisk = "ok" | "due_soon" | "closed" | "n/a";

export type HolidayDealPlan = {
  id: string;
  clientIdCode: string;
  clientName: string | null;
  productId: string | null;
  asin: string | null;
  sku: string | null;
  itemName: string | null;
  summarizedTitle: string | null;
  event: HolidayEventId;
  dealType: DealType | null;
  discountPercent: number | null;
  promoPrice: number | null;
  startDate: string | null;
  endDate: string | null;
  adBudget: number | null;
  estimatedUnits: number | null;
  inboundMethod: InboundMethod;
  submissionStatus: SubmissionStatus;
  inboundStatus: InboundStatus;
  submittedAt: string | null;
  clientTalked: boolean;
  clientTalkedAt: string | null;
  clientAgreement: ClientAgreement;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DealFee = {
  upfront: number;
  variable: number;
  total: number;
  incomplete: boolean;
};

export type EnrichedHolidayDeal = HolidayDealPlan & {
  inboundDeadline: string;
  inboundDaysRemaining: number;
  inboundRisk: InboundRisk;
  submissionClose: string;
  submissionDaysRemaining: number;
  submissionRisk: SubmissionRisk;
  fee: DealFee;
  peakFee: number;
};

export type HolidayDealSummary = {
  total: number;
  enrolled: number;
  notSubmitted: number;
  inventoryAtRisk: number;
  adBudget: number;
  estimatedFees: number;
  notTalked: number;
  waitingOnClient: number;
  agreed: number;
  missingSpend: number;
  missingPercent: number;
};

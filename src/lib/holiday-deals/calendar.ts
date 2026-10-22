import type {
  DealFee,
  DealType,
  EnrichedHolidayDeal,
  HolidayDealPlan,
  HolidayDealSummary,
  HolidayEventId,
  InboundMethod,
  InboundRisk,
  InboundStatus,
  SubmissionRisk,
  SubmissionStatus,
  ClientAgreement,
} from "./types";

export const DEFAULT_TODAY = "2026-09-15";

export function dealProductTitle(
  plan: Pick<HolidayDealPlan, "summarizedTitle" | "itemName" | "sku">,
): string {
  return plan.summarizedTitle?.trim() || plan.itemName?.trim() || plan.sku || "";
}

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  lightning: "Lightning Deal",
  best_deal: "Best Deal",
  prime_exclusive: "Prime Exclusive Discount",
  coupon: "Coupon",
  price_discount: "Price Discount",
  other: "Other",
};

export const INBOUND_METHOD_LABELS: Record<InboundMethod, string> = {
  awd: "AWD",
  fba_minimal: "FBA minimal splits",
  fba_optimized: "FBA optimized splits",
};

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  not_started: "Not started",
  drafting: "Drafting",
  submitted: "Submitted",
  approved: "Approved",
  enrolled: "Enrolled",
  rejected: "Rejected",
  skipped: "Skipped",
};

export const INBOUND_STATUS_LABELS: Record<InboundStatus, string> = {
  not_planned: "Not planned",
  po_created: "Inbound created",
  in_transit: "In transit",
  received: "Received",
  at_risk: "At risk",
  missed: "Missed",
};

export const CLIENT_AGREEMENT_LABELS: Record<ClientAgreement, string> = {
  unset: "—",
  agreed: "Yes",
  declined: "No",
};

export type ClientTrackerStatus = "not_talked" | "waiting" | "agreed" | "declined";

export function clientTrackerStatus(plan: HolidayDealPlan): ClientTrackerStatus {
  if (plan.clientAgreement === "agreed") return "agreed";
  if (plan.clientAgreement === "declined") return "declined";
  if (plan.clientTalked) return "waiting";
  return "not_talked";
}

export function missingDealTerms(plan: HolidayDealPlan): {
  spend: boolean;
  percent: boolean;
} {
  const status = clientTrackerStatus(plan);
  const needsTerms = status === "waiting" || status === "agreed";
  return {
    spend: needsTerms && plan.adBudget == null,
    percent: needsTerms && plan.discountPercent == null,
  };
}

type HolidayEvent = {
  id: HolidayEventId;
  label: string;
  shortLabel: string;
  startDate: string;
  endDate: string;
  submissionOpen: string;
  submissionClose: string;
  earlyBirdDeadline: string;
  inbound: Record<InboundMethod, string>;
  datesConfirmedOn: string | null;
};

export const HOLIDAY_EVENTS: readonly HolidayEvent[] = [
  {
    id: "pbdd",
    label: "Prime Day",
    shortLabel: "Prime Day",
    startDate: "2026-10-06",
    endDate: "2026-10-07",
    submissionOpen: "2026-07-08",
    submissionClose: "2026-09-08",
    earlyBirdDeadline: "2026-08-05",
    inbound: {
      awd: "2026-09-02",
      fba_minimal: "2026-09-09",
      fba_optimized: "2026-09-16",
    },
    datesConfirmedOn: "2026-09-15",
  },
  {
    id: "bf_week",
    label: "Black Friday Week",
    shortLabel: "BF Week",
    startDate: "2026-11-23",
    endDate: "2026-11-29",
    submissionOpen: "2026-07-08",
    submissionClose: "2026-10-20",
    earlyBirdDeadline: "2026-09-05",
    inbound: {
      awd: "2026-10-14",
      fba_minimal: "2026-10-21",
      fba_optimized: "2026-10-28",
    },
    datesConfirmedOn: null,
  },
  {
    id: "cyber_monday",
    label: "Cyber Monday",
    shortLabel: "Cyber Monday",
    startDate: "2026-11-30",
    endDate: "2026-11-30",
    submissionOpen: "2026-07-08",
    submissionClose: "2026-10-20",
    earlyBirdDeadline: "2026-09-05",
    inbound: {
      awd: "2026-10-14",
      fba_minimal: "2026-10-21",
      fba_optimized: "2026-10-28",
    },
    datesConfirmedOn: null,
  },
];

const EVENT_BY_ID = new Map(HOLIDAY_EVENTS.map((event) => [event.id, event]));

export function getEvent(id: HolidayEventId): HolidayEvent {
  const event = EVENT_BY_ID.get(id);
  if (!event) throw new Error(`Unknown holiday event: ${id}`);
  return event;
}

export function defaultDealDates(id: HolidayEventId): {
  startDate: string;
  endDate: string;
} {
  const event = getEvent(id);
  return { startDate: event.startDate, endDate: event.endDate };
}

export function inboundDeadline(
  eventId: HolidayEventId,
  method: InboundMethod,
): string {
  return getEvent(eventId).inbound[method];
}

export type HolidayCalendarKind = "event" | "inbound" | "submission" | "peak";

export type HolidayCalendarMark = {
  id: string;
  label: string;
  shortLabel: string;
  startDate: string;
  endDate: string;
  kind: HolidayCalendarKind;
  confirmed?: boolean;
};

export const HOLIDAY_CALENDAR_MARKS: readonly HolidayCalendarMark[] = [
  {
    id: "pbdd",
    label: "Prime Day",
    shortLabel: "Prime Days",
    startDate: "2026-10-06",
    endDate: "2026-10-07",
    kind: "event",
    confirmed: true,
  },
  {
    id: "bf_week",
    label: "Black Friday Week",
    shortLabel: "BF Week",
    startDate: "2026-11-23",
    endDate: "2026-11-29",
    kind: "event",
  },
  {
    id: "cyber_monday",
    label: "Cyber Monday",
    shortLabel: "Cyber Monday",
    startDate: "2026-11-30",
    endDate: "2026-11-30",
    kind: "event",
  },
  {
    id: "pbdd_sub",
    label: "Prime Day submissions close",
    shortLabel: "Prime Day sub",
    startDate: "2026-09-08",
    endDate: "2026-09-08",
    kind: "submission",
  },
  {
    id: "pbdd_awd",
    label: "Prime Day AWD inbound",
    shortLabel: "Prime Day AWD",
    startDate: "2026-09-02",
    endDate: "2026-09-02",
    kind: "inbound",
  },
  {
    id: "pbdd_fba_min",
    label: "Prime Day FBA minimal inbound",
    shortLabel: "Prime Day FBA min",
    startDate: "2026-09-09",
    endDate: "2026-09-09",
    kind: "inbound",
  },
  {
    id: "pbdd_fba_opt",
    label: "Prime Day FBA optimized inbound",
    shortLabel: "Prime Day FBA opt",
    startDate: "2026-09-16",
    endDate: "2026-09-16",
    kind: "inbound",
  },
  {
    id: "bfcm_sub",
    label: "BFCM submissions close",
    shortLabel: "BFCM sub",
    startDate: "2026-10-20",
    endDate: "2026-10-20",
    kind: "submission",
  },
  {
    id: "bfcm_awd",
    label: "BFCM AWD inbound",
    shortLabel: "BFCM AWD",
    startDate: "2026-10-14",
    endDate: "2026-10-14",
    kind: "inbound",
  },
  {
    id: "bfcm_fba_min",
    label: "BFCM FBA minimal inbound",
    shortLabel: "BFCM FBA min",
    startDate: "2026-10-21",
    endDate: "2026-10-21",
    kind: "inbound",
  },
  {
    id: "bfcm_fba_opt",
    label: "BFCM FBA optimized inbound",
    shortLabel: "BFCM FBA opt",
    startDate: "2026-10-28",
    endDate: "2026-10-28",
    kind: "inbound",
  },
  {
    id: "peak_start",
    label: "Peak fulfillment fees start",
    shortLabel: "Peak fees",
    startDate: "2026-10-15",
    endDate: "2026-10-15",
    kind: "peak",
  },
];

export type MonthCell = {
  iso: string | null;
  day: number | null;
};

export function marksOnDate(
  iso: string,
  marks: readonly HolidayCalendarMark[] = HOLIDAY_CALENDAR_MARKS,
): HolidayCalendarMark[] {
  return marks.filter((mark) => iso >= mark.startDate && iso <= mark.endDate);
}

export function monthGrid(year: number, month: number): MonthCell[] {
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: MonthCell[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push({ iso: null, day: null });
  for (let day = 1; day <= days; day += 1) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ iso, day });
  }
  while (cells.length % 7 !== 0) cells.push({ iso: null, day: null });
  return cells;
}

export type YearMonth = { year: number; month: number };

/** Shift a (year, month) by any number of months, wrapping across years. */
export function shiftMonth(year: number, month: number, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The three consecutive months shown in the deadline calendar. */
export function calendarWindow(anchor: YearMonth): YearMonth[] {
  return [0, 1, 2].map((delta) => shiftMonth(anchor.year, anchor.month, delta));
}

/** Earliest and latest anchors so the 3-month window stays inside Q4 planning
 *  (first inbound cut-offs in Jul 2026 through the last peak-fee day in Jan 2027). */
export const CALENDAR_FIRST_ANCHOR: YearMonth = { year: 2026, month: 7 };
export const CALENDAR_LAST_ANCHOR: YearMonth = { year: 2026, month: 11 };

export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export const WEEKDAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function parseUtcDay(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function daysUntil(isoDate: string, today: string): number {
  const target = parseUtcDay(isoDate);
  const from = parseUtcDay(today);
  if (!Number.isFinite(target) || !Number.isFinite(from)) return NaN;
  return Math.round((target - from) / 86_400_000);
}

const IN_FLIGHT: ReadonlySet<SubmissionStatus> = new Set([
  "submitted",
  "approved",
  "enrolled",
]);

function inboundRisk(
  daysRemaining: number,
  status: InboundStatus,
): InboundRisk {
  if (status === "received") return "received";
  if (status === "missed") return "overdue";
  if (daysRemaining < 0) return "overdue";
  if (daysRemaining <= 7) return "due_soon";
  return "ok";
}

function submissionRisk(
  daysRemaining: number,
  status: SubmissionStatus,
): SubmissionRisk {
  if (status === "skipped") return "n/a";
  if (IN_FLIGHT.has(status)) return "ok";
  if (daysRemaining < 0) return "closed";
  if (daysRemaining <= 7) return "due_soon";
  return "ok";
}

export function estimateDealFee(input: {
  promoSales: number | null | undefined;
  earlyBird: boolean;
}): DealFee {
  const upfront = input.earlyBird ? 50 : 100;
  if (input.promoSales == null || !Number.isFinite(input.promoSales)) {
    return { upfront, variable: 0, total: upfront, incomplete: true };
  }
  const variable = Math.min(input.promoSales * 0.015, 5_000);
  return {
    upfront,
    variable,
    total: upfront + variable,
    incomplete: false,
  };
}

const PEAK_START = "2026-10-15";
const PEAK_END = "2027-01-14";
const PEAK_PER_UNIT = 0.32 * 1.035;

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return parseUtcDay(aStart) <= parseUtcDay(bEnd) && parseUtcDay(bStart) <= parseUtcDay(aEnd);
}

export function estimatePeakFulfillmentFee(input: {
  units: number | null | undefined;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
}): number {
  if (!input.units || !input.startDate || !input.endDate) return 0;
  if (!rangesOverlap(input.startDate, input.endDate, PEAK_START, PEAK_END)) {
    return 0;
  }
  return Math.round(input.units * PEAK_PER_UNIT * 100) / 100;
}

function qualifiesEarlyBird(plan: HolidayDealPlan): boolean {
  if (!plan.submittedAt) return false;
  if (!IN_FLIGHT.has(plan.submissionStatus) && plan.submissionStatus !== "rejected") {
    return false;
  }
  return parseUtcDay(plan.submittedAt) <= parseUtcDay(getEvent(plan.event).earlyBirdDeadline);
}

export function enrichPlan(
  plan: HolidayDealPlan,
  today: string = todayISO(),
): EnrichedHolidayDeal {
  const event = getEvent(plan.event);
  const inboundDue = inboundDeadline(plan.event, plan.inboundMethod);
  const inboundDaysRemaining = daysUntil(inboundDue, today);
  const submissionDaysRemaining = daysUntil(event.submissionClose, today);
  const promoSales =
    plan.promoPrice != null && plan.estimatedUnits != null
      ? plan.promoPrice * plan.estimatedUnits
      : null;
  const fee = estimateDealFee({
    promoSales,
    earlyBird: qualifiesEarlyBird(plan),
  });
  return {
    ...plan,
    inboundDeadline: inboundDue,
    inboundDaysRemaining,
    inboundRisk: inboundRisk(inboundDaysRemaining, plan.inboundStatus),
    submissionClose: event.submissionClose,
    submissionDaysRemaining,
    submissionRisk: submissionRisk(submissionDaysRemaining, plan.submissionStatus),
    fee,
    peakFee: estimatePeakFulfillmentFee({
      units: plan.estimatedUnits,
      startDate: plan.startDate,
      endDate: plan.endDate,
    }),
  };
}

export function summarizePlans(
  plans: HolidayDealPlan[],
  today: string = todayISO(),
): HolidayDealSummary {
  const enriched = plans.map((p) => enrichPlan(p, today));
  return {
    total: enriched.length,
    enrolled: enriched.filter((p) => IN_FLIGHT.has(p.submissionStatus)).length,
    notSubmitted: enriched.filter(
      (p) => p.submissionStatus === "not_started" || p.submissionStatus === "drafting",
    ).length,
    inventoryAtRisk: enriched.filter(
      (p) => p.inboundRisk === "overdue" || p.inboundRisk === "due_soon",
    ).length,
    adBudget: enriched.reduce((sum, p) => sum + (p.adBudget ?? 0), 0),
    estimatedFees: enriched.reduce((sum, p) => sum + p.fee.total, 0),
    notTalked: plans.filter((p) => clientTrackerStatus(p) === "not_talked").length,
    waitingOnClient: plans.filter((p) => clientTrackerStatus(p) === "waiting").length,
    agreed: plans.filter((p) => clientTrackerStatus(p) === "agreed").length,
    missingSpend: plans.filter((p) => missingDealTerms(p).spend).length,
    missingPercent: plans.filter((p) => missingDealTerms(p).percent).length,
  };
}

export function csvHeaders(): string[] {
  return [
    "Client",
    "ASIN",
    "SKU",
    "Product",
    "Event",
    "Talked",
    "Talked on",
    "Agreed",
    "Spend",
    "Discount %",
    "Deal type",
    "Promo price",
    "Start",
    "End",
    "Est. units",
    "Inbound method",
    "Inbound deadline",
    "Submission status",
    "Inbound status",
    "Est. deal fee",
    "Notes",
  ];
}

function csvCell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsvRow(plan: EnrichedHolidayDeal): string[] {
  return [
    plan.clientName || plan.clientIdCode,
    plan.asin ?? "",
    plan.sku ?? "",
    dealProductTitle(plan),
    getEvent(plan.event).label,
    plan.clientTalked ? "Yes" : "No",
    plan.clientTalkedAt ?? "",
    CLIENT_AGREEMENT_LABELS[plan.clientAgreement],
    plan.adBudget ?? "",
    plan.discountPercent ?? "",
    plan.dealType ? DEAL_TYPE_LABELS[plan.dealType] : "",
    plan.promoPrice ?? "",
    plan.startDate ?? "",
    plan.endDate ?? "",
    plan.estimatedUnits ?? "",
    INBOUND_METHOD_LABELS[plan.inboundMethod],
    plan.inboundDeadline,
    SUBMISSION_STATUS_LABELS[plan.submissionStatus],
    INBOUND_STATUS_LABELS[plan.inboundStatus],
    plan.fee.incomplete ? `${plan.fee.upfront}+` : String(plan.fee.total),
    plan.notes ?? "",
  ].map(csvCell);
}

export function plansToCsv(plans: EnrichedHolidayDeal[]): string {
  const lines = [csvHeaders().map(csvCell).join(","), ...plans.map((p) => toCsvRow(p).join(","))];
  return lines.join("\n") + "\n";
}

export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

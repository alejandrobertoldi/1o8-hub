import { defaultDealDates } from "./calendar";
import {
  CLIENT_AGREEMENTS,
  DEAL_TYPES,
  HOLIDAY_EVENT_IDS,
  INBOUND_METHODS,
  INBOUND_STATUSES,
  SUBMISSION_STATUSES,
  type ClientAgreement,
  type DealType,
  type HolidayEventId,
  type InboundMethod,
  type InboundStatus,
  type SubmissionStatus,
} from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ASIN_MAX = 20;
const SKU_MAX = 100;
const NAME_MAX = 500;
const NOTES_MAX = 4000;
const CLIENT_MAX = 100;

export type HolidayDealWrite = {
  clientIdCode: string;
  productId: string | null;
  asin: string | null;
  sku: string | null;
  itemName: string | null;
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
};

export type HolidayDealPatch = Partial<
  Omit<HolidayDealWrite, "clientIdCode" | "event">
> & {
  event?: HolidayEventId;
};

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function asObject(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function asTrimmed(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function isEventId(value: unknown): value is HolidayEventId {
  return (
    typeof value === "string" &&
    (HOLIDAY_EVENT_IDS as readonly string[]).includes(value)
  );
}

function isDealType(value: unknown): value is DealType {
  return typeof value === "string" && (DEAL_TYPES as readonly string[]).includes(value);
}

function isInboundMethod(value: unknown): value is InboundMethod {
  return (
    typeof value === "string" &&
    (INBOUND_METHODS as readonly string[]).includes(value)
  );
}

function isSubmissionStatus(value: unknown): value is SubmissionStatus {
  return (
    typeof value === "string" &&
    (SUBMISSION_STATUSES as readonly string[]).includes(value)
  );
}

function isInboundStatus(value: unknown): value is InboundStatus {
  return (
    typeof value === "string" &&
    (INBOUND_STATUSES as readonly string[]).includes(value)
  );
}

function isClientAgreement(value: unknown): value is ClientAgreement {
  return (
    typeof value === "string" &&
    (CLIENT_AGREEMENTS as readonly string[]).includes(value)
  );
}

function parseBool(value: unknown, label: string): ParseResult<boolean> {
  if (typeof value === "boolean") return { ok: true, data: value };
  if (value === "true" || value === "yes" || value === 1 || value === "1") {
    return { ok: true, data: true };
  }
  if (value === "false" || value === "no" || value === 0 || value === "0") {
    return { ok: true, data: false };
  }
  return { ok: false, error: `${label} must be yes or no.` };
}

function parseDate(value: unknown, label: string): ParseResult<string | null> {
  if (value == null || value === "") return { ok: true, data: null };
  if (typeof value !== "string") {
    return { ok: false, error: `${label} must be YYYY-MM-DD.` };
  }
  const raw = value.trim();
  if (!DATE_RE.test(raw)) {
    return { ok: false, error: `${label} must be YYYY-MM-DD.` };
  }
  return { ok: true, data: raw };
}

function parseMoney(
  value: unknown,
  label: string,
  opts: { integer?: boolean; min?: number; max?: number } = {},
): ParseResult<number | null> {
  if (value == null || value === "") return { ok: true, data: null };
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : NaN;
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number.` };
  if (opts.integer && !Number.isInteger(n)) {
    return { ok: false, error: `${label} must be a whole number.` };
  }
  const min = opts.min ?? 0;
  const max = opts.max ?? 1_000_000_000;
  if (n < min || n > max) {
    return { ok: false, error: `${label} must be between ${min} and ${max}.` };
  }
  return { ok: true, data: n };
}

function parseUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

function validateWindow(
  startDate: string | null,
  endDate: string | null,
): string | null {
  if (startDate && endDate && startDate > endDate) {
    return "Deal end date must be on or after the start date.";
  }
  return null;
}

function eventList(input: Record<string, unknown>): ParseResult<HolidayEventId[]> {
  if (Array.isArray(input.events)) {
    const ids: HolidayEventId[] = [];
    const seen = new Set<string>();
    for (const item of input.events) {
      if (!isEventId(item)) {
        return { ok: false, error: "Each event must be Prime Day, Black Friday Week, or Cyber Monday." };
      }
      if (seen.has(item)) continue;
      seen.add(item);
      ids.push(item);
    }
    if (ids.length === 0) return { ok: false, error: "Pick at least one event." };
    return { ok: true, data: ids };
  }
  if (isEventId(input.event)) return { ok: true, data: [input.event] };
  return { ok: false, error: "Pick at least one event." };
}

function readSharedFields(
  input: Record<string, unknown>,
): ParseResult<Omit<HolidayDealWrite, "clientIdCode" | "event">> {
  const start = parseDate(input.startDate, "Start date");
  if (!start.ok) return start;
  const end = parseDate(input.endDate, "End date");
  if (!end.ok) return end;
  const submittedAt = parseDate(input.submittedAt, "Submitted date");
  if (!submittedAt.ok) return submittedAt;
  const clientTalkedAt = parseDate(input.clientTalkedAt, "Talked on");
  if (!clientTalkedAt.ok) return clientTalkedAt;

  const discountPercent = parseMoney(input.discountPercent, "Discount %", {
    min: 0,
    max: 100,
  });
  if (!discountPercent.ok) return discountPercent;
  const promoPrice = parseMoney(input.promoPrice, "Promo price");
  if (!promoPrice.ok) return promoPrice;
  const adBudget = parseMoney(input.adBudget, "Ad budget");
  if (!adBudget.ok) return adBudget;
  const estimatedUnits = parseMoney(input.estimatedUnits, "Estimated units", {
    integer: true,
    max: 10_000_000,
  });
  if (!estimatedUnits.ok) return estimatedUnits;

  if (input.dealType != null && input.dealType !== "" && !isDealType(input.dealType)) {
    return { ok: false, error: "Unknown deal type." };
  }
  if (
    input.inboundMethod != null &&
    input.inboundMethod !== "" &&
    !isInboundMethod(input.inboundMethod)
  ) {
    return { ok: false, error: "Unknown inbound method." };
  }
  if (
    input.submissionStatus != null &&
    input.submissionStatus !== "" &&
    !isSubmissionStatus(input.submissionStatus)
  ) {
    return { ok: false, error: "Unknown submission status." };
  }
  if (
    input.inboundStatus != null &&
    input.inboundStatus !== "" &&
    !isInboundStatus(input.inboundStatus)
  ) {
    return { ok: false, error: "Unknown inbound status." };
  }
  if (
    input.clientAgreement != null &&
    input.clientAgreement !== "" &&
    !isClientAgreement(input.clientAgreement)
  ) {
    return { ok: false, error: "Agreed must be yes, no, or not set." };
  }

  let clientTalked = false;
  if ("clientTalked" in input && input.clientTalked != null && input.clientTalked !== "") {
    const parsed = parseBool(input.clientTalked, "Talked");
    if (!parsed.ok) return parsed;
    clientTalked = parsed.data;
  }
  const clientAgreement = isClientAgreement(input.clientAgreement)
    ? input.clientAgreement
    : "unset";
  if (clientAgreement === "agreed") clientTalked = true;

  const windowError = validateWindow(start.data, end.data);
  if (windowError) return { ok: false, error: windowError };

  return {
    ok: true,
    data: {
      productId: parseUuid(input.productId),
      asin: asTrimmed(input.asin, ASIN_MAX)?.toUpperCase() ?? null,
      sku: asTrimmed(input.sku, SKU_MAX),
      itemName: asTrimmed(input.itemName, NAME_MAX),
      dealType: isDealType(input.dealType) ? input.dealType : null,
      discountPercent: discountPercent.data,
      promoPrice: promoPrice.data,
      startDate: start.data,
      endDate: end.data,
      adBudget: adBudget.data,
      estimatedUnits: estimatedUnits.data,
      inboundMethod: isInboundMethod(input.inboundMethod)
        ? input.inboundMethod
        : "fba_optimized",
      submissionStatus: isSubmissionStatus(input.submissionStatus)
        ? input.submissionStatus
        : "not_started",
      inboundStatus: isInboundStatus(input.inboundStatus)
        ? input.inboundStatus
        : "not_planned",
      submittedAt: submittedAt.data,
      clientTalked,
      clientTalkedAt: clientTalkedAt.data,
      clientAgreement,
      notes: asTrimmed(input.notes, NOTES_MAX),
    },
  };
}

export function parseHolidayDealCreate(
  body: unknown,
): ParseResult<HolidayDealWrite[]> {
  const input = asObject(body);
  if (!input) return { ok: false, error: "Invalid JSON body" };

  const clientIdCode = asTrimmed(input.clientIdCode, CLIENT_MAX);
  if (!clientIdCode) return { ok: false, error: "Client is required." };

  const events = eventList(input);
  if (!events.ok) return events;

  const shared = readSharedFields(input);
  if (!shared.ok) return shared;

  if (!shared.data.productId && !shared.data.asin && !shared.data.sku) {
    return { ok: false, error: "Pick a product or enter an ASIN/SKU." };
  }

  return {
    ok: true,
    data: events.data.map((event) => {
      const defaults = defaultDealDates(event);
      return {
        ...shared.data,
        clientIdCode,
        event,
        startDate: shared.data.startDate ?? defaults.startDate,
        endDate: shared.data.endDate ?? defaults.endDate,
      };
    }),
  };
}

export function parseHolidayDealPatch(body: unknown): ParseResult<HolidayDealPatch> {
  const input = asObject(body);
  if (!input) return { ok: false, error: "Invalid JSON body" };

  const patch: HolidayDealPatch = {};

  if ("event" in input) {
    if (!isEventId(input.event)) return { ok: false, error: "Unknown event." };
    patch.event = input.event;
  }
  if ("productId" in input) patch.productId = parseUuid(input.productId);
  if ("asin" in input) patch.asin = asTrimmed(input.asin, ASIN_MAX)?.toUpperCase() ?? null;
  if ("sku" in input) patch.sku = asTrimmed(input.sku, SKU_MAX);
  if ("itemName" in input) patch.itemName = asTrimmed(input.itemName, NAME_MAX);
  if ("dealType" in input) {
    if (input.dealType == null || input.dealType === "") patch.dealType = null;
    else if (!isDealType(input.dealType)) return { ok: false, error: "Unknown deal type." };
    else patch.dealType = input.dealType;
  }
  if ("inboundMethod" in input) {
    if (!isInboundMethod(input.inboundMethod)) {
      return { ok: false, error: "Unknown inbound method." };
    }
    patch.inboundMethod = input.inboundMethod;
  }
  if ("submissionStatus" in input) {
    if (!isSubmissionStatus(input.submissionStatus)) {
      return { ok: false, error: "Unknown submission status." };
    }
    patch.submissionStatus = input.submissionStatus;
  }
  if ("inboundStatus" in input) {
    if (!isInboundStatus(input.inboundStatus)) {
      return { ok: false, error: "Unknown inbound status." };
    }
    patch.inboundStatus = input.inboundStatus;
  }
  if ("notes" in input) patch.notes = asTrimmed(input.notes, NOTES_MAX);
  if ("clientTalked" in input) {
    const parsed = parseBool(input.clientTalked, "Talked");
    if (!parsed.ok) return parsed;
    patch.clientTalked = parsed.data;
  }
  if ("clientAgreement" in input) {
    if (input.clientAgreement == null || input.clientAgreement === "") {
      patch.clientAgreement = "unset";
    } else if (!isClientAgreement(input.clientAgreement)) {
      return { ok: false, error: "Agreed must be yes, no, or not set." };
    } else {
      patch.clientAgreement = input.clientAgreement;
    }
    if (patch.clientAgreement === "agreed") patch.clientTalked = true;
  }

  for (const [key, label, opts] of [
    ["discountPercent", "Discount %", { min: 0, max: 100 }],
    ["promoPrice", "Promo price", {}],
    ["adBudget", "Ad budget", {}],
    ["estimatedUnits", "Estimated units", { integer: true, max: 10_000_000 }],
  ] as const) {
    if (key in input) {
      const parsed = parseMoney(input[key], label, opts);
      if (!parsed.ok) return parsed;
      (patch as Record<string, unknown>)[key] = parsed.data;
    }
  }

  for (const key of ["startDate", "endDate", "submittedAt", "clientTalkedAt"] as const) {
    if (key in input) {
      const parsed = parseDate(input[key], key);
      if (!parsed.ok) return parsed;
      patch[key] = parsed.data;
    }
  }

  const windowError = validateWindow(patch.startDate ?? null, patch.endDate ?? null);
  if (windowError) return { ok: false, error: windowError };

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No fields to update." };
  }
  return { ok: true, data: patch };
}

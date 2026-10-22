import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac, holidayDealPlans, master, type VariationData } from "@/lib/db/schema";
import { displaySummarizedTitle, type ThemeAttrBag } from "@/lib/computed-fields";
import { enrichPlan, summarizePlans, todayISO } from "./calendar";
import type { HolidayDealPatch, HolidayDealWrite } from "./parse";
import type {
  EnrichedHolidayDeal,
  HolidayDealPlan,
  HolidayDealSummary,
  HolidayEventId,
  InboundMethod,
  InboundStatus,
  SubmissionStatus,
  DealType,
  ClientAgreement,
} from "./types";
import {
  CLIENT_AGREEMENTS,
  DEAL_TYPES,
  HOLIDAY_EVENT_IDS,
  INBOUND_METHODS,
  INBOUND_STATUSES,
  SUBMISSION_STATUSES,
} from "./types";

function toNum(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asEvent(value: string): HolidayEventId {
  return (HOLIDAY_EVENT_IDS as readonly string[]).includes(value)
    ? (value as HolidayEventId)
    : "pbdd";
}

function asDealType(value: string | null): DealType | null {
  if (!value) return null;
  return (DEAL_TYPES as readonly string[]).includes(value)
    ? (value as DealType)
    : null;
}

function asInboundMethod(value: string): InboundMethod {
  return (INBOUND_METHODS as readonly string[]).includes(value)
    ? (value as InboundMethod)
    : "fba_optimized";
}

function asSubmissionStatus(value: string): SubmissionStatus {
  return (SUBMISSION_STATUSES as readonly string[]).includes(value)
    ? (value as SubmissionStatus)
    : "not_started";
}

function asInboundStatus(value: string): InboundStatus {
  return (INBOUND_STATUSES as readonly string[]).includes(value)
    ? (value as InboundStatus)
    : "not_planned";
}

function asClientAgreement(value: string): ClientAgreement {
  return (CLIENT_AGREEMENTS as readonly string[]).includes(value)
    ? (value as ClientAgreement)
    : "unset";
}

function money(value: number | null | undefined): string | null {
  return value == null ? null : String(value);
}

type JoinedRow = typeof holidayDealPlans.$inferSelect & {
  clientName: string | null;
  summarizedTitle: string | null;
};

function catalogTitleFromMaster(product: {
  summarizedTitle: string | null;
  variations: VariationData | null;
} | null): string | null {
  if (!product) return null;
  const attrs = (product.variations ?? {}) as ThemeAttrBag;
  return displaySummarizedTitle({
    variationThemeName: product.variations?.VariationThemeName ?? null,
    variationName: product.variations?.VariationProduct ?? null,
    Color: attrs.Color,
    Size: attrs.Size,
    Flavor: attrs.Flavor,
    Style: attrs.Style,
    summarizedTitle: product.summarizedTitle,
    itemName: null,
  });
}

async function decoratePlan(
  row: typeof holidayDealPlans.$inferSelect,
): Promise<HolidayDealPlan> {
  const [named] = await db
    .select({ clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, row.clientIdCode))
    .limit(1);
  const product = row.productId ? await lookupProduct(row.productId) : null;
  return toPlan({
    ...row,
    clientName: named?.clientName ?? null,
    summarizedTitle: product?.summarizedTitle ?? null,
  });
}

function toPlan(row: JoinedRow): HolidayDealPlan {
  return {
    id: row.id,
    clientIdCode: row.clientIdCode,
    clientName: row.clientName,
    productId: row.productId,
    asin: row.asin,
    sku: row.sku,
    itemName: row.itemName,
    summarizedTitle: row.summarizedTitle,
    event: asEvent(row.event),
    dealType: asDealType(row.dealType),
    discountPercent: toNum(row.discountPercent),
    promoPrice: toNum(row.promoPrice),
    startDate: row.startDate,
    endDate: row.endDate,
    adBudget: toNum(row.adBudget),
    estimatedUnits: row.estimatedUnits,
    inboundMethod: asInboundMethod(row.inboundMethod),
    submissionStatus: asSubmissionStatus(row.submissionStatus),
    inboundStatus: asInboundStatus(row.inboundStatus),
    submittedAt: row.submittedAt,
    clientTalked: Boolean(row.clientTalked),
    clientTalkedAt: row.clientTalkedAt,
    clientAgreement: asClientAgreement(row.clientAgreement),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

export class HolidayDealConflictError extends Error {
  constructor() {
    super("This product is already on that event.");
    this.name = "HolidayDealConflictError";
  }
}

export class HolidayDealNotFoundError extends Error {
  constructor() {
    super("Deal plan not found.");
    this.name = "HolidayDealNotFoundError";
  }
}

export type ListHolidayDealsInput = {
  client?: string | null;
  event?: string | null;
  q?: string | null;
};

const CATALOG_COLS = {
  id: master.id,
  clientIdCode: master.clientIdCode,
  asin: master.asin,
  sku: master.sku,
  summarizedTitle: master.summarizedTitle,
  variations: master.variations,
};

async function catalogTitlesForPlans(
  plans: Array<
    Pick<typeof holidayDealPlans.$inferSelect, "id" | "productId" | "clientIdCode" | "asin" | "sku">
  >,
): Promise<Map<string, string | null>> {
  const titles = new Map<string, string | null>();
  if (plans.length === 0) return titles;

  const productIds = [
    ...new Set(plans.map((p) => p.productId).filter((id): id is string => Boolean(id))),
  ];
  const catalog = productIds.length
    ? await db.select(CATALOG_COLS).from(master).where(inArray(master.id, productIds))
    : [];
  const byId = new Map(catalog.map((p) => [p.id, catalogTitleFromMaster(p)]));

  const missing = plans.filter((p) => !(p.productId && byId.get(p.productId)) && p.asin);
  const asins = [...new Set(missing.map((p) => p.asin).filter((a): a is string => Boolean(a)))];
  const byKey = new Map<string, string | null>();
  if (asins.length) {
    const extras = await db.select(CATALOG_COLS).from(master).where(inArray(master.asin, asins));
    for (const p of extras) {
      const title = catalogTitleFromMaster(p);
      if (!title) continue;
      byKey.set(`${p.clientIdCode}|${p.asin}|${p.sku ?? ""}`, title);
      const asinOnly = `${p.clientIdCode}|${p.asin}|`;
      if (!byKey.has(asinOnly)) byKey.set(asinOnly, title);
    }
  }

  for (const plan of plans) {
    const fromId = plan.productId ? byId.get(plan.productId) : null;
    const fromSku = plan.asin
      ? byKey.get(`${plan.clientIdCode}|${plan.asin}|${plan.sku ?? ""}`)
      : null;
    const fromAsin = plan.asin ? byKey.get(`${plan.clientIdCode}|${plan.asin}|`) : null;
    titles.set(plan.id, fromId || fromSku || fromAsin || null);
  }
  return titles;
}

export async function listHolidayDeals(
  input: ListHolidayDealsInput = {},
): Promise<{ rows: EnrichedHolidayDeal[]; summary: HolidayDealSummary }> {
  const conditions = [];
  if (input.client) conditions.push(eq(holidayDealPlans.clientIdCode, input.client));
  if (input.event && (HOLIDAY_EVENT_IDS as readonly string[]).includes(input.event)) {
    conditions.push(eq(holidayDealPlans.event, input.event));
  }
  if (input.q) {
    const needle = `%${input.q}%`;
    conditions.push(
      or(
        ilike(holidayDealPlans.asin, needle),
        ilike(holidayDealPlans.sku, needle),
        ilike(holidayDealPlans.itemName, needle),
        ilike(holidayDealPlans.clientIdCode, needle),
        ilike(aac.clientName, needle),
      ),
    );
  }

  const rows = await db
    .select({
      plan: holidayDealPlans,
      clientName: aac.clientName,
    })
    .from(holidayDealPlans)
    .leftJoin(aac, eq(aac.clientIdCode, holidayDealPlans.clientIdCode))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      holidayDealPlans.clientIdCode,
      holidayDealPlans.event,
      sql`coalesce(${holidayDealPlans.itemName}, '')`,
      desc(holidayDealPlans.updatedAt),
    );

  const titles = await catalogTitlesForPlans(rows.map((row) => row.plan));
  const plans = rows.map((row) =>
    toPlan({
      ...row.plan,
      clientName: row.clientName,
      summarizedTitle: titles.get(row.plan.id) ?? null,
    }),
  );
  const today = todayISO();
  return {
    rows: plans.map((p) => enrichPlan(p, today)),
    summary: summarizePlans(plans, today),
  };
}

function insertValues(data: HolidayDealWrite, userId: string) {
  return {
    clientIdCode: data.clientIdCode,
    productId: data.productId,
    asin: data.asin,
    sku: data.sku,
    itemName: data.itemName,
    event: data.event,
    dealType: data.dealType,
    discountPercent: money(data.discountPercent),
    promoPrice: money(data.promoPrice),
    startDate: data.startDate,
    endDate: data.endDate,
    adBudget: money(data.adBudget),
    estimatedUnits: data.estimatedUnits,
    inboundMethod: data.inboundMethod,
    submissionStatus: data.submissionStatus,
    inboundStatus: data.inboundStatus,
    submittedAt: data.submittedAt,
    clientTalked: data.clientTalked,
    clientTalkedAt: data.clientTalked && !data.clientTalkedAt ? todayISO() : data.clientTalkedAt,
    clientAgreement: data.clientAgreement,
    notes: data.notes,
    createdBy: userId,
    updatedBy: userId,
  };
}

export async function createHolidayDeals(
  rows: HolidayDealWrite[],
  userId: string,
): Promise<EnrichedHolidayDeal[]> {
  const created: EnrichedHolidayDeal[] = [];
  const today = todayISO();
  for (const data of rows) {
    try {
      const [row] = await db
        .insert(holidayDealPlans)
        .values(insertValues(data, userId))
        .returning();
      if (!row) continue;
      created.push(enrichPlan(await decoratePlan(row), today));
    } catch (err) {
      if (isUniqueViolation(err)) throw new HolidayDealConflictError();
      throw err;
    }
  }
  return created;
}

const IN_FLIGHT = new Set(["submitted", "approved", "enrolled"]);

export async function updateHolidayDeal(
  id: string,
  patch: HolidayDealPatch,
  userId: string,
): Promise<EnrichedHolidayDeal> {
  const [existing] = await db
    .select()
    .from(holidayDealPlans)
    .where(eq(holidayDealPlans.id, id))
    .limit(1);
  if (!existing) throw new HolidayDealNotFoundError();

  const submittedAt =
    patch.submittedAt !== undefined
      ? patch.submittedAt
      : patch.submissionStatus &&
          IN_FLIGHT.has(patch.submissionStatus) &&
          !existing.submittedAt
        ? todayISO()
        : undefined;

  const values: Partial<typeof holidayDealPlans.$inferInsert> = {
    updatedBy: userId,
    updatedAt: new Date(),
  };
  if (patch.event !== undefined) values.event = patch.event;
  if (patch.productId !== undefined) values.productId = patch.productId;
  if (patch.asin !== undefined) values.asin = patch.asin;
  if (patch.sku !== undefined) values.sku = patch.sku;
  if (patch.itemName !== undefined) values.itemName = patch.itemName;
  if (patch.dealType !== undefined) values.dealType = patch.dealType;
  if (patch.discountPercent !== undefined) values.discountPercent = money(patch.discountPercent);
  if (patch.promoPrice !== undefined) values.promoPrice = money(patch.promoPrice);
  if (patch.startDate !== undefined) values.startDate = patch.startDate;
  if (patch.endDate !== undefined) values.endDate = patch.endDate;
  if (patch.adBudget !== undefined) values.adBudget = money(patch.adBudget);
  if (patch.estimatedUnits !== undefined) values.estimatedUnits = patch.estimatedUnits;
  if (patch.inboundMethod !== undefined) values.inboundMethod = patch.inboundMethod;
  if (patch.submissionStatus !== undefined) values.submissionStatus = patch.submissionStatus;
  if (patch.inboundStatus !== undefined) values.inboundStatus = patch.inboundStatus;
  if (submittedAt !== undefined) values.submittedAt = submittedAt;
  if (patch.notes !== undefined) values.notes = patch.notes;

  const nextTalked =
    patch.clientTalked !== undefined
      ? patch.clientTalked
      : patch.clientAgreement === "agreed"
        ? true
        : undefined;
  if (nextTalked !== undefined) values.clientTalked = nextTalked;
  if (patch.clientAgreement !== undefined) values.clientAgreement = patch.clientAgreement;
  if (patch.clientTalkedAt !== undefined) {
    values.clientTalkedAt = patch.clientTalkedAt;
  } else if (nextTalked === true && !existing.clientTalkedAt) {
    values.clientTalkedAt = todayISO();
  }

  try {
    const [row] = await db
      .update(holidayDealPlans)
      .set(values)
      .where(eq(holidayDealPlans.id, id))
      .returning();
    if (!row) throw new HolidayDealNotFoundError();
    return enrichPlan(await decoratePlan(row), todayISO());
  } catch (err) {
    if (isUniqueViolation(err)) throw new HolidayDealConflictError();
    throw err;
  }
}

export async function deleteHolidayDeal(id: string): Promise<void> {
  const deleted = await db
    .delete(holidayDealPlans)
    .where(eq(holidayDealPlans.id, id))
    .returning({ id: holidayDealPlans.id });
  if (deleted.length === 0) throw new HolidayDealNotFoundError();
}

export async function lookupProduct(productId: string) {
  const [row] = await db
    .select({
      id: master.id,
      clientIdCode: master.clientIdCode,
      asin: master.asin,
      sku: master.sku,
      itemName: master.itemName,
      summarizedTitle: master.summarizedTitle,
      variations: master.variations,
    })
    .from(master)
    .where(eq(master.id, productId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    clientIdCode: row.clientIdCode,
    asin: row.asin,
    sku: row.sku,
    itemName: row.itemName,
    summarizedTitle: catalogTitleFromMaster(row),
  };
}

import { z } from "zod";
import { hasSuperPowers, isEditorOrAbove } from "@/lib/roles";

/**
 * New Business pipeline (beta). Pure: shared by the API, the board and Hours.
 *
 * Funnel: Contact → First meeting → Building pitch → Pitch presented → Quote
 * sent, then Won / Lost / On hold. `probability` weights the pipeline value.
 */
export const NEW_BUSINESS_SECTION = "new-business";

export const OPEN_STAGES = [
  { id: "contact", label: "Contact", probability: 0.1 },
  { id: "first_meeting", label: "First meeting", probability: 0.2 },
  { id: "building_pitch", label: "Building pitch", probability: 0.4 },
  { id: "pitch_presented", label: "Pitch presented", probability: 0.6 },
  { id: "quote_sent", label: "Quote sent", probability: 0.75 },
] as const;
export const CLOSED_STAGES = [
  { id: "won", label: "Won", probability: 1 },
  { id: "lost", label: "Lost", probability: 0 },
  { id: "on_hold", label: "On hold", probability: 0 },
] as const;
export const STAGES = [...OPEN_STAGES, ...CLOSED_STAGES];
export type StageId = (typeof STAGES)[number]["id"];
export const STAGE_IDS = STAGES.map((s) => s.id) as [StageId, ...StageId[]];

export const stageLabel = (id: string) => STAGES.find((s) => s.id === id)?.label ?? id;
export const stageProbability = (id: string) => STAGES.find((s) => s.id === id)?.probability ?? 0;
export const isOpenStage = (id: string) => OPEN_STAGES.some((s) => s.id === id);
/** Won and lost close the deal; on hold stays out of the funnel without closing it. */
export const isClosedStage = (id: string) => id === "won" || id === "lost";

export const DEAL_TYPES = [
  { id: "retainer", label: "Monthly retainer" },
  { id: "project", label: "Project" },
] as const;
export type DealType = (typeof DEAL_TYPES)[number]["id"];

export const SOURCES = [
  { id: "referral", label: "Referral" },
  { id: "inbound", label: "Inbound" },
  { id: "outbound", label: "Outbound" },
  { id: "event", label: "Event" },
  { id: "upsell", label: "Existing client (upsell)" },
  { id: "other", label: "Other" },
] as const;

export const SERVICES = ["Paid Media", "Email & SMS", "Web Dev", "Creative", "SEO & Content", "Social", "Strategy"] as const;

/**
 * Hours project number of a pitch, logged under the 1O8 client: 1O87 + 4
 * digits (1O870001…). The 1O89xxxx range holds the fixed internal codes.
 */
export const PITCH_NUMBER_PREFIX = "1O87";
export const pitchProjectNumber = (seq: number) => `${PITCH_NUMBER_PREFIX}${String(seq).padStart(4, "0")}`;
export const isPitchProjectNumber = (projectNumber: string) => /^1O87\d{4}$/.test(projectNumber.toUpperCase());

/**
 * Who sees and edits the pipeline: owners / super admins always; other staff
 * (editor or above) only with the "new-business" section granted in Admin → Users.
 * Logging hours to a pitch needs none of this (any staff member can).
 */
export function canUseNewBusiness(role: string | null | undefined, allowedSections: readonly string[] | null | undefined): boolean {
  if (hasSuperPowers(role)) return true;
  return isEditorOrAbove(role) && (allowedSections ?? []).includes(NEW_BUSINESS_SECTION);
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const opportunitySchema = z.object({
  prospectName: z.string().trim().min(1, "Prospect name is required").max(255),
  website: optionalText(500),
  contactName: optionalText(255),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid contact email")
    .nullish()
    .or(z.literal(""))
    .transform((v) => v || null),
  ownerId: z.string().uuid().nullish().or(z.literal("")).transform((v) => v || null),
  source: z.enum(SOURCES.map((s) => s.id) as [string, ...string[]]).nullish().or(z.literal("")).transform((v) => v || null),
  services: z.array(z.enum(SERVICES)).max(SERVICES.length).default([]),
  dealType: z.enum(["retainer", "project"]).default("retainer"),
  value: z.coerce
    .number()
    .min(0, "Value can't be negative")
    .max(100_000_000)
    .nullish()
    .transform((v) => (v == null || Number.isNaN(v) ? null : v)),
  stage: z.enum(STAGE_IDS).default("contact"),
  nextStep: optionalText(500),
  nextStepDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
    .nullish()
    .or(z.literal(""))
    .transform((v) => v || null),
  asanaUrl: optionalText(500),
  notes: optionalText(5000),
  lostReason: optionalText(1000),
});
export type OpportunityInput = z.input<typeof opportunitySchema>;

/** What the API returns for the board. */
export type OpportunityView = {
  id: string;
  seq: number;
  projectNumber: string;
  prospectName: string;
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  ownerId: string | null;
  ownerName: string | null;
  source: string | null;
  services: string[];
  dealType: DealType;
  value: number | null;
  stage: StageId;
  stageChangedAt: string;
  nextStep: string | null;
  nextStepDate: string | null;
  asanaUrl: string | null;
  notes: string | null;
  lostReason: string | null;
  closedAt: string | null;
  createdAt: string;
  hours: number;
  people: number;
};

/** Open-pipeline totals, kept apart by deal type (a monthly fee and a project total don't add up). */
export function pipelineTotals(opps: Pick<OpportunityView, "stage" | "dealType" | "value">[]) {
  const t = { retainer: { total: 0, weighted: 0, count: 0 }, project: { total: 0, weighted: 0, count: 0 } };
  for (const o of opps) {
    if (!isOpenStage(o.stage)) continue;
    const bucket = t[o.dealType];
    bucket.count++;
    if (o.value == null) continue;
    bucket.total += o.value;
    bucket.weighted += o.value * stageProbability(o.stage);
  }
  return t;
}

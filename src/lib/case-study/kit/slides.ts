import type { AnyMetricKey, PulledMetrics, Derived } from "./metrics";
import { isMissing } from "./metrics";
import type { DeckFormat } from "./display";

export type HlSlideType = "hl_cover" | "hl_challenge" | "hl_results" | "hl_approach" | "hl_creative";
export type DetailedSlideType = "cover" | "brief" | "results" | "snapshot" | "approach" | "sales_growth"
  | "product_mix" | "demand_curve" | "paid_media" | "brand_story" | "listing_images" | "aplus" | "storefront" | "next_steps";
export type SlideType = HlSlideType | DetailedSlideType;

export interface DesignImages {
  heroListing: string[]; brandStory: string[]; aplusStacks: string[][]; storefrontPages: string[][]; logo: string[];
  aplusPremiumModules: number | null; aplusAsinsLive: number | null;
}
export const EMPTY_DESIGN_IMAGES: DesignImages = {
  heroListing: [], brandStory: [], aplusStacks: [], storefrontPages: [], logo: [],
  aplusPremiumModules: null, aplusAsinsLive: null,
};
export interface CopyField { key: string; label: string; kind: "text" | "textarea"; default: string; required: boolean }
export interface ImageSlotDef { id: string; label: string; fit: "cover" | "contain" | "width"; align?: "top"; group: string; from: (d: DesignImages) => string[] }
export interface SlideDef { type: SlideType; label: string; copy: CopyField[]; metrics: AnyMetricKey[]; images: ImageSlotDef[] }
export interface SectionContent {
  copy: Record<string, string>; designImages: Record<string, string[]>; manualImages: Record<string, string[]>;
  creativeCounts?: { aplusPremiumModules: number | null; aplusAsinsLive: number | null };
}

const t = (key: string, label: string, def = "", required = true): CopyField => ({ key, label, kind: "text", default: def, required });
const ta = (key: string, label: string, def = "", required = true): CopyField => ({ key, label, kind: "textarea", default: def, required });
const one = (u: string | undefined) => (u ? [u] : []);
const pillars = (): CopyField[] => [1, 2, 3, 4, 5].flatMap((n) => [t(`pillar${n}`, `Pillar ${n} — name`), t(`pillar${n}Desc`, `Pillar ${n} — one line`)]);
const heroSlot = (id: string): ImageSlotDef => ({ id, label: "Hero product photo", fit: "contain", group: "hero", from: (d) => one(d.heroListing[0]) });
const logoSlot = (id: string): ImageSlotDef => ({ id, label: "Client logo", fit: "contain", group: "logo", from: (d) => d.logo });
const listingSlots = (ids: string[], fit: "cover" | "contain"): ImageSlotDef[] =>
  ids.map((id, i) => ({ id, label: i === 0 ? "Listing image — hero (MAIN)" : `Listing image ${i + 1}`, fit, group: "listing", from: (d) => one(d.heroListing[i]) }));
const aplusSlot = (id: string, stack: number, pos: number): ImageSlotDef =>
  ({ id, label: `A+ stack ${stack + 1} · module ${pos + 1}`, fit: "cover", group: "aplus", from: (d) => one(d.aplusStacks[stack]?.[pos]) });
const sfSlot = (id: string, page: number): ImageSlotDef =>
  ({ id, label: `Storefront page ${page + 1}`, fit: "width", align: "top", group: "storefront", from: (d) => d.storefrontPages[page] ?? [] });

const KPI6 = (prefix: string, withHints: boolean): CopyField[] => {
  const labels = ["Ordered sales", "Growth multiple", "Ad impressions", "Ad-attributed sales", "Buy Box", "Conversion rate"];
  return labels.flatMap((l, i) => [
    t(`${prefix}${i + 1}Label`, `KPI ${i + 1} — label`, l),
    ...(withHints ? [t(`${prefix}${i + 1}Hint`, `KPI ${i + 1} — context`, "", false)] : []),
  ]);
};
const KPI6_METRICS: AnyMetricKey[] = ["salesTotal", "growthMultiple", "adImpressions", "adSales", "roas", "buyBoxPct", "cvrPct"];

export const HL_SLIDES: SlideDef[] = [
  { type: "hl_cover", label: "Cover",
    copy: [t("claim", "Bold claim"), t("result", "Key result (orange)"), ta("summary", "One-paragraph summary (no $ figures — bands are added by the KPI chips)"),
      t("kpi1Label", "Chip 1 label (ordered sales)", "Ordered sales · {period}"), t("kpi2Label", "Chip 2 label (growth multiple)", "Growth multiple"),
      t("kpi3Label", "Chip 3 label (ad-attributed sales)", "Ad-attributed sales"), t("category", "Category"), t("engagement", "Engagement", "Full-account management")],
    metrics: ["salesTotal", "growthMultiple", "adSales"], images: [heroSlot("cover-hero"), logoSlot("cover-logo")] },
  { type: "hl_challenge", label: "The Challenge",
    copy: [t("headline", "Headline"), t("headlineAccent", "Headline accent (orange)"), ta("body", "2–3 sentences: situation, difficulty, mandate"),
      t("startLabel", "Starting point — label", "Monthly ordered sales when we started"), t("targetValue", "Target — value (e.g. 3×)"), t("targetLabel", "Target — what defined success")],
    metrics: ["startSales"], images: [] },
  { type: "hl_results", label: "The Results",
    copy: [t("headline", "Headline (before “six proof points.”)", "Year one,"), ...KPI6("kpi", false)],
    metrics: KPI6_METRICS, images: [] },
  { type: "hl_approach", label: "The Approach",
    copy: [t("headline", "Headline"), t("headlineAccent", "Headline accent (orange)"), t("body", "One line on the method"), ...pillars()],
    metrics: [], images: [] },
  { type: "hl_creative", label: "The Creative",
    copy: [t("bsJob", "Brand Story — its job in one line", "introduces the brand and cross-sells the range")],
    metrics: ["cvrPct", "buyBoxPct"],
    images: [{ id: "bs", label: "Brand story banner", fit: "contain", group: "brandStory", from: (d) => d.brandStory },
      ...listingSlots(["li1", "li2", "li3", "li4", "li5", "li6", "li7", "li8", "li9"], "cover"),
      aplusSlot("ap1", 0, 0), aplusSlot("ap2", 0, 1), aplusSlot("ap3", 0, 2), aplusSlot("ap4", 0, 3),
      sfSlot("sf", 0)] },
];

export const DETAILED_SLIDES: SlideDef[] = [
  { type: "cover", label: "Cover",
    copy: [t("positioning", "Positioning line · one phrase"), t("claim", "Bold claim"), t("didWhat", "“{client} …did what”"),
      ta("summary", "One-sentence summary of the engagement and the single headline result"), t("category", "Category"), t("quote", "Short client or positioning quote", "", false)],
    metrics: [], images: [heroSlot("cover-hero"), logoSlot("cover-logo")] },
  { type: "brief", label: "The Brief",
    copy: [t("line1", "Headline line 1"), t("line2", "Headline line 2 (white part)"), t("line2Accent", "Headline line 2 (orange part)"), t("line3", "Headline line 3"),
      ta("situation", "2–3 sentences: situation + mandate"), t("startingPoint", "Where the account was when we took over"),
      t("deliverables", "What we were asked to deliver"), t("targetValue", "Target — value (e.g. 3.0×)"), t("targetLabel", "Target — what defined success")],
    metrics: [], images: [] },
  { type: "results", label: "Results at a Glance",
    copy: [t("scope", "Topbar right", "Seller Central · {period}"), t("headline", "Headline (before “six proof points.”)", "Year one,"), ...KPI6("kpi", true)],
    metrics: KPI6_METRICS, images: [] },
  { type: "snapshot", label: "Seller Central Snapshot",
    copy: [ta("body", "One line on the shape of the account"), t("headlineLabel", "Headline tile — label", "Ordered sales"),
      t("headlineContext", "Headline tile — context", "", false), t("engineLine", "Why Seller Central is the growth engine")],
    metrics: ["salesTotal", "unitsTotal", "asp", "skuCount", "pageViews", "sessions", "cvrPct", "buyBoxPct", "roas"], images: [] },
  { type: "approach", label: "Our Approach",
    copy: [ta("body", "One line on the method — the levers and how they compound"), ...pillars()], metrics: [], images: [] },
  { type: "sales_growth", label: "Sales Performance",
    copy: [t("topRight", "Topbar right", "Ordered sales · {period}"), ta("body", "Two sentences on the year — cite the total with {total}", "")],
    metrics: ["salesTotal", "salesMonthly", "organicSales", "organicPct", "adSales", "adPct", "asp", "unitsTotal"], images: [] },
  { type: "product_mix", label: "Product Mix",
    copy: [t("headline", "Headline (white)", "A few ASINs"), t("headlineAccent", "Headline (orange)", "carry the catalogue."), t("body", "How the catalogue concentrates")],
    metrics: ["topByRevenue", "topByUnits", "top3RevenueSharePct", "unitsTotal", "skuCount"], images: [] },
  { type: "demand_curve", label: "Demand Curve",
    copy: [t("headline", "Headline (white)", "From zero to"), t("headlineTail", "Headline end (after the orange figure)", ", steadily."),
      ta("body", "Two lines on the cumulative curve")],
    metrics: ["salesMonthly", "peakMonth", "peakSales", "h2AvgSales", "h2VsH1Pct"], images: [] },
  { type: "paid_media", label: "Paid Media",
    copy: [ta("body", "The paid-media approach — funnel stages, ad types, efficiency vs growth")],
    metrics: ["adSales", "adSpend", "roas", "paidSp", "paidSbSd", "spAcos", "sbSdAcos"], images: [] },
  { type: "brand_story", label: "Brand Story", copy: [], metrics: [],
    images: [{ id: "bs-hero", label: "Brand story banner", fit: "contain", group: "brandStory", from: (d) => d.brandStory }] },
  { type: "listing_images", label: "Listing Images", copy: [], metrics: ["cvrPct"],
    images: listingSlots(["li-main", "li-2", "li-3", "li-4", "li-5", "li-6", "li-7", "li-8", "li-9"], "contain") },
  { type: "aplus", label: "Premium A+ Content", copy: [], metrics: [],
    images: [0, 1, 2].flatMap((s) => [0, 1, 2, 3].map((p) => aplusSlot(s === 0 ? `ap-${p + 1}` : `ap-${"bc"[s - 1]}${p + 1}`, s, p))) },
  { type: "storefront", label: "Storefront", copy: [], metrics: [],
    images: [sfSlot("sf-a1", 0), sfSlot("sf-b1", 1), sfSlot("sf-c1", 2)] },
  { type: "next_steps", label: "Next Steps", copy: [], metrics: [], images: [] },
];

export function slidesFor(format: DeckFormat): SlideDef[] { return format === "high_level" ? HL_SLIDES : DETAILED_SLIDES; }
const KNOWN_SLIDE_TYPES: ReadonlySet<string> = new Set([...HL_SLIDES, ...DETAILED_SLIDES].map((s) => s.type));
/** False for legacy `section_type`s (e.g. rows written by the old 13-section builder). */
export function isKnownSlideType(type: string): type is SlideType { return KNOWN_SLIDE_TYPES.has(type); }
/** The sections a deck actually renders, in order: sorted by sortOrder, legacy/unknown types dropped. */
export function deckSections<T extends { sectionType: string; sortOrder: number }>(sections: T[]): T[] {
  return sections.filter((s) => isKnownSlideType(s.sectionType)).sort((a, b) => a.sortOrder - b.sortOrder);
}
export function slideDef(type: SlideType): SlideDef {
  const d = [...HL_SLIDES, ...DETAILED_SLIDES].find((s) => s.type === type);
  if (!d) throw new Error(`Unknown slide type: ${type}`);
  return d;
}

function designFor(def: SlideDef, design: DesignImages): Record<string, string[]> {
  return Object.fromEntries(def.images.map((s) => [s.id, s.from(design)]));
}
export function defaultSectionContent(def: SlideDef, design: DesignImages): SectionContent {
  return {
    copy: Object.fromEntries(def.copy.map((c) => [c.key, c.default])), designImages: designFor(def, design), manualImages: {},
    creativeCounts: { aplusPremiumModules: design.aplusPremiumModules, aplusAsinsLive: design.aplusAsinsLive },
  };
}
/** The Design-owned keys of a section's content — the only keys a refresh may write. */
export function designRefresh(def: SlideDef, design: DesignImages): Required<Pick<SectionContent, "designImages" | "creativeCounts">> {
  return {
    designImages: designFor(def, design),
    creativeCounts: { aplusPremiumModules: design.aplusPremiumModules, aplusAsinsLive: design.aplusAsinsLive },
  };
}
export function refreshSectionContent(def: SlideDef, prev: SectionContent, design: DesignImages): SectionContent {
  const copy = { ...Object.fromEntries(def.copy.map((c) => [c.key, c.default])), ...(prev.copy ?? {}) };
  return {
    copy, designImages: designFor(def, design), manualImages: prev.manualImages ?? {},
    creativeCounts: { aplusPremiumModules: design.aplusPremiumModules, aplusAsinsLive: design.aplusAsinsLive },
  };
}
export function resolveSlotImages(content: SectionContent, slotId: string): { urls: string[]; source: "manual" | "design" | "empty" } {
  const manual = content.manualImages?.[slotId] ?? [];
  if (manual.length) return { urls: manual, source: "manual" };
  const design = content.designImages?.[slotId] ?? [];
  if (design.length) return { urls: design, source: "design" };
  return { urls: [], source: "empty" };
}

export interface Blocker { slide: SlideType; kind: "metric" | "image" | "copy"; key: string; message: string }
const NON_BLOCKING: ReadonlySet<string> = new Set(["fulfilment"]);

export function deckBlockers(format: DeckFormat, e: Partial<PulledMetrics>, d: Derived,
  sections: { sectionType: SlideType; content: SectionContent }[]): Blocker[] {
  const out: Blocker[] = [];
  for (const def of slidesFor(format)) {
    const sec = sections.find((s) => s.sectionType === def.type);
    if (!sec) continue;
    for (const key of def.metrics) {
      if (!NON_BLOCKING.has(key) && isMissing(e, d, key))
        out.push({ slide: def.type, kind: "metric", key, message: `${def.label}: no Redshift data for ${key}` });
    }
    for (const c of def.copy) {
      if (c.required && !(sec.content.copy?.[c.key] ?? "").trim())
        out.push({ slide: def.type, kind: "copy", key: c.key, message: `${def.label}: “${c.label}” is empty` });
    }
    const groups = [...new Set(def.images.map((i) => i.group))];
    for (const g of groups) {
      if (g === "logo") continue; // logo is optional; cover shows the client name regardless
      const filled = def.images.filter((i) => i.group === g).some((i) => resolveSlotImages(sec.content, i.id).urls.length > 0);
      if (!filled) out.push({ slide: def.type, kind: "image", key: g, message: `${def.label}: no ${g} images in Design (add them there, or an emergency manual image)` });
    }
  }
  return out;
}
export function manualImageCount(sections: { content: SectionContent }[]): number {
  return sections.reduce((n, s) => n + Object.values(s.content.manualImages ?? {}).filter((u) => u.length > 0).length, 0);
}

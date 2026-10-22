/** The six v2 report sections that have a paper document.
 *
 *  `label`, `title`, and `blurb` are copied VERBATIM from the on-screen pages so
 *  the paper document and the dashboard never drift apart:
 *    label → ReportsControlsBar's sectionLabel
 *    title → the page <h1>
 *    blurb → the standfirst under the <h1>
 *
 *  The portal's seventh section, business-model-audit, is deliberately absent: it
 *  is an iframe of /api/portal/audit, renders no ReportsControlsBar, and therefore
 *  has no PDF control to fix. */

export type PrintSectionId =
  | "overview"
  | "advertising-audit"
  | "inventory"
  | "period-comparative"
  | "share-of-voice"
  | "subscribe-save";

/** What the section's data is keyed by, which decides the print URL's params.
 *  range    → start + end          (the week/custom picker)
 *  snapshot → no dates at all      (inventory is a point-in-time stock read)
 *  year     → a single year        (S&S is a full calendar year) */
export type PrintRangeKind = "range" | "snapshot" | "year";

export interface PrintSectionMeta {
  id: PrintSectionId;
  label: string;
  title: string;
  blurb: string;
  rangeKind: PrintRangeKind;
}

export const PRINT_SECTIONS: Record<PrintSectionId, PrintSectionMeta> = {
  overview: {
    id: "overview",
    // Hub passes no sectionLabel, so it defaults to "Performance Overview";
    // the portal page passes "Overview". Resolved to the hub's wording for both.
    label: "Performance Overview",
    title: "Performance overview",
    blurb:
      "An executive-first reporting layout that separates headline performance, diagnostics, and detailed analysis.",
    rangeKind: "range",
  },
  "advertising-audit": {
    id: "advertising-audit",
    label: "Advertising Audit",
    title: "Advertising audit",
    blurb:
      "Ad spend, performance and campaign efficiency — campaign breakdowns, ACoS vs goal, segmentation and keyword gaps.",
    rangeKind: "range",
  },
  inventory: {
    id: "inventory",
    label: "Inventory",
    title: "Inventory",
    blurb:
      "Stock levels, availability and inventory health per ASIN — status tables and FBA breakdowns.",
    rangeKind: "snapshot",
  },
  "period-comparative": {
    id: "period-comparative",
    label: "Period Comparative",
    title: "Period comparative",
    blurb:
      "Current period against previous month and previous year — trend, comparison cards, and daily detail.",
    rangeKind: "range",
  },
  "share-of-voice": {
    id: "share-of-voice",
    label: "Share of Voice",
    title: "Share of voice",
    blurb:
      "Brand visibility in search results — top brands, keyword coverage, and brand-vs-competitor trends per keyword.",
    rangeKind: "range",
  },
  "subscribe-save": {
    id: "subscribe-save",
    label: "Subscribe & Save",
    title: "Subscribe & Save",
    blurb:
      "Weekly subscription performance across the selected year — subscriptions, sales, units and penetration vs previous year.",
    rangeKind: "year",
  },
};

export function isPrintSectionId(value: string): value is PrintSectionId {
  return Object.prototype.hasOwnProperty.call(PRINT_SECTIONS, value);
}

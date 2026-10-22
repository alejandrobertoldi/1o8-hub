// A+ 2.0 Module Specifications
//
// Schema-driven spec for all 19 Amazon Premium A+ module types. The editor
// component (<Aplus2ModuleEditor>) renders text fields, image slots, video
// slots, and repeatable items by reading this file — no per-type code.
//
// Repeatable items store their per-type fields in aplus2_module_items.data
// (JSONB). The Aplus2ItemData discriminated union below is the canonical
// shape; Zod validators in zod-schemas.ts enforce it at the API boundary.

export const APLUS2_MODULE_TYPES = [
  "full_image",
  "simple_image_carousel",
  "full_video",
  "qa",
  "background_image_text",
  "comparison_table_1",
  "comparison_table_2",
  "comparison_table_3",
  "dual_images_text",
  "four_images_text",
  "hotspots_1",
  "hotspots_2",
  "navigation_carousel",
  "regimen_carousel",
  "single_image_text",
  "technical_specifications",
  "text",
  "video_image_carousel",
  "video_text",
  "basic_text",
  "basic_header_image_text",
  "basic_single_image_text",
  "basic_three_image_text",
  "basic_four_image_text",
  "basic_single_image_highlights",
  "basic_technical_specifications",
  "basic_comparison_table",
] as const;

export type Aplus2ModuleType = (typeof APLUS2_MODULE_TYPES)[number];

/** Item-data tag stored at module-spec time — Zod uses this to pick the
 * right shape validator for aplus2_module_items.data. */
export type Aplus2ItemDataType =
  | "qa"
  | "comparison_row_1"
  | "comparison_row_2"
  | "comparison_row_3"
  | "carousel_slide"
  | "hotspot"
  | "regimen_step"
  | "tech_spec_row"
  | "image_caption"
  | "panel"
  | "highlight_bullet"
  | "basic_comparison_row";

/** Discriminated union for aplus2_module_items.data. */
export type Aplus2ItemData =
  | { type: "qa"; question: string; answer: string }
  | { type: "comparison_row_1"; metric: string; metric_type: string; value_hero: string; value_1: string; value_2: string; value_3: string; value_4: string; value_5: string; value_6: string }
  | { type: "comparison_row_2"; headline_1: string; body_1: string; headline_2: string; body_2: string; headline_3: string; body_3: string }
  | { type: "comparison_row_3"; feature: string; metric_type: string; value_hero: string; value_1: string; value_2: string; value_3: string; value_4: string }
  | { type: "carousel_slide"; headline: string; body: string; cta_text: string; asin: string }
  | { type: "hotspot"; title: string; description?: string }
  | { type: "regimen_step"; step_label: string; description: string; nav_text: string }
  | { type: "tech_spec_row"; spec_label: string; spec_value: string }
  | { type: "image_caption"; caption: string; body: string }
  | { type: "panel"; tab_title?: string; subheadline?: string; caption?: string; body: string; headline?: string }
  | { type: "highlight_bullet"; text: string }
  | { type: "basic_comparison_row"; metric: string; metric_type: string;
      value_1: string; value_2: string; value_3: string;
      value_4: string; value_5: string; value_6: string };

// ─── Field spec types (mirror aplus-module-specs.ts) ────────────────

export interface Aplus2TextFieldSpec {
  /** DB column key — shared text columns in aplus2_modules. */
  key: "headlineText" | "subheadlineText" | "bodyText" | "overlayText" | "altText";
  label: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  hint?: string;
}

export interface Aplus2ImageSize {
  width: number;
  height: number;
}

export interface Aplus2ImageSlotSpec {
  /** Stored in aplus2_assets.slot_key. */
  key: string;
  label: string;
  desktopSize: Aplus2ImageSize;
  /** When present, the slot also accepts a mobile variant. */
  mobileSize?: Aplus2ImageSize;
}

export interface Aplus2RepeatableFieldSpec {
  /** Field key inside aplus2_module_items.data. */
  key: string;
  label: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  hint?: string;
}

export interface Aplus2RepeatableImageSpec {
  key: string;
  label: string;
  desktopSize: Aplus2ImageSize;
  mobileSize?: Aplus2ImageSize;
}

export interface Aplus2RepeatableGroupSpec {
  label: string;
  itemLabel: string;
  minItems: number;
  maxItems: number;
  defaultCount: number;
  fields: Aplus2RepeatableFieldSpec[];
  image?: Aplus2RepeatableImageSpec;
  /** Discriminator written into data.type for every item of this group. */
  itemDataType: Aplus2ItemDataType;
}

export interface Aplus2VideoSpec {
  titleMaxLen: number;
  descriptionMaxLen: number;
}

export type Aplus2LayoutControl =
  | { key: "text_position"; options: Array<"left" | "right"> }
  | { key: "font_color"; options: Array<"light" | "dark"> };

export type Aplus2LayoutItem =
  | { type: "textField"; fieldKey: Aplus2TextFieldSpec["key"] }
  | { type: "imageSlot"; slotKey: string }
  | { type: "repeatableGroup" }
  | { type: "videoSlot" };

export interface Aplus2ModuleSpec {
  type: Aplus2ModuleType;
  /** Content tier this module belongs to. Drives the add-module picker filter. */
  tier: "PA+" | "BA+";
  label: string;
  description: string;
  textFields: Aplus2TextFieldSpec[];
  imageSlots: Aplus2ImageSlotSpec[];
  repeatableGroup?: Aplus2RepeatableGroupSpec;
  video?: Aplus2VideoSpec;
  layoutControls?: Aplus2LayoutControl[];
  layout?: Aplus2LayoutItem[];
}

/** Compute layout order — uses explicit `layout` if defined, else defaults
 * to: textFields → imageSlots → (videoSlot if video) → repeatableGroup. */
export function getAplus2ModuleLayout(spec: Aplus2ModuleSpec): Aplus2LayoutItem[] {
  if (spec.layout) return spec.layout;
  const items: Aplus2LayoutItem[] = [];
  for (const f of spec.textFields) items.push({ type: "textField", fieldKey: f.key });
  for (const s of spec.imageSlots) items.push({ type: "imageSlot", slotKey: s.key });
  if (spec.video) items.push({ type: "videoSlot" });
  if (spec.repeatableGroup) items.push({ type: "repeatableGroup" });
  return items;
}

// ─── 27 module specs (19 PA+ + 8 BA+) ───────────────────────────────
// Data transcribed from src/lib/aplus-module-specs.ts with these deltas:
//   1. Every repeatableGroup gets `itemDataType` + `defaultCount`.
//   2. background_image_text gains `layoutControls` for text_position + font_color.
//   3. Video modules gain a `video` spec block (title 50, description 500).
// Image dimensions, char limits, min/max counts are byte-for-byte identical.

export const APLUS2_MODULE_SPECS: Record<Aplus2ModuleType, Aplus2ModuleSpec> = {
  background_image_text: {
    type: "background_image_text",
    tier: "PA+",
    label: "Premium Background Image with Text",
    description: "Full-width background image with subheadline, headline and body text overlay",
    textFields: [
      { key: "subheadlineText", label: "Subheadline", maxLength: 40 },
      { key: "headlineText", label: "Headline", maxLength: 60 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 300 },
    ],
    imageSlots: [
      { key: "background_image", label: "Background image", desktopSize: { width: 1464, height: 600 }, mobileSize: { width: 600, height: 450 } },
    ],
    layoutControls: [
      { key: "text_position", options: ["left", "right"] },
      { key: "font_color", options: ["light", "dark"] },
    ],
    layout: [
      { type: "textField", fieldKey: "subheadlineText" },
      { type: "textField", fieldKey: "headlineText" },
      { type: "textField", fieldKey: "bodyText" },
      { type: "imageSlot", slotKey: "background_image" },
    ],
  },

  comparison_table_1: {
    type: "comparison_table_1",
    tier: "PA+",
    label: "Premium Comparison Table 1",
    description: "Hero product + 3 to 6 comparison products with metrics",
    textFields: [{ key: "headlineText", label: "Title", maxLength: 25 }],
    imageSlots: [
      { key: "hero_product", label: "Hero Product", desktopSize: { width: 200, height: 225 } },
      { key: "product_1", label: "Product 1", desktopSize: { width: 200, height: 225 } },
      { key: "product_2", label: "Product 2", desktopSize: { width: 200, height: 225 } },
      { key: "product_3", label: "Product 3", desktopSize: { width: 200, height: 225 } },
      { key: "product_4", label: "Product 4", desktopSize: { width: 200, height: 225 } },
      { key: "product_5", label: "Product 5", desktopSize: { width: 200, height: 225 } },
      { key: "product_6", label: "Product 6", desktopSize: { width: 200, height: 225 } },
    ],
    repeatableGroup: {
      label: "Comparison Metrics", itemLabel: "Metric", minItems: 5, maxItems: 12, defaultCount: 5,
      itemDataType: "comparison_row_1",
      fields: [
        { key: "metric", label: "Metric", maxLength: 30 },
        { key: "metric_type", label: "Type", hint: "checkbox or text" },
        { key: "value_hero", label: "Hero Value", maxLength: 30 },
        { key: "value_1", label: "Product 1 Value", maxLength: 30 },
        { key: "value_2", label: "Product 2 Value", maxLength: 30 },
        { key: "value_3", label: "Product 3 Value", maxLength: 30 },
        { key: "value_4", label: "Product 4 Value", maxLength: 30 },
        { key: "value_5", label: "Product 5 Value", maxLength: 30 },
        { key: "value_6", label: "Product 6 Value", maxLength: 30 },
      ],
    },
  },

  comparison_table_2: {
    type: "comparison_table_2",
    tier: "PA+",
    label: "Premium Comparison Table 2",
    description: "3 products with images, headlines, ASINs, and feature comparison rows",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 80 }],
    imageSlots: [
      { key: "product_1", label: "Product 1", desktopSize: { width: 300, height: 225 } },
      { key: "product_2", label: "Product 2", desktopSize: { width: 300, height: 225 } },
      { key: "product_3", label: "Product 3", desktopSize: { width: 300, height: 225 } },
    ],
    repeatableGroup: {
      label: "Feature comparison", itemLabel: "Comparison", minItems: 2, maxItems: 5, defaultCount: 2,
      itemDataType: "comparison_row_2",
      fields: [
        { key: "headline_1", label: "Headline (Product 1)", maxLength: 30 },
        { key: "body_1", label: "Body text (Product 1)", maxLength: 80 },
        { key: "headline_2", label: "Headline (Product 2)", maxLength: 30 },
        { key: "body_2", label: "Body text (Product 2)", maxLength: 80 },
        { key: "headline_3", label: "Headline (Product 3)", maxLength: 30 },
        { key: "body_3", label: "Body text (Product 3)", maxLength: 80 },
      ],
    },
  },

  comparison_table_3: {
    type: "comparison_table_3",
    tier: "PA+",
    label: "Premium Comparison Table 3",
    description: "Hero plus 2 to 4 comparison products with toggle-style feature comparison",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 25 }],
    imageSlots: [
      { key: "hero_product", label: "Hero Product", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
      { key: "product_1", label: "Product 1", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
      { key: "product_2", label: "Product 2", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
      { key: "product_3", label: "Product 3", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
      { key: "product_4", label: "Product 4", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
    ],
    repeatableGroup: {
      label: "Comparison Metrics", itemLabel: "Metric", minItems: 3, maxItems: 7, defaultCount: 3,
      itemDataType: "comparison_row_3",
      fields: [
        { key: "feature", label: "Metric", maxLength: 20 },
        { key: "metric_type", label: "Type", hint: "checkbox or text" },
        { key: "value_hero", label: "Hero Value", maxLength: 30 },
        { key: "value_1", label: "Product 1", maxLength: 30 },
        { key: "value_2", label: "Product 2", maxLength: 30 },
        { key: "value_3", label: "Product 3", maxLength: 30 },
        { key: "value_4", label: "Product 4", maxLength: 30 },
      ],
    },
  },

  dual_images_text: {
    type: "dual_images_text",
    tier: "PA+",
    label: "Premium Dual Images with Text",
    description: "2 images side-by-side, each with its own headline and body text",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 50 }],
    imageSlots: [
      { key: "image_1", label: "Image 1", desktopSize: { width: 650, height: 350 } },
      { key: "image_2", label: "Image 2", desktopSize: { width: 650, height: 350 } },
    ],
    repeatableGroup: {
      label: "Image Captions", itemLabel: "Caption", minItems: 2, maxItems: 2, defaultCount: 2,
      itemDataType: "image_caption",
      fields: [
        { key: "caption", label: "Image Headline", maxLength: 50 },
        { key: "body", label: "Body Text", multiline: true, rows: 2, maxLength: 300 },
      ],
    },
  },

  four_images_text: {
    type: "four_images_text",
    tier: "PA+",
    label: "Premium Four Images and Text",
    description: "4 images in a row, each with headline and short body text",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 80 }],
    imageSlots: [
      { key: "image_1", label: "Image 1", desktopSize: { width: 300, height: 225 } },
      { key: "image_2", label: "Image 2", desktopSize: { width: 300, height: 225 } },
      { key: "image_3", label: "Image 3", desktopSize: { width: 300, height: 225 } },
      { key: "image_4", label: "Image 4", desktopSize: { width: 300, height: 225 } },
    ],
    repeatableGroup: {
      label: "Image Captions", itemLabel: "Caption", minItems: 4, maxItems: 4, defaultCount: 4,
      itemDataType: "image_caption",
      fields: [
        { key: "caption", label: "Image Headline", maxLength: 30 },
        { key: "body", label: "Image Body Text", multiline: true, rows: 2, maxLength: 150 },
      ],
    },
  },

  full_image: {
    type: "full_image",
    tier: "PA+",
    label: "Premium Full Image",
    description: "Full-width image with optional headline and body text",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 300 },
      { key: "altText", label: "Image alt text", maxLength: 100, hint: "Describes the image for accessibility" },
    ],
    imageSlots: [{ key: "main_image", label: "Image", desktopSize: { width: 1464, height: 600 }, mobileSize: { width: 600, height: 450 } }],
  },

  full_video: {
    type: "full_video",
    tier: "PA+",
    label: "Premium Full Video",
    description: "Full-width video with thumbnail, headline and body text",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 300 },
    ],
    imageSlots: [{ key: "video_thumbnail", label: "Video thumbnail", desktopSize: { width: 1464, height: 600 }, mobileSize: { width: 600, height: 450 } }],
    video: { titleMaxLen: 50, descriptionMaxLen: 500 },
    layout: [
      { type: "textField", fieldKey: "headlineText" },
      { type: "imageSlot", slotKey: "video_thumbnail" },
      { type: "videoSlot" },
      { type: "textField", fieldKey: "bodyText" },
    ],
  },

  hotspots_1: {
    type: "hotspots_1",
    tier: "PA+",
    label: "Premium Hotspots 1",
    description: "Background image with clickable hotspots, each revealing headline + body + image",
    textFields: [],
    imageSlots: [{ key: "main_image", label: "Background Image", desktopSize: { width: 1464, height: 600 } }],
    repeatableGroup: {
      label: "Hotspots", itemLabel: "Hotspot", minItems: 1, maxItems: 6, defaultCount: 3,
      itemDataType: "hotspot",
      fields: [
        { key: "title", label: "Headline", maxLength: 50 },
        { key: "description", label: "Body Text", multiline: true, rows: 2, maxLength: 200 },
      ],
      image: { key: "hotspot_image", label: "Hotspot Image", desktopSize: { width: 600, height: 450 } },
    },
  },

  hotspots_2: {
    type: "hotspots_2",
    tier: "PA+",
    label: "Premium Hotspots 2",
    description: "Headline + body text, background image with numbered hotspots",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 2, maxLength: 300 },
    ],
    imageSlots: [{ key: "main_image", label: "Background Image", desktopSize: { width: 1464, height: 600 } }],
    repeatableGroup: {
      label: "Hotspots", itemLabel: "Hotspot", minItems: 1, maxItems: 8, defaultCount: 3,
      itemDataType: "hotspot",
      fields: [{ key: "title", label: "Headline", maxLength: 50 }],
      image: { key: "hotspot_image", label: "Hotspot Image", desktopSize: { width: 600, height: 450 } },
    },
  },

  navigation_carousel: {
    type: "navigation_carousel",
    tier: "PA+",
    label: "Premium Navigation Carousel",
    description: "Tabbed navigation with image + text card per panel",
    textFields: [],
    imageSlots: [],
    repeatableGroup: {
      label: "Panels", itemLabel: "Panel", minItems: 2, maxItems: 5, defaultCount: 2,
      itemDataType: "panel",
      fields: [
        { key: "tab_title", label: "Navigation Text", maxLength: 25 },
        { key: "subheadline", label: "Subheadline", maxLength: 25 },
        { key: "caption", label: "Headline", maxLength: 50 },
        { key: "body", label: "Body Text", multiline: true, rows: 2, maxLength: 100 },
      ],
      image: { key: "tab_image", label: "Panel Image", desktopSize: { width: 1464, height: 600 }, mobileSize: { width: 600, height: 450 } },
    },
  },

  qa: {
    type: "qa",
    tier: "PA+",
    label: "Premium Q&A",
    description: "Accordion-style question and answer pairs",
    textFields: [],
    imageSlots: [],
    repeatableGroup: {
      label: "Q&A Pairs", itemLabel: "Q&A", minItems: 2, maxItems: 5, defaultCount: 3,
      itemDataType: "qa",
      fields: [
        { key: "question", label: "Question", maxLength: 120 },
        { key: "answer", label: "Answer", multiline: true, rows: 3, maxLength: 250 },
      ],
    },
  },

  regimen_carousel: {
    type: "regimen_carousel",
    tier: "PA+",
    label: "Premium Regimen Carousel",
    description: "Numbered step carousel with image, headline, body text, and navigation",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 100 }],
    imageSlots: [],
    repeatableGroup: {
      label: "Panels", itemLabel: "Panel", minItems: 2, maxItems: 5, defaultCount: 3,
      itemDataType: "regimen_step",
      fields: [
        { key: "step_label", label: "Headline", maxLength: 20 },
        { key: "description", label: "Body Text", multiline: true, rows: 2, maxLength: 100 },
        { key: "nav_text", label: "Navigation Text", maxLength: 20 },
      ],
      image: { key: "step_image", label: "Panel Image", desktopSize: { width: 1464, height: 600 }, mobileSize: { width: 600, height: 450 } },
    },
  },

  simple_image_carousel: {
    type: "simple_image_carousel",
    tier: "PA+",
    label: "Premium Simple Image Carousel",
    description: "Full-width image slides with headline, body text, and button",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 300 },
    ],
    imageSlots: [],
    repeatableGroup: {
      label: "Panels", itemLabel: "Panel", minItems: 2, maxItems: 6, defaultCount: 2,
      itemDataType: "carousel_slide",
      fields: [
        { key: "headline", label: "Headline", maxLength: 50 },
        { key: "body", label: "Body Text", multiline: true, rows: 2, maxLength: 200 },
        { key: "cta_text", label: "Button Text", maxLength: 12, hint: "Button label (optional)" },
        { key: "asin", label: "ASIN", maxLength: 10, hint: "Linked ASIN for button" },
        { key: "altText", label: "Alt text", maxLength: 100 },
        { key: "mobileAltText", label: "Mobile alt text", maxLength: 100 },
      ],
      image: { key: "slide_image", label: "Panel Image", desktopSize: { width: 1464, height: 600 }, mobileSize: { width: 600, height: 450 } },
    },
  },

  single_image_text: {
    type: "single_image_text",
    tier: "PA+",
    label: "Premium Single Image with Text",
    description: "Image on one side with subheadline, headline, and body text",
    textFields: [
      { key: "subheadlineText", label: "Subheadline", maxLength: 40 },
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body", multiline: true, rows: 3, maxLength: 500 },
    ],
    imageSlots: [{ key: "main_image", label: "Image", desktopSize: { width: 800, height: 600 } }],
  },

  technical_specifications: {
    type: "technical_specifications",
    tier: "PA+",
    label: "Premium Technical Specifications",
    description: "Two-column spec table with label-value rows",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 80 }],
    imageSlots: [],
    repeatableGroup: {
      label: "Specifications", itemLabel: "Spec", minItems: 4, maxItems: 16, defaultCount: 4,
      itemDataType: "tech_spec_row",
      fields: [
        { key: "spec_label", label: "Specification Name", maxLength: 30 },
        { key: "spec_value", label: "Definition", multiline: true, rows: 3, maxLength: 500 },
      ],
    },
  },

  text: {
    type: "text",
    tier: "PA+",
    label: "Premium Text",
    description: "Headline with long-form body text",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body Text", multiline: true, rows: 6, maxLength: 5000 },
    ],
    imageSlots: [],
  },

  video_image_carousel: {
    type: "video_image_carousel",
    tier: "PA+",
    label: "Premium Video Image Carousel",
    description: "Video plus image carousel with headline, subheadline, and body text per panel",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 80 }],
    imageSlots: [],
    video: { titleMaxLen: 50, descriptionMaxLen: 500 },
    repeatableGroup: {
      label: "Panels", itemLabel: "Panel", minItems: 2, maxItems: 6, defaultCount: 3,
      itemDataType: "panel",
      fields: [
        { key: "headline", label: "Headline", maxLength: 50 },
        { key: "subheadline", label: "Subheadline", maxLength: 80 },
        { key: "body", label: "Body Text", multiline: true, rows: 3, maxLength: 500 },
      ],
      image: { key: "carousel_image", label: "Panel Image", desktopSize: { width: 800, height: 600 }, mobileSize: { width: 600, height: 450 } },
    },
  },

  video_text: {
    type: "video_text",
    tier: "PA+",
    label: "Premium Video with Text",
    description: "Video on one side with subheadline, headline, and body text",
    textFields: [
      { key: "subheadlineText", label: "Subheadline", maxLength: 40 },
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body Text", multiline: true, rows: 3, maxLength: 500 },
    ],
    imageSlots: [{ key: "video_thumbnail", label: "Video thumbnail", desktopSize: { width: 800, height: 600 } }],
    video: { titleMaxLen: 50, descriptionMaxLen: 500 },
  },

  basic_text: {
    type: "basic_text",
    tier: "BA+",
    label: "Basic All Text",
    description: "Standard All Text — headline (optional) with long-form body text",
    textFields: [
      { key: "headlineText", label: "Headline (optional)", maxLength: 160 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 6, maxLength: 6000 },
    ],
    imageSlots: [],
  },

  basic_header_image_text: {
    type: "basic_header_image_text",
    tier: "BA+",
    label: "Basic Image Header with Text",
    description: "Standard Image Header With Text — banner image above headline + body",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 160 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 500 },
    ],
    imageSlots: [
      { key: "header_image", label: "Header image", desktopSize: { width: 970, height: 600 } },
    ],
  },

  basic_single_image_text: {
    type: "basic_single_image_text",
    tier: "BA+",
    label: "Basic Single Image with Text",
    description: "Standard Single Left/Right Image — square image beside headline + body",
    textFields: [
      { key: "headlineText", label: "Headline (optional)", maxLength: 160 },
      { key: "bodyText", label: "Body text (optional)", multiline: true, rows: 4, maxLength: 1000 },
    ],
    imageSlots: [
      { key: "main_image", label: "Image", desktopSize: { width: 300, height: 300 } },
    ],
    layoutControls: [
      { key: "text_position", options: ["left", "right"] },
    ],
  },

  basic_three_image_text: {
    type: "basic_three_image_text",
    tier: "BA+",
    label: "Basic Three Images and Text",
    description: "Standard Three Images & Text — three square images, each with caption + body",
    textFields: [
      { key: "headlineText", label: "Module headline", maxLength: 160 },
    ],
    imageSlots: [
      { key: "image_1", label: "Image 1", desktopSize: { width: 300, height: 300 } },
      { key: "image_2", label: "Image 2", desktopSize: { width: 300, height: 300 } },
      { key: "image_3", label: "Image 3", desktopSize: { width: 300, height: 300 } },
    ],
    repeatableGroup: {
      label: "Image Captions", itemLabel: "Caption", minItems: 3, maxItems: 3, defaultCount: 3,
      itemDataType: "image_caption",
      fields: [
        { key: "caption", label: "Image Headline", maxLength: 160 },
        { key: "body", label: "Body Text", multiline: true, rows: 2, maxLength: 1000 },
      ],
    },
  },

  basic_four_image_text: {
    type: "basic_four_image_text",
    tier: "BA+",
    label: "Basic Four Images and Text",
    description: "Standard Four Images & Text — four square images, each with caption + body",
    textFields: [
      { key: "headlineText", label: "Module headline", maxLength: 160 },
    ],
    imageSlots: [
      { key: "image_1", label: "Image 1", desktopSize: { width: 200, height: 200 } },
      { key: "image_2", label: "Image 2", desktopSize: { width: 200, height: 200 } },
      { key: "image_3", label: "Image 3", desktopSize: { width: 200, height: 200 } },
      { key: "image_4", label: "Image 4", desktopSize: { width: 200, height: 200 } },
    ],
    repeatableGroup: {
      label: "Image Captions", itemLabel: "Caption", minItems: 4, maxItems: 4, defaultCount: 4,
      itemDataType: "image_caption",
      fields: [
        { key: "caption", label: "Image Headline", maxLength: 160 },
        { key: "body", label: "Image Body Text", multiline: true, rows: 2, maxLength: 1000 },
      ],
    },
  },

  basic_single_image_highlights: {
    type: "basic_single_image_highlights",
    tier: "BA+",
    label: "Basic Single Image with Highlights",
    description: "Standard Single Image & Highlights — square image with intro text and bullet highlights",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 160 },
      { key: "subheadlineText", label: "Subheadline", maxLength: 50 },
      { key: "bodyText", label: "Intro body text", multiline: true, rows: 4, maxLength: 1000 },
    ],
    imageSlots: [
      { key: "main_image", label: "Image", desktopSize: { width: 300, height: 300 } },
    ],
    repeatableGroup: {
      label: "Highlights", itemLabel: "Highlight", minItems: 1, maxItems: 8, defaultCount: 3,
      itemDataType: "highlight_bullet",
      fields: [
        { key: "text", label: "Highlight", maxLength: 100 },
      ],
    },
  },

  basic_technical_specifications: {
    type: "basic_technical_specifications",
    tier: "BA+",
    label: "Basic Technical Specifications",
    description: "Standard Technical Specifications — label/value spec rows",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 160 },
    ],
    imageSlots: [],
    repeatableGroup: {
      label: "Specifications", itemLabel: "Spec row", minItems: 4, maxItems: 16, defaultCount: 4,
      itemDataType: "tech_spec_row",
      fields: [
        { key: "spec_label", label: "Spec Name", maxLength: 30 },
        { key: "spec_value", label: "Spec Definition", multiline: true, rows: 3, maxLength: 500 },
      ],
    },
  },

  basic_comparison_table: {
    type: "basic_comparison_table",
    tier: "BA+",
    label: "Basic Comparison Chart",
    description: "Standard Comparison Chart — 2 to 6 product columns with metric rows",
    textFields: [
      { key: "headlineText", label: "Title", maxLength: 80 },
    ],
    imageSlots: [
      { key: "product_1", label: "Product 1", desktopSize: { width: 150, height: 300 } },
      { key: "product_2", label: "Product 2", desktopSize: { width: 150, height: 300 } },
      { key: "product_3", label: "Product 3", desktopSize: { width: 150, height: 300 } },
      { key: "product_4", label: "Product 4", desktopSize: { width: 150, height: 300 } },
      { key: "product_5", label: "Product 5", desktopSize: { width: 150, height: 300 } },
      { key: "product_6", label: "Product 6", desktopSize: { width: 150, height: 300 } },
    ],
    repeatableGroup: {
      label: "Comparison Metrics", itemLabel: "Metric", minItems: 1, maxItems: 10, defaultCount: 3,
      itemDataType: "basic_comparison_row",
      fields: [
        { key: "metric", label: "Metric", maxLength: 80 },
        { key: "metric_type", label: "Type", hint: "checkbox or text" },
        { key: "value_1", label: "Product 1 Value", maxLength: 80 },
        { key: "value_2", label: "Product 2 Value", maxLength: 80 },
        { key: "value_3", label: "Product 3 Value", maxLength: 80 },
        { key: "value_4", label: "Product 4 Value", maxLength: 80 },
        { key: "value_5", label: "Product 5 Value", maxLength: 80 },
        { key: "value_6", label: "Product 6 Value", maxLength: 80 },
      ],
    },
  },
};

/** All module types belonging to a tier — drives the add-module picker. */
export function moduleTypesForTier(tier: "PA+" | "BA+"): Aplus2ModuleType[] {
  return APLUS2_MODULE_TYPES.filter((t) => APLUS2_MODULE_SPECS[t].tier === tier);
}

/** Hard module cap per tier. BA+ = 5 (Amazon Standard), PA+ = 7. */
export function maxModulesForTier(contentType: string): number {
  return contentType === "BA+" ? 5 : 7;
}

const CAROUSEL_TYPES = new Set<string>([
  "simple_image_carousel",
  "navigation_carousel",
  "regimen_carousel",
  "video_image_carousel",
]);

export function isCarouselModule(type: string): boolean {
  return CAROUSEL_TYPES.has(type);
}

/** Allowed panel counts for a carousel type (from spec min/max). */
export function carouselPanelOptions(type: Aplus2ModuleType): number[] {
  const group = APLUS2_MODULE_SPECS[type].repeatableGroup;
  if (!group) return [];
  return Array.from({ length: group.maxItems - group.minItems + 1 }, (_, i) => group.minItems + i);
}

export function defaultCarouselPanelCount(type: Aplus2ModuleType): number {
  return APLUS2_MODULE_SPECS[type].repeatableGroup?.defaultCount ?? 2;
}

export function isQaModule(type: string): boolean {
  return type === "qa";
}

/** Q&A pair counts offered when adding a Premium Q&A module. Spec min is 2; new modules start at 3–5. */
export function qaQuestionOptions(): number[] {
  return [3, 4, 5];
}

export function defaultQaQuestionCount(): number {
  return APLUS2_MODULE_SPECS.qa.repeatableGroup?.defaultCount ?? 3;
}

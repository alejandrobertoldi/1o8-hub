// Premium A+ Content Module Type Specifications
//
// These are the 19 Amazon Premium A+ module types.
// Standard (Basic) A+ types are deferred to a future milestone.
//
// Each spec defines: text fields shown, image slots with dimensions,
// and optional repeatable groups (Q&A pairs, comparison rows, etc.).

export const APLUS_MODULE_TYPES = [
  "background_image_text",
  "comparison_table_1",
  "comparison_table_2",
  "comparison_table_3",
  "dual_images_text",
  "four_images_text",
  "full_image",
  "full_video",
  "hotspots_1",
  "hotspots_2",
  "navigation_carousel",
  "qa",
  "regimen_carousel",
  "simple_image_carousel",
  "single_image_text",
  "technical_specifications",
  "text",
  "video_image_carousel",
  "video_text",
] as const;

export type AplusModuleType = (typeof APLUS_MODULE_TYPES)[number];

// ─── Field spec types ───────────────────────────────────────────────

export interface TextFieldSpec {
  /** DB column key (headlineText, subheadlineText, bodyText, overlayText) */
  key: "headlineText" | "subheadlineText" | "bodyText" | "overlayText";
  /** Display label */
  label: string;
  /** Render as textarea */
  multiline?: boolean;
  /** Textarea rows (default 2) */
  rows?: number;
  /** Character limit shown in UI */
  maxLength?: number;
  /** Helper hint below input */
  hint?: string;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface ImageSlotSpec {
  /** Stored in customLabel column */
  key: string;
  /** Display label */
  label: string;
  /** Desktop image dimensions (px) */
  desktopSize: ImageSize;
  /** Mobile image dimensions (px) — optional, some slots are same */
  mobileSize?: ImageSize;
}

export interface RepeatableFieldSpec {
  /** DB key for this field within the repeatable item */
  key: string;
  label: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  hint?: string;
}

export interface RepeatableImageSpec {
  key: string;
  label: string;
  desktopSize: ImageSize;
  mobileSize?: ImageSize;
}

export interface RepeatableGroupSpec {
  /** Label for the group (e.g. "Q&A Pair", "Hotspot") */
  label: string;
  /** Singular item label (e.g. "Question", "Step") */
  itemLabel: string;
  minItems: number;
  maxItems: number;
  /** Text fields per repeatable item */
  fields: RepeatableFieldSpec[];
  /** Image per repeatable item (optional) */
  image?: RepeatableImageSpec;
}

/** Layout item — controls the render order of fields in the module card */
export type LayoutItem =
  | { type: "textField"; fieldKey: TextFieldSpec["key"] }
  | { type: "imageSlot"; slotKey: string }
  | { type: "repeatableGroup" };

export interface ModuleSpec {
  /** Human-readable display name */
  label: string;
  /** Short description shown in picker */
  description: string;
  /** Which module-level text fields to show */
  textFields: TextFieldSpec[];
  /** Image slots with dimension specs */
  imageSlots: ImageSlotSpec[];
  /** Whether this module includes a video upload */
  hasVideo?: boolean;
  /** Repeatable content groups (Q&A, hotspots, comparison rows, etc.) */
  repeatableGroup?: RepeatableGroupSpec;
  /**
   * Explicit field ordering for the card UI.
   * If omitted, defaults to: textFields → imageSlots → repeatableGroup.
   * Allows interleaving (e.g. Headline → Image → Body text).
   */
  layout?: LayoutItem[];
}

/** Compute layout order — uses explicit layout if defined, else default order */
export function getModuleLayout(spec: ModuleSpec): LayoutItem[] {
  if (spec.layout) return spec.layout;
  const items: LayoutItem[] = [];
  for (const f of spec.textFields) items.push({ type: "textField", fieldKey: f.key });
  for (const s of spec.imageSlots) items.push({ type: "imageSlot", slotKey: s.key });
  if (spec.repeatableGroup) items.push({ type: "repeatableGroup" });
  return items;
}

// ─── Module specs ───────────────────────────────────────────────────

export const APLUS_MODULE_SPECS: Record<AplusModuleType, ModuleSpec> = {
  // ── Background Image with Text ──────────────────────────────────
  background_image_text: {
    label: "Premium Background Image with Text",
    description: "Full-width background image with subheadline, headline and body text overlay",
    textFields: [
      { key: "subheadlineText", label: "Subheadline", maxLength: 40 },
      { key: "headlineText", label: "Headline", maxLength: 60 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 300 },
    ],
    imageSlots: [
      {
        key: "background_image",
        label: "Background image",
        desktopSize: { width: 1464, height: 600 },
        mobileSize: { width: 600, height: 450 },
      },
    ],
    layout: [
      { type: "textField", fieldKey: "subheadlineText" },
      { type: "textField", fieldKey: "headlineText" },
      { type: "textField", fieldKey: "bodyText" },
      { type: "imageSlot", slotKey: "background_image" },
    ],
  },

  // ── Comparison Table 1 (1 hero + 3-6 comparison) ────────────────
  comparison_table_1: {
    label: "Premium Comparison Table 1",
    description: "Hero product + 3 to 6 comparison products with metrics",
    textFields: [
      { key: "headlineText", label: "Title", maxLength: 25 },
    ],
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
      label: "Comparison Metrics",
      itemLabel: "Metric",
      minItems: 5,
      maxItems: 12,
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

  // ── Comparison Table 2 (3 products) ─────────────────────────────
  comparison_table_2: {
    label: "Premium Comparison Table 2",
    description: "3 products with images, headlines, ASINs, and feature comparison rows",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
    ],
    imageSlots: [
      { key: "product_1", label: "Product 1", desktopSize: { width: 300, height: 225 } },
      { key: "product_2", label: "Product 2", desktopSize: { width: 300, height: 225 } },
      { key: "product_3", label: "Product 3", desktopSize: { width: 300, height: 225 } },
    ],
    repeatableGroup: {
      label: "Feature comparison",
      itemLabel: "Comparison",
      minItems: 2,
      maxItems: 5,
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

  // ── Comparison Table 3 (hero + 2-4 comparison) ─────────────────
  comparison_table_3: {
    label: "Premium Comparison Table 3",
    description: "Hero plus 2 to 4 comparison products with toggle-style feature comparison",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 25 },
    ],
    imageSlots: [
      { key: "hero_product", label: "Hero Product", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
      { key: "product_1", label: "Product 1", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
      { key: "product_2", label: "Product 2", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
      { key: "product_3", label: "Product 3", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
      { key: "product_4", label: "Product 4", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
    ],
    repeatableGroup: {
      label: "Comparison Metrics",
      itemLabel: "Metric",
      minItems: 3,
      maxItems: 7,
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

  // ── Dual Images with Text ───────────────────────────────────────
  dual_images_text: {
    label: "Premium Dual Images with Text",
    description: "2 images side-by-side, each with its own headline and body text",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 50 },
    ],
    imageSlots: [
      {
        key: "image_1",
        label: "Image 1",
        desktopSize: { width: 650, height: 350 },
      },
      {
        key: "image_2",
        label: "Image 2",
        desktopSize: { width: 650, height: 350 },
      },
    ],
    repeatableGroup: {
      label: "Image Captions",
      itemLabel: "Caption",
      minItems: 2,
      maxItems: 2,
      fields: [
        { key: "caption", label: "Image Headline", maxLength: 50 },
        { key: "body", label: "Body Text", multiline: true, rows: 2, maxLength: 300 },
      ],
    },
  },

  // ── Four Images & Text ──────────────────────────────────────────
  four_images_text: {
    label: "Premium Four Images and Text",
    description: "4 images in a row, each with headline and short body text",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
    ],
    imageSlots: [
      { key: "image_1", label: "Image 1", desktopSize: { width: 300, height: 225 } },
      { key: "image_2", label: "Image 2", desktopSize: { width: 300, height: 225 } },
      { key: "image_3", label: "Image 3", desktopSize: { width: 300, height: 225 } },
      { key: "image_4", label: "Image 4", desktopSize: { width: 300, height: 225 } },
    ],
    repeatableGroup: {
      label: "Image Captions",
      itemLabel: "Caption",
      minItems: 4,
      maxItems: 4,
      fields: [
        { key: "caption", label: "Image Headline", maxLength: 30 },
        { key: "body", label: "Image Body Text", multiline: true, rows: 2, maxLength: 150 },
      ],
    },
  },

  // ── Full Image ──────────────────────────────────────────────────
  full_image: {
    label: "Premium Full Image",
    description: "Full-width image with optional headline and body text",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 300 },
    ],
    imageSlots: [
      {
        key: "main_image",
        label: "Image",
        desktopSize: { width: 1464, height: 600 },
        mobileSize: { width: 600, height: 450 },
      },
    ],
    layout: [
      { type: "textField", fieldKey: "headlineText" },
      { type: "imageSlot", slotKey: "main_image" },
      { type: "textField", fieldKey: "bodyText" },
    ],
  },

  // ── Full Video ──────────────────────────────────────────────────
  full_video: {
    label: "Premium Full Video",
    description: "Full-width video with thumbnail, headline and body text",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 300 },
    ],
    imageSlots: [
      {
        key: "video_thumbnail",
        label: "Video",
        desktopSize: { width: 1464, height: 600 },
        mobileSize: { width: 600, height: 450 },
      },
    ],
    hasVideo: true,
    layout: [
      { type: "textField", fieldKey: "headlineText" },
      { type: "imageSlot", slotKey: "video_thumbnail" },
      { type: "textField", fieldKey: "bodyText" },
    ],
  },

  // ── Hotspots 1 ──────────────────────────────────────────────────
  hotspots_1: {
    label: "Premium Hotspots 1",
    description: "Background image with clickable hotspots, each revealing headline + body + image",
    textFields: [],
    imageSlots: [
      {
        key: "main_image",
        label: "Background Image",
        desktopSize: { width: 1464, height: 600 },
      },
    ],
    repeatableGroup: {
      label: "Hotspots",
      itemLabel: "Hotspot",
      minItems: 1,
      maxItems: 6,
      fields: [
        { key: "title", label: "Headline", maxLength: 50 },
        { key: "description", label: "Body Text", multiline: true, rows: 2, maxLength: 200 },
      ],
      image: {
        key: "hotspot_image",
        label: "Hotspot Image",
        desktopSize: { width: 600, height: 450 },
      },
    },
  },

  // ── Hotspots 2 ──────────────────────────────────────────────────
  hotspots_2: {
    label: "Premium Hotspots 2",
    description: "Headline + body text, background image with numbered hotspots",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 2, maxLength: 300 },
    ],
    imageSlots: [
      {
        key: "main_image",
        label: "Background Image",
        desktopSize: { width: 1464, height: 600 },
      },
    ],
    repeatableGroup: {
      label: "Hotspots",
      itemLabel: "Hotspot",
      minItems: 1,
      maxItems: 8,
      fields: [
        { key: "title", label: "Headline", maxLength: 50 },
      ],
      image: {
        key: "hotspot_image",
        label: "Hotspot Image",
        desktopSize: { width: 600, height: 450 },
      },
    },
  },

  // ── Navigation Carousel ─────────────────────────────────────────
  navigation_carousel: {
    label: "Premium Navigation Carousel",
    description: "Tabbed navigation with image + text card per panel",
    textFields: [],
    imageSlots: [],
    repeatableGroup: {
      label: "Panels",
      itemLabel: "Panel",
      minItems: 2,
      maxItems: 5,
      fields: [
        { key: "tab_title", label: "Navigation Text", maxLength: 25 },
        { key: "subheadline", label: "Subheadline", maxLength: 25 },
        { key: "caption", label: "Headline", maxLength: 50 },
        { key: "body", label: "Body Text", multiline: true, rows: 2, maxLength: 100 },
      ],
      image: {
        key: "tab_image",
        label: "Panel Image",
        desktopSize: { width: 1464, height: 600 },
        mobileSize: { width: 600, height: 450 },
      },
    },
  },

  // ── Q&A ─────────────────────────────────────────────────────────
  qa: {
    label: "Premium Q&A",
    description: "Accordion-style question and answer pairs",
    textFields: [],
    imageSlots: [],
    repeatableGroup: {
      label: "Q&A Pairs",
      itemLabel: "Q&A",
      minItems: 2,
      maxItems: 5,
      fields: [
        { key: "question", label: "Question", maxLength: 120 },
        { key: "answer", label: "Answer", multiline: true, rows: 3, maxLength: 250 },
      ],
    },
  },

  // ── Regimen Carousel ────────────────────────────────────────────
  regimen_carousel: {
    label: "Premium Regimen Carousel",
    description: "Numbered step carousel with image, headline, body text, and navigation",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 100 },
    ],
    imageSlots: [],
    repeatableGroup: {
      label: "Panels",
      itemLabel: "Panel",
      minItems: 2,
      maxItems: 5,
      fields: [
        { key: "step_label", label: "Headline", maxLength: 20 },
        { key: "description", label: "Body Text", multiline: true, rows: 2, maxLength: 100 },
        { key: "nav_text", label: "Navigation Text", maxLength: 20 },
      ],
      image: {
        key: "step_image",
        label: "Panel Image",
        desktopSize: { width: 1464, height: 600 },
        mobileSize: { width: 600, height: 450 },
      },
    },
  },

  // ── Simple Image Carousel ───────────────────────────────────────
  simple_image_carousel: {
    label: "Premium Simple Image Carousel",
    description: "Full-width image slides with headline, body text, and button",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 300 },
    ],
    imageSlots: [],
    repeatableGroup: {
      label: "Panels",
      itemLabel: "Panel",
      minItems: 2,
      maxItems: 6,
      fields: [
        { key: "headline", label: "Headline", maxLength: 50 },
        { key: "body", label: "Body Text", multiline: true, rows: 2, maxLength: 200 },
        { key: "cta_text", label: "Button Text", maxLength: 12, hint: "Button label (optional)" },
        { key: "asin", label: "ASIN", maxLength: 10, hint: "Linked ASIN for button" },
      ],
      image: {
        key: "slide_image",
        label: "Panel Image",
        desktopSize: { width: 1464, height: 600 },
        mobileSize: { width: 600, height: 450 },
      },
    },
  },

  // ── Single Image with Text ──────────────────────────────────────
  single_image_text: {
    label: "Premium Single Image with Text",
    description: "Image on one side with subheadline, headline, and body text",
    textFields: [
      { key: "subheadlineText", label: "Subheadline", maxLength: 40 },
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body", multiline: true, rows: 3, maxLength: 500 },
    ],
    imageSlots: [
      {
        key: "main_image",
        label: "Image",
        desktopSize: { width: 800, height: 600 },
      },
    ],
  },

  // ── Technical Specifications ────────────────────────────────────
  technical_specifications: {
    label: "Premium Technical Specifications",
    description: "Two-column spec table with label-value rows",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
    ],
    imageSlots: [],
    repeatableGroup: {
      label: "Specifications",
      itemLabel: "Spec",
      minItems: 4,
      maxItems: 16,
      fields: [
        { key: "spec_label", label: "Specification Name", maxLength: 30 },
        { key: "spec_value", label: "Definition", multiline: true, rows: 3, maxLength: 500 },
      ],
    },
  },

  // ── Text ────────────────────────────────────────────────────────
  text: {
    label: "Premium Text",
    description: "Headline with long-form body text",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body Text", multiline: true, rows: 6, maxLength: 5000 },
    ],
    imageSlots: [],
  },

  // ── Video Image Carousel ────────────────────────────────────────
  video_image_carousel: {
    label: "Premium Video Image Carousel",
    description: "Video plus image carousel with headline, subheadline, and body text per panel",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
    ],
    imageSlots: [],
    hasVideo: true,
    repeatableGroup: {
      label: "Panels",
      itemLabel: "Panel",
      minItems: 2,
      maxItems: 6,
      fields: [
        { key: "headline", label: "Headline", maxLength: 50 },
        { key: "subheadline", label: "Subheadline", maxLength: 80 },
        { key: "body", label: "Body Text", multiline: true, rows: 3, maxLength: 500 },
      ],
      image: {
        key: "carousel_image",
        label: "Panel Image",
        desktopSize: { width: 800, height: 600 },
        mobileSize: { width: 600, height: 450 },
      },
    },
  },

  // ── Video with Text ─────────────────────────────────────────────
  video_text: {
    label: "Premium Video with Text",
    description: "Video on one side with subheadline, headline, and body text",
    textFields: [
      { key: "subheadlineText", label: "Subheadline", maxLength: 40 },
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body Text", multiline: true, rows: 3, maxLength: 500 },
    ],
    imageSlots: [
      {
        key: "video_thumbnail",
        label: "Video",
        desktopSize: { width: 800, height: 600 },
      },
    ],
    hasVideo: true,
  },
};

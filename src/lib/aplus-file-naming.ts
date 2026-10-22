// A+ Content File Naming & Folder Structure Utilities
//
// Generates standardized file names and Google Drive folder paths
// for A+ Content image and video assets.
//
// Naming convention (clientIdCode is always the root):
//   VARIATION: {cid}_V{##}_M{#}_{typeCode}_{slot}_{device}_IMG.png
//   GROUP:     {cid}_V{##}G{##}_M{#}_{typeCode}_{slot}_{device}_IMG.png
//   ASIN:      {cid}_V{##}_{ASIN}_M{#}_{typeCode}_{slot}_{device}_IMG.png
//
// Folder tree under client root:
//   {cid}-Graphics/{cid}-A+/PA+/{scopeFolder}/v{##}/

import { APLUS_MODULE_SPECS, type AplusModuleType } from "./aplus-module-specs";

// ─── Constants ───────────────────────────────────────────────────────

/** Module type → short file code (P prefix = Premium) */
export const MODULE_TYPE_CODES: Record<AplusModuleType, string> = {
  background_image_text: "PBIT",
  comparison_table_1: "PCT1",
  comparison_table_2: "PCT2",
  comparison_table_3: "PCT3",
  dual_images_text: "PDIT",
  four_images_text: "PFIT",
  full_image: "PFI",
  full_video: "PFV",
  hotspots_1: "PHS1",
  hotspots_2: "PHS2",
  navigation_carousel: "PNC",
  qa: "PQA",
  regimen_carousel: "PRC",
  simple_image_carousel: "PSIC",
  single_image_text: "PSIT",
  technical_specifications: "PTS",
  text: "PTXT",
  video_image_carousel: "PVIC",
  video_text: "PVT",
};

/** Module type → full MODTYPE name (as shown in tracker) */
export const MODULE_TYPE_NAMES: Record<AplusModuleType, string> = {
  background_image_text: "PREMIUMBACKGROUNDIMAGETEXT",
  comparison_table_1: "PREMIUMCOMPARISONTABLE1",
  comparison_table_2: "PREMIUMCOMPARISONTABLE2",
  comparison_table_3: "PREMIUMCOMPARISONTABLE3",
  dual_images_text: "PREMIUMDUALIMAGESTEXT",
  four_images_text: "PREMIUMFOURIMAGESTEXT",
  full_image: "PREMIUMFULLIMAGE",
  full_video: "PREMIUMFULLVIDEO",
  hotspots_1: "PREMIUMHOTSPOTS1",
  hotspots_2: "PREMIUMHOTSPOTS2",
  navigation_carousel: "PREMIUMNAVIGATIONCAROUSEL",
  qa: "PREMIUMQA",
  regimen_carousel: "PREMIUMREGIMENCAROUSEL",
  simple_image_carousel: "PREMIUMSIMPLEIMAGECAROUSEL",
  single_image_text: "PREMIUMSINGLEIMAGETEXT",
  technical_specifications: "PREMIUMTECHNICALSPECIFICATIONS",
  text: "PREMIUMTEXT",
  video_image_carousel: "PREMIUMVIDEOIMAGECAROUSEL",
  video_text: "PREMIUMVIDEOTEXT",
};

/**
 * Text field abbreviations for the APP TRACKER naming convention.
 * Maps spec field keys → 4-char abbreviations.
 */
export const TEXT_FIELD_ABBRS: Record<string, string> = {
  // Module-level text field keys (from TextFieldSpec.key)
  headlineText: "HEAD",
  subheadlineText: "SUBH",
  bodyText: "BODY",
  overlayText: "OVLY",
  // Repeatable group field keys
  headline: "HEAD",
  subheadline: "SUBH",
  caption: "HEAD",       // captions are headlines in panels
  body: "BODY",
  description: "BODY",   // descriptions are body text in panels
  cta_text: "BUTT",      // button text
  asin: "ASIN",
  tab_title: "NAVT",     // navigation text
  nav_text: "NAVT",
  step_label: "HEAD",    // step labels are headlines
  question: "QUES",
  answer: "ANSW",
  metric: "METR",
  metric_type: "MTYP",
  feature: "METR",
  spec_label: "SPEC",
  spec_value: "DEFN",
  // Per-product fields (comparison tables)
  value_hero: "VHER",
  value_1: "VAL1",
  value_2: "VAL2",
  value_3: "VAL3",
  value_4: "VAL4",
  value_5: "VAL5",
  value_6: "VAL6",
  headline_1: "HD1",
  body_1: "BD1",
  headline_2: "HD2",
  body_2: "BD2",
  headline_3: "HD3",
  body_3: "BD3",
};

/**
 * Image metadata field abbreviations (per-image, appended to PAN entries).
 * These are additional rows for each image in a panel.
 */
export const IMAGE_META_ABBRS = {
  altText: "ALTE",       // Alt text
  aiImagePrompt: "AIIP", // AI image prompt
  imageDescription: "IMDE", // Image description
} as const;

/**
 * Maps each module type's internal image slot keys (from aplus-module-specs.ts)
 * to the standardized file slot keys used in filenames.
 *
 * All slot keys are UPPERCASE in the filename convention.
 * Repeatable group images (hotspots, carousels, etc.) are handled dynamically
 * via getRepeatableSlotKey() — they are NOT listed here.
 */
export const SLOT_KEY_MAP: Partial<Record<AplusModuleType, Record<string, string>>> = {
  full_image: { main_image: "MAIN" },
  background_image_text: { background_image: "BG" },
  single_image_text: { main_image: "IMG" },
  dual_images_text: { image_1: "IMG1", image_2: "IMG2" },
  four_images_text: {
    image_1: "IMG1",
    image_2: "IMG2",
    image_3: "IMG3",
    image_4: "IMG4",
  },
  comparison_table_1: {
    hero_product: "HERO",
    product_1: "COMP1",
    product_2: "COMP2",
    product_3: "COMP3",
    product_4: "COMP4",
    product_5: "COMP5",
    product_6: "COMP6",
  },
  comparison_table_2: {
    product_1: "COMP1",
    product_2: "COMP2",
    product_3: "COMP3",
  },
  comparison_table_3: {
    hero_product: "HERO",
    product_1: "COMP1",
    product_2: "COMP2",
    product_3: "COMP3",
    product_4: "COMP4",
  },
  hotspots_1: { main_image: "BG" },
  hotspots_2: { main_image: "BG" },
  full_video: { video_thumbnail: "PREV" },
  video_image_carousel: { video_thumbnail: "PREV" },
  video_text: { video_thumbnail: "PREV" },
};

/**
 * Maps repeatable group image keys to their file slot prefix.
 * The actual slot key = prefix + item index (1-based).
 * e.g., hotspot_image item 3 → "PAN3", slide_image item 1 → "PAN1"
 */
export const REPEATABLE_SLOT_PREFIXES: Record<string, string> = {
  hotspot_image: "PAN",
  tab_image: "PAN",
  step_image: "PAN",
  slide_image: "PAN",
  carousel_image: "PAN",
};

// ─── Types ───────────────────────────────────────────────────────────

export type AplusScopeType = "ASIN" | "VAR" | "GRP";
export type AplusDevice = "DV" | "MV";
export type AplusPlatform = "SC" | "VC";

export interface AplusScope {
  type: AplusScopeType;
  /** For ASIN: the ASIN. For GRP/VAR: parent ASIN (or clientIdCode). */
  identifier: string;
  /** Group number (1-99), only for GRP scope */
  groupNumber?: number;
  /** Specific ASIN, only for ASIN scope */
  asin?: string;
}

export interface AplusContext {
  clientIdCode: string;
  marketplace: string;
  platform: AplusPlatform;
  scope: AplusScope;
  version: number;
}

// ─── Helper functions ────────────────────────────────────────────────

/** Zero-pad a number to 2 digits */
function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Format version for filenames: V01, V02 (zero-padded) */
function fmtVersion(n: number): string {
  return `V${pad2(n)}`;
}

/**
 * Build the scope segment for filenames and folder names.
 *
 * - VAR:  V01           (version only — covers all ASINs)
 * - GRP:  V01G01        (version + group number)
 * - ASIN: V01_B0DCLWMB4Y (version + specific ASIN)
 */
export function buildScopeSegment(
  version: number,
  scopeType: AplusScopeType,
  asin?: string,
  groupNumber?: number,
): string {
  const v = fmtVersion(version);
  switch (scopeType) {
    case "VAR":
      return v;
    case "GRP":
      return `${v}G${pad2(groupNumber ?? 1)}`;
    case "ASIN":
      return `${v}_${asin ?? "UNKNOWN"}`;
    default:
      return v;
  }
}

/**
 * Get the scope folder name (used as subfolder under PA+/).
 * Same as buildScopeSegment — the folder IS the scope segment.
 */
export function getScopeFolderName(
  version: number,
  scopeType: AplusScopeType,
  asin?: string,
  groupNumber?: number,
): string {
  return buildScopeSegment(version, scopeType, asin, groupNumber);
}

/**
 * Get the full Google Drive folder path for an A+ version.
 *
 * clientIdCode already includes platform+marketplace (e.g. "DRC_SC_US").
 * Returns: "{cid}/{cid}-Graphics/{cid}-A+/PA+/{scopeFolder}/"
 */
export function getAplusFolderPath(ctx: AplusContext): string {
  const cid = ctx.clientIdCode;
  const scopeFolder = getScopeFolderName(
    ctx.version,
    ctx.scope.type,
    ctx.scope.asin,
    ctx.scope.groupNumber,
  );

  return `${cid}/${cid}-Graphics/${cid}-A+/PA+/${scopeFolder}`;
}

/**
 * Get the file slot key for a fixed (non-repeatable) image slot.
 * Maps from the internal spec key (e.g., "main_image") to the file key (e.g., "main").
 */
export function getFixedSlotKey(moduleType: AplusModuleType, specSlotKey: string): string {
  const mapping = SLOT_KEY_MAP[moduleType];
  if (mapping && mapping[specSlotKey]) {
    return mapping[specSlotKey];
  }
  // Fallback: use the spec key as-is (shouldn't happen with proper mapping)
  return specSlotKey;
}

/**
 * Get the file slot key for a repeatable group image at a given index.
 * e.g., ("hotspot_image", 3) → "PAN3"
 */
export function getRepeatableSlotKey(repeatableImageKey: string, itemIndex: number): string {
  const prefix = REPEATABLE_SLOT_PREFIXES[repeatableImageKey];
  if (!prefix) {
    return `${repeatableImageKey}${itemIndex}`;
  }
  return `${prefix}${itemIndex}`;
}

/**
 * Generate a complete image filename.
 *
 * Convention by scope:
 *   VAR:  {cid}_V{##}_M{#}_{typeCode}_{slot}_{device}_IMG.png
 *   GRP:  {cid}_V{##}G{##}_M{#}_{typeCode}_{slot}_{device}_IMG.png
 *   ASIN: {cid}_V{##}_{ASIN}_M{#}_{typeCode}_{slot}_{device}_IMG.png
 */
export function generateImageFilename(
  clientIdCode: string,
  version: number,
  scopeType: AplusScopeType,
  modulePosition: number,
  moduleType: AplusModuleType,
  slotKey: string,
  device: AplusDevice,
  asin?: string,
  groupNumber?: number,
): string {
  const typeCode = MODULE_TYPE_CODES[moduleType];
  const scopeSeg = buildScopeSegment(version, scopeType, asin, groupNumber);
  return `${clientIdCode}_${scopeSeg}_M${modulePosition}_${typeCode}_${slotKey}_${device}_IMG.png`;
}

/**
 * Generate a video filename.
 *
 * Format: {cid}_{scopeSegment}_M{#}_{typeCode}_VIDEO.mp4
 */
export function generateVideoFilename(
  clientIdCode: string,
  version: number,
  scopeType: AplusScopeType,
  modulePosition: number,
  moduleType: AplusModuleType,
  asin?: string,
  groupNumber?: number,
): string {
  const typeCode = MODULE_TYPE_CODES[moduleType];
  const scopeSeg = buildScopeSegment(version, scopeType, asin, groupNumber);
  return `${clientIdCode}_${scopeSeg}_M${modulePosition}_${typeCode}_VIDEO.mp4`;
}

/**
 * Generate a video preview image filename.
 *
 * Format: {cid}_{scopeSegment}_M{#}_{typeCode}_PREV_{device}.png
 */
export function generateVideoPreviewFilename(
  clientIdCode: string,
  version: number,
  scopeType: AplusScopeType,
  modulePosition: number,
  moduleType: AplusModuleType,
  device: AplusDevice,
  asin?: string,
  groupNumber?: number,
): string {
  const typeCode = MODULE_TYPE_CODES[moduleType];
  const scopeSeg = buildScopeSegment(version, scopeType, asin, groupNumber);
  return `${clientIdCode}_${scopeSeg}_M${modulePosition}_${typeCode}_PREV_${device}.png`;
}

/**
 * Generate the full file path (folder + filename) for an image.
 */
export function generateImageFilePath(
  ctx: AplusContext,
  modulePosition: number,
  moduleType: AplusModuleType,
  slotKey: string,
  device: AplusDevice,
): string {
  const folder = getAplusFolderPath(ctx);
  const filename = generateImageFilename(
    ctx.clientIdCode,
    ctx.version,
    ctx.scope.type,
    modulePosition,
    moduleType,
    slotKey,
    device,
    ctx.scope.asin,
    ctx.scope.groupNumber,
  );
  return `${folder}/${filename}`;
}

/**
 * Compute all filenames that need renaming when modules are reordered.
 *
 * @param oldOrder - Array of module positions in old order (e.g., [1, 2, 3])
 * @param newOrder - Array of module positions in new order (e.g., [3, 1, 2])
 * @param filesByPosition - Map of old position → array of filenames at that position
 *
 * Returns: Array of { oldFilename, newFilename } pairs
 */
export function computeReorderRenames(
  oldOrder: number[],
  newOrder: number[],
  filesByPosition: Map<number, string[]>,
): Array<{ oldFilename: string; newFilename: string }> {
  const renames: Array<{ oldFilename: string; newFilename: string }> = [];

  for (let newPos = 0; newPos < newOrder.length; newPos++) {
    const oldPosition = newOrder[newPos];
    const newPosition = newPos + 1;

    if (oldPosition === newPosition) continue;

    const files = filesByPosition.get(oldPosition) || [];
    for (const oldFilename of files) {
      const newFilename = oldFilename.replace(
        /_M(\d+)_/,
        `_M${newPosition}_`,
      );
      if (oldFilename !== newFilename) {
        renames.push({ oldFilename, newFilename });
      }
    }
  }

  return renames;
}

// ─── APP TRACKER Row Generation ─────────────────────────────────────
//
// Generates all tracker rows for a module type, matching the spreadsheet
// naming convention.

export type TrackerRowType = "text" | "image";

export interface TrackerRow {
  /** Full generated file name / reference */
  fileName: string;
  /** MODULE */
  type: "MODULE";
  /** M */
  typeAbbr: "M";
  /** Full module type name (PREMIUMSIMPLEIMAGECAROUSEL) */
  modType: string;
  /** Module type abbreviation (PSIC) */
  modTypeAbbr: string;
  /** Module position number */
  modNumber: number;
  /** TEXTFIELD name (HEADLINE, BODY TEXT, etc.) */
  textField: string;
  /** TEXFIELD ABBR (HEAD, BODY, BUTT, etc.) */
  textFieldAbbr: string;
  /** Panel number (empty for GEN) */
  panelNumber: number | null;
  /** GROUP: INDIVIDUAL, DESKTOP VERSION, MOBILE VERSION */
  group: string;
  /** GROUP ABBR: empty, DV, MV */
  groupAbbr: string;
  /** IMAGE type (empty for text, IMG for images) */
  image: string;
  /** IMAGE NUMBER (empty typically) */
  imageNumber: string;
  /** Whether this is a text field row or image row */
  rowType: TrackerRowType;
}

/** Map of human-readable text field names */
const TEXT_FIELD_NAMES: Record<string, string> = {
  HEAD: "HEADLINE",
  SUBH: "SUBHEADLINE",
  BODY: "BODYTEXT",
  BUTT: "BUTTON TEXT",
  ASIN: "ASIN",
  ALTE: "ALT TEXT",
  AIIP: "AI IMAGE PROMPT",
  IMDE: "IMAGE DESCRIPTION",
  OVLY: "OVERLAY TEXT",
  NAVT: "NAVIGATION TEXT",
  QUES: "QUESTION",
  ANSW: "ANSWER",
  METR: "METRIC",
  MTYP: "METRIC TYPE",
  SPEC: "SPECIFICATION",
  DEFN: "DEFINITION",
  VHER: "HERO VALUE",
  VAL1: "PRODUCT 1 VALUE",
  VAL2: "PRODUCT 2 VALUE",
  VAL3: "PRODUCT 3 VALUE",
  VAL4: "PRODUCT 4 VALUE",
  VAL5: "PRODUCT 5 VALUE",
  VAL6: "PRODUCT 6 VALUE",
  HD1: "HEADLINE PRODUCT 1",
  BD1: "BODY PRODUCT 1",
  HD2: "HEADLINE PRODUCT 2",
  BD2: "BODY PRODUCT 2",
  HD3: "HEADLINE PRODUCT 3",
  BD3: "BODY PRODUCT 3",
};

function makeTrackerRow(
  filePrefix: string,
  modNumber: number,
  modTypeAbbr: string,
  modType: string,
  scope: "GEN" | "PAN",
  panelNumber: number | null,
  fieldAbbr: string,
  group: string,
  groupAbbr: string,
  image: string,
  imageNumber: string,
  rowType: TrackerRowType,
): TrackerRow {
  const scopePart = scope === "GEN" ? "GEN" : `PAN${panelNumber}`;
  const fileName = `${filePrefix}_M${modNumber}_${modTypeAbbr}_${scopePart}_${fieldAbbr}_${groupAbbr}${image}${imageNumber}`;

  return {
    fileName,
    type: "MODULE",
    typeAbbr: "M",
    modType,
    modTypeAbbr,
    modNumber,
    textField: TEXT_FIELD_NAMES[fieldAbbr] || fieldAbbr,
    textFieldAbbr: fieldAbbr,
    panelNumber,
    group,
    groupAbbr,
    image,
    imageNumber,
    rowType,
  };
}

/**
 * Generate all APP TRACKER rows for a given module type and position.
 * Produces text field rows (GEN + PAN) and image rows (PAN DV/MV).
 *
 * filePrefix is the {cid}_{scopeSegment} portion (e.g. "DRC_SC_US_V01" or "DRC_SC_US_V01G01").
 */
export function generateTrackerRows(
  clientIdCode: string,
  version: number,
  scopeType: AplusScopeType,
  modulePosition: number,
  moduleType: AplusModuleType,
  asin?: string,
  groupNumber?: number,
  panelCount?: number,
): TrackerRow[] {
  const spec = APLUS_MODULE_SPECS[moduleType];
  if (!spec) return [];

  const typeCode = MODULE_TYPE_CODES[moduleType];
  const typeName = MODULE_TYPE_NAMES[moduleType];
  const scopeSeg = buildScopeSegment(version, scopeType, asin, groupNumber);
  const filePrefix = `${clientIdCode}_${scopeSeg}`;
  const rows: TrackerRow[] = [];

  // 1) GEN (module-level) text fields
  for (const tf of spec.textFields) {
    const abbr = TEXT_FIELD_ABBRS[tf.key] || tf.key.toUpperCase().slice(0, 4);
    rows.push(makeTrackerRow(
      filePrefix, modulePosition, typeCode, typeName,
      "GEN", null, abbr, "", "", "", "", "text",
    ));
  }

  // 2) Fixed image slots (module-level, not in repeatable group)
  for (const img of spec.imageSlots) {
    // Desktop
    rows.push(makeTrackerRow(
      filePrefix, modulePosition, typeCode, typeName,
      "GEN", null, "DV", "DESKTOP VERSION", "DV", "IMG", "", "image",
    ));
    // Mobile (if has mobile size)
    if (img.mobileSize) {
      rows.push(makeTrackerRow(
        filePrefix, modulePosition, typeCode, typeName,
        "GEN", null, "MV", "MOBILE VERSION", "MV", "IMG", "", "image",
      ));
    }
    // Image metadata
    rows.push(makeTrackerRow(filePrefix, modulePosition, typeCode, typeName, "GEN", null, "ALTE", "", "", "", "", "text"));
    rows.push(makeTrackerRow(filePrefix, modulePosition, typeCode, typeName, "GEN", null, "AIIP", "", "", "", "", "text"));
    rows.push(makeTrackerRow(filePrefix, modulePosition, typeCode, typeName, "GEN", null, "IMDE", "", "", "", "", "text"));
  }

  // 3) Repeatable group panels
  if (spec.repeatableGroup) {
    const rg = spec.repeatableGroup;
    const count = panelCount ?? rg.minItems;

    for (let p = 1; p <= count; p++) {
      // Panel text fields
      for (const field of rg.fields) {
        const abbr = TEXT_FIELD_ABBRS[field.key] || field.key.toUpperCase().slice(0, 4);
        rows.push(makeTrackerRow(
          filePrefix, modulePosition, typeCode, typeName,
          "PAN", p, abbr, "INDIVIDUAL", "", "", "", "text",
        ));
      }

      // Panel image (if has image in repeatable group)
      if (rg.image) {
        // Image metadata fields
        rows.push(makeTrackerRow(filePrefix, modulePosition, typeCode, typeName, "PAN", p, "ALTE", "INDIVIDUAL", "", "", "", "text"));
        rows.push(makeTrackerRow(filePrefix, modulePosition, typeCode, typeName, "PAN", p, "AIIP", "INDIVIDUAL", "", "", "", "text"));
        rows.push(makeTrackerRow(filePrefix, modulePosition, typeCode, typeName, "PAN", p, "IMDE", "INDIVIDUAL", "", "", "", "text"));
      }
    }

    // Image rows for panels (separate section, like in the spreadsheet)
    if (rg.image) {
      for (let p = 1; p <= count; p++) {
        // Desktop version
        rows.push(makeTrackerRow(
          filePrefix, modulePosition, typeCode, typeName,
          "PAN", p, "DV", "DESKTOP VERSION", "DV", "IMG", "", "image",
        ));
        // Mobile version (if has mobile size)
        if (rg.image.mobileSize) {
          rows.push(makeTrackerRow(
            filePrefix, modulePosition, typeCode, typeName,
            "PAN", p, "MV", "MOBILE VERSION", "MV", "IMG", "", "image",
          ));
        }
      }
    }
  }

  // 4) Video files (for video modules)
  if (spec.hasVideo) {
    rows.push(makeTrackerRow(
      filePrefix, modulePosition, typeCode, typeName,
      "GEN", null, "VIDEO", "", "", "VID", "", "image",
    ));
    rows.push(makeTrackerRow(
      filePrefix, modulePosition, typeCode, typeName,
      "GEN", null, "DV", "DESKTOP VERSION", "DV", "PREV", "", "image",
    ));
    rows.push(makeTrackerRow(
      filePrefix, modulePosition, typeCode, typeName,
      "GEN", null, "MV", "MOBILE VERSION", "MV", "PREV", "", "image",
    ));
  }

  return rows;
}

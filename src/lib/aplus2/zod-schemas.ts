import { z } from "zod";

import {
  APLUS2_MODULE_SPECS,
  type Aplus2ItemData,
  type Aplus2ModuleType,
} from "./module-specs";

// ─── Module status ──────────────────────────────────────────────────

export const APLUS2_MODULE_STATUSES = [
  "draft", "in_review", "approved", "uploaded", "live",
] as const;
export type Aplus2ModuleStatus = (typeof APLUS2_MODULE_STATUSES)[number];

export const APLUS2_VERSION_STATUSES = [
  "not_started", "in_progress", "in_review", "approved", "live", "discontinued",
] as const;
export type Aplus2VersionStatus = (typeof APLUS2_VERSION_STATUSES)[number];

// ─── Module patch validator ─────────────────────────────────────────

export interface ModulePatchInput {
  headlineText?: string | null;
  subheadlineText?: string | null;
  bodyText?: string | null;
  overlayText?: string | null;
  altText?: string | null;
  mobileAltText?: string | null;
  imageDescription?: string | null;
  aiImagePrompt?: string | null;
  cosmoRelationType?: string | null;
  videoTitle?: string | null;
  videoDescription?: string | null;
  videoDriveFileId?: string | null;
  textPosition?: "left" | "right" | null;
  fontColor?: "light" | "dark" | null;
  figmaUrl?: string | null;
  markupUrl?: string | null;
  status?: Aplus2ModuleStatus;
}

export type ValidateResult<T> = { ok: true; value: T } | { ok: false; error: string };

const textFieldKeys = ["headlineText", "subheadlineText", "bodyText", "overlayText", "altText"] as const;
type TextFieldKey = (typeof textFieldKeys)[number];

export function validateModulePatch(
  moduleType: Aplus2ModuleType,
  input: ModulePatchInput
): ValidateResult<ModulePatchInput> {
  const spec = APLUS2_MODULE_SPECS[moduleType];
  if (!spec) return { ok: false, error: `unknown moduleType: ${moduleType}` };

  // Status
  if (input.status !== undefined && !APLUS2_MODULE_STATUSES.includes(input.status)) {
    return { ok: false, error: `invalid status: ${input.status}` };
  }

  // Text fields — reject keys not declared by the spec, then enforce maxLength.
  // altText describes an image, so allow it on any module with an image slot even
  // when the spec doesn't list it as a text field (e.g. full_video's video thumbnail).
  const allowed = new Set<TextFieldKey>(spec.textFields.map((f) => f.key));
  const textFieldsByKey = new Map(spec.textFields.map((field) => [field.key, field]));
  const hasImageSlot = spec.imageSlots.length > 0;
  for (const key of textFieldKeys) {
    const v = input[key];
    if (v === undefined || v === null || v === "") continue;
    const altOnImage = key === "altText" && hasImageSlot;
    if (!allowed.has(key) && !altOnImage) {
      return { ok: false, error: `field ${key} not allowed on ${moduleType}` };
    }
    const field = textFieldsByKey.get(key);
    const maxLength = field?.maxLength ?? (altOnImage ? 100 : undefined);
    if (maxLength && v.length > maxLength) {
      return { ok: false, error: `${field?.label ?? key} exceeds ${maxLength} characters` };
    }
  }

  // Video fields — only allowed when spec.video is set.
  if (input.videoTitle != null) {
    if (!spec.video) return { ok: false, error: `videoTitle not allowed on ${moduleType}` };
    if (input.videoTitle.length > spec.video.titleMaxLen) {
      return { ok: false, error: `videoTitle exceeds ${spec.video.titleMaxLen} characters` };
    }
  }
  if (input.videoDescription != null) {
    if (!spec.video) return { ok: false, error: `videoDescription not allowed on ${moduleType}` };
    if (input.videoDescription.length > spec.video.descriptionMaxLen) {
      return { ok: false, error: `videoDescription exceeds ${spec.video.descriptionMaxLen} characters` };
    }
  }
  if (input.videoDriveFileId != null && !spec.video) {
    return { ok: false, error: `videoDriveFileId not allowed on ${moduleType}` };
  }

  // Layout controls
  const layoutKeys = new Set((spec.layoutControls ?? []).map((c) => c.key));
  if (input.textPosition != null) {
    if (!layoutKeys.has("text_position")) {
      return { ok: false, error: `text_position not allowed on ${moduleType}` };
    }
    const c = spec.layoutControls!.find((lc) => lc.key === "text_position")!;
    if (!c.options.includes(input.textPosition)) {
      return { ok: false, error: `text_position must be one of ${c.options.join(", ")}` };
    }
  }
  if (input.fontColor != null) {
    if (!layoutKeys.has("font_color")) {
      return { ok: false, error: `font_color not allowed on ${moduleType}` };
    }
    const c = spec.layoutControls!.find((lc) => lc.key === "font_color")!;
    if (!c.options.includes(input.fontColor)) {
      return { ok: false, error: `font_color must be one of ${c.options.join(", ")}` };
    }
  }

  // Generic 1000-char caps on remaining strings.
  for (const k of ["figmaUrl", "markupUrl", "altText", "mobileAltText", "imageDescription", "aiImagePrompt", "cosmoRelationType"] as const) {
    const v = input[k];
    if (typeof v === "string" && v.length > 1000) {
      return { ok: false, error: `${k} exceeds 1000 characters` };
    }
  }

  return { ok: true, value: input };
}

// ─── Item data validators (dispatch by parent module type) ──────────

function itemFieldSchema(maxLen: number | undefined): z.ZodString {
  return maxLen ? z.string().max(maxLen) : z.string();
}

function buildItemDataSchema(moduleType: Aplus2ModuleType): z.ZodTypeAny {
  const spec = APLUS2_MODULE_SPECS[moduleType];
  const group = spec.repeatableGroup;
  if (!group) return z.never();
  const shape: Record<string, z.ZodTypeAny> = { type: z.literal(group.itemDataType) };
  for (const f of group.fields) {
    shape[f.key] = itemFieldSchema(f.maxLength).optional().default("");
  }
  return z.strictObject(shape);
}

const ITEM_SCHEMAS_CACHE = new Map<Aplus2ModuleType, z.ZodTypeAny>();
function getItemDataSchema(moduleType: Aplus2ModuleType): z.ZodTypeAny {
  let s = ITEM_SCHEMAS_CACHE.get(moduleType);
  if (!s) {
    s = buildItemDataSchema(moduleType);
    ITEM_SCHEMAS_CACHE.set(moduleType, s);
  }
  return s;
}

export function validateItemData(
  moduleType: Aplus2ModuleType,
  data: unknown
): ValidateResult<Aplus2ItemData> {
  const schema = getItemDataSchema(moduleType);
  if (schema instanceof z.ZodNever) {
    return { ok: false, error: `module type ${moduleType} has no repeatable items` };
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, value: parsed.data as Aplus2ItemData };
}

/** Default item shape for pre-seeding new modules. Returns null when the
 * module type has no repeatableGroup. */
export function defaultItemDataFor(moduleType: Aplus2ModuleType): Aplus2ItemData | null {
  const spec = APLUS2_MODULE_SPECS[moduleType];
  const group = spec.repeatableGroup;
  if (!group) return null;
  const out: Record<string, string> = { type: group.itemDataType };
  for (const f of group.fields) out[f.key] = "";
  return out as Aplus2ItemData;
}

export function validateVersionStatus(value: string): value is Aplus2VersionStatus {
  return (APLUS2_VERSION_STATUSES as readonly string[]).includes(value);
}

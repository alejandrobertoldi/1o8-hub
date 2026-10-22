// A+ 2.0 Drive naming helpers.
//
// Folder convention:   {clientIdCode}_{ASIN|VariationID}_{contentToken}_V##
//   e.g.  DRC_SC_US_B0DCLWMB4Y_APlus_V02          (ASIN scope)
//         TRT_SC_US_TRT_SC_US_02_APlus_V01        (VARIATION/PARENT scope)
//         BNU_SC_US_B0B39MGKRQ_ABasic_V01
// File convention:     {folderName}_M##_{ITEM}_{ITEMVERSION}.{ext}
//   images  …_M01_image_DV.png   …_M01_image_MV.png
//   video   …_M12_video.mp4      (no DV/MV suffix)
//
// The ITEM token is resolved by aplus2ItemToken() from
// (moduleType, kind, slotKey, itemPosition). See the design spec at
// docs/superpowers/specs/2026-06-01-aplus2-naming-convention-design.md

import { aplus2DriveScopeToken } from "@/lib/aplus2/variation-scope";

export type Aplus2Variant = "desktop" | "mobile";
export type Aplus2Kind = "image" | "video";

/** Carousel module types — repeatable panel images become Slide##. */
const CAROUSEL_TYPES = new Set<string>([
  "simple_image_carousel",
  "regimen_carousel",
  "navigation_carousel",
  "video_image_carousel",
]);

/** Hotspot module types — repeatable item images become hotspot##. */
const HOTSPOT_TYPES = new Set<string>(["hotspots_1", "hotspots_2"]);

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Drive + editor token: "BA+" → "ABasic", "PA+" → "APlus". */
export function contentTokenFor(contentType: string): string {
  return contentType === "BA+" ? "ABasic" : "APlus";
}

/** @deprecated Use contentTokenFor — display and Drive share the same token. */
export function aplus2DisplayContentToken(contentType: string): string {
  return contentTokenFor(contentType);
}

export interface Aplus2VersionSlugArgs {
  clientIdCode: string;
  scopeIdentifier: string;
  contentType: string;
  versionNumber: number;
}

export function aplus2VersionSlug(args: Aplus2VersionSlugArgs): string {
  const token = contentTokenFor(args.contentType);
  return `${args.clientIdCode}_${args.scopeIdentifier}_${token}_V${pad2(args.versionNumber)}`;
}

export function aplus2VersionSlugFromSet(args: {
  clientIdCode: string;
  scopeType: string;
  scopeIdentifier: string;
  variationId?: string | null;
  contentType: string;
  versionNumber: number;
}): string {
  return aplus2VersionSlug({
    clientIdCode: args.clientIdCode,
    scopeIdentifier: aplus2DriveScopeToken(args),
    contentType: args.contentType,
    versionNumber: args.versionNumber,
  });
}

export interface Aplus2VersionDisplayNameArgs {
  clientIdCode: string;
  marketplace: string;
  scopeIdentifier: string;
  contentType: string;
  versionNumber: number;
  scopeType?: string;
  variationId?: string | null;
}

/** Header label shown on the set editor, e.g. BNU_SC_US_US_B0B39MGKRQ_ABasic_V01. */
export function aplus2VersionDisplayName(args: Aplus2VersionDisplayNameArgs): string {
  const token = aplus2DisplayContentToken(args.contentType);
  const scope = aplus2DriveScopeToken({
    scopeType: args.scopeType ?? "ASIN",
    scopeIdentifier: args.scopeIdentifier,
    variationId: args.variationId,
  });
  return `${args.clientIdCode}_${args.marketplace}_${scope}_${token}_V${pad2(args.versionNumber)}`;
}

/** Drive folder_type for the per-version Master Files subfolder. */
export const APLUS2_MASTER_FOLDER_TYPE = "aplus2_master" as const;

/**
 * Empty Master Files subfolder created inside each version folder, matching
 * brand story: `{slug}_Master_Files`.
 */
export function aplus2MasterSubfolderName(versionSlug: string): string {
  return `${versionSlug}_Master_Files`;
}

export function aplus2ModulePosition(position: number): string {
  return `M${pad2(position)}`;
}

/** Replace the `_M##_` segment in an existing Drive filename. */
export function aplus2RenameModuleSegment(filename: string, newPosition: number): string {
  return filename.replace(/_M\d+_/, `_${aplus2ModulePosition(newPosition)}_`);
}

/** Unique temp name so two files can swap `_M##_` without Drive collisions. */
export function aplus2TempReorderFilename(filename: string, token: string): string {
  return filename.replace(/_M\d+_/, `_Mtmp${token}_`);
}

export interface Aplus2ItemTokenArgs {
  moduleType: string;
  kind: Aplus2Kind;
  slotKey: string;
  /** Set when the asset lives inside a repeatable item. */
  itemPosition?: number;
}

/**
 * Resolve the human-readable ITEM token. First match wins:
 *  1. video kind                        → "video"
 *  2. repeatable item image (itemPosition set):
 *       carousel module                 → "Slide##"
 *       hotspot module                  → "hotspot##"
 *       (any other repeatable image)    → "image##"
 *  3. module-level slot:
 *       video_thumbnail                 → "thumbnail"
 *       hero_product                    → "hero"
 *       product_N                       → "product0N"
 *       image_N                         → "image0N"
 *       (any other single-image slot)   → "image"
 */
export function aplus2ItemToken(args: Aplus2ItemTokenArgs): string {
  if (args.kind === "video") return "video";

  if (typeof args.itemPosition === "number") {
    if (CAROUSEL_TYPES.has(args.moduleType)) return `Slide${pad2(args.itemPosition)}`;
    if (HOTSPOT_TYPES.has(args.moduleType)) return `hotspot${pad2(args.itemPosition)}`;
    return `image${pad2(args.itemPosition)}`;
  }

  if (args.slotKey === "video_thumbnail") return "thumbnail";
  if (args.slotKey === "hero_product") return "hero";

  const productMatch = /^product_(\d+)$/.exec(args.slotKey);
  if (productMatch) return `product${pad2(Number(productMatch[1]))}`;

  const imageMatch = /^image_(\d+)$/.exec(args.slotKey);
  if (imageMatch) return `image${pad2(Number(imageMatch[1]))}`;

  // main_image, background_image, or any other single image slot.
  return "image";
}

export interface Aplus2AssetFilenameArgs {
  slug: string;
  modulePosition: number;
  moduleType: string;
  kind: Aplus2Kind;
  slotKey: string;
  /** Set when the asset is inside a repeatable item. */
  itemPosition?: number;
  variant: Aplus2Variant;
  ext: string;
}

export function aplus2AssetFilename(args: Aplus2AssetFilenameArgs): string {
  const m = aplus2ModulePosition(args.modulePosition);
  const item = aplus2ItemToken({
    moduleType: args.moduleType,
    kind: args.kind,
    slotKey: args.slotKey,
    itemPosition: args.itemPosition,
  });
  // Video files carry no DV/MV version suffix.
  if (args.kind === "video") {
    return `${args.slug}_${m}_${item}.${args.ext}`;
  }
  const ver = args.variant === "mobile" ? "MV" : "DV";
  return `${args.slug}_${m}_${item}_${ver}.${args.ext}`;
}

/** Allowed mime types and their canonical extensions. */
export const APLUS2_IMAGE_MIME: Record<string, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

export const APLUS2_VIDEO_MIME: Record<string, "mp4"> = {
  "video/mp4": "mp4",
};

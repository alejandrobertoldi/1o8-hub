export const STOREFRONT_MODULE_TYPES = ["header", "video", "cover_image", "image", "split_section"] as const;
export type StorefrontModuleType = (typeof STOREFRONT_MODULE_TYPES)[number];

export const ADDABLE_MODULE_TYPES = ["header", "video", "image", "split_section"] as const;

export const SECTION_LAYOUTS = ["fill", "fit", "text"] as const;
export type SectionLayout = (typeof SECTION_LAYOUTS)[number];

export interface StorefrontModuleSpec {
  key: StorefrontModuleType;
  label: string;
  kind: "image" | "video";
  minWidth?: number;
  minHeight?: number;
  maxBytes?: number;
  mimes: string[];
}

const IMG = ["image/png", "image/jpeg", "image/webp"];
const VID = ["video/x-msvideo", "video/quicktime", "video/mpeg", "video/mp4", "audio/mp4", "video/x-m4v"];
// avi, mov, mpg/mpeg, mp4, m4a, m4v, m4p — browsers report these mimes; accept generously.

export const STOREFRONT_MODULE_SPECS: Record<StorefrontModuleType, StorefrontModuleSpec> = {
  header:      { key: "header",      label: "Header",      kind: "image", minWidth: 3000, minHeight: 600,  mimes: IMG },
  video:       { key: "video",       label: "Video",       kind: "video", minWidth: 1280, minHeight: 640, maxBytes: 500 * 1024 * 1024, mimes: VID },
  cover_image: { key: "cover_image", label: "Cover Image", kind: "image", minWidth: 3000, minHeight: 1500, mimes: IMG },
  image:       { key: "image",       label: "Image",       kind: "image", minWidth: 1500, mimes: IMG },
  split_section: { key: "split_section", label: "Split Section", kind: "image", minWidth: 1500, mimes: IMG },
};

export function validateAsset(
  spec: StorefrontModuleSpec,
  asset: { width?: number; height?: number; bytes: number; mime: string }
): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const mimeOk = spec.mimes.includes(asset.mime) || (spec.kind === "video" && asset.mime.startsWith("video/"));
  if (!mimeOk) return { ok: false, warnings: [`Unsupported file type for ${spec.label}`] };
  if (spec.minWidth && asset.width !== undefined && asset.width < spec.minWidth)
    warnings.push(`Width ${asset.width}px is below the recommended ${spec.minWidth}px`);
  if (spec.minHeight && asset.height !== undefined && asset.height < spec.minHeight)
    warnings.push(`Height ${asset.height}px is below the recommended ${spec.minHeight}px`);
  if (spec.maxBytes && asset.bytes > spec.maxBytes)
    warnings.push(`File exceeds the 500MB limit`);
  return { ok: true, warnings };
}

// ─── Split Section layouts ───────────────────────────────────────────
// Nested row/col trees. Tile indices are 1-based positions on storefront_module_tiles.
// Flippable layouts also register a `${key}_flip` variant (horizontal mirror).

export type SplitFamily = "basic" | "grid" | "variable" | "legacy";

export type SplitNode =
  | { t: number }
  | { dir: "row" | "col"; sizes: readonly number[]; children: readonly SplitNode[] };

export type SplitDevice = "desktop" | "mobile";

export type SplitLayoutDef = {
  family: SplitFamily;
  tiles: number;
  tree: SplitNode;
  /** Amazon mobile reflow of the same tiles. */
  mobileTree: SplitNode;
  /** CSS aspect-ratio for the editor/portal frame. */
  aspect: string;
  mobileAspect: string;
  flippable: boolean;
  /** Show in the layout picker. Legacy keys still render if already stored. */
  picker: boolean;
  /** Mobile tree for the `_flip` variant (desktop flip is not a mobile flip). */
  mobileFlipTree?: SplitNode;
};

function tile(t: number): SplitNode {
  return { t };
}
function col(sizes: readonly number[], children: readonly SplitNode[]): SplitNode {
  return { dir: "col", sizes, children };
}
function row(sizes: readonly number[], children: readonly SplitNode[]): SplitNode {
  return { dir: "row", sizes, children };
}

export function isSplitTile(node: SplitNode): node is { t: number } {
  return "t" in node;
}

export function collectSplitTiles(node: SplitNode, acc: number[] = []): number[] {
  if (isSplitTile(node)) {
    acc.push(node.t);
    return acc;
  }
  for (const child of node.children) collectSplitTiles(child, acc);
  return acc;
}

export function flipSplitNode(node: SplitNode): SplitNode {
  if (isSplitTile(node)) return node;
  if (node.dir === "col") {
    return {
      dir: "col",
      sizes: [...node.sizes].reverse(),
      children: [...node.children].reverse().map(flipSplitNode),
    };
  }
  return {
    dir: "row",
    sizes: node.sizes,
    children: node.children.map(flipSplitNode),
  };
}

const BASIC_ASPECT = "2 / 1";
const GRID_ASPECT = "11 / 5";
const VAR_ASPECT = "4 / 1";
const BASIC_MOBILE_ASPECT = "3 / 4";
const GRID_MOBILE_ASPECT = "2 / 3";
const GRID8_MOBILE_ASPECT = "1 / 2";
const VAR_MOBILE_ASPECT = "3 / 4";

const STACKED_2 = row([1, 1], [tile(1), tile(2)]);

const BASE_SPLIT_LAYOUTS: Record<string, SplitLayoutDef> = {
  // Legacy 2-tile ratios (still valid if already stored).
  split_2_equal: {
    family: "basic",
    tiles: 2,
    tree: col([1, 1], [tile(1), tile(2)]),
    mobileTree: STACKED_2,
    aspect: BASIC_ASPECT,
    mobileAspect: BASIC_MOBILE_ASPECT,
    flippable: false,
    picker: true,
  },
  split_2_left: {
    family: "legacy",
    tiles: 2,
    tree: col([62, 38], [tile(1), tile(2)]),
    mobileTree: STACKED_2,
    aspect: BASIC_ASPECT,
    mobileAspect: BASIC_MOBILE_ASPECT,
    flippable: false,
    picker: false,
  },
  split_2_right: {
    family: "legacy",
    tiles: 2,
    tree: col([38, 62], [tile(1), tile(2)]),
    mobileTree: STACKED_2,
    aspect: BASIC_ASPECT,
    mobileAspect: BASIC_MOBILE_ASPECT,
    flippable: false,
    picker: false,
  },

  // Basic section — 50/50 outer split, right side subdivides (Amazon Brand Store).
  basic_3: {
    family: "basic",
    tiles: 3,
    tree: col([1, 1], [tile(1), row([1, 1], [tile(2), tile(3)])]),
    mobileTree: row([2, 1, 1], [tile(1), tile(2), tile(3)]),
    mobileFlipTree: row([1, 1, 2], [tile(2), tile(3), tile(1)]),
    aspect: BASIC_ASPECT,
    mobileAspect: BASIC_MOBILE_ASPECT,
    flippable: true,
    picker: true,
  },
  basic_4: {
    family: "basic",
    tiles: 4,
    tree: col([1, 1], [
      tile(1),
      row([1, 1], [tile(2), col([1, 1], [tile(3), tile(4)])]),
    ]),
    mobileTree: row([2, 1, 1], [tile(1), tile(2), col([1, 1], [tile(3), tile(4)])]),
    mobileFlipTree: row([1, 1, 2], [tile(2), col([1, 1], [tile(3), tile(4)]), tile(1)]),
    aspect: BASIC_ASPECT,
    mobileAspect: BASIC_MOBILE_ASPECT,
    flippable: true,
    picker: true,
  },
  basic_5: {
    family: "basic",
    tiles: 5,
    tree: col([1, 1], [
      tile(1),
      row([1, 1], [
        col([1, 1], [tile(2), tile(3)]),
        col([1, 1], [tile(4), tile(5)]),
      ]),
    ]),
    mobileTree: row([2, 1, 1], [
      tile(1),
      col([1, 1], [tile(2), tile(3)]),
      col([1, 1], [tile(4), tile(5)]),
    ]),
    mobileFlipTree: row([1, 1, 2], [
      col([1, 1], [tile(2), tile(3)]),
      col([1, 1], [tile(4), tile(5)]),
      tile(1),
    ]),
    aspect: BASIC_ASPECT,
    mobileAspect: BASIC_MOBILE_ASPECT,
    flippable: true,
    picker: true,
  },

  // Grid — two rows.
  grid_4: {
    family: "grid",
    tiles: 4,
    tree: row([1, 1], [
      col([1, 1], [tile(1), tile(2)]),
      col([1, 1], [tile(3), tile(4)]),
    ]),
    mobileTree: row([1, 1, 1, 1], [tile(1), tile(2), tile(3), tile(4)]),
    aspect: GRID_ASPECT,
    mobileAspect: GRID_MOBILE_ASPECT,
    flippable: false,
    picker: true,
  },
  grid_6: {
    family: "grid",
    tiles: 6,
    tree: row([1, 1], [
      col([2, 1, 1], [tile(1), tile(2), tile(3)]),
      col([2, 1, 1], [tile(4), tile(5), tile(6)]),
    ]),
    mobileTree: row([1, 1, 1, 1], [
      tile(1),
      col([1, 1], [tile(2), tile(3)]),
      tile(4),
      col([1, 1], [tile(5), tile(6)]),
    ]),
    mobileFlipTree: row([1, 1, 1, 1], [
      col([1, 1], [tile(2), tile(3)]),
      tile(1),
      col([1, 1], [tile(5), tile(6)]),
      tile(4),
    ]),
    aspect: GRID_ASPECT,
    mobileAspect: GRID_MOBILE_ASPECT,
    flippable: true,
    picker: true,
  },
  grid_7: {
    family: "grid",
    tiles: 7,
    tree: row([1, 1], [
      col([2, 1, 1], [tile(1), tile(2), tile(3)]),
      col([1, 1, 1, 1], [tile(4), tile(5), tile(6), tile(7)]),
    ]),
    mobileTree: row([1, 1, 1, 1], [
      tile(1),
      col([1, 1], [tile(2), tile(3)]),
      col([1, 1], [tile(4), tile(5)]),
      col([1, 1], [tile(6), tile(7)]),
    ]),
    mobileFlipTree: row([1, 1, 1, 1], [
      col([1, 1], [tile(2), tile(3)]),
      tile(1),
      col([1, 1], [tile(4), tile(5)]),
      col([1, 1], [tile(6), tile(7)]),
    ]),
    aspect: GRID_ASPECT,
    mobileAspect: GRID_MOBILE_ASPECT,
    flippable: true,
    picker: true,
  },
  grid_8: {
    family: "grid",
    tiles: 8,
    tree: row([1, 1], [
      col([1, 1, 1, 1], [tile(1), tile(2), tile(3), tile(4)]),
      col([1, 1, 1, 1], [tile(5), tile(6), tile(7), tile(8)]),
    ]),
    mobileTree: row([1, 1, 1, 1], [
      col([1, 1], [tile(1), tile(2)]),
      col([1, 1], [tile(3), tile(4)]),
      col([1, 1], [tile(5), tile(6)]),
      col([1, 1], [tile(7), tile(8)]),
    ]),
    aspect: GRID_ASPECT,
    mobileAspect: GRID8_MOBILE_ASPECT,
    flippable: false,
    picker: true,
  },

  // Variable-height — single row.
  var_2: {
    family: "variable",
    tiles: 2,
    tree: col([1, 1], [tile(1), tile(2)]),
    mobileTree: STACKED_2,
    aspect: VAR_ASPECT,
    mobileAspect: VAR_MOBILE_ASPECT,
    flippable: false,
    picker: true,
  },
  var_3: {
    family: "variable",
    tiles: 3,
    tree: col([2, 1, 1], [tile(1), tile(2), tile(3)]),
    mobileTree: row([1, 1], [tile(1), col([1, 1], [tile(2), tile(3)])]),
    mobileFlipTree: row([1, 1], [col([1, 1], [tile(2), tile(3)]), tile(1)]),
    aspect: VAR_ASPECT,
    mobileAspect: VAR_MOBILE_ASPECT,
    flippable: true,
    picker: true,
  },
  var_4: {
    family: "variable",
    tiles: 4,
    tree: col([1, 1, 1, 1], [tile(1), tile(2), tile(3), tile(4)]),
    mobileTree: row([1, 1], [
      col([1, 1], [tile(1), tile(2)]),
      col([1, 1], [tile(3), tile(4)]),
    ]),
    aspect: VAR_ASPECT,
    mobileAspect: VAR_MOBILE_ASPECT,
    flippable: false,
    picker: true,
  },
};

function buildSplitLayouts(): Record<string, SplitLayoutDef> {
  const out: Record<string, SplitLayoutDef> = { ...BASE_SPLIT_LAYOUTS };
  for (const [key, def] of Object.entries(BASE_SPLIT_LAYOUTS)) {
    if (!def.flippable) continue;
    out[`${key}_flip`] = {
      ...def,
      tree: flipSplitNode(def.tree),
      mobileTree: def.mobileFlipTree ?? flipSplitNode(def.mobileTree),
      picker: false,
    };
  }
  return out;
}

export const SPLIT_LAYOUTS: Record<string, SplitLayoutDef> = buildSplitLayouts();

export type SplitLayout = string;

export const DEFAULT_SPLIT_LAYOUT: SplitLayout = "split_2_equal";

export const SPLIT_PICKER_GROUPS: { family: SplitFamily; label: string; keys: string[] }[] = [
  { family: "basic", label: "Basic section", keys: ["split_2_equal", "basic_3", "basic_4", "basic_5"] },
  { family: "grid", label: "Grid", keys: ["grid_4", "grid_6", "grid_7", "grid_8"] },
  { family: "variable", label: "Variable-height", keys: ["var_2", "var_3", "var_4"] },
];

export function isSplitLayout(key: string | null | undefined): key is SplitLayout {
  return !!key && key in SPLIT_LAYOUTS;
}

export function getSplitLayout(key: string | null | undefined): SplitLayoutDef {
  return (key && SPLIT_LAYOUTS[key]) || SPLIT_LAYOUTS[DEFAULT_SPLIT_LAYOUT];
}

export function splitLayoutTree(
  key: string | null | undefined,
  device: SplitDevice = "desktop"
): SplitNode {
  const def = getSplitLayout(key);
  return device === "mobile" ? def.mobileTree : def.tree;
}

export function splitLayoutAspect(
  key: string | null | undefined,
  device: SplitDevice = "desktop"
): string {
  const def = getSplitLayout(key);
  return device === "mobile" ? def.mobileAspect : def.aspect;
}

/**
 * True when the layout is a single row or column of leaf tiles (no nested
 * splits). Amazon sizes those widgets from the uploaded images; the Hub
 * should not force a CSS aspect-ratio box that letterboxes or crops them.
 */
export function isSingleRowSplit(
  key: string | null | undefined,
  device: SplitDevice = "desktop"
): boolean {
  const tree = splitLayoutTree(key, device);
  if (isSplitTile(tree)) return true;
  return tree.children.every(isSplitTile);
}

export function splitTileCount(key: string | null | undefined): number {
  return getSplitLayout(key).tiles;
}

export function isFlippedSplitLayout(key: string | null | undefined): boolean {
  return typeof key === "string" && key.endsWith("_flip") && key in SPLIT_LAYOUTS;
}

export function canonicalSplitLayoutKey(key: string | null | undefined): SplitLayout {
  if (!key || !(key in SPLIT_LAYOUTS)) return DEFAULT_SPLIT_LAYOUT;
  return key.endsWith("_flip") ? key.slice(0, -5) : key;
}

export function flipSplitLayoutKey(key: string | null | undefined): SplitLayout {
  const canonical = canonicalSplitLayoutKey(key);
  const def = SPLIT_LAYOUTS[canonical];
  if (!def?.flippable) return canonical;
  return isFlippedSplitLayout(key) ? canonical : `${canonical}_flip`;
}

/** Flex-grow pair for simple 2-tile column layouts. Nested layouts fall back to 1/1. */
export function splitLayoutRatio(key: string | null | undefined): readonly [number, number] {
  const tree = getSplitLayout(key).tree;
  if (
    !isSplitTile(tree) &&
    tree.dir === "col" &&
    tree.sizes.length === 2 &&
    tree.children.every(isSplitTile)
  ) {
    return [Number(tree.sizes[0]), Number(tree.sizes[1])];
  }
  return [1, 1];
}

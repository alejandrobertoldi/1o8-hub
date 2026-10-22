export function isAplus2ParentProduct(parentageLevel: string | null | undefined): boolean {
  return (parentageLevel ?? "").toLowerCase() === "parent";
}

export function uniqueAsins(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function uniqueRowsByAsin<
  T extends { asin: string | null | undefined },
>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.asin?.trim().toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sameAsinSet(a: string[], b: string[]): boolean {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((asin, i) => asin === right[i]);
}

export function aplusGroupSelectionError(
  requestedAsins: string[],
  familyAsins: string[],
): string | null {
  const requested = [...new Set(requestedAsins)];
  if (requested.length < 2) return "Group scope requires at least two ASINs";
  const family = new Set(familyAsins);
  if (requested.some((asin) => !family.has(asin))) {
    return "Every group ASIN must belong to the selected client";
  }
  return null;
}

export function nextAplusGroupIdentifier(
  groupLabel: string,
  existingIdentifiers: string[],
): string {
  const maxNumber = existingIdentifiers.reduce((current, identifier) => {
    const match = identifier.match(/^G(\d+)(?:_|$)/i);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  const nextNumber = Math.max(maxNumber, existingIdentifiers.length) + 1;
  return `G${String(nextNumber).padStart(2, "0")}_${aplusGroupLabelToken(groupLabel)}`;
}

export type AplusThemeAxis = "Color" | "Size" | "Flavor" | "Style";
export type AplusThemeFilters = Partial<Record<AplusThemeAxis, string[]>>;

export function aplusGroupLabelToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "Selected_ASINs";
}

export function aplusGroupLabelFromFilters(filters: AplusThemeFilters): string {
  const axes: AplusThemeAxis[] = ["Color", "Size", "Flavor", "Style"];
  const seen = new Set<string>();
  const values = axes.flatMap((axis) =>
    (filters[axis] ?? []).filter((value) => {
      const key = value.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
  return aplusGroupLabelToken(values.join("_"));
}

export function filterAplusGroupMembers<
  T extends { color?: string | null; size?: string | null; flavor?: string | null; style?: string | null },
>(members: T[], filters: AplusThemeFilters): T[] {
  const keys: Array<[AplusThemeAxis, "color" | "size" | "flavor" | "style"]> = [
    ["Color", "color"],
    ["Size", "size"],
    ["Flavor", "flavor"],
    ["Style", "style"],
  ];
  return members.filter((member) =>
    keys.every(([axis, key]) => {
      const selected = filters[axis] ?? [];
      if (selected.length === 0) return true;
      const value = member[key]?.trim().toLowerCase();
      return Boolean(value && selected.some((option) => option.trim().toLowerCase() === value));
    }),
  );
}

export type AplusCoveredProduct = {
  id: string;
  asin: string;
  parentageLevel: string | null;
  summarizedTitle: string | null;
  itemName: string | null;
};

type CoveredProductRow = {
  id: string;
  asin: string | null | undefined;
  parentageLevel?: string | null;
  summarizedTitle?: string | null;
  itemName?: string | null;
};

function toCoveredProduct(row: CoveredProductRow): AplusCoveredProduct | null {
  if (!row.id || !row.asin) return null;
  return {
    id: row.id,
    asin: row.asin,
    parentageLevel: row.parentageLevel ?? null,
    summarizedTitle: row.summarizedTitle ?? null,
    itemName: row.itemName ?? null,
  };
}

/** Parent first (when present), then remaining members, unique by ASIN. */
export function uniqueCoveredProducts(
  rows: CoveredProductRow[],
  parentAsin?: string | null,
): AplusCoveredProduct[] {
  const seen = new Set<string>();
  const out: AplusCoveredProduct[] = [];
  const add = (row: CoveredProductRow) => {
    const product = toCoveredProduct(row);
    if (!product || seen.has(product.asin)) return;
    seen.add(product.asin);
    out.push(product);
  };
  if (parentAsin) {
    const parent = rows.find((r) => r.asin === parentAsin);
    if (parent) add(parent);
  }
  for (const row of rows) add(row);
  return out;
}

/** Keep stored GROUP membership and ordering; ignore other live family members. */
export function pickStoredCoveredProducts(
  asins: string[],
  products: AplusCoveredProduct[],
): AplusCoveredProduct[] {
  const byAsin = new Map(products.map((product) => [product.asin, product]));
  return uniqueAsins(asins).flatMap((asin) => {
    const product = byAsin.get(asin);
    return product ? [product] : [];
  });
}

/** Folder/file token: Variation ID for PARENT scope, otherwise the set's ASIN. */
export function aplus2DriveScopeToken(args: {
  scopeType: string;
  scopeIdentifier: string;
  variationId?: string | null;
}): string {
  if (args.scopeType === "PARENT") {
    const id = args.variationId?.trim();
    if (id) return id;
  }
  return args.scopeIdentifier;
}

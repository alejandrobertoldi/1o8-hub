// Applies the Amazon "Parent fills theme fields" rule:
// when parentageLevel === "Parent" and variationThemeName mentions a given
// variation dimension (size/color/flavor/style), that field is forced to
// "Parent". Other dimensions are left untouched.
//
// Examples:
//   { parentageLevel: "Parent", variationThemeName: "SizeColor" }
//     -> size="Parent", color="Parent", flavor untouched, style untouched
//   { parentageLevel: "Child", ... }    -> unchanged
//   { variationThemeName: null, ... }   -> unchanged

export type ParentVariationFillable = {
  parentageLevel?: string | null;
  variationThemeName?: string | null;
  size?: string | null;
  color?: string | null;
  flavor?: string | null;
  style?: string | null;
};

/** BQ names of theme axes named in VariationThemeName (Flavor/Size → Flavor, Size). */
export function parentThemeBqNames(themeName: string | null | undefined): string[] {
  if (!themeName) return [];
  const names: string[] = [];
  if (/flavor/i.test(themeName)) names.push("Flavor");
  if (/size/i.test(themeName)) names.push("Size");
  if (/color/i.test(themeName)) names.push("Color");
  if (/style/i.test(themeName)) names.push("Style");
  return names;
}

export function applyParentVariationFill<T extends ParentVariationFillable>(row: T): T {
  if (row.parentageLevel !== "Parent" || !row.variationThemeName) return row;
  const t = row.variationThemeName;
  return {
    ...row,
    size: /size/i.test(t) ? "Parent" : row.size,
    color: /color/i.test(t) ? "Parent" : row.color,
    flavor: /flavor/i.test(t) ? "Parent" : row.flavor,
    style: /style/i.test(t) ? "Parent" : row.style,
  };
}

type ParentFillChangeLogEntry = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: string;
};

/** Persist Amazon parent sentinels onto the product update payload (variations blob + raw). */
export function applyParentThemeFillToProductUpdates(opts: {
  product: {
    parentageLevel?: string | null;
    variations?: Record<string, string> | null;
    rawColumnValues?: Record<string, string> | null;
  };
  bqName: string;
  value: string | null;
  updates: Record<string, unknown>;
  rawValues: Record<string, string | null | undefined>;
  changeLog: ParentFillChangeLogEntry[];
  changedBy: string;
  changedAt: string;
}): void {
  const isParentageEdit = opts.bqName === "ParentageLevel";
  const isThemeEdit = opts.bqName === "VariationThemeName";
  if (!isParentageEdit && !isThemeEdit) return;

  const parentage = isParentageEdit
    ? opts.value
    : ((opts.updates.parentageLevel as string | null | undefined) ?? opts.product.parentageLevel ?? null);
  if (parentage?.toLowerCase() !== "parent") return;

  const variations = {
    ...((opts.product.variations as Record<string, string> | null) ?? {}),
    ...((opts.updates.variations as Record<string, string> | undefined) ?? {}),
  };
  const theme = isThemeEdit
    ? opts.value
    : (variations.VariationThemeName
      ?? opts.rawValues.VariationThemeName
      ?? opts.product.rawColumnValues?.VariationThemeName
      ?? null);

  const names = parentThemeBqNames(theme);
  if (names.length === 0) return;

  let blobChanged = false;
  for (const bq of names) {
    const old = variations[bq] ?? opts.rawValues[bq] ?? null;
    if (old === "Parent") continue;
    variations[bq] = "Parent";
    opts.rawValues[bq] = "Parent";
    blobChanged = true;
    opts.changeLog.push({
      field: bq,
      oldValue: old,
      newValue: "Parent",
      changedBy: opts.changedBy,
      changedAt: opts.changedAt,
    });
  }
  if (blobChanged) opts.updates.variations = variations;
}

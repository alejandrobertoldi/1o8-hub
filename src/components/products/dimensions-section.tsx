"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  X,
  Box,
  Package,
  PackageOpen,
  Monitor,
  HelpCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { getProductFieldValue } from "@/lib/product-mapper";
import type { Product } from "@/lib/db/schema";
import { useAttributesMasterCards } from "@/hooks/use-attributes-master";
import { parseValidValues } from "@/hooks/use-category-filter";

function parseSelectOptions(validValuesJson: string | null): string[] | null {
  if (!validValuesJson) return null;
  try {
    const parsed = JSON.parse(validValuesJson);
    const keys = Object.keys(parsed);
    if (keys.length === 0) return null;

    for (const key of keys) {
      const value = parsed[key];
      if (value && typeof value === "string" && value.trim() !== "") {
        const values = value.split(",").map((v: string) => v.trim());
        if (values.length > 0 && values[0] !== "") {
          return values;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/* ── Mapping HubLabel to BQ_Master ───────────────────────────────── */

const HUB_LABEL_TO_BQ_NAME: Record<string, string> = {
  "Item Length 1": "ItemLength",
  "Item Length 2": "ItemLength2",
  "Item Length Unit": "ItemLengthUnit",
  "Item Width 1": "ItemWidth1",
  "Item Width 2": "ItemWidth2",
  "Item Width Unit": "ItemWidthUnit",
  "Width Unit": "WidthUnit",
  "Item Height": "ItemHeight",
  "Item Height Unit": "ItemHeightUnit",
  "Item Weight": "ItemWeight",
  "Item Weight Unit": "ItemWeightUnit",
  "Item Volume": "ItemVolume",
  "Item Volume Unit": "ItemVolumeUnit",
  "Item Length Description": "ItemLengthDescription",
  "Item Diameter": "ItemDiameter",
  "Item Display Length": "ItemDisplayLength",
  "Item Display Length Unit": "ItemDisplayLengthUnit",
  "Item Display Width": "ItemDisplayWidth",
  "Item Display Width Unit": "ItemDisplayWidthUnit",
  "Item Display Height": "ItemDisplayHeight",
  "Item Display Height Unit": "ItemDisplayHeightUnit",
  "Item Display Depth": "ItemDisplayDepth",
  "Item Display Depth Unit": "ItemDisplayDepthUnit",
  "Item Display Weight": "ItemDisplayWeight",
  "Item Display Weight Unit": "ItemDisplayWeightUnit",
  "Item Display Diameter": "ItemDisplayDiameter",
  "Item Display Diameter Unit": "ItemDisplayDiameterUnit",
  "Item Shape": "ItemShape",
  "Item Package Length": "ItemPackageLength",
  "Package Length Unit": "PackageLengthUnit",
  "Item Package Width": "ItemPackageWidth",
  "Package Width Unit": "PackageWidthUnit",
  "Item Package Height": "ItemPackageHeight",
  "Package Height Unit": "PackageHeightUnit",
  "Package Weight": "PackageWeight",
  "Package Weight Unit": "PackageWeightUnit",
  "Item Package Quantity": "ItemPackageQuantity",
  "Number of Packs": "NumberOfPacks",
  "Package Type": "PackageType",
  "Package Level": "PackageLevel",
  "Package Contains SKU Identifier": "PackageContainsSKUIdentifier",
  "Package Contains SKU Quantity": "PackageContainsSKUQuantity",
  "Customer Package Type": "CustomerPackageType",
  "Master Pack Layers per Pallet Quantity": "MasterPackLayersperPalletQuantity",
  "Master Packs Per Layer Quantity": "MasterPacksPerLayerQuantity",
  "Number of Boxes": "NumberOfBoxes",
  "Inner Packs Per Master Pack": "InnerPacksPerMasterPack",
  "Itemsper Inner Pack": "ItemsperInnerPack",
};

type DimensionAttribute = {
  hubLabel: string;
  bqName: string;
  requirement: string | null;
  description: string | null;
  subcardName: string;
};

type SubcardData = {
  name: string;
  attributes: DimensionAttribute[];
};

function getDimensionsSubcards(cards: Awaited<ReturnType<typeof useAttributesMasterCards>>["cards"]): SubcardData[] {
  if (!cards) return [];

  const dimsCard = cards.find(c => c.name === "Dimensions & Shipping");
  if (!dimsCard) return [];

  const subcardsMap = new Map<string, DimensionAttribute[]>();

  for (const subcard of dimsCard.subcards) {
    const subcardName = subcard.name;
    const attrs: DimensionAttribute[] = [];

    for (const attr of subcard.attributes) {
      const hubLabel = attr.Attributes_HubLabel;
      const bqName = HUB_LABEL_TO_BQ_NAME[hubLabel] || attr.BQ_Master || hubLabel;
      attrs.push({
        hubLabel,
        bqName,
        requirement: attr.Attributes_Requirement,
        description: attr.Attributes_Description,
        subcardName,
      });
    }

    subcardsMap.set(subcardName, attrs);
  }

  return Array.from(subcardsMap.entries()).map(([name, attributes]) => ({
    name,
    attributes,
  }));
}

const SUBCARD_CONFIG: Record<string, { id: string; label: string; icon: typeof Box; color: string; accent: string; description: string }> = {
  "Item Dimensions": { id: "item", label: "Item Dimensions", icon: Box, color: "text-blue-400", accent: "border-blue-500/40 bg-blue-500/5", description: "The actual product dimensions without any packaging" },
  "Item Display Dimensions": { id: "display", label: "Item Display Dimensions", icon: Monitor, color: "text-purple-400", accent: "border-purple-500/40 bg-purple-500/5", description: "Dimensions as shown on the product listing page" },
  "Package": { id: "itemPackage", label: "Item Package", icon: PackageOpen, color: "text-amber-400", accent: "border-amber-500/40 bg-amber-500/5", description: "Product in its retail packaging (box on the shelf)" },
  "Logistics": { id: "logistics", label: "Logistics", icon: Package, color: "text-green-400", accent: "border-green-500/40 bg-green-500/5", description: "Logistics and pallet configuration" },
};

/* ── Valid unit values ────────────────────────────────────────── */

const LENGTH_UNITS = ["Inches", "Centimeters", "Millimeters", "Feet", "Meters"] as const;
const WEIGHT_UNITS = ["Pounds", "Kilograms", "Grams", "Ounces", "Milligrams"] as const;
const VOLUME_UNITS = [
  "Cubic Inches", "Cubic Centimeters", "Cubic Feet", "Cubic Meters",
  "Fluid Ounces", "Gallons", "Liters", "Milliliters", "Pints", "Quarts",
] as const;

/* ── Field groups by category ─────────────────────────────────── */

type DimField = {
  bqName: string;
  label: string;
  kind: "length" | "weight" | "volume" | "count";
  unit?: string; // bqName of the unit field
  unitLabel?: string; // display label for the unit selector column
};

const ITEM_DIMS: DimField[] = [
  { bqName: "ItemLength", label: "Item Length", kind: "length", unit: "ItemLengthUnit", unitLabel: "Item Length Unit" },
  { bqName: "ItemLengthDescription", label: "Item Length Description", kind: "count" },
  { bqName: "ItemWidth", label: "Item Width", kind: "length", unit: "ItemWidthUnit", unitLabel: "Item Width Unit" },
  { bqName: "ItemWeight", label: "Item Weight", kind: "weight", unit: "ItemWeightUnit", unitLabel: "Item Weight Unit" },
  { bqName: "ItemHeight", label: "Item Height", kind: "length", unit: "ItemHeightUnit", unitLabel: "Item Height Unit" },
  { bqName: "ItemVolume", label: "Item Volume", kind: "volume", unit: "ItemVolumeUnit", unitLabel: "Item Volume Unit" },
];

const ITEM_PACKAGE_DIMS: DimField[] = [
  { bqName: "ItemPackageLength", label: "Item Package Length", kind: "length", unit: "PackageLengthUnit", unitLabel: "Package Length Unit" },
  { bqName: "ItemPackageWidth", label: "Item Package Width", kind: "length", unit: "PackageWidthUnit", unitLabel: "Package Width Unit" },
  { bqName: "ItemPackageHeight", label: "Item Package Height", kind: "length", unit: "PackageHeightUnit", unitLabel: "Package Height Unit" },
  { bqName: "PackageWeight", label: "Item Package Weight", kind: "weight", unit: "PackageWeightUnit", unitLabel: "Package Weight Unit" },
];

const PACKAGE_META: { bqName: string; label: string }[] = [
  { bqName: "PackageLevel", label: "Package Level" },
  { bqName: "PackageType", label: "Package Type" },
  { bqName: "PackageTypeName", label: "Package Type Name" },
  { bqName: "PackageContainsSKUIdentifier", label: "Package Contains SKU Identifier" },
  { bqName: "PackageContainsSKUQuantity", label: "Package Contains SKU Quantity" },
  { bqName: "IsPackageLevelOrderable", label: "Is Package Level Orderable" },
  { bqName: "ItemPackageQuantity", label: "Item Package Quantity" },
  { bqName: "CustomerPackageType", label: "Customer Package Type" },
  { bqName: "IsAdultProduct", label: "Is Adult Product" },
];

const SHIPPING_DIMS: DimField[] = [
  { bqName: "PackageLength", label: "Length", kind: "length", unit: "PackageLengthUnit", unitLabel: "Package Length Unit" },
  { bqName: "PackageWidth", label: "Width", kind: "length", unit: "PackageWidthUnit", unitLabel: "Package Width Unit" },
  { bqName: "PackageHeight", label: "Height", kind: "length", unit: "PackageHeightUnit", unitLabel: "Package Height Unit" },
  { bqName: "PackageWeight", label: "Weight", kind: "weight", unit: "PackageWeightUnit", unitLabel: "Package Weight Unit" },
];

const DISPLAY_DIMS: DimField[] = [
  { bqName: "ItemDisplayWeight", label: "Item Display Weight", kind: "weight", unit: "ItemDisplayWeightUnit", unitLabel: "Item Display Weight Unit" },
  { bqName: "ItemDisplayWidth", label: "Item Display Width", kind: "length", unit: "ItemDisplayWidthUnit", unitLabel: "Item Display Width Unit" },
  { bqName: "ItemShape", label: "Item Shape", kind: "count" },
];

const MEASURES_FIELDS: DimField[] = [];

const LOGISTICS_FIELDS: { bqName: string; label: string }[] = [
  { bqName: "InnerPacksPerMasterPack", label: "Inner Packs Per Master Pack" },
  { bqName: "ItemsperInnerPack", label: "Itemsper Inner Pack" },
  { bqName: "MasterPackLayersperPalletQuantity", label: "Master Pack Layersper Pallet Quantity" },
  { bqName: "MasterPacksPerLayerQuantity", label: "Master Packs Per Layer Quantity" },
  { bqName: "NumberOfBoxes", label: "Number Of Boxes" },
];

/** All bqNames managed by this section (for exclusion in data-driven loop) */
export const DIMENSIONS_SECTION_FIELDS = new Set([
  ...ITEM_DIMS.flatMap((f) => [f.bqName, ...(f.unit ? [f.unit] : [])]),
  ...ITEM_PACKAGE_DIMS.flatMap((f) => [f.bqName, ...(f.unit ? [f.unit] : [])]),
  ...SHIPPING_DIMS.flatMap((f) => [f.bqName, ...(f.unit ? [f.unit] : [])]),
  ...DISPLAY_DIMS.flatMap((f) => [f.bqName, ...(f.unit ? [f.unit] : [])]),
  ...MEASURES_FIELDS.flatMap((f) => [f.bqName, ...(f.unit ? [f.unit] : [])]),
  ...LOGISTICS_FIELDS.map((f) => f.bqName),
  "NetContentVolume1", "NetContentVolume2",
  "NetContentVolumeUnit1", "NetContentVolumeUnit2",
  "NetContentWeight1", "NetContentWeight2",
  "NetContentWeightUnit1", "NetContentWeightUnit2",
]);

const CATEGORIES: {
  id: string;
  label: string;
  icon: typeof Box;
  color: string;
  accent: string;
  dims: DimField[];
  description: string;
}[] = [
  {
    id: "item",
    label: "Item Dimensions",
    icon: Box,
    color: "text-blue-400",
    accent: "border-blue-500/40 bg-blue-500/5",
    dims: ITEM_DIMS,
    description: "The actual product dimensions without any packaging",
  },
  {
    id: "display",
    label: "Item Display Dimensions",
    icon: Monitor,
    color: "text-purple-400",
    accent: "border-purple-500/40 bg-purple-500/5",
    dims: DISPLAY_DIMS,
    description: "Dimensions as shown on the product listing page",
  },
  {
    id: "itemPackage",
    label: "Item Package",
    icon: PackageOpen,
    color: "text-amber-400",
    accent: "border-amber-500/40 bg-amber-500/5",
    dims: ITEM_PACKAGE_DIMS,
    description: "Product in its retail packaging (box on the shelf)",
  },
];

function formatUnit(unit: string): string {
  const map: Record<string, string> = {
    inches: "in", centimeters: "cm", millimeters: "mm",
    feet: "ft", meters: "m", pounds: "lb", kilograms: "kg",
    grams: "g", ounces: "oz", milligrams: "mg",
    "cubic inches": "cu in", "cubic centimeters": "cc", "cubic feet": "cu ft",
    "cubic meters": "cu m", "fluid ounces": "fl oz", gallons: "gal",
    liters: "L", milliliters: "mL", pints: "pt", quarts: "qt",
  };
  return map[unit.toLowerCase()] ?? unit;
}

/** Normalize stored unit value to match dropdown option casing */
function normalizeUnit(stored: string, options: readonly string[]): string {
  if (!stored) return "";
  const match = options.find((o) => o.toLowerCase() === stored.toLowerCase());
  return match ?? stored;
}

type Props = {
  product: Product;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (
    bqName: string,
    label: string,
    oldValue: string,
    newValue: string
  ) => void;
  children?: React.ReactNode;
  requirementSummary?: { required: number; conditional: number; preferred: number; optional: number };
};

const REQ_CHIP_COLORS: Record<string, string> = {
  R: "bg-red-900/60 text-red-200",
  C: "bg-amber-900/60 text-amber-200",
  P: "bg-blue-900/60 text-blue-200",
  O: "bg-zinc-700/60 text-zinc-300",
};

export function DimensionsSection({
  product,
  readOnly,
  onSave,
  onFieldSaved,
  children,
  requirementSummary: requirementSummaryProp,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const { cards, isLoading } = useAttributesMasterCards();

  const productType = getProductFieldValue(product, "ProductType");

  const allAttributes = useMemo((): { bqName: string; hubLabel: string; requirement: string | null; description: string | null; validValues: string[] | null; rawValidValues: string | null; subcardName: string }[] => {
    if (!cards) return [];
    const dimsCard = cards.find(c => c.name === "Dimensions & Shipping");
    if (!dimsCard) return [];
    const attrs = [];
    for (const subcard of dimsCard.subcards) {
      for (const attr of subcard.attributes) {
        attrs.push({
          hubLabel: attr.Attributes_HubLabel,
          bqName: HUB_LABEL_TO_BQ_NAME[attr.Attributes_HubLabel] || attr.BQ_Master || attr.Attributes_HubLabel,
          requirement: attr.Attributes_Requirement,
          description: attr.Attributes_Description,
          validValues: parseSelectOptions(attr.Attributes_ValidValues),
          rawValidValues: attr.Attributes_ValidValues ?? null,
          subcardName: subcard.name,
        });
      }
    }
    return attrs;
  }, [cards]);

  const dimsAttributes = useMemo(() => {
    return allAttributes.filter((attr) => {
      const result = parseValidValues(attr.rawValidValues, productType);
      return result.visible;
    });
  }, [allAttributes, productType]);

  const attributeMetaMap = useMemo(() => {
    const map = new Map<string, { requirement: string | null; description: string | null; validValues: string[] | null }>();
    for (const attr of dimsAttributes) {
      map.set(attr.bqName, { requirement: attr.requirement, description: attr.description, validValues: attr.validValues });
    }
    return map;
  }, [dimsAttributes]);

  const populatedCount = useMemo(() => {
    return dimsAttributes.filter((attr) => {
      const val = getProductFieldValue(product, attr.bqName);
      return val != null && val !== "";
    }).length;
  }, [dimsAttributes, product]);

  const requirementCounts = useMemo(() => {
    if (requirementSummaryProp) return requirementSummaryProp;
    const counts = { required: 0, conditional: 0, preferred: 0, optional: 0 };
    for (const attr of dimsAttributes) {
      if (attr.requirement === "Required") counts.required++;
      else if (attr.requirement === "Conditionally Required") counts.conditional++;
      else if (attr.requirement === "Recommended") counts.preferred++;
      else if (attr.requirement === "Optional") counts.optional++;
    }
    return counts;
  }, [dimsAttributes, requirementSummaryProp]);

  const subcardsData = useMemo(() => getDimensionsSubcards(cards), [cards]);

  const subcardsGrouped = useMemo(() => {
    const grouped = new Map<string, typeof dimsAttributes>();
    for (const attr of dimsAttributes) {
      if (!grouped.has(attr.subcardName)) grouped.set(attr.subcardName, []);
      grouped.get(attr.subcardName)!.push(attr);
    }
    return grouped;
  }, [dimsAttributes]);

  const renderedSubcards = useMemo(() => {
    return subcardsData.map((subcard) => {
      const config = SUBCARD_CONFIG[subcard.name];
      if (!config) return null;

      const dimensions = subcard.attributes.filter((a) => {
        return a.bqName.toLowerCase().includes("length") ||
               a.bqName.toLowerCase().includes("width") ||
               a.bqName.toLowerCase().includes("height") ||
               a.bqName.toLowerCase().includes("weight") ||
               a.bqName.toLowerCase().includes("volume") ||
               a.bqName.toLowerCase().includes("depth") ||
               a.bqName.toLowerCase().includes("diameter");
      });

      const metaFields = subcard.attributes.filter((a) => !dimensions.some((d) => d.bqName === a.bqName));

      const populatedCount = subcard.attributes.filter((a) => {
        const val = getProductFieldValue(product, a.bqName);
        return val != null && val !== "";
      }).length;

      return {
        ...config,
        attributes: subcard.attributes,
        dimensions,
        metaFields,
        populatedCount,
      };
    }).filter(Boolean);
  }, [subcardsData, product]);

  const logisticsAttributes = useMemo(() => {
    const logistics = subcardsData.find((s) => s.name === "Logistics");
    return logistics?.attributes || [];
  }, [subcardsData]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden p-4">
        <span className="text-sm text-muted-foreground">Loading Dimensions attributes...</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between gap-3 w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="text-sm font-medium text-section-title">
            Dimensions & Shipping
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(requirementCounts.required > 0 || requirementCounts.conditional > 0 || requirementCounts.preferred > 0 || requirementCounts.optional > 0) && (
            <div className="flex items-center gap-1">
              {requirementCounts.required > 0 && <span className={`text-[10px] px-1.5 py-0 rounded font-medium ${REQ_CHIP_COLORS.R}`}>{requirementCounts.required}R</span>}
              {requirementCounts.conditional > 0 && <span className={`text-[10px] px-1.5 py-0 rounded font-medium ${REQ_CHIP_COLORS.C}`}>{requirementCounts.conditional}C</span>}
              {requirementCounts.preferred > 0 && <span className={`text-[10px] px-1.5 py-0 rounded font-medium ${REQ_CHIP_COLORS.P}`}>{requirementCounts.preferred}P</span>}
              {requirementCounts.optional > 0 && <span className={`text-[10px] px-1.5 py-0 rounded font-medium ${REQ_CHIP_COLORS.O}`}>{requirementCounts.optional}O</span>}
            </div>
          )}
          <Badge variant="secondary" className="text-xs tabular-nums">
            {populatedCount}/{dimsAttributes.length}
          </Badge>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3">
          {/* Dynamic subcards from database */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from(subcardsGrouped.entries()).map(([subcardName, attrs]) => {
              const config = SUBCARD_CONFIG[subcardName];
              if (!config) return null;
              const populatedCount = attrs.filter((a) => {
                const val = getProductFieldValue(product, a.bqName);
                return val != null && val !== "";
              }).length;
              return (
                <div key={subcardName} className={`rounded-lg border p-3 ${config.accent}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <config.icon className={`h-4 w-4 ${config.color}`} />
                    <span className={`text-xs font-semibold ${config.color}`}>{config.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                      {populatedCount}/{attrs.length}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2 leading-tight">{config.description}</p>

                  <div className="space-y-1.5">
                    {attrs.map((attr) => (
                      <MetaField
                        key={attr.bqName}
                        label={attr.hubLabel}
                        bqName={attr.bqName}
                        value={getProductFieldValue(product, attr.bqName) ?? ""}
                        readOnly={readOnly}
                        onSave={onSave}
                        onFieldSaved={onFieldSaved}
                        attributeMeta={{ requirement: attr.requirement, description: attr.description }}
                        validValues={attr.rawValidValues}
                        productType={productType}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {children}
        </div>
      )}
    </div>
  );
}

/* ── Visual dimension card ───────────────────────────────────── */

function DimensionCard({
  category,
  product,
  readOnly,
  onSave,
  onFieldSaved,
  attributeMetaMap,
}: {
  category: (typeof CATEGORIES)[number];
  product: Product;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
  attributeMetaMap: Map<string, { requirement: string | null; description: string | null }>;
}) {
  const Icon = category.icon;
  const dims = category.dims;
  const spatialDims = dims.filter((d) => d.kind === "length");

  const populated = dims.filter((d) => {
    const v = getProductFieldValue(product, d.bqName);
    return v != null && v !== "";
  }).length;

  return (
    <div className={`rounded-lg border p-3 ${category.accent}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`h-4 w-4 ${category.color}`} />
        <span className={`text-xs font-semibold ${category.color}`}>
          {category.label}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
          {populated}/{dims.length}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mb-2 leading-tight">
        {category.description}
      </p>

      {/* 3D box visual for L×W×H */}
      {spatialDims.length === 3 && (
        <div className="flex items-end justify-center gap-1 mb-2">
          <BoxVisual
            l={getProductFieldValue(product, spatialDims[0].bqName) ?? ""}
            w={getProductFieldValue(product, spatialDims[1].bqName) ?? ""}
            h={getProductFieldValue(product, spatialDims[2].bqName) ?? ""}
            unit={getProductFieldValue(product, spatialDims[0].unit ?? "") ?? ""}
          />
        </div>
      )}

      {/* Input fields */}
      <div className="space-y-1.5">
        {dims.map((dim) => {
          const unitVal = dim.unit ? getProductFieldValue(product, dim.unit) ?? "" : "";
          return (
            <DimInput
              key={dim.bqName}
              dim={dim}
              value={getProductFieldValue(product, dim.bqName) ?? ""}
              unit={unitVal}
              unitBqName={dim.unit}
              readOnly={readOnly}
              onSave={onSave}
              onFieldSaved={onFieldSaved}
              attributeMeta={attributeMetaMap.get(dim.bqName)}
            />
          );
        })}
      </div>

      {/* Package metadata */}
      {category.id === "itemPackage" && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-1.5">
          {PACKAGE_META.map((field) => (
            <MetaField
              key={field.bqName}
              label={field.label}
              bqName={field.bqName}
              value={getProductFieldValue(product, field.bqName) ?? ""}
              readOnly={readOnly}
              onSave={onSave}
              onFieldSaved={onFieldSaved}
              attributeMeta={attributeMetaMap.get(field.bqName)}
              validValues={null}
              productType={getProductFieldValue(product, "ProductType")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 3D box visual ───────────────────────────────────────────── */

function BoxVisual({
  l,
  w,
  h,
  unit,
}: {
  l: string;
  w: string;
  h: string;
  unit: string;
}) {
  const hasValues = l || w || h;
  const unitShort = unit ? ` ${formatUnit(unit)}` : "";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 80 70" className="w-16 h-14 mb-1" aria-hidden>
        <polygon
          points="40,5 75,20 75,50 40,35"
          className="fill-muted/30 stroke-muted-foreground/30"
          strokeWidth="0.8"
        />
        <polygon
          points="40,35 75,50 40,65 5,50"
          className="fill-muted/20 stroke-muted-foreground/30"
          strokeWidth="0.8"
        />
        <polygon
          points="5,20 40,5 40,35 5,50"
          className="fill-muted/40 stroke-muted-foreground/40"
          strokeWidth="0.8"
        />
        <line x1="2" y1="20" x2="2" y2="50" className="stroke-muted-foreground/50" strokeWidth="0.6" />
        <text x="0" y="37" className="fill-muted-foreground text-[7px]" textAnchor="middle">H</text>
        <line x1="5" y1="53" x2="40" y2="68" className="stroke-muted-foreground/50" strokeWidth="0.6" />
        <text x="22" y="65" className="fill-muted-foreground text-[7px]" textAnchor="middle">W</text>
        <line x1="43" y1="68" x2="78" y2="53" className="stroke-muted-foreground/50" strokeWidth="0.6" />
        <text x="60" y="65" className="fill-muted-foreground text-[7px]" textAnchor="middle">L</text>
      </svg>

      {hasValues ? (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {l || "—"} × {w || "—"} × {h || "—"}{unitShort}
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground/50">No dimensions</span>
      )}
    </div>
  );
}

/* ── Dimension input row ─────────────────────────────────────── */

function DimInput({
  dim,
  value,
  unit,
  unitBqName,
  readOnly,
  onSave,
  onFieldSaved,
  attributeMeta,
}: {
  dim: DimField;
  value: string;
  unit: string;
  unitBqName?: string;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
  attributeMeta?: { requirement: string | null; description: string | null };
}) {
  const unitOptions = dim.kind === "weight" ? WEIGHT_UNITS
    : dim.kind === "volume" ? VOLUME_UNITS
    : dim.kind === "count" ? ([] as readonly string[])
    : LENGTH_UNITS;
  const [localValue, setLocalValue] = useState(value);
  const [localUnit, setLocalUnit] = useState(() => normalizeUnit(unit, unitOptions));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocalValue(value); }, [value]);
  useEffect(() => { setLocalUnit(normalizeUnit(unit, unitOptions)); }, [unit, unitOptions]);

  const doSave = useCallback(
    async (bqName: string, label: string, oldVal: string, newVal: string) => {
      if (newVal === oldVal) return;
      setSaveState("saving");
      try {
        await onSave(bqName, newVal || null);
        onFieldSaved?.(bqName, label, oldVal, newVal);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } catch {
        setSaveState("error");
        toast.error(`Failed to save ${label}`);
        setTimeout(() => setSaveState("idle"), 2000);
      }
    },
    [onSave, onFieldSaved]
  );

  const handleValueChange = (newVal: string) => {
    setLocalValue(newVal);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(dim.bqName, dim.label, value, newVal), 600);
  };

  const handleUnitChange = (newUnit: string) => {
    setLocalUnit(newUnit);
    if (unitBqName) {
      doSave(unitBqName, `${dim.label} Unit`, unit, newUnit);
    }
  };

  const getFieldTooltip = (bqName: string): string => {
    const tooltips: Record<string, string> = {
      ItemLength: "Numeric length of the fully assembled product itself, without packaging",
      ItemLengthDescription: "Optional free-text description of the item's length when a simple numeric value isn't sufficient (e.g., adjustable from 24 to 36 inches)",
      ItemWidth: "Numeric width of the fully assembled product itself, without packaging",
      ItemWeight: "Numeric weight of the fully assembled product itself, without packaging",
      ItemHeight: "Numeric height of the fully assembled product itself, without packaging",
      ItemVolume: "Total volume of the product itself (without packaging) — relevant for liquids or granular goods",
      ItemShape: "Geometric shape of the product (e.g., round, square, rectangular, cylindrical, oval). Used for filtering and category-specific specs",
    };
    return tooltips[bqName] || `Numeric value for this field`;
  };

  const inputClassName = unitBqName
    ? "h-6 px-1.5 text-xs tabular-nums rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand w-16"
    : "h-6 px-1.5 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand w-full";

  return (
    <div className="flex flex-col gap-0.5" id={`field-${dim.bqName}`}>
      <div className="flex items-end gap-1.5 mb-1">
        <div className="flex items-center gap-1 w-[144px] shrink-0">
          <label className="text-[10px] font-medium text-muted-foreground">
            {dim.label}
          </label>
          {attributeMeta?.requirement && attributeMeta.requirement !== "Optional" && (
            <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${
              attributeMeta.requirement === "Required" ? REQ_CHIP_COLORS.R :
              attributeMeta.requirement === "Conditionally Required" ? REQ_CHIP_COLORS.C :
              attributeMeta.requirement === "Recommended" ? REQ_CHIP_COLORS.P : REQ_CHIP_COLORS.O
            }`}>
              {attributeMeta.requirement === "Required" ? "R" :
               attributeMeta.requirement === "Conditionally Required" ? "C" :
               attributeMeta.requirement === "Recommended" ? "P" : "O"}
            </span>
          )}
          {attributeMeta?.description !== null && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-[10px] font-sans">
                    {attributeMeta?.description || getFieldTooltip(dim.bqName)}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {unitBqName && (
          <div className="flex items-center gap-1">
            <label className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
              {dim.unitLabel ?? "Unit"}
            </label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-[10px] font-sans">Select the unit of measurement for {dim.label}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
      {readOnly ? (
        <span className="text-xs text-foreground/80 tabular-nums">
          {value || "—"}{unit ? ` ${formatUnit(unit)}` : ""}
        </span>
      ) : (
        <div className="flex items-end gap-1.5 w-full">
          <input
            type="text"
            inputMode={unitBqName ? "decimal" : undefined}
            value={localValue}
            onChange={(e) => handleValueChange(e.target.value)}
            onKeyDown={unitBqName ? (e) => {
              if (e.key === "Enter") {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                doSave(dim.bqName, dim.label, value, localValue);
              }
            } : undefined}
            placeholder={dim.kind === "count" ? "" : "0"}
            className={inputClassName}
          />
          {unitBqName && (
            <select
              value={localUnit}
              onChange={(e) => handleUnitChange(e.target.value)}
              className="px-1 text-[10px] leading-none rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand"
              style={{ height: "24px", paddingTop: "3px", paddingBottom: "3px", width: "120px", marginLeft: "80px" }}
            >
              <option value="">— select unit —</option>
              {unitOptions.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          )}
          {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0 self-center" />}
          {saveState === "saved" && <Check className="h-3 w-3 shrink-0 self-center" style={{ color: "#1B6B25" }} />}
          {saveState === "error" && <X className="h-3 w-3 shrink-0 self-center" style={{ color: "#EA4336" }} />}
        </div>
      )}
    </div>
  );
}

/* ── Boolean fields that render as Yes/No selects ──────────────── */

const BOOLEAN_FIELDS = new Set([
  "IsPackageLevelOrderable",
  "IsAdultProduct",
]);

/* ── Small metadata field ────────────────────────────────────── */

function MetaField({
  label,
  bqName,
  value,
  readOnly,
  onSave,
  onFieldSaved,
  attributeMeta,
  validValues,
  productType,
}: {
  label: string;
  bqName: string;
  value: string;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
  attributeMeta?: { requirement: string | null; description: string | null };
  validValues: string | null;
  productType: string | null;
}) {
  const isBoolean = BOOLEAN_FIELDS.has(bqName);

  const validValuesParsed = validValues ? parseValidValues(validValues, productType) : null;
  const isSelectFromDB = validValuesParsed?.options != null && validValuesParsed.options.length > 0;

  const getSelectOptions = (): string[] => {
    const isAdult = bqName.toLowerCase().includes("isadult") || bqName.toLowerCase().includes("adult");
    if (isAdult) return ["Yes", "No"];
    return [];
  };

  const hardcodedOpts = getSelectOptions();
  const isSelect = isSelectFromDB || hardcodedOpts.length > 0;
  const selectOptions = isSelectFromDB ? (validValuesParsed?.options ?? []) : hardcodedOpts;

  const [localValue, setLocalValue] = useState(value);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocalValue(value); }, [value]);

  const getFieldTooltip = (name: string): string => {
    const tooltips: Record<string, string> = {
      PackageLevel: "Number of packages per unit for multi-pack items",
      PackageType: "Type of packaging used (box, pallet, etc.)",
      PackageTypeName: "Specific name of the packaging type",
      PackageContainsSKUIdentifier: "Whether the package includes a SKU barcode label",
      PackageContainsSKUQuantity: "Number of SKUs contained in the package",
      IsPackageLevelOrderable: "Whether this package level can be ordered independently",
      ItemPackageQuantity: "Number of items included in one retail package",
      CustomerPackageType: "Packaging type shown to the end customer",
      IsAdultProduct: "Product is restricted to adult buyers only",
      InnerPacksPerMasterPack: "Number of inner packs per master pack",
      ItemsperInnerPack: "Number of individual items per inner pack",
      MasterPackLayersperPalletQuantity: "Number of stacked layers per pallet",
      MasterPacksPerLayerQuantity: "Number of master packs per pallet layer",
      NumberOfBoxes: "Total number of boxes in this shipment configuration",
    };
    return tooltips[name] || `Value for ${name}`;
  };

  const doSave = useCallback(
    async (newVal: string) => {
      if (newVal === value) return;
      setSaveState("saving");
      try {
        await onSave(bqName, newVal || null);
        onFieldSaved?.(bqName, label, value, newVal);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } catch {
        setSaveState("error");
        toast.error(`Failed to save ${label}`);
        setTimeout(() => setSaveState("idle"), 2000);
      }
    },
    [bqName, label, value, onSave, onFieldSaved]
  );

  const handleChange = (newVal: string) => {
    setLocalValue(newVal);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(newVal), 600);
  };

  return (
    <div className="flex flex-col gap-0.5" id={`field-${bqName}`}>
      <div className="flex items-center gap-1 mb-0.5">
        <label className="text-[10px] text-muted-foreground font-medium">
          {label}
        </label>
        {attributeMeta?.requirement && attributeMeta.requirement !== "Optional" && (
          <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${
            attributeMeta.requirement === "Required" ? REQ_CHIP_COLORS.R :
            attributeMeta.requirement === "Conditionally Required" ? REQ_CHIP_COLORS.C :
            attributeMeta.requirement === "Recommended" ? REQ_CHIP_COLORS.P : REQ_CHIP_COLORS.O
          }`}>
            {attributeMeta.requirement === "Required" ? "R" :
             attributeMeta.requirement === "Conditionally Required" ? "C" :
             attributeMeta.requirement === "Recommended" ? "P" : "O"}
          </span>
        )}
        {attributeMeta?.description !== null && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-[10px] font-sans">
                  {attributeMeta?.description || getFieldTooltip(bqName)}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {readOnly ? (
        <span className="text-xs text-foreground/80">
          {value || <span className="text-muted-foreground/50">—</span>}
        </span>
      ) : isSelect ? (
        <div className="flex items-center gap-1">
          <select
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            className="h-6 px-1 text-[10px] leading-none rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand w-full"
          >
            <option value="">
              {label.toLowerCase().includes("unit") ? "— select unit —" :
               label.toLowerCase().includes("type") ? "— select type —" : "— select —"}
            </option>
            {selectOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0 self-center" />}
          {saveState === "saved" && <Check className="h-3 w-3 shrink-0 self-center" style={{ color: "#1B6B25" }} />}
          {saveState === "error" && <X className="h-3 w-3 shrink-0 self-center" style={{ color: "#EA4336" }} />}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            placeholder=""
            className="h-6 px-1.5 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand w-full"
          />
          {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0 self-center" />}
          {saveState === "saved" && <Check className="h-3 w-3 shrink-0 self-center" style={{ color: "#1B6B25" }} />}
          {saveState === "error" && <X className="h-3 w-3 shrink-0 self-center" style={{ color: "#EA4336" }} />}
        </div>
      )}
    </div>
  );
}

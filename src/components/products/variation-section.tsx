"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Check, X, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { getProductFieldValue } from "@/lib/product-mapper";
import { variationAttributeSlots } from "@/lib/variation-theme";
import { useAttributesMasterCards } from "@/hooks/use-attributes-master";
import {
  allowsFreeTextWithOptions,
  collectAllValidValueOptions,
  mergeSuggestionOptions,
  parseValidValues,
} from "@/hooks/use-category-filter";
import { useThemeValidValues } from "@/hooks/use-theme-valid-values";
import { SuggestableTextInput } from "@/components/products/suggestable-text-input";
import type { Product } from "@/lib/db/schema";

const REQ_CHIP_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Required: { bg: "bg-red-900/60", text: "text-red-200", label: "R" },
  "Conditionally Required": { bg: "bg-amber-900/60", text: "text-amber-200", label: "C" },
  Recommended: { bg: "bg-blue-900/60", text: "text-blue-200", label: "P" },
  Optional: { bg: "bg-zinc-700/60", text: "text-zinc-300", label: "O" },
};

function SourceBadge({ source, violetAuto = false }: { source: "AAC" | "VB" | "Auto"; violetAuto?: boolean }) {
  const isAuto = source === "Auto";
  const colors = isAuto && violetAuto
    ? "bg-violet-500/15 text-violet-400 border-violet-500/30"
    : source === "AAC"
      ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
      : isAuto
        ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
        : "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return (
    <span className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] leading-none font-medium border whitespace-nowrap shrink-0 ${colors}`}>
      {source}
    </span>
  );
}

const THEME_FIELD_MAP: Record<string, Set<string>> = {
  COLOR: new Set(["Color"]),
  Color: new Set(["Color"]),
  "COLOR_NAME": new Set(["Color"]),
  SIZE: new Set(["Size"]),
  Size: new Set(["Size"]),
  "SIZE_NAME": new Set(["Size"]),
  SizeName: new Set(["Size"]),
  STYLE: new Set(["Style"]),
  Style: new Set(["Style"]),
  "STYLE_NAME": new Set(["Style"]),
  StyleName: new Set(["Style"]),
  FLAVOR: new Set(["Flavor"]),
  FLAVOR_NAME: new Set(["Flavor"]),
  Flavor: new Set(["Flavor"]),
  FlavorName: new Set(["Flavor"]),
  PATTERN: new Set(["Color"]),
  PATTERN_NAME: new Set(["Color"]),
  "COLOR/SIZE": new Set(["Color", "Size"]),
  "SIZE/COLOR": new Set(["Color", "Size"]),
  "COLOR_NAME/SIZE_NAME": new Set(["Color", "Size"]),
  "SIZE_NAME/COLOR_NAME": new Set(["Color", "Size"]),
  "SIZE/COLOR_NAME": new Set(["Color", "Size"]),
  "SIZE_NAME/COLOR": new Set(["Color", "Size"]),
  "COLOR/SIZE_NAME": new Set(["Color", "Size"]),
  "COLOR_NAME/SIZE": new Set(["Color", "Size"]),
  "color-size": new Set(["Color", "Size"]),
  "size-color": new Set(["Color", "Size"]),
  "COLOR/FLAVOR": new Set(["Color", "Flavor"]),
  "FLAVOR/COLOR": new Set(["Color", "Flavor"]),
  "COLOR_NAME/FLAVOR_NAME": new Set(["Color", "Flavor"]),
  "FLAVOR_NAME/COLOR_NAME": new Set(["Color", "Flavor"]),
  "FLAVOR/SIZE": new Set(["Flavor", "Size"]),
  "SIZE/FLAVOR": new Set(["Flavor", "Size"]),
  "FLAVOR_NAME/SIZE_NAME": new Set(["Flavor", "Size"]),
  "SIZE_NAME/FLAVOR_NAME": new Set(["Flavor", "Size"]),
  "FLAVOR/SIZE_NAME": new Set(["Flavor", "Size"]),
  "SIZE/FLAVOR_NAME": new Set(["Flavor", "Size"]),
  "Flavor-Size": new Set(["Flavor", "Size"]),
  "FlavorSize": new Set(["Flavor", "Size"]),
  "FlavorName-SizeName": new Set(["Flavor", "Size"]),
  "Size-Flavor": new Set(["Flavor", "Size"]),
  "SIZE/STYLE": new Set(["Size", "Style"]),
  "STYLE/SIZE": new Set(["Size", "Style"]),
  "SIZE_NAME/STYLE_NAME": new Set(["Size", "Style"]),
  "STYLE_NAME/SIZE_NAME": new Set(["Size", "Style"]),
  "SIZE/STYLE_NAME": new Set(["Size", "Style"]),
  "STYLE/SIZE_NAME": new Set(["Size", "Style"]),
  "COLOR/STYLE": new Set(["Color", "Style"]),
  "STYLE/COLOR": new Set(["Color", "Style"]),
  "COLOR_NAME/STYLE_NAME": new Set(["Color", "Style"]),
  "STYLE_NAME/COLOR_NAME": new Set(["Color", "Style"]),
  "stylename-color": new Set(["Style", "Color"]),
  "color-stylename": new Set(["Color", "Style"]),
  "size-sizename": new Set(["Size"]),
  "itemform-sizename": new Set(["Size"]),
  "sizename-itemform": new Set(["Size"]),
  "sizeitemform": new Set(["Size"]),
};

const THEME_CONTROLLED = new Set(["Color", "Flavor", "Size", "Style"]);

function variationAttrIndex(bqName: string, hubLabel: string): 0 | 1 | 2 | null {
  for (const candidate of [bqName, hubLabel]) {
    const match = candidate.replace(/\s/g, "").match(/^VariationAttribute([123])$/i);
    if (match) return (Number(match[1]) - 1) as 0 | 1 | 2;
  }
  return null;
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
  parentInfo?: { sku: string | null; asin: string | null } | null;
  variationName?: string | null;
};

export function VariationSection({
  product,
  readOnly,
  onSave,
  onFieldSaved,
  parentInfo,
  variationName,
}: Props) {
  const { cards, isLoading } = useAttributesMasterCards();
  const { data: themeValidValues } = useThemeValidValues(product.clientIdCode);

  const [localExpanded, setLocalExpanded] = useState(true);

  const cardName = "Variation";

  const allAttributes = useMemo(() => {
    if (!cards) return [];
    const card = cards.find((c) => c.name === cardName);
    if (!card) return [];
    return card.subcards.flatMap((sub) =>
      sub.attributes.map((attr) => ({
        hubLabel: attr.Attributes_HubLabel,
        bqName: attr.BQ_Master || attr.Attributes_HubLabel.replace(/ /g, ""),
        requirement: attr.Attributes_Requirement,
        description: attr.Attributes_Description,
        subcardOrder: attr.Attributes_PDPSubcardOrder ?? 0,
        subcardName: sub.name,
        validValues: attr.Attributes_ValidValues,
      }))
    );
  }, [cards]);

  const productType = getProductFieldValue(product, "ProductType");
  const themeName = getProductFieldValue(product, "VariationThemeName") ?? "";
  const enabledFields = THEME_FIELD_MAP[themeName];
  const attrSlots = useMemo(() => variationAttributeSlots(themeName), [themeName]);

  const visibleAttributes = useMemo(() => {
    return allAttributes.filter((attr) => {
      const categoryResult = parseValidValues(attr.validValues, productType);
      if (!allowsFreeTextWithOptions(attr.bqName) && !categoryResult.visible) return false;
      if (!THEME_CONTROLLED.has(attr.bqName)) return true;
      if (!themeName || !enabledFields) return true;
      return enabledFields.has(attr.bqName);
    });
  }, [allAttributes, productType, themeName, enabledFields]);

  const requirementCounts = useMemo(() => {
    const counts = { required: 0, conditionallyRequired: 0, recommended: 0, optional: 0 };
    for (const attr of visibleAttributes) {
      if (attr.requirement === "Required") counts.required++;
      else if (attr.requirement === "Conditionally Required") counts.conditionallyRequired++;
      else if (attr.requirement === "Recommended") counts.recommended++;
      else if (attr.requirement === "Optional") counts.optional++;
    }
    return counts;
  }, [visibleAttributes]);

  const populatedCount = useMemo(() => {
    return visibleAttributes.filter((attr) => {
      if (attr.bqName === "ChildRelationshipType") {
        const hasVariation = !!(product.variationRef || product.parentAsin || product.parentSku);
        return hasVariation;
      }
      const slot = variationAttrIndex(attr.bqName, attr.hubLabel);
      if (slot !== null) return attrSlots[slot] !== "";
      if (attr.bqName === "ParentASIN") {
        return !!(getProductFieldValue(product, "ParentASIN") || parentInfo?.asin);
      }
      if (attr.bqName === "ParentSKU") {
        return !!(getProductFieldValue(product, "ParentSKU") || parentInfo?.sku);
      }
      const val = getProductFieldValue(product, attr.bqName);
      return val != null && val !== "";
    }).length;
  }, [visibleAttributes, product, attrSlots, parentInfo]);

  const isDimmed = useCallback(
    (bqName: string): boolean => {
      if (!THEME_CONTROLLED.has(bqName)) return false;
      if (!themeName || !enabledFields) return false;
      return !enabledFields.has(bqName);
    },
    [themeName, enabledFields]
  );

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden">
      <Collapsible
        open={localExpanded}
        onOpenChange={setLocalExpanded}
      >
        <CollapsibleTrigger className="group flex items-center justify-between gap-3 w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            <span className="text-sm font-medium text-section-title">
              Variations
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isLoading ? (
              <span className="text-[10px] text-muted-foreground">Loading...</span>
            ) : (
              <>
                {(requirementCounts.required > 0 || requirementCounts.conditionallyRequired > 0 || requirementCounts.recommended > 0 || requirementCounts.optional > 0) && (
                  <div className="flex items-center gap-1">
                    {requirementCounts.required > 0 && (
                      <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${REQ_CHIP_STYLES.Required.bg} ${REQ_CHIP_STYLES.Required.text}`}>
                        {requirementCounts.required}R
                      </span>
                    )}
                    {requirementCounts.conditionallyRequired > 0 && (
                      <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${REQ_CHIP_STYLES["Conditionally Required"].bg} ${REQ_CHIP_STYLES["Conditionally Required"].text}`}>
                        {requirementCounts.conditionallyRequired}C
                      </span>
                    )}
                    {requirementCounts.recommended > 0 && (
                      <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${REQ_CHIP_STYLES.Recommended.bg} ${REQ_CHIP_STYLES.Recommended.text}`}>
                        {requirementCounts.recommended}P
                      </span>
                    )}
                    {requirementCounts.optional > 0 && (
                      <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${REQ_CHIP_STYLES.Optional.bg} ${REQ_CHIP_STYLES.Optional.text}`}>
                        {requirementCounts.optional}O
                      </span>
                    )}
                  </div>
                )}
                <Badge variant="secondary" className="text-xs tabular-nums shrink-0">
                  {populatedCount}/{visibleAttributes.length}
                </Badge>
              </>
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border px-4 py-2 space-y-1.5">
            {isLoading ? (
              <p className="text-xs text-muted-foreground py-2">
                Loading {allAttributes.length > 0 ? allAttributes.length : "attributes"}...
              </p>
            ) : (
              allAttributes.map((attr) => {
                if (isDimmed(attr.bqName)) return null;

                const dimmed = isDimmed(attr.bqName);
                const reqStyle = attr.requirement ? REQ_CHIP_STYLES[attr.requirement] : null;
                const showHelpCircle = attr.description !== null;

                let value = getProductFieldValue(product, attr.bqName) ?? "";
                if (!value && parentInfo) {
                  if (attr.bqName === "ParentSKU" || /^parent\s*sku$/i.test(attr.hubLabel)) {
                    value = parentInfo.sku ?? "";
                  } else if (attr.bqName === "ParentASIN" || /^parent\s*asin$/i.test(attr.hubLabel)) {
                    value = parentInfo.asin ?? "";
                  }
                }

                const varAttrSlot = variationAttrIndex(attr.bqName, attr.hubLabel);
                if (varAttrSlot !== null) {
                  const displayValue = attrSlots[varAttrSlot];
                  return (
                    <div key={attr.bqName} className="flex items-center gap-3 min-w-0">
                      <span className="text-xs text-muted-foreground whitespace-normal leading-tight shrink-0">
                        {attr.hubLabel}
                      </span>
                      {reqStyle && (
                        <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${reqStyle.bg} ${reqStyle.text}`}>
                          {reqStyle.label}
                        </span>
                      )}
                      {showHelpCircle && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-[10px] font-sans">{attr.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <span className="text-xs text-foreground/80 font-mono tabular-nums">
                          {displayValue || "—"}
                        </span>
                      </div>
                      <SourceBadge source="Auto" violetAuto={true} />
                    </div>
                  );
                }

                if (attr.bqName === "ChildRelationshipType") {
                  const hasVariation = !!(product.variationRef || product.parentAsin || product.parentSku);
                  const displayValue = "variation";
                  const computed = hasVariation;
                  return (
                    <div key={attr.bqName} className="flex items-center gap-3 min-w-0">
                      <span className="text-xs text-muted-foreground whitespace-normal leading-tight shrink-0">
                        {attr.hubLabel}
                      </span>
                      {reqStyle && (
                        <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${reqStyle.bg} ${reqStyle.text}`}>
                          {reqStyle.label}
                        </span>
                      )}
                      {showHelpCircle && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-[10px] font-sans">{attr.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <span className="text-xs text-foreground/80 font-mono tabular-nums">
                          {displayValue || "—"}
                        </span>
                      </div>
                      <SourceBadge source={computed ? "Auto" : "VB"} violetAuto={true} />
                    </div>
                  );
                }

                if (attr.bqName === "VariationName") {
                  return (
                    <div key={attr.bqName} className="flex items-center gap-3 min-w-0">
                      <span className="text-xs text-muted-foreground whitespace-normal leading-tight shrink-0">
                        {attr.hubLabel}
                      </span>
                      {reqStyle && (
                        <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${reqStyle.bg} ${reqStyle.text}`}>
                          {reqStyle.label}
                        </span>
                      )}
                      {showHelpCircle && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-[10px] font-sans">{attr.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <span className="text-xs text-foreground/80 font-mono tabular-nums">
                          {variationName || "—"}
                        </span>
                      </div>
                      <SourceBadge source="VB" />
                    </div>
                  );
                }

                const computedFields = new Set([
                  "VariationID", "ParentSKU", "ParentASIN", "VariationThemeName"
                ]);
                if (computedFields.has(attr.bqName)) {
                  return (
                    <div key={attr.bqName} className="flex items-center gap-3 min-w-0">
                      <span className="text-xs text-muted-foreground whitespace-normal leading-tight shrink-0">
                        {attr.hubLabel}
                      </span>
                      {reqStyle && (
                        <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${reqStyle.bg} ${reqStyle.text}`}>
                          {reqStyle.label}
                        </span>
                      )}
                      {showHelpCircle && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-[10px] font-sans">{attr.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <span className="text-xs text-foreground/80 font-mono tabular-nums">
                          {value || "—"}
                        </span>
                        {attr.bqName === "VariationID" && value && (
                          <Link href="/variations" className="shrink-0 text-muted-foreground hover:text-foreground">
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                      <SourceBadge
                        source={
                          (attr.bqName === "ParentASIN" || attr.bqName === "ParentSKU")
                          && !getProductFieldValue(product, attr.bqName)
                          && !!value
                            ? "Auto"
                            : "VB"
                        }
                        violetAuto={
                          (attr.bqName === "ParentASIN" || attr.bqName === "ParentSKU")
                          && !getProductFieldValue(product, attr.bqName)
                          && !!value
                        }
                      />
                    </div>
                  );
                }

                return (
                  <EditableField
                    key={attr.bqName}
                    label={attr.hubLabel}
                    bqName={attr.bqName}
                    requirement={attr.requirement}
                    description={attr.description}
                    value={value}
                    readOnly={readOnly}
                    onSave={onSave}
                    onFieldSaved={onFieldSaved}
                    validValues={attr.validValues}
                    productType={productType}
                    extraOptions={themeValidValues?.get(attr.bqName)}
                  />
                );
              })
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

type EditableFieldProps = {
  label: string;
  bqName: string;
  requirement: string | null;
  description: string | null;
  value: string;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
  validValues?: string | null;
  productType?: string | null;
  extraOptions?: string[];
};

function EditableField({
  label,
  bqName,
  requirement,
  description,
  value,
  readOnly,
  onSave,
  onFieldSaved,
  validValues,
  productType,
  extraOptions,
}: EditableFieldProps) {
  const [localValue, setLocalValue] = useState(value);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const focusedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focusedRef.current) {
      setLocalValue(value);
    }
  }, [value]);

  const reqStyle = requirement ? REQ_CHIP_STYLES[requirement] : null;
  const showHelpCircle = description !== null;

  const validValuesParsed = validValues ? parseValidValues(validValues, productType ?? null) : null;
  const catalogOptions = collectAllValidValueOptions(validValues);
  const matchedOptions = validValuesParsed?.options ?? [];
  const suggestionOptions = mergeSuggestionOptions(catalogOptions, matchedOptions, extraOptions);
  const allowCustomWithOptions = allowsFreeTextWithOptions(bqName);
  const isSelectFromDB =
    !allowCustomWithOptions &&
    validValuesParsed?.options != null &&
    validValuesParsed.options.length > 0;
  const selectOptionsFromDB = validValuesParsed?.options ?? [];

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

  const isSelect = isSelectFromDB;

  if (isSelect) {
    // Keep the stored value selectable when it predates the valid-values list
    // (e.g. the legacy "Bundle" / lowercase "child" parentage levels), otherwise
    // a controlled select with an unknown value renders blank and reads as data loss.
    const optionValues = localValue && !selectOptionsFromDB.includes(localValue)
      ? [...selectOptionsFromDB, localValue]
      : selectOptionsFromDB;
    const options = optionValues.map((v) => ({ value: v, label: v }));
    return (
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs text-muted-foreground whitespace-normal leading-tight shrink-0">
          {label}
        </span>
        {reqStyle && (
          <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${reqStyle.bg} ${reqStyle.text}`}>
            {reqStyle.label}
          </span>
        )}
        {showHelpCircle && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-[10px] font-sans">{description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {readOnly ? (
          <span className="text-xs text-foreground/80 font-mono tabular-nums">{value || "—"}</span>
        ) : (
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <select
              value={localValue}
              onChange={(e) => handleChange(e.target.value)}
              className="h-7 px-2 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand w-full min-w-0"
            >
              <option value="">— select —</option>
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
            {saveState === "saved" && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
            {saveState === "error" && <X className="h-3 w-3 text-destructive shrink-0" />}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-xs text-muted-foreground whitespace-normal leading-tight shrink-0">
        {label}
      </span>
      {reqStyle && (
        <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${reqStyle.bg} ${reqStyle.text}`}>
          {reqStyle.label}
        </span>
      )}
      {showHelpCircle && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-[10px] font-sans">{description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {readOnly ? (
        <span className="text-xs text-foreground/80 font-mono tabular-nums">{value || "—"}</span>
      ) : (
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {allowCustomWithOptions ? (
            <SuggestableTextInput
              id={`field-${bqName}`}
              value={localValue}
              options={suggestionOptions}
              placeholder={suggestionOptions.length > 0 ? "Type or choose" : undefined}
              onChange={handleChange}
              onCommit={(next) => {
                focusedRef.current = false;
                if (debounceRef.current) clearTimeout(debounceRef.current);
                setLocalValue(next);
                doSave(next);
              }}
              onFocus={() => { focusedRef.current = true; }}
              onEscape={() => setLocalValue(value)}
              className="h-6 w-full px-2 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand font-mono tabular-nums min-w-0"
            />
          ) : (
            <input
              type="text"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              onFocus={() => { focusedRef.current = true; }}
              onBlur={() => {
                focusedRef.current = false;
                if (debounceRef.current) clearTimeout(debounceRef.current);
                doSave(localValue);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  doSave(localValue);
                }
                if (e.key === "Escape") {
                  setLocalValue(value);
                }
              }}
              className="h-6 px-2 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand flex-1 font-mono tabular-nums min-w-0"
            />
          )}
          {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
          {saveState === "saved" && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
          {saveState === "error" && <X className="h-3 w-3 text-destructive shrink-0" />}
        </div>
      )}
    </div>
  );
}
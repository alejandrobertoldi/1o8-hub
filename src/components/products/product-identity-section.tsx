"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ChevronRight, Loader2, Check, X, HelpCircle } from "lucide-react";
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
import { useAttributesMasterCards } from "@/hooks/use-attributes-master";
import { parseValidValues } from "@/hooks/use-category-filter";
import type { Product } from "@/lib/db/schema";

const REQ_CHIP_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Required: { bg: "bg-red-900/60", text: "text-red-200", label: "R" },
  "Conditionally Required": { bg: "bg-amber-900/60", text: "text-amber-200", label: "C" },
  Recommended: { bg: "bg-blue-900/60", text: "text-blue-200", label: "P" },
  Optional: { bg: "bg-zinc-700/60", text: "text-zinc-300", label: "O" },
};

const PRODUCT_ID_TYPE_OPTIONS = [
  { value: "ASIN", label: "ASIN" },
  { value: "UPC", label: "UPC" },
  { value: "EAN", label: "EAN" },
  { value: "GTIN", label: "GTIN" },
  { value: "ISBN", label: "ISBN" },
  { value: "GCID", label: "GCID" },
  { value: "GTIN Exempt", label: "GTIN Exempt" },
];

/** Preferred main-row order for Product Identity (hub label + BQ fallbacks). */
const MAIN_FIELD_ORDER: { labels: string[]; bqNames: string[] }[] = [
  { labels: ["Item Name", "Title"], bqNames: ["ItemName"] },
  { labels: ["Product Type"], bqNames: ["ProductType"] },
  { labels: ["Item Type Keyword"], bqNames: ["ItemTypeKeyword"] },
  { labels: ["Item Highlight"], bqNames: ["ItemHighlight"] },
  { labels: ["Brand Name"], bqNames: ["BrandName"] },
  { labels: ["Product Id Type", "External Product Id Type"], bqNames: ["ProductIdType"] },
  { labels: ["Product Id", "External Product Id", "External Product ID"], bqNames: ["ProductId", "ExternalProductId"] },
];

/** Nested under the Other subcard (includes Collection Item). */
const OTHER_FIELDS: { labels: string[]; bqNames: string[] }[] = [
  { labels: ["Collection Item"], bqNames: ["CollectionItem"] },
  { labels: ["Set Name"], bqNames: ["SetName"] },
  { labels: ["Denomination"], bqNames: ["Denomination"] },
  { labels: ["Letter Character"], bqNames: ["LetterCharacter"] },
];

type IdentityAttr = {
  hubLabel: string;
  bqName: string;
  requirement: string | null;
  description: string | null;
  subcardOrder: number;
  subcardName: string;
  validValues: string | null;
};

function matchesFieldOrder(
  attr: IdentityAttr,
  slot: { labels: string[]; bqNames: string[] },
): boolean {
  return slot.labels.includes(attr.hubLabel) || slot.bqNames.includes(attr.bqName);
}

function isOtherField(attr: IdentityAttr): boolean {
  return OTHER_FIELDS.some((slot) => matchesFieldOrder(attr, slot));
}

function sortOtherAttributes(attrs: IdentityAttr[]): IdentityAttr[] {
  const used = new Set<string>();
  const ordered: IdentityAttr[] = [];
  for (const slot of OTHER_FIELDS) {
    const match = attrs.find((a) => !used.has(a.bqName) && matchesFieldOrder(a, slot));
    if (match) {
      ordered.push(match);
      used.add(match.bqName);
    }
  }
  const rest = attrs.filter((a) => !used.has(a.bqName));
  return [...ordered, ...rest];
}

function sortMainAttributes(attrs: IdentityAttr[]): IdentityAttr[] {
  const used = new Set<string>();
  const ordered: IdentityAttr[] = [];
  for (const slot of MAIN_FIELD_ORDER) {
    const match = attrs.find((a) => !used.has(a.bqName) && matchesFieldOrder(a, slot));
    if (match) {
      ordered.push(match);
      used.add(match.bqName);
    }
  }
  const rest = attrs
    .filter((a) => !used.has(a.bqName))
    .sort((a, b) => a.subcardOrder - b.subcardOrder || a.hubLabel.localeCompare(b.hubLabel));
  return [...ordered, ...rest];
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
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  aacBrandName?: string | null;
};

export function ProductIdentitySection({
  product,
  readOnly,
  onSave,
  onFieldSaved,
  expanded: controlledExpanded,
  onExpandedChange,
  aacBrandName,
}: Props) {
  const { cards, isLoading } = useAttributesMasterCards();

  const [internalExpanded, setInternalExpanded] = useState(true);
  const [localExpanded, setLocalExpanded] = useState(true);
  const expanded =
    controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const cardName = "Product Identity";

  const allAttributes = useMemo((): IdentityAttr[] => {
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

  const visibleAttributes = useMemo(() => {
    return allAttributes.filter((attr) => {
      if (attr.hubLabel === "Region of Origin" || attr.bqName === "RegionOfOrigin") return false;
      const result = parseValidValues(attr.validValues, productType);
      return result.visible;
    });
  }, [allAttributes, productType]);

  const mainAttributes = useMemo(() => {
    const base = visibleAttributes.filter(
      (a) => a.subcardName === "-" || a.subcardName === cardName,
    );
    const byBq = new Map(base.map((a) => [a.bqName, a]));

    // Promote pinned fields out of nested subcards into the main list.
    for (const attr of visibleAttributes) {
      if (byBq.has(attr.bqName)) continue;
      if (MAIN_FIELD_ORDER.some((slot) => matchesFieldOrder(attr, slot))) {
        byBq.set(attr.bqName, { ...attr, subcardName: cardName });
      }
    }

    // Ensure Item Highlight exists even if Attributes Master omits it here.
    const itemHighlightSlot = MAIN_FIELD_ORDER.find((s) => s.bqNames.includes("ItemHighlight"))!;
    if (![...byBq.values()].some((a) => matchesFieldOrder(a, itemHighlightSlot))) {
      byBq.set("ItemHighlight", {
        hubLabel: "Item Highlight",
        bqName: "ItemHighlight",
        requirement: "Recommended",
        description: "Secondary title keywords (max 125 characters).",
        subcardOrder: 0,
        subcardName: cardName,
        validValues: null,
      });
    }

    return sortMainAttributes([...byBq.values()].filter((a) => !isOtherField(a)));
  }, [visibleAttributes]);

  const mainBqNames = useMemo(
    () => new Set(mainAttributes.map((a) => a.bqName)),
    [mainAttributes],
  );

  const subcardsGrouped = useMemo(() => {
    const grouped = new Map<string, IdentityAttr[]>();
    for (const attr of visibleAttributes) {
      if (isOtherField(attr)) {
        if (!grouped.has("Other")) grouped.set("Other", []);
        if (!grouped.get("Other")!.some((a) => a.bqName === attr.bqName)) {
          grouped.get("Other")!.push(attr);
        }
        continue;
      }
      if (attr.subcardName === "-" || attr.subcardName === cardName) continue;
      if (mainBqNames.has(attr.bqName)) continue;
      if (!grouped.has(attr.subcardName)) grouped.set(attr.subcardName, []);
      grouped.get(attr.subcardName)!.push(attr);
    }
    if (grouped.has("Other")) {
      grouped.set("Other", sortOtherAttributes(grouped.get("Other")!));
    }
    return grouped;
  }, [visibleAttributes, mainBqNames]);

  const sortedSubcards = useMemo(() => {
    const entries = Array.from(subcardsGrouped.entries()).sort(([a], [b]) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      const firstA = subcardsGrouped.get(a)?.[0]?.subcardOrder ?? 0;
      const firstB = subcardsGrouped.get(b)?.[0]?.subcardOrder ?? 0;
      return firstA - firstB;
    });
    return entries;
  }, [subcardsGrouped]);

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
      const val = getProductFieldValue(product, attr.bqName);
      return val != null && val !== "";
    }).length;
  }, [visibleAttributes, product]);

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden">
      <Collapsible
        open={localExpanded}
        onOpenChange={(open) => {
          setLocalExpanded(open);
          setInternalExpanded(open);
          onExpandedChange?.(open);
        }}
      >
        <CollapsibleTrigger className="group flex items-center justify-between gap-3 w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            <span className="text-sm font-medium text-section-title">
              Product Details
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
                Loading {visibleAttributes.length > 0 ? visibleAttributes.length : "attributes"}...
              </p>
            ) : (
              <>
                {mainAttributes.map((attr) => (
                  <FieldRow
                    key={attr.bqName}
                    label={attr.hubLabel}
                    bqName={attr.bqName}
                    requirement={attr.requirement}
                    description={attr.description}
                    value={getProductFieldValue(product, attr.bqName) ?? ""}
                    readOnly={readOnly}
                    onSave={onSave}
                    onFieldSaved={onFieldSaved}
                    validValues={attr.validValues}
                    productType={productType}
                  />
                ))}

                {sortedSubcards.map(([subcardName, subAttrs]) => (
                  <div
                    key={subcardName}
                    className="rounded-lg border border-stone-200 bg-card hover:border-stone-300 hover:shadow-md transition-all dark:border-zinc-800 overflow-hidden mt-2"
                  >
                    <Collapsible
                      defaultOpen={false}
                    >
                      <CollapsibleTrigger className="group flex items-center justify-between gap-3 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                          <span className="text-[13px] font-semibold text-section-title">
                            {subcardName}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-[10px] mr-1 tabular-nums shrink-0">
                          {subAttrs.filter(a => {
                            const val = getProductFieldValue(product, a.bqName);
                            return val != null && val !== "";
                          }).length}/{subAttrs.length}
                        </Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t border-stone-200 px-3 py-2 space-y-1 dark:border-zinc-800">
                          {subAttrs.map((attr) => (
                            <FieldRow
                              key={attr.bqName}
                              label={attr.hubLabel}
                              bqName={attr.bqName}
                              requirement={attr.requirement}
                              description={attr.description}
                              value={getProductFieldValue(product, attr.bqName) ?? ""}
                              readOnly={readOnly}
                              onSave={onSave}
                              onFieldSaved={onFieldSaved}
                              validValues={attr.validValues}
                              productType={productType}
                            />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ))}
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

const CHAR_LIMITS_BY_BQ: Record<string, number> = {
  ItemName: 75,
  ItemHighlight: 125,
};

const CHAR_LIMITS_BY_LABEL: Record<string, number> = {
  Title: 75,
  "Item Name": 75,
  "Item Highlight": 125,
};

type FieldRowProps = {
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
};

function FieldRow({
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
}: FieldRowProps) {
  const [localValue, setLocalValue] = useState(value);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const charLimit = CHAR_LIMITS_BY_BQ[bqName] ?? CHAR_LIMITS_BY_LABEL[label];

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const reqStyle = requirement ? REQ_CHIP_STYLES[requirement] : null;
  const showHelpCircle = description !== null;

  const validValuesParsed = validValues ? parseValidValues(validValues, productType ?? null) : null;
  const isSelectFromDB = validValuesParsed?.options != null && validValuesParsed.options.length > 0;
  const selectOptionsFromDB = validValuesParsed?.options ?? [];

  const getSelectOptions = (): { value: string; label: string }[] => {
    if (bqName === "ProductIdType") return PRODUCT_ID_TYPE_OPTIONS;
    return [];
  };

  const hardcodedOpts = getSelectOptions();
  const isSelect = (isSelectFromDB || hardcodedOpts.length > 0) && bqName !== "ProductType";
  const selectOptions = isSelectFromDB ? selectOptionsFromDB : hardcodedOpts.map(o => o.value);

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
    const next = charLimit != null ? newVal.slice(0, charLimit) : newVal;
    setLocalValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(next), 600);
  };

  if (isSelect) {
    const options = bqName === "ProductIdType"
      ? PRODUCT_ID_TYPE_OPTIONS
      : selectOptions.map((v) => ({ value: v, label: v }));

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

  const useMultiline = charLimit != null;

  return (
    <div className={`flex gap-3 min-w-0 ${useMultiline ? "items-start" : "items-center"}`}>
      <div className="flex flex-col gap-0 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-normal leading-tight">
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
        </div>
        {charLimit != null && (
          <span
            className={`text-[10px] font-sans tabular-nums ${
              localValue.length > charLimit ? "text-red-600" : "text-green-500"
            }`}
          >
            {localValue.length}/{charLimit}
          </span>
        )}
      </div>

      {readOnly ? (
        <span className="text-xs text-foreground/80 font-mono tabular-nums whitespace-pre-wrap break-words">
          {value || "—"}
        </span>
      ) : (
        <div className={`flex gap-1 min-w-0 flex-1 ${useMultiline ? "items-start" : "items-center"}`}>
          {useMultiline ? (
            <textarea
              value={localValue}
              onChange={(e) => handleChange(e.target.value)}
              maxLength={charLimit}
              rows={2}
              className="min-h-[3rem] px-2 py-1 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand flex-1 font-mono tabular-nums min-w-0 resize-y leading-snug"
            />
          ) : (
            <input
              type="text"
              value={localValue}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  doSave(localValue);
                }
              }}
              className="h-6 px-2 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand flex-1 font-mono tabular-nums min-w-0"
            />
          )}
          {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0 mt-1" />}
          {saveState === "saved" && <Check className="h-3 w-3 text-emerald-500 shrink-0 mt-1" />}
          {saveState === "error" && <X className="h-3 w-3 text-destructive shrink-0 mt-1" />}
        </div>
      )}
    </div>
);
}
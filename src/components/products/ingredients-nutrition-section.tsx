"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ChevronRight, Loader2, Check, X, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { getProductFieldValue } from "@/lib/product-mapper";
import type { Product } from "@/lib/db/schema";
import { useAttributesMasterCards } from "@/hooks/use-attributes-master";
import { parseValidValues } from "@/hooks/use-category-filter";

const REQ_CHIP_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Required: { bg: "bg-red-900/60", text: "text-red-200", label: "R" },
  "Conditionally Required": { bg: "bg-amber-900/60", text: "text-amber-200", label: "C" },
  Recommended: { bg: "bg-blue-900/60", text: "text-blue-200", label: "P" },
  Optional: { bg: "bg-zinc-700/60", text: "text-zinc-300", label: "O" },
};

const MASS_UNIT_OPTIONS = ["Grams", "Kilograms", "Milligrams", "Ounces", "Pounds"];
const ENERGY_UNIT_OPTIONS = ["Kilojoules", "Kilocalories", "Calories"];
const DOSAGE_FORM_OPTIONS = ["Bar", "Beverage", "Biscuit", "Bottle", "Box", "Candy", "Capsule", "Chewing Gum", "Coffee", "Cosmetic Cream", "Cream", "Crystal", "Cup", "Drops", "Elixir", "Emulsion", "Film", "Flakes", "Foam", "Gel", "Gelatin", "Granule", "Gummy", "Inhaler", "Injection", "Liquid", "Lozenge", "Lotion", "Mint", "Oil", "Paste", "Patch", " Pellet", "Powder", "Ready to Drink", " Sachet", "Salve", "Serum", "Shampoo", "Solution", "Spray", "Stick", "Strip", "Syrup", "Tablet", "Tea", "Tincture", "Toothpaste", "Vapor"];
const DOSE_RELEASE_METHOD_OPTIONS = ["Coated", "Delayed Release", "Enteric Coated", "Extended Release", "Fast Dissolving", "Gastro Resistant", "Liquid", "Lozenge", "Quick Dissolve", "Sublingual", "Timed Release", "Transdermal"];
const PILL_COATING_OPTIONS = ["Clear", "Coated", "Colored", "Film Coated", "Glazed", "Sugar Coated"];

type Props = {
  product: Product;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
};

export function IngredientsNutritionSection({
  product,
  readOnly,
  onSave,
  onFieldSaved,
}: Props) {
  const { cards, isLoading } = useAttributesMasterCards();

  const nutritionAttributes = useMemo((): { bqName: string; hubLabel: string; requirement: string | null; description: string | null; subcardOrder: number; subcardName: string; validValues: string | null }[] => {
    if (!cards) return [];
    const card = cards.find(c => c.name === "Ingredients & Nutrition");
    if (!card) return [];
    const attrs = [];
    for (const subcard of card.subcards) {
      for (const attr of subcard.attributes) {
        attrs.push({
          hubLabel: attr.Attributes_HubLabel,
          bqName: attr.BQ_Master || attr.Attributes_HubLabel.replace(/ /g, ""),
          requirement: attr.Attributes_Requirement,
          description: attr.Attributes_Description,
          subcardOrder: attr.Attributes_PDPSubcardOrder ?? 0,
          subcardName: subcard.name,
          validValues: attr.Attributes_ValidValues,
        });
      }
    }
    return attrs.sort((a, b) => a.subcardOrder - b.subcardOrder);
  }, [cards]);

  const productType = getProductFieldValue(product, "ProductType");

  const visibleAttributes = useMemo(() => {
    return nutritionAttributes.filter((attr) => {
      const result = parseValidValues(attr.validValues, productType);
      return result.visible;
    });
  }, [nutritionAttributes, productType]);

  const subcardsGrouped = useMemo(() => {
    const grouped = new Map<string, typeof visibleAttributes>();
    for (const attr of visibleAttributes) {
      if (!grouped.has(attr.subcardName)) grouped.set(attr.subcardName, []);
      grouped.get(attr.subcardName)!.push(attr);
    }
    return grouped;
  }, [visibleAttributes]);

  const populatedCount = useMemo(() => {
    return visibleAttributes.filter((attr) => {
      const val = getProductFieldValue(product, attr.bqName);
      return val != null && val !== "";
    }).length;
  }, [visibleAttributes, product]);

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

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden p-4">
        <span className="text-sm text-muted-foreground">Loading Ingredients & Nutrition attributes...</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden">
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="group flex items-center justify-between gap-3 w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            <span className="text-sm font-medium text-section-title">Ingredients & Nutrition</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {(requirementCounts.required > 0 || requirementCounts.conditionallyRequired > 0 || requirementCounts.recommended > 0 || requirementCounts.optional > 0) && (
              <div className="flex items-center gap-1">
                {requirementCounts.required > 0 && <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-medium bg-red-900/60 text-red-200">{requirementCounts.required}R</span>}
                {requirementCounts.conditionallyRequired > 0 && <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-medium bg-amber-900/60 text-amber-200">{requirementCounts.conditionallyRequired}C</span>}
                {requirementCounts.recommended > 0 && <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-medium bg-blue-900/60 text-blue-200">{requirementCounts.recommended}P</span>}
                {requirementCounts.optional > 0 && <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-medium bg-zinc-700/60 text-zinc-300">{requirementCounts.optional}O</span>}
              </div>
            )}
            <Badge variant="secondary" className="text-xs tabular-nums">
              {populatedCount}/{visibleAttributes.length}
            </Badge>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border px-4 py-3 space-y-2">
            {Array.from(subcardsGrouped.entries()).map(([subcardName, attrs]) => {
              const subcardPopulatedCount = attrs.filter((a) => {
                const val = getProductFieldValue(product, a.bqName);
                return val != null && val !== "";
              }).length;
              return (
                <div key={subcardName} className="rounded-lg border border-stone-200 bg-card hover:border-stone-300 hover:shadow-md transition-all dark:border-zinc-800 overflow-hidden">
                  <Collapsible defaultOpen={false}>
                    <CollapsibleTrigger className="group flex items-center justify-between gap-3 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                        <span className="text-[13px] font-semibold text-section-title">{subcardName}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px] shrink-0 tabular-nums mr-1">
                        {subcardPopulatedCount}/{attrs.length}
                      </Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-stone-200 px-3 py-2 dark:border-zinc-800">
                        <div className="space-y-1.5">
                          {attrs.map((attr) => (
                            <NutritionFieldRow
                              key={attr.bqName}
                              label={attr.hubLabel}
                              bqName={attr.bqName}
                              value={getProductFieldValue(product, attr.bqName) ?? ""}
                              readOnly={readOnly}
                              onSave={onSave}
                              onFieldSaved={onFieldSaved}
                              requirement={attr.requirement}
                              description={attr.description}
                              validValues={attr.validValues}
                              productType={productType}
                            />
                          ))}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

type NutritionFieldRowProps = {
  label: string;
  bqName: string;
  value: string;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
  requirement: string | null;
  description: string | null;
  validValues?: string | null;
  productType?: string | null;
};

function NutritionFieldRow({
  label,
  bqName,
  value,
  readOnly,
  onSave,
  onFieldSaved,
  requirement,
  description,
  validValues,
  productType,
}: NutritionFieldRowProps) {
  const [localValue, setLocalValue] = useState(value);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocalValue(value); }, [value]);

  const reqStyle = requirement ? REQ_CHIP_STYLES[requirement] : null;
  const showHelpCircle = description !== null;

  const validValuesParsed = validValues ? parseValidValues(validValues, productType ?? null) : null;
  const isSelectFromDB = validValuesParsed?.options != null && validValuesParsed.options.length > 0;
  const selectOptionsFromDB = validValuesParsed?.options ?? [];

  const getSelectOptions = (): string[] => {
    if (bqName.includes("unit") && (bqName.includes("fat") || bqName.includes("carbohydrate") || bqName.includes("protein") || bqName.includes("vitamin") || bqName.includes("serving"))) return MASS_UNIT_OPTIONS;
    if (bqName.includes("energy") && bqName.includes("unit")) return ENERGY_UNIT_OPTIONS;
    if (bqName.includes("dosage_form")) return DOSAGE_FORM_OPTIONS;
    if (bqName.includes("dose_release_method")) return DOSE_RELEASE_METHOD_OPTIONS;
    if (bqName.includes("pill_coating")) return PILL_COATING_OPTIONS;
    return [];
  };

  const hardcodedOpts = getSelectOptions();
  const isSelect = isSelectFromDB || hardcodedOpts.length > 0;
  const selectOptions = isSelectFromDB ? selectOptionsFromDB : hardcodedOpts;
  const isNumber = label.toLowerCase().includes("content") || label.toLowerCase().includes("fat") || label.toLowerCase().includes("fiber") || label.toLowerCase().includes("sugar") || label.toLowerCase().includes("protein") || label.toLowerCase().includes("energy");

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
        setLocalValue(value);
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
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-xs text-muted-foreground whitespace-normal leading-tight shrink-0">{label}</span>
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
      ) : isSelect ? (
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <select value={localValue} onChange={(e) => handleChange(e.target.value)} className="h-6 px-2 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand" style={{ minWidth: "80px", paddingTop: "2px", paddingBottom: "2px" }}>
            <option value="">{label.toLowerCase().includes("unit") ? "— select unit —" : "— select —"}</option>
            {selectOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
          {saveState === "saved" && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
          {saveState === "error" && <X className="h-3 w-3 text-destructive shrink-0" />}
        </div>
      ) : (
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <input type={isNumber ? "number" : "text"} step={isNumber ? "any" : undefined} value={localValue} onChange={(e) => handleChange(e.target.value)} className="h-6 px-2 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand flex-1 font-mono tabular-nums" />
          {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
          {saveState === "saved" && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
          {saveState === "error" && <X className="h-3 w-3 text-destructive shrink-0" />}
        </div>
      )}
    </div>
  );
}
"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, Check, X, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  buildSeoProjectNameOptions,
  buildSeoVersionOptions,
  displaySeoProjectName,
  ensureCurrentVersionOption,
  matchVersionSelectValue,
  normalizeSeoVersionNumber,
  parseVersionOptionValue,
  resolveSeoPairFromProject,
  resolveSeoPairFromVersion,
  type SeoProjectOption,
  type SeoSelectionPair,
  type SeoVersionOption,
} from "@/lib/seo-product-options";

const FORBIDDEN_WORDS = [
  '100% natural', '100% organic', 'best seller', 'bestseller', 'bestselling',
  'FDA approved', 'FDA registered', 'FDA certified', 'FDA cleared',
  'eco-friendly', 'eco friendly', 'eco-friendly', 'environmentally friendly',
  'guaranteed', 'guarantee', 'money back', 'lifetime warranty',
  'anti-inflammatory', 'anti aging', 'anti-aging', 'anti-aging',
  'cures', 'cure', 'heals', 'heal', 'treatment for', 'treats',
  'clinically proven', 'scientifically proven', 'doctor recommended',
  'patent pending', 'patented', 'award winning', 'award-winning',
  'no side effects', 'no side-effects', 'safe for', 'non-toxic',
  'all-natural', 'all natural', 'organic', 'vegan', 'gluten-free',
  'hypoallergenic', 'dermatologist tested', 'dermatologist-approved',
  'instant', 'immediately', 'fast-acting', 'fast acting',
  'miracle', 'revolutionary', 'breakthrough', 'secret', 'amazing',
  'incredible', 'unbelievable', 'phenomenal', 'game-changer'
];

const APPROVED_ACRONYMS = ['BPA', 'USDA', 'FDA', 'FDA', 'ASTM', 'ISO', 'UL', 'FCC', 'CE', 'RoHS', 'REACH', 'GMP', 'OTC', 'Rx'];

const ALLOWED_BQ_NAMES_WITH_COLON = [
  'DetailedBulletPoint1', 'DetailedBulletPoint2', 'DetailedBulletPoint3',
  'DetailedBulletPoint4', 'DetailedBulletPoint5', 'ConciseBulletPoint1',
  'ConciseBulletPoint2', 'ConciseBulletPoint3', 'ConciseBulletPoint4',
  'ConciseBulletPoint5', 'ContentBulletPoint1', 'ContentBulletPoint2',
  'ContentBulletPoint3', 'ContentBulletPoint4', 'ContentBulletPoint5'
];

interface ValidationResult {
  isValid: boolean;
  hasForbiddenWords: boolean;
  hasColon: boolean;
  hasEmojis: boolean;
  hasHTML: boolean;
  hasExcessiveCaps: boolean;
  hasWordRepetition: boolean;
  forbiddenWord?: string;
  repeatedWord?: string;
}

function validateSEOContent(text: string, bqName: string): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    hasForbiddenWords: false,
    hasColon: false,
    hasEmojis: false,
    hasHTML: false,
    hasExcessiveCaps: false,
    hasWordRepetition: false
  };

  const lowerText = text.toLowerCase();

  for (const word of FORBIDDEN_WORDS) {
    if (lowerText.includes(word)) {
      result.hasForbiddenWords = true;
      result.forbiddenWord = word;
      result.isValid = false;
      break;
    }
  }

  const isItemNameOrDescription = bqName === 'ItemName' || bqName === 'ProductDescription' || bqName === 'ShortProductDescription';
  const isBulletField = ALLOWED_BQ_NAMES_WITH_COLON.includes(bqName);

  if (text.includes(':') && (isItemNameOrDescription || !isBulletField)) {
    result.hasColon = true;
    result.isValid = false;
  }

  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  if (emojiRegex.test(text)) {
    result.hasEmojis = true;
    result.isValid = false;
  }

  const htmlRegex = /<[^>]+>/g;
  if (htmlRegex.test(text)) {
    result.hasHTML = true;
    result.isValid = false;
  }

  const words = text.split(/\s+/).filter(w => w.length > 0);
  const upperWords = words.filter(w => w === w.toUpperCase() && w.length > 1 && /[A-Z]/.test(w));
  const nonAcronymUpper = upperWords.filter(w => !APPROVED_ACRONYMS.includes(w));
  if (nonAcronymUpper.length > 0) {
    const upperRatio = upperWords.length / words.length;
    if (upperRatio > 0.3) {
      result.hasExcessiveCaps = true;
      result.isValid = false;
    }
  }

  if (bqName === 'ItemName' && text.length > 0) {
    const cleanWords = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    const wordCounts: Record<string, number> = {};
    for (const word of cleanWords) {
      if (word.length > 3) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }
    for (const [word, count] of Object.entries(wordCounts)) {
      if (count > 2) {
        result.hasWordRepetition = true;
        result.repeatedWord = word;
        break;
      }
    }
  }

  return result;
}

type SEOAttribute = {
  hubLabel: string;
  bqName: string;
  requirement: string | null;
  description: string | null;
  subcardOrder: number;
  validValues: string | null;
};

const HUB_LABEL_TO_BQ_NAME: Record<string, string> = {
  "SEO Version Number": "SEOVersionNumber",
  "Item Name": "ItemName",
  "Item Highlight": "ItemHighlight",
  "Bullet Point 1": "DetailedBulletPoint1",
  "Bullet Point 2": "DetailedBulletPoint2",
  "Bullet Point 3": "DetailedBulletPoint3",
  "Bullet Point 4": "DetailedBulletPoint4",
  "Bullet Point 5": "DetailedBulletPoint5",
  "Product Description": "ProductDescription",
  "Generic Keyword 1": "GenericKeyword1",
  "Generic Keyword 2": "GenericKeyword2",
  "Generic Keyword 3": "GenericKeyword3",
  "Generic Keyword 4": "GenericKeyword4",
  "Generic Keyword 5": "GenericKeyword5",
  "Concise Bullet Point 1": "ConciseBulletPoint1",
  "Concise Bullet Point 2": "ConciseBulletPoint2",
  "Concise Bullet Point 3": "ConciseBulletPoint3",
  "Concise Bullet Point 4": "ConciseBulletPoint4",
  "Concise Bullet Point 5": "ConciseBulletPoint5",
  "Key Feature 1": "KeyFeature1",
  "Key Feature 2": "KeyFeature2",
  "Key Feature 3": "KeyFeature3",
  "Key Feature 4": "KeyFeature4",
  "Key Feature 5": "KeyFeature5",
  "Short Product Description": "ShortProductDescription",
  "SEO Project Name": "SEOProjectName",
};

function getSEOAttributesFromCards(cards: Awaited<ReturnType<typeof useAttributesMasterCards>>["cards"]): SEOAttribute[] {
  if (!cards) return [];

  const seoCard = cards.find(c => c.name === "SEO");
  if (!seoCard) return [];

  const attributes: SEOAttribute[] = [];

  for (const subcard of seoCard.subcards) {
    for (const attr of subcard.attributes) {
      const hubLabel = attr.Attributes_HubLabel;
      const bqName = HUB_LABEL_TO_BQ_NAME[hubLabel] || attr.BQ_Master || hubLabel;
      attributes.push({
        hubLabel,
        bqName,
        requirement: attr.Attributes_Requirement,
        description: attr.Attributes_Description,
        subcardOrder: attr.Attributes_PDPSubcardOrder ?? 0,
        validValues: attr.Attributes_ValidValues,
      });
    }
  }

  return attributes.sort((a, b) => a.subcardOrder - b.subcardOrder);
}

const REQ_CHIP_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Required: { bg: "bg-red-900/60", text: "text-red-200", label: "R" },
  "Conditionally Required": { bg: "bg-amber-900/60", text: "text-amber-200", label: "C" },
  Recommended: { bg: "bg-blue-900/60", text: "text-blue-200", label: "P" },
  Optional: { bg: "bg-zinc-700/60", text: "text-zinc-300", label: "O" },
};

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
};

export function SeoSection({
  product,
  readOnly,
  onSave,
  onFieldSaved,
}: Props) {
  const { cards, isLoading } = useAttributesMasterCards();
  const queryClient = useQueryClient();

  const { data: seoOptions } = useQuery({
    queryKey: ["product-seo-options", product.id],
    queryFn: async () => {
      const res = await fetch(`/api/products/${product.id}/seo-options`);
      if (!res.ok) throw new Error("Failed to load SEO options");
      return res.json() as Promise<{
        projects: SeoProjectOption[];
        versions: SeoVersionOption[];
      }>;
    },
    staleTime: 30_000,
  });

  const productType = getProductFieldValue(product, "ProductType");
  const allAttributes = useMemo(() => getSEOAttributesFromCards(cards), [cards]);

  const visibleAttributes = useMemo(() => {
    const filtered = allAttributes.filter((attr) => {
      const result = parseValidValues(attr.validValues, productType);
      return result.visible;
    });

    // Ensure Item Highlight is present (core SEO field) even if Attributes Master
    // has not yet listed it under the SEO card.
    if (!filtered.some((a) => a.bqName === "ItemHighlight" || a.hubLabel === "Item Highlight")) {
      filtered.push({
        hubLabel: "Item Highlight",
        bqName: "ItemHighlight",
        requirement: "Recommended",
        description: "Secondary title keywords (max 125 characters). Shown after Item Name.",
        subcardOrder: 0,
        validValues: null,
      });
    }

    return filtered;
  }, [allAttributes, productType]);

  /** Project Name + Version share a row; Item Highlight always follows Item Name. */
  const layout = useMemo(() => {
    const byLabel = new Map(visibleAttributes.map((a) => [a.hubLabel, a]));
    const projectName = byLabel.get("SEO Project Name");
    const version = byLabel.get("SEO Version Number");
    const itemName = byLabel.get("Item Name");
    const itemHighlight = byLabel.get("Item Highlight");
    const pinned = new Set([
      "SEO Project Name",
      "SEO Version Number",
      "Item Name",
      "Item Highlight",
    ]);
    const rest = visibleAttributes.filter((a) => !pinned.has(a.hubLabel));
    return { projectName, version, itemName, itemHighlight, rest };
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

  const currentProjectName = getProductFieldValue(product, "SEOProjectName") ?? "";
  const currentVersionNumber = getProductFieldValue(product, "SEOVersionNumber") ?? "";
  const currentSeoCategory = getProductFieldValue(product, "SEOCategory") ?? "";

  const versionOptions = useMemo(() => {
    const built =
      seoOptions?.versions ??
      buildSeoVersionOptions({ bqVersions: [], projects: [] });
    return ensureCurrentVersionOption(
      built,
      currentVersionNumber,
      currentSeoCategory,
      currentProjectName
    );
  }, [seoOptions?.versions, currentVersionNumber, currentSeoCategory, currentProjectName]);

  const versionSelectValue = matchVersionSelectValue(
    versionOptions,
    currentVersionNumber,
    currentSeoCategory,
    currentProjectName
  );

  const selectedVersion = versionOptions.find((o) => o.value === versionSelectValue);
  const linkedProjectName = displaySeoProjectName({
    currentProjectName,
    versionNumber: currentVersionNumber || selectedVersion?.seoVersionNumber || "",
    versionSource: selectedVersion?.source,
    linkedFromVersion: selectedVersion?.projectName,
  });

  const projectNameOptions = useMemo(
    () => buildSeoProjectNameOptions(seoOptions?.projects ?? [], linkedProjectName),
    [seoOptions?.projects, linkedProjectName]
  );

  const applySeoPair = useCallback(
    async (pair: SeoSelectionPair) => {
      const nextName = pair.projectName?.trim() ?? "";
      const nameChanged = nextName !== currentProjectName;
      const versionChanged =
        normalizeSeoVersionNumber(pair.seoVersionNumber) !==
        normalizeSeoVersionNumber(currentVersionNumber);

      if (!nameChanged && !versionChanged) return;

      if (nameChanged) {
        await onSave("SEOProjectName", nextName || null);
        onFieldSaved?.(
          "SEOProjectName",
          "SEO Project Name",
          currentProjectName,
          nextName
        );
      }

      if (!versionChanged) return;

      const version = normalizeSeoVersionNumber(pair.seoVersionNumber);
      if (version == null) {
        throw new Error("SEO version number is required");
      }

      const option = versionOptions.find((o) => o.value === pair.versionValue);
      const canActivate = Boolean(
        product.asin &&
          product.sku &&
          option &&
          (option.source === "bq" || option.source === "clr")
      );

      if (canActivate) {
        const res = await fetch("/api/seo/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: product.id,
            seoVersionNumber: version,
            seoCategory: pair.seoCategory || option?.seoCategory,
            asin: product.asin,
            sku: product.sku,
          }),
        });
        if (res.ok) {
          await queryClient.invalidateQueries({ queryKey: ["product", product.id] });
          onFieldSaved?.(
            "SEOVersionNumber",
            "SEO Version Number",
            currentVersionNumber,
            version
          );
          return;
        }
        if (res.status !== 404 && !(version === "0" && !res.ok)) {
          throw new Error("Failed to load SEO version");
        }
      }

      await onSave("SEOVersionNumber", version);
      onFieldSaved?.(
        "SEOVersionNumber",
        "SEO Version Number",
        currentVersionNumber,
        version
      );
    },
    [
      currentProjectName,
      currentVersionNumber,
      versionOptions,
      product.asin,
      product.sku,
      product.id,
      queryClient,
      onSave,
      onFieldSaved,
    ]
  );

  const handleProjectNameChange = useCallback(
    async (name: string) => {
      const pair = resolveSeoPairFromProject(
        seoOptions?.projects ?? [],
        versionOptions,
        name
      );
      if (!pair) {
        if (name === currentProjectName) return;
        await onSave("SEOProjectName", name || null);
        onFieldSaved?.("SEOProjectName", "SEO Project Name", currentProjectName, name);
        return;
      }
      await applySeoPair(pair);
    },
    [
      seoOptions?.projects,
      versionOptions,
      currentProjectName,
      onSave,
      onFieldSaved,
      applySeoPair,
    ]
  );

  const handleVersionChange = useCallback(
    async (selectValue: string) => {
      const option = versionOptions.find((o) => o.value === selectValue);
      if (!option) {
        const parsed = parseVersionOptionValue(selectValue);
        await applySeoPair({
          projectName: currentProjectName || null,
          versionValue: selectValue,
          seoVersionNumber: parsed.seoVersionNumber,
          seoCategory: parsed.seoCategory,
          source: "bq",
        });
        return;
      }
      await applySeoPair(
        resolveSeoPairFromVersion(seoOptions?.projects ?? [], option)
      );
    },
    [versionOptions, seoOptions?.projects, currentProjectName, applySeoPair]
  );

  const renderField = (attr: SEOAttribute, opts?: { compact?: boolean; maxLength?: number; singleLine?: boolean }) => (
    <SEOTextField
      key={attr.bqName}
      label={attr.hubLabel}
      bqName={attr.bqName}
      value={getProductFieldValue(product, attr.bqName) ?? ""}
      readOnly={readOnly}
      onSave={onSave}
      onFieldSaved={onFieldSaved}
      requirement={attr.requirement}
      description={attr.description}
      compact={opts?.compact}
      maxLength={opts?.maxLength}
      singleLine={opts?.singleLine}
    />
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden p-4">
        <span className="text-sm text-muted-foreground">Loading SEO attributes...</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden">
      <Collapsible defaultOpen={true}>
        <CollapsibleTrigger className="group flex items-center justify-between gap-3 w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            <span className="text-sm font-medium text-section-title">SEO</span>
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
            <Badge variant="secondary" className="text-xs shrink-0 tabular-nums">
              {populatedCount}/{visibleAttributes.length}
            </Badge>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border p-4 space-y-4">
            {(layout.projectName || layout.version) && (
              <div className="grid grid-cols-1 gap-3">
                {layout.projectName && (
                  <div className="min-w-0">
                    <SEODropdownField
                      label={layout.projectName.hubLabel}
                      bqName={layout.projectName.bqName}
                      requirement={layout.projectName.requirement}
                      description={layout.projectName.description}
                      compact
                      stacked
                      value={linkedProjectName}
                      options={projectNameOptions}
                      readOnly={readOnly}
                      placeholder="Select SEO project"
                      onSelect={handleProjectNameChange}
                    />
                  </div>
                )}
                {layout.version && (
                  <div className="min-w-0">
                    <SEODropdownField
                      label={layout.version.hubLabel}
                      bqName={layout.version.bqName}
                      requirement={layout.version.requirement}
                      description={layout.version.description}
                      compact
                      stacked
                      value={versionSelectValue}
                      options={versionOptions.map((o) => ({ value: o.value, label: o.label }))}
                      readOnly={readOnly}
                      placeholder="Select version"
                      onSelect={handleVersionChange}
                    />
                  </div>
                )}
              </div>
            )}
            {layout.itemName && renderField(layout.itemName)}
            {layout.itemHighlight && renderField(layout.itemHighlight)}
            {layout.rest.map((attr) => renderField(attr))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

type SEODropdownFieldProps = {
  label: string;
  bqName: string;
  requirement: string | null;
  description: string | null;
  compact?: boolean;
  stacked?: boolean;
  value: string;
  options: Array<{ value: string; label: string }>;
  readOnly: boolean;
  placeholder?: string;
  onSelect: (value: string) => Promise<void>;
};

function SEODropdownField({
  label,
  bqName,
  requirement,
  description,
  compact = false,
  stacked = false,
  value,
  options,
  readOnly,
  placeholder = "Select...",
  onSelect,
}: SEODropdownFieldProps) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const reqStyle = requirement ? REQ_CHIP_STYLES[requirement] : null;
  const showHelpCircle = description !== null;
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  const handleChange = async (next: string) => {
    if (next === value) return;
    setSaveState("saving");
    try {
      await onSelect(next);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("error");
      toast.error(`Failed to save ${label}`);
      setTimeout(() => setSaveState("idle"), 2000);
    }
  };

  return (
    <div className={`flex ${stacked ? "flex-col gap-1" : "items-start gap-2"} ${compact ? "min-h-[32px]" : "min-h-[40px]"}`}>
      <div className={`flex flex-col gap-0 shrink-0 ${stacked ? "w-full" : "w-fit"}`}>
        <div className="flex items-start gap-1">
          <span className="text-xs text-muted-foreground whitespace-normal leading-tight font-sans">{label}</span>
          {reqStyle && (
            <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${reqStyle.bg} ${reqStyle.text}`}>
              {reqStyle.label}
            </span>
          )}
          {showHelpCircle && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm">
                  <p className="text-xs font-sans">{description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {!stacked && <div className="h-[14px] w-[50px]" />}
      </div>
      {readOnly ? (
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground/80 break-words font-sans">
            {selectedLabel || <span className="text-muted-foreground/50">None</span>}
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-1 flex-1 w-full min-w-0 relative">
          <Select value={value || undefined} onValueChange={handleChange} disabled={saveState === "saving"}>
            <SelectTrigger
              data-field-bq={bqName}
              size="sm"
              className="w-full h-auto min-h-8 data-[size=sm]:h-auto px-2 py-1 text-xs rounded border border-border bg-field-bg text-field-text font-sans shadow-none whitespace-normal text-left focus-visible:border-brand focus-visible:ring-brand/50 *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:whitespace-normal *:data-[slot=select-value]:break-all *:data-[slot=select-value]:overflow-visible"
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent position="popper" className="max-w-[min(36rem,var(--radix-select-trigger-width))]">
              {options.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No SEO projects yet
                </SelectItem>
              ) : (
                options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs font-sans whitespace-normal">
                    {opt.label}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {saveState === "saving" && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0 absolute right-8 top-2" />
          )}
          {saveState === "saved" && (
            <Check className="h-3 w-3 text-emerald-500 shrink-0 absolute right-8 top-2" />
          )}
          {saveState === "error" && (
            <X className="h-3 w-3 text-destructive shrink-0 absolute right-8 top-2" />
          )}
        </div>
      )}
    </div>
  );
}

const CHAR_LIMITS: Record<string, number | undefined> = {
  "SEO Version Number": 3,
  "Item Name": 75,
  "Item Highlight": 125,
  "Bullet Point 1": 400,
  "Bullet Point 2": 400,
  "Bullet Point 3": 400,
  "Bullet Point 4": 400,
  "Bullet Point 5": 400,
  "Detailed Bullet Point 1": 400,
  "Detailed Bullet Point 2": 400,
  "Detailed Bullet Point 3": 400,
  "Detailed Bullet Point 4": 400,
  "Detailed Bullet Point 5": 400,
  "Product Description": 1200,
  "Generic Keyword 1": undefined,
  "Generic Keyword 2": undefined,
  "Generic Keyword 3": undefined,
  "Generic Keyword 4": undefined,
  "Generic Keyword 5": undefined,
  "Concise Bullet Point 1": 200,
  "Concise Bullet Point 2": 200,
  "Concise Bullet Point 3": 200,
  "Concise Bullet Point 4": 200,
  "Concise Bullet Point 5": 200,
  "Content Bullet Point 1": 100,
  "Content Bullet Point 2": 100,
  "Content Bullet Point 3": 100,
  "Content Bullet Point 4": 100,
  "Content Bullet Point 5": 100,
  "Key Feature 1": 50,
  "Key Feature 2": 50,
  "Key Feature 3": 50,
  "Key Feature 4": 50,
  "Key Feature 5": 50,
  "Short Product Description": undefined,
};

type SEOTextFieldProps = {
  label: string;
  bqName: string;
  value: string;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
  requirement: string | null;
  description: string | null;
  compact?: boolean;
  maxLength?: number;
  singleLine?: boolean;
};

function SEOTextField({
  label,
  bqName,
  value,
  readOnly,
  onSave,
  onFieldSaved,
  requirement,
  description,
  compact = false,
  maxLength,
  singleLine = false,
}: SEOTextFieldProps) {
  const [localValue, setLocalValue] = useState(value);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (singleLine || !textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
  }, [localValue, singleLine]);

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
    const next = maxLength != null ? newVal.slice(0, maxLength) : newVal;
    setLocalValue(next);
    setValidation(validateSEOContent(next, bqName));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(next), 600);
  };

  const reqStyle = requirement ? REQ_CHIP_STYLES[requirement] : null;
  const showHelpCircle = description !== null;
  const fieldClass = compact
    ? "w-full px-2 py-1 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand font-sans"
    : "w-full px-2 py-1.5 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand font-sans resize-y overflow-hidden";

  return (
    <div className={`flex items-start gap-2 ${compact ? "min-h-[32px]" : "min-h-[40px]"}`}>
      <div className="flex flex-col gap-0 shrink-0 w-fit">
        <div className="flex items-start gap-1">
          <span className="text-xs text-muted-foreground whitespace-normal leading-tight font-sans">{label}</span>
          {reqStyle && (
            <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${reqStyle.bg} ${reqStyle.text}`}>
              {reqStyle.label}
            </span>
          )}
          {showHelpCircle && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm">
                  <p className="text-xs font-sans">{description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {(() => {
          const limit = maxLength ?? CHAR_LIMITS[label];
          if (!limit) return <div className="h-[14px] w-[50px]" />;
          const isOver = localValue.length > limit;
          return (
            <span className={`text-[10px] font-sans ${isOver ? "text-red-600" : "text-green-500"}`}>
              {localValue.length}/{limit}
            </span>
          );
        })()}
        {validation && !validation.isValid && (
          <span className="text-[10px] font-sans text-red-600">
            {validation.forbiddenWord && `Prohibido: "${validation.forbiddenWord}"`}
            {validation.hasColon && '":" no permitido'}
            {validation.hasEmojis && 'Emoji'}
            {validation.hasHTML && 'HTML'}
            {validation.hasExcessiveCaps && 'CAPS'}
          </span>
        )}
      </div>
      {readOnly ? (
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground/80 whitespace-pre-wrap break-words font-sans">
            {value || <span className="text-muted-foreground/50">—</span>}
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-1 flex-1 w-full min-w-0 relative">
          {singleLine ? (
            <input
              type="text"
              data-field-bq={bqName}
              value={localValue}
              onChange={(e) => handleChange(e.target.value)}
              maxLength={maxLength}
              className={fieldClass}
            />
          ) : (
            <textarea
              ref={textareaRef}
              data-field-bq={bqName}
              value={localValue}
              onChange={(e) => handleChange(e.target.value)}
              rows={1}
              maxLength={maxLength}
              className={fieldClass}
              style={{ height: "auto", minHeight: compact ? "2rem" : "3rem" }}
            />
          )}
          {saveState === "saving" && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0 absolute right-2 top-2" />
          )}
          {saveState === "saved" && (
            <Check className="h-3 w-3 text-emerald-500 shrink-0 absolute right-2 top-2" />
          )}
          {saveState === "error" && (
            <X className="h-3 w-3 text-destructive shrink-0 absolute right-2 top-2" />
          )}
        </div>
      )}
    </div>
  );
}
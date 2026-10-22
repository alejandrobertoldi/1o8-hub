"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Check, X, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getProductFieldValue } from "@/lib/product-mapper";
import { computeUUID, computeAmazonPdpUrl, displaySummarizedTitle } from "@/lib/computed-fields";
import { useAttributesMasterCards } from "@/hooks/use-attributes-master";
import { parseValidValues } from "@/hooks/use-category-filter";
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
import type { Product } from "@/lib/db/schema";

const REQ_CHIP_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Required: { bg: "bg-red-900/60", text: "text-red-200", label: "R" },
  "Conditionally Required": { bg: "bg-amber-900/60", text: "text-amber-200", label: "C" },
  Recommended: { bg: "bg-blue-900/60", text: "text-blue-200", label: "P" },
  Optional: { bg: "bg-zinc-700/60", text: "text-zinc-300", label: "O" },
};

const STATUS_OPTIONS = [
  "Active",
  "Inactive",
  "Incomplete",
  "Out of Stock",
  "Closed",
  "Discontinued",
];

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-emerald-700 text-emerald-100 border-emerald-600",
  Inactive: "bg-zinc-600 text-zinc-200 border-zinc-500",
  Closed: "bg-red-700 text-red-100 border-red-600",
  Discontinued: "bg-orange-700 text-orange-100 border-orange-600",
  Incomplete: "bg-yellow-700 text-yellow-100 border-yellow-600",
  "Out of Stock": "bg-purple-700 text-purple-100 border-purple-600",
};

const FIELD_CONFIG: {
  bqName: string;
  fieldType: "status" | "url" | "computed" | "editable" | "select";
  options?: { value: string; label: string }[];
  width?: string;
  tabular?: boolean;
  aacSource?: string;
}[] = [
  { bqName: "Status", fieldType: "status" },
  { bqName: "UUID", fieldType: "computed", tabular: true },
  { bqName: "ASIN", fieldType: "editable", width: "w-48", tabular: true },
  { bqName: "SKU", fieldType: "editable", width: "w-48", tabular: true },
  { bqName: "SummarizedTitle", fieldType: "computed" },
  { bqName: "AmazonPDPURL", fieldType: "computed", tabular: true },
  { bqName: "WebsiteProductURL", fieldType: "url" },
  { bqName: "ClientIDCode", fieldType: "computed", tabular: true, aacSource: "ClientIDCode" },
  { bqName: "ClientName", fieldType: "computed", tabular: true, aacSource: "ClientName" },
  { bqName: "BrandName", fieldType: "computed", tabular: true, aacSource: "BrandName" },
  { bqName: "BrandURL", fieldType: "computed", tabular: true, aacSource: "BrandURL" },
  { bqName: "Marketplace", fieldType: "computed", tabular: true, aacSource: "Marketplace" },
  { bqName: "Country", fieldType: "computed", tabular: true, aacSource: "Country" },
];

function isRegionOfOrigin(hubLabel: string, bqName: string): boolean {
  return hubLabel === "Region of Origin" || bqName === "RegionOfOrigin";
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
  aacData?: { intentwiseId: string | null; marketplace: string | null; country: string | null; brandName: string | null; brandURL: string | null; clientName: string | null };
  variationName?: string | null;
  flavor?: string | null;
  size?: string | null;
};

export function ListingIdentitySection({
  product,
  readOnly,
  onSave,
  onFieldSaved,
  expanded: controlledExpanded,
  onExpandedChange,
  aacData,
  variationName,
  flavor,
  size,
}: Props) {
  const { cards, isLoading } = useAttributesMasterCards();

  const [internalExpanded, setInternalExpanded] = useState(true);
  const [localExpanded, setLocalExpanded] = useState(true);
  const expanded =
    controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const cardName = "Listing Identity";

  const dbAttributes = useMemo(() => {
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
      }))
    ).filter((attr) => attr.bqName !== "Action");
  }, [cards]);

  const regionOfOriginAttr = useMemo(() => {
    if (!cards) return null;
    for (const card of cards) {
      for (const sub of card.subcards) {
        for (const attr of sub.attributes) {
          const hubLabel = attr.Attributes_HubLabel;
          const bqName = attr.BQ_Master || hubLabel.replace(/ /g, "");
          if (isRegionOfOrigin(hubLabel, bqName)) {
            return {
              hubLabel: "Region of Origin",
              bqName,
              requirement: attr.Attributes_Requirement ?? "Optional",
              description: attr.Attributes_Description ?? null,
              validValues: attr.Attributes_ValidValues ?? null,
            };
          }
        }
      }
    }
    return {
      hubLabel: "Region of Origin",
      bqName: "RegionOfOrigin",
      requirement: "Optional",
      description: null,
      validValues: null,
    };
  }, [cards]);

  const productType = getProductFieldValue(product, "ProductType");

  const requirementCounts = useMemo(() => {
    const counts = { required: 0, conditionallyRequired: 0, recommended: 0, optional: 0 };
    for (const attr of dbAttributes) {
      if (attr.requirement === "Required") counts.required++;
      else if (attr.requirement === "Conditionally Required") counts.conditionallyRequired++;
      else if (attr.requirement === "Recommended") counts.recommended++;
      else if (attr.requirement === "Optional") counts.optional++;
    }
    return counts;
  }, [dbAttributes]);

  const populatedCount = useMemo(() => {
    return dbAttributes.filter((attr) => {
      const val = getProductFieldValue(product, attr.bqName);
      return val != null && val !== "";
    }).length;
  }, [dbAttributes, product]);

  const getRequirement = (bqName: string) => {
    const attr = dbAttributes.find((a) => a.bqName === bqName);
    return attr?.requirement ?? "Optional";
  };

  const getDescription = (bqName: string) => {
    const attr = dbAttributes.find((a) => a.bqName === bqName);
    return attr?.description ?? null;
  };

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
              Listing Identity
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
                  {populatedCount}/{dbAttributes.length}
                </Badge>
              </>
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border px-4 py-2 space-y-1.5">
            {isLoading ? (
              <p className="text-xs text-muted-foreground py-2">
                Loading {dbAttributes.length > 0 ? dbAttributes.length : "attributes"}...
              </p>
            ) : (
              FIELD_CONFIG.map((field) => {
                const requirement = getRequirement(field.bqName);
                const description = getDescription(field.bqName);
                const reqStyle = REQ_CHIP_STYLES[requirement];

                if (field.fieldType === "status") {
                  return (
                    <StatusField
                      key={field.bqName}
                      label="Product Status"
                      bqName="Status"
                      value={getProductFieldValue(product, "Status") ?? ""}
                      readOnly={readOnly}
                      onSave={onSave}
                      onFieldSaved={onFieldSaved}
                      requirement={requirement}
                      description={description}
                    />
                  );
                }

                if (field.fieldType === "url") {
                  return (
                    <UrlField
                      key={field.bqName}
                      label="Website Product URL"
                      bqName="WebsiteProductURL"
                      value={getProductFieldValue(product, "WebsiteProductURL") ?? ""}
                      readOnly={readOnly}
                      onSave={onSave}
                      onFieldSaved={onFieldSaved}
                      requirement={requirement}
                      description={description}
                    />
                  );
                }

                if (field.fieldType === "computed") {
                  let displayValue: string;
                  let source: string | null = "Auto";

                  if (field.aacSource === "Marketplace") {
                    displayValue = aacData?.marketplace ?? "";
                    source = "AAC";
                  } else if (field.aacSource === "Country") {
                    displayValue = aacData?.country ?? "";
                    source = "AAC";
                  } else if (field.aacSource === "ClientIDCode") {
                    displayValue = getProductFieldValue(product, "ClientIDCode") ?? "";
                    source = "AAC";
                  } else if (field.aacSource === "ClientName") {
                    displayValue = aacData?.clientName ?? "";
                    source = "AAC";
                  } else if (field.aacSource === "BrandName") {
                    displayValue = aacData?.brandName ?? "";
                    source = "AAC";
                  } else if (field.aacSource === "BrandURL") {
                    displayValue = aacData?.brandURL ?? "";
                    source = "AAC";
                  } else if (field.bqName === "UUID") {
                    displayValue = getProductFieldValue(product, "UUID") || computeUUID(
                      getProductFieldValue(product, "ASIN"),
                      getProductFieldValue(product, "SKU"),
                      getProductFieldValue(product, "ClientIDCode"),
                    );
                  } else if (field.bqName === "AmazonPDPURL") {
                    displayValue = getProductFieldValue(product, "AmazonPDPURL") || computeAmazonPdpUrl(
                      getProductFieldValue(product, "ASIN"),
                    );
                  } else if (field.bqName === "SummarizedTitle") {
                    displayValue = displaySummarizedTitle({
                      variationThemeName: getProductFieldValue(product, "VariationThemeName"),
                      variationName,
                      Flavor: getProductFieldValue(product, "Flavor") || flavor,
                      Size: getProductFieldValue(product, "Size") || size,
                      Color: getProductFieldValue(product, "Color"),
                      Style: getProductFieldValue(product, "Style"),
                      summarizedTitle: getProductFieldValue(product, "SummarizedTitle"),
                      itemName: getProductFieldValue(product, "ItemName"),
                    }) ?? "";
                    source = "Auto";
                  } else {
                    displayValue = getProductFieldValue(product, field.bqName) ?? "";
                  }

                  const isUrl = field.bqName === "AmazonPDPURL" || field.aacSource === "BrandURL";

                  return (
                    <ComputedField
                      key={field.bqName}
                      label={field.bqName}
                      bqName={field.bqName}
                      value={displayValue}
                      source={source}
                      isUrl={isUrl}
                      tabular={field.tabular}
                      requirement={requirement}
                      description={description}
                    />
                  );
                }

                return (
                  <EditableField
                    key={field.bqName}
                    label={field.bqName === "ASIN" ? "ASIN" : field.bqName === "SKU" ? "SKU" : field.bqName}
                    bqName={field.bqName}
                    value={getProductFieldValue(product, field.bqName) ?? ""}
                    readOnly={readOnly}
                    onSave={onSave}
                    onFieldSaved={onFieldSaved}
                    width={field.width}
                    requirement={requirement}
                    description={description}
                  />
                );
              })
            )}
            {regionOfOriginAttr && (
              <EditableField
                label={regionOfOriginAttr.hubLabel}
                bqName={regionOfOriginAttr.bqName}
                value={getProductFieldValue(product, regionOfOriginAttr.bqName) ?? ""}
                readOnly={readOnly}
                onSave={onSave}
                onFieldSaved={onFieldSaved}
                requirement={regionOfOriginAttr.requirement}
                description={regionOfOriginAttr.description}
                validValues={regionOfOriginAttr.validValues}
                productType={productType}
              />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

type StatusFieldProps = {
  label: string;
  bqName: string;
  value: string;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
  requirement: string;
  description: string | null;
};

function StatusField({
  label,
  bqName,
  value,
  readOnly,
  onSave,
  onFieldSaved,
  requirement,
  description,
}: StatusFieldProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reqStyle = REQ_CHIP_STYLES[requirement];
  const showHelpCircle = description !== null;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = async (newVal: string) => {
    if (newVal === value) { setOpen(false); return; }
    setSaving(true);
    try {
      await onSave(bqName, newVal || null);
      onFieldSaved?.(bqName, label, value, newVal);
      toast.success(`${label} updated`);
    } catch {
      toast.error(`Failed to update ${label}`);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  const colors = STATUS_COLORS[value] ?? "bg-muted text-muted-foreground border-border";

  return (
    <div className="flex items-center gap-3 min-w-0" ref={ref}>
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
      <div className="relative">
        <button
          type="button"
          disabled={readOnly || saving}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors} ${!readOnly ? "cursor-pointer hover:opacity-80" : ""}`}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            {value || "—"}
          </span>
          {!readOnly && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </button>

        {open && (
          <div className="absolute top-full left-0 z-50 mt-1 rounded-md border border-border bg-popover shadow-md py-1 min-w-[140px]">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left"
                onClick={() => handleSelect(opt)}
              >
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[opt]}`}>
                  {opt}
                </span>
                {opt === value && <Check className="h-3 w-3 ml-auto" />}
              </button>
            ))}
            <div className="border-t border-border my-1" />
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left text-muted-foreground"
              onClick={() => handleSelect("")}
            >
              None
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UrlField({
  label,
  bqName,
  value,
  readOnly,
  onSave,
  onFieldSaved,
  requirement,
  description,
}: {
  label: string;
  bqName: string;
  value: string;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
  requirement: string;
  description: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqStyle = REQ_CHIP_STYLES[requirement];
  const showHelpCircle = description !== null;

  useEffect(() => { setLocalValue(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const handleSave = async () => {
    if (localValue === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(bqName, localValue || null);
      onFieldSaved?.(bqName, label, value, localValue);
      setEditing(false);
    } catch {
      toast.error(`Failed to update ${label}`);
      setLocalValue(value);
    } finally {
      setSaving(false);
    }
  };

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
      {editing ? (
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <input
            ref={inputRef}
            type="url"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") { setLocalValue(value); setEditing(false); }
            }}
            className="h-6 px-2 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand flex-1 min-w-0 font-mono"
            disabled={saving}
          />
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {value ? (
            <a href={value} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate">
              {value}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground/50">—</span>
          )}
          {value && (
            <a href={value} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {!readOnly && (
            <button onClick={() => setEditing(true)} className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground ml-1">
              edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const colors =
    source === "AAC"
      ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
      : source === "VB"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : "bg-violet-500/15 text-violet-400 border-violet-500/30";
  return (
    <span className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] leading-none font-medium border whitespace-nowrap shrink-0 ${colors}`}>
      {source}
    </span>
  );
}

function ComputedField({
  label,
  bqName,
  value,
  source,
  isUrl,
  tabular,
  requirement,
  description,
}: {
  label: string;
  bqName: string;
  value: string;
  source: string | null;
  isUrl?: boolean;
  tabular?: boolean;
  requirement: string;
  description: string | null;
}) {
  const tabularClass = tabular ? "font-mono tabular-nums" : "font-mono";
  const reqStyle = REQ_CHIP_STYLES[requirement];
  const showHelpCircle = description !== null;

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
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {isUrl && value ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate">
            {value}
          </a>
        ) : bqName === "SummarizedTitle" ? (
          <span className="text-xs text-foreground/80 whitespace-normal break-words w-full">
            {value || <span className="text-muted-foreground/50">—</span>}
          </span>
        ) : (
          <span className={`text-xs text-foreground/80 ${tabularClass} truncate`}>
            {value || <span className="text-muted-foreground/50">—</span>}
          </span>
        )}
        {isUrl && value && (
          <a href={value} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {source && <SourceBadge source={source} />}
    </div>
  );
}

function EditableField({
  label,
  bqName,
  value,
  readOnly,
  onSave,
  onFieldSaved,
  width,
  requirement,
  description,
  validValues,
  productType,
}: {
  label: string;
  bqName: string;
  value: string;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
  width?: string;
  requirement: string;
  description: string | null;
  validValues?: string | null;
  productType?: string | null;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqStyle = REQ_CHIP_STYLES[requirement];
  const showHelpCircle = description !== null;

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const isAsin = bqName === "ASIN";

  const validateAsin = (val: string): boolean => {
    if (val.length !== 10) return false;
    if (!val.startsWith("B0")) return false;
    return /^[A-Z0-9]{10}$/.test(val);
  };

  const formatAsin = (val: string): string => {
    let cleaned = val.toUpperCase();
    cleaned = cleaned.replace(/[^A-Z0-9]/g, "");
    if (cleaned.length > 10) cleaned = cleaned.slice(0, 10);
    return cleaned;
  };

  const doSave = useCallback(
    async (newVal: string) => {
      if (newVal === value) return;
      if (isAsin && !validateAsin(newVal)) {
        toast.error(`ASIN must be exactly 10 characters starting with "B0"`);
        setLocalValue(value);
        return;
      }
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
    [bqName, label, value, onSave, onFieldSaved, isAsin]
  );

  const handleChange = (newVal: string) => {
    const formattedValue = isAsin ? formatAsin(newVal) : newVal;
    setLocalValue(formattedValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(formattedValue), 600);
  };

  const validValuesParsed = validValues ? parseValidValues(validValues, productType ?? null) : null;
  const selectOptionsFromDB = validValuesParsed?.options ?? [];
  const selectOptions = localValue && !selectOptionsFromDB.includes(localValue)
    ? [...selectOptionsFromDB, localValue]
    : selectOptionsFromDB;
  const isSelect = selectOptionsFromDB.length > 0;

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
      ) : isSelect ? (
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <select
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            className="h-7 px-2 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand w-full min-w-0"
          >
            <option value="">— select —</option>
            {selectOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
          {saveState === "saved" && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
          {saveState === "error" && <X className="h-3 w-3 text-destructive shrink-0" />}
        </div>
      ) : (
        <div className="flex items-center gap-1 min-w-0 flex-1">
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
            className={`h-6 px-2 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand font-mono tabular-nums ${width ?? "flex-1 min-w-0"}`}
          />
          {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
          {saveState === "saved" && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
          {saveState === "error" && <X className="h-3 w-3 text-destructive shrink-0" />}
        </div>
      )}
    </div>
  );
}
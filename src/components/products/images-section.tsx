"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Loader2,
  Check,
  X,
  ExternalLink,
  HelpCircle,
  ImageIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { getProductFieldValue } from "@/lib/product-mapper";
import type { Product } from "@/lib/db/schema";
import { useAttributesMasterCards } from "@/hooks/use-attributes-master";
import { parseValidValues } from "@/hooks/use-category-filter";
import {
  LISTING_IMAGE_SLOT_FIELDS,
  type ListingImageSlot,
} from "@/lib/listing-image-slots";

const HUB_LABEL_TO_BQ_NAME: Record<string, string> = Object.fromEntries(
  LISTING_IMAGE_SLOT_FIELDS.map((f) => [f.hubLabel, f.bqName]),
);

const REQ_CHIP_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Required: { bg: "bg-red-900/60", text: "text-red-200", label: "R" },
  "Conditionally Required": { bg: "bg-amber-900/60", text: "text-amber-200", label: "C" },
  Recommended: { bg: "bg-blue-900/60", text: "text-blue-200", label: "P" },
  Optional: { bg: "bg-zinc-700/60", text: "text-zinc-300", label: "O" },
};

type HubListingImage = {
  id: string;
  driveFileId: string;
  displayName: string | null;
  versionNumber: number;
  status: string;
  productId: string;
  slot: ListingImageSlot;
};

type Props = {
  product: Product;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
};

async function fetchProductListingImages(productId: string): Promise<HubListingImage[]> {
  const res = await fetch(
    `/api/design/listing-images?productId=${encodeURIComponent(productId)}`,
  );
  if (!res.ok) throw new Error("Failed to load Hub listing images");
  return res.json();
}

export function ImagesSection({
  product,
  readOnly,
  onSave,
  onFieldSaved,
}: Props) {
  const { cards, isLoading } = useAttributesMasterCards();

  const { data: hubImages = [], isLoading: hubLoading } = useQuery({
    queryKey: ["listing-images-product", product.id],
    queryFn: () => fetchProductListingImages(product.id),
    staleTime: 30_000,
  });

  const hubBySlot = useMemo(() => {
    const map = new Map<string, HubListingImage>();
    for (const img of hubImages) map.set(img.slot, img);
    return map;
  }, [hubImages]);

  const imagesAttributes = useMemo((): {
    bqName: string;
    hubLabel: string;
    requirement: string | null;
    description: string | null;
    subcardOrder: number;
    rawValidValues: string | null;
  }[] => {
    if (!cards) return [];
    const imagesCard = cards.find((c) => c.name === "Images");
    if (!imagesCard) {
      // Fallback to slot↔CLR map when attributes master is unavailable
      return LISTING_IMAGE_SLOT_FIELDS.map((f, i) => ({
        bqName: f.bqName,
        hubLabel: f.hubLabel,
        requirement: null,
        description: null,
        subcardOrder: i,
        rawValidValues: null,
      }));
    }
    const attrs = [];
    for (const subcard of imagesCard.subcards) {
      for (const attr of subcard.attributes) {
        attrs.push({
          hubLabel: attr.Attributes_HubLabel,
          bqName:
            HUB_LABEL_TO_BQ_NAME[attr.Attributes_HubLabel] ||
            attr.BQ_Master ||
            attr.Attributes_HubLabel,
          requirement: attr.Attributes_Requirement,
          description: attr.Attributes_Description,
          subcardOrder: attr.Attributes_PDPSubcardOrder ?? 0,
          rawValidValues: attr.Attributes_ValidValues ?? null,
        });
      }
    }
    return attrs.sort((a, b) => a.subcardOrder - b.subcardOrder);
  }, [cards]);

  const productType = getProductFieldValue(product, "ProductType");

  const visibleAttributes = useMemo(() => {
    return imagesAttributes.filter((attr) => {
      const result = parseValidValues(attr.rawValidValues, productType);
      return result.visible;
    });
  }, [imagesAttributes, productType]);

  const amazonByBq = useMemo(() => {
    const map = new Map(visibleAttributes.map((a) => [a.bqName, a]));
    return map;
  }, [visibleAttributes]);

  const pairedRows = useMemo(() => {
    return LISTING_IMAGE_SLOT_FIELDS.map((slotField) => {
      const attr = amazonByBq.get(slotField.bqName);
      return {
        ...slotField,
        requirement: attr?.requirement ?? null,
        description: attr?.description ?? null,
        amazonVisible: attr != null || visibleAttributes.length === 0,
      };
    }).filter((row) => row.amazonVisible || hubBySlot.has(row.slot));
  }, [amazonByBq, visibleAttributes.length, hubBySlot]);

  const populatedCount = useMemo(() => {
    return visibleAttributes.filter((attr) => {
      const val = getProductFieldValue(product, attr.bqName);
      return val != null && val !== "";
    }).length;
  }, [visibleAttributes, product]);

  const hubFilledCount = useMemo(
    () => LISTING_IMAGE_SLOT_FIELDS.filter((f) => hubBySlot.has(f.slot)).length,
    [hubBySlot],
  );

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

  const designHref = product.clientIdCode
    ? `/design/listing-images/${encodeURIComponent(product.clientIdCode)}`
    : "/design/listing-images";

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden p-4">
        <span className="text-sm text-muted-foreground">Loading Images attributes...</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden">
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="group flex items-center justify-between gap-3 w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            <span className="text-sm font-medium text-section-title">Images</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {(requirementCounts.required > 0 ||
              requirementCounts.conditionallyRequired > 0 ||
              requirementCounts.recommended > 0 ||
              requirementCounts.optional > 0) && (
              <div className="flex items-center gap-1">
                {requirementCounts.required > 0 && (
                  <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-medium bg-red-900/60 text-red-200">
                    {requirementCounts.required}R
                  </span>
                )}
                {requirementCounts.conditionallyRequired > 0 && (
                  <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-medium bg-amber-900/60 text-amber-200">
                    {requirementCounts.conditionallyRequired}C
                  </span>
                )}
                {requirementCounts.recommended > 0 && (
                  <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-medium bg-blue-900/60 text-blue-200">
                    {requirementCounts.recommended}P
                  </span>
                )}
                {requirementCounts.optional > 0 && (
                  <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-medium bg-zinc-700/60 text-zinc-300">
                    {requirementCounts.optional}O
                  </span>
                )}
              </div>
            )}
            <Badge variant="secondary" className="text-xs tabular-nums">
              Hub {hubFilledCount}/{LISTING_IMAGE_SLOT_FIELDS.length}
            </Badge>
            <Badge variant="secondary" className="text-xs tabular-nums">
              Amazon {populatedCount}/{visibleAttributes.length || LISTING_IMAGE_SLOT_FIELDS.length}
            </Badge>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border">
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
              {/* Left — Hub / Drive uploads (thumb on right → faces Live) */}
              <div className="pl-4 pr-2 py-3 space-y-3">
                <div className="flex items-end justify-between gap-2">
                  <Link
                    href={designHref}
                    className="text-[10px] text-brand hover:underline shrink-0"
                  >
                    Manage in Design
                  </Link>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-foreground">Hub</p>
                    <p className="text-[10px] text-muted-foreground">
                      Design uploads · Drive
                    </p>
                  </div>
                </div>

                {hubLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading Drive images…
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {LISTING_IMAGE_SLOT_FIELDS.map((slotField) => {
                      const img = hubBySlot.get(slotField.slot);
                      return (
                        <HubImageRow
                          key={slotField.slot}
                          label={slotField.label}
                          slot={slotField.slot}
                          image={img}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right — Amazon CLR / live URLs (thumb on left → faces Hub) */}
              <div className="pl-2 pr-4 py-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">Live (Amazon)</p>
                  <p className="text-[10px] text-muted-foreground">
                    CLR / catalog image URLs
                  </p>
                </div>

                <div className="space-y-1.5">
                  {pairedRows.map((row) => (
                    <ImageUrlField
                      key={row.bqName}
                      label={row.hubLabel}
                      bqName={row.bqName}
                      value={getProductFieldValue(product, row.bqName) ?? ""}
                      readOnly={readOnly}
                      onSave={onSave}
                      onFieldSaved={onFieldSaved}
                      requirement={row.requirement}
                      description={row.description}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function HubImageRow({
  label,
  slot,
  image,
}: {
  label: string;
  slot: string;
  image: HubListingImage | undefined;
}) {
  const thumbSrc = image
    ? `/api/design/listing-images/image?driveFileId=${encodeURIComponent(image.driveFileId)}&thumb=1`
    : null;
  const fullSrc = image
    ? `/api/design/listing-images/image?driveFileId=${encodeURIComponent(image.driveFileId)}`
    : null;

  return (
    <div className="flex items-center gap-2.5 min-h-[88px] rounded-md border border-border/60 bg-muted/20 px-2 py-2">
      {/* Text + link on the left; thumb on the right so it sits next to Live Amazon thumbs */}
      {fullSrc ? (
        <a
          href={fullSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title="Open Hub image"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <span className="w-3.5 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            {slot}
          </span>
          <span className="text-xs text-foreground truncate">{label}</span>
        </div>
        {image ? (
          <p className="text-[10px] text-muted-foreground truncate">
            V{String(image.versionNumber).padStart(2, "0")}
            {image.displayName ? ` · ${image.displayName}` : ""}
            {image.status ? ` · ${image.status}` : ""}
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground/60">Not uploaded</p>
        )}
      </div>
      <a
        href={fullSrc ?? undefined}
        target={fullSrc ? "_blank" : undefined}
        rel={fullSrc ? "noopener noreferrer" : undefined}
        className="relative h-20 w-20 shrink-0 rounded border border-border bg-background overflow-hidden block"
        title={fullSrc ? "Open Hub image" : undefined}
        onClick={fullSrc ? undefined : (e) => e.preventDefault()}
      >
        {thumbSrc ? (
          <Image
            src={thumbSrc}
            alt=""
            fill
            className="object-contain"
            sizes="80px"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
          </div>
        )}
      </a>
    </div>
  );
}

type ImageUrlFieldProps = {
  label: string;
  bqName: string;
  value: string;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
  requirement: string | null;
  description: string | null;
};

function ImageUrlField({
  label,
  bqName,
  value,
  readOnly,
  onSave,
  onFieldSaved,
  requirement,
  description,
}: ImageUrlFieldProps) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const reqStyle = requirement ? REQ_CHIP_STYLES[requirement] : null;
  const showHelpCircle = description !== null;

  const doSave = useCallback(async () => {
    if (localValue === value) {
      setEditing(false);
      return;
    }
    setSaveState("saving");
    try {
      await onSave(bqName, localValue || null);
      onFieldSaved?.(bqName, label, value, localValue);
      setSaveState("saved");
      setTimeout(() => {
        setSaveState("idle");
        setEditing(false);
      }, 1500);
    } catch {
      toast.error(`Failed to update ${label}`);
      setLocalValue(value);
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2000);
    }
  }, [bqName, label, value, localValue, onSave, onFieldSaved]);

  return (
    <div className="flex items-center gap-2.5 min-h-[88px] rounded-md border border-border/60 bg-muted/10 px-2 py-2" id={`field-${bqName}`}>
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="relative h-20 w-20 shrink-0 rounded border border-border bg-muted overflow-hidden block"
          title="Open Amazon image"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-full w-full object-contain" />
        </a>
      ) : (
        <div className="h-20 w-20 shrink-0 rounded border border-dashed border-border/70 bg-muted/30 flex items-center justify-center">
          <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
        </div>
      )}

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
          {reqStyle && (
            <span
              className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${reqStyle.bg} ${reqStyle.text}`}
            >
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

        {editing ? (
          <div className="flex items-center gap-1 min-w-0 relative">
            <input
              ref={inputRef}
              type="url"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              onBlur={doSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") doSave();
                if (e.key === "Escape") {
                  setLocalValue(value);
                  setEditing(false);
                }
              }}
              className="h-6 px-1.5 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand flex-1 min-w-0"
              disabled={saveState === "saving"}
            />
            {saveState === "saving" && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
            )}
            {saveState === "saved" && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
            {saveState === "error" && <X className="h-3 w-3 text-destructive shrink-0" />}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            {value ? (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline truncate"
              >
                {value}
              </a>
            ) : (
              <span className="text-xs text-muted-foreground/50">—</span>
            )}
            {value && (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground ml-1"
              >
                edit
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

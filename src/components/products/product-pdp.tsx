"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  Trash2,
  ArrowLeftRight,
  Maximize2,
  ImagePlus,
  Image as ImageIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getProductFieldValue } from "@/lib/product-mapper";
import { ImageUrlDialog } from "./image-url-dialog";
import { ImageLightbox } from "./image-lightbox";
import type { Product } from "@/lib/db/schema";

// ── Image slots ──

const IMAGE_SLOTS = [
  { bqName: "MainImageURL", label: "Main" },
  { bqName: "OtherImageURL1", label: "Image 2" },
  { bqName: "OtherImageURL2", label: "Image 3" },
  { bqName: "OtherImageURL3", label: "Image 4" },
  { bqName: "OtherImageURL4", label: "Image 5" },
  { bqName: "OtherImageURL5", label: "Image 6" },
  { bqName: "OtherImageURL6", label: "Image 7" },
  { bqName: "OtherImageURL7", label: "Image 8" },
  { bqName: "OtherImageURL8", label: "Image 9" },
] as const;

// ── Types ──

type FamilyMember = {
  id: string;
  asin: string | null;
  sku: string | null;
  parentSku: string | null;
  parentAsin: string | null;
  parentageLevel: string | null;
  clientIdCode: string | null;
  marketplace: string | null;
  status: string | null;
  brandName: string | null;
  itemName: string | null;
  /** Amazon's "Item Highlight" — the grey line shown under the title on the live PDP. */
  itemHighlight?: string | null;
  summarizedTitle: string | null;
  listPrice: string | null;
  mainImageUrl: string | null;
  isDirty: boolean;
  variations: Record<string, string> | null;
};

type FamilyResponse = {
  parent: FamilyMember | null;
  children: FamilyMember[];
  currentId: string;
  variationTheme: string | null;
};

// ── Helpers ──

const VARIATION_META_KEYS = new Set([
  "VariationThemeName",
  "VariationID",
  "ParentageLevel",
  "parentage_level",
]);

function findDistinguishingKey(children: FamilyMember[]): string | null {
  if (children.length < 2) return null;
  const allKeys = new Set<string>();
  for (const child of children) {
    if (!child.variations) continue;
    for (const k of Object.keys(child.variations)) {
      if (!VARIATION_META_KEYS.has(k)) allKeys.add(k);
    }
  }
  for (const key of allKeys) {
    const values = new Set<string>();
    for (const child of children) {
      const val = child.variations?.[key];
      if (val) values.add(val);
    }
    if (values.size > 1) return key;
  }
  return null;
}

function getVariationLabel(
  member: FamilyMember,
  distinguishingKey: string | null,
  theme: string | null
): string {
  if (!member.variations) return member.asin || "—";
  if (distinguishingKey && member.variations[distinguishingKey]) {
    return member.variations[distinguishingKey];
  }
  if (theme) {
    const keys = [theme, `${theme}Name`, `${theme}Map`];
    for (const key of keys) {
      if (member.variations[key]) return member.variations[key];
    }
  }
  return member.asin || "—";
}

function formatPrice(raw: string | null): string | null {
  if (!raw) return null;
  const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return raw;
  const dollars = Math.floor(num);
  const cents = Math.round((num - dollars) * 100)
    .toString()
    .padStart(2, "0");
  return `${dollars}.${cents}`;
}

// ── PdpCollapsible ──

function PdpCollapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[var(--pdp-border)] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-bold text-[var(--pdp-text)]">{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-[var(--pdp-secondary-text)] shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--pdp-secondary-text)] shrink-0" />
        )}
      </button>
      {open && <div className="px-6 pb-4">{children}</div>}
    </div>
  );
}

// ── Component ──

type Props = {
  product: Product;
  productId: string;
  readOnly?: boolean;
  familyEnabled?: boolean;
  /** Start with the Product Detail Page section open (the SEO review page wants it visible). */
  defaultExpanded?: boolean;
  /** Name for the "Visit the … Store" line — the client name; falls back to the product's brand. */
  storeName?: string | null;
  /** Hub Design → Listing Images by field (MainImageURL, OtherImageURL1..8). An uploaded image wins over the
   *  product's Amazon image URL for its slot; slots with no upload fall back to the Amazon URL. */
  listingImages?: Record<string, string>;
  /** Limit the variation buttons to these ASINs (one button each) — e.g. the ASINs an SEO revision covers. */
  variationAsins?: string[];
  /** Variation buttons switch in place (by ASIN) instead of linking to /products/<id>. */
  onSelectAsin?: (asin: string) => void;
  /** SEO review: show only the SEO fields (title, item highlight, bullets, description) — hide catalog-attribute sections. */
  seoOnly?: boolean;
  /** Wrap an SEO field (revision key: Title, ItemHighlight, DetailedBulletPoint_N, ProductDescription) — e.g. to comment on it in place. */
  annotate?: (fieldKey: string, node: React.ReactNode) => React.ReactNode;
  /** Render SEO text (title, item highlight, bullets, description) — e.g. with keywords highlighted. */
  highlightText?: (text: string) => React.ReactNode;
  onSave?: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (
    bqName: string,
    label: string,
    oldValue: string,
    newValue: string
  ) => void;
};

export function ProductPdp({ product, productId, readOnly, familyEnabled = true, defaultExpanded = false, storeName: storeNameProp, listingImages, variationAsins, onSelectAsin, seoOnly = false, annotate, highlightText, onSave, onFieldSaved }: Props) {
  const hl = (text: string) => (highlightText ? highlightText(text) : text);
  const wrap = (key: string, node: React.ReactNode) => (annotate ? annotate(key, node) : node);
  // Fetch family for variation selectors
  const { data: family } = useQuery<FamilyResponse>({
    queryKey: ["product-family", productId],
    enabled: familyEnabled,
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/family`);
      if (!res.ok) throw new Error("Failed to fetch family");
      return res.json();
    },
  });

  // ── Field values ──
  const title = product.itemName || "Untitled Product";
  const price = formatPrice(product.listPrice);
  const size = getProductFieldValue(product, "Size");
  const brandName = product.brandName;
  const storeName = storeNameProp || brandName;

  // Bullet points
  const bullets = useMemo(() => {
    // Keep each bullet's slot number so comments attach to the right one
    const items: { slot: number; text: string }[] = [];
    for (let i = 1; i <= 5; i++) {
      const val = getProductFieldValue(product, `DetailedBulletPoint${i}`);
      if (val) items.push({ slot: i, text: val });
    }
    return items;
  }, [product]);

  // Product description
  const productDescription = getProductFieldValue(product, "ProductDescription");

  // Concise bullet points
  const conciseBullets = useMemo(() => {
    const items: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const val = getProductFieldValue(product, `ConciseBulletPoint${i}`);
      if (val) items.push(val);
    }
    return items;
  }, [product]);

  // Key features
  const keyFeatures = useMemo(() => {
    const items: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const val = getProductFieldValue(product, `KeyFeature${i}`);
      if (val) items.push(val);
    }
    return items;
  }, [product]);

  // Item details
  const itemDetails = useMemo(() => {
    const rows: { label: string; value: string }[] = [];
    const specFields: [string, string][] = [
      ["Brand Name", "BrandName"],
      ["Manufacturer", "Manufacturer"],
      ["Item Weight", "ItemWeight"],
      ["Package Weight", "PackageWeight"],
      ["Item Dimensions", "ItemDimensions"],
      ["Package Dimensions", "PackageDimensions"],
      ["ASIN", "ASIN"],
      ["UPC", "UPC"],
      ["EAN", "EAN"],
      ["Model Number", "ModelNumber"],
      ["Part Number", "PartNumber"],
      ["Country of Origin", "CountryOfOrigin"],
      ["Material", "Material"],
      ["Number of Items", "NumberOfItems"],
      ["Unit Count", "UnitCount"],
      ["Ingredients", "Ingredients"],
      ["Allergen Information", "AllergenInformation"],
    ];
    for (const [label, bqName] of specFields) {
      const val = getProductFieldValue(product, bqName);
      if (val) rows.push({ label, value: val });
    }
    return rows;
  }, [product]);

  // Variation theme & children
  const variationTheme = family?.variationTheme || null;
  const familyChildren = family?.children || [];
  // Limited to the given ASINs: one entry per ASIN (this product's own row wins for its ASIN)
  const children = useMemo(() => {
    if (!variationAsins) return familyChildren;
    const allowed = new Set(variationAsins);
    const byAsin = new Map<string, FamilyMember>();
    for (const c of familyChildren) {
      if (!c.asin || !allowed.has(c.asin)) continue;
      if (!byAsin.has(c.asin) || c.id === productId) byAsin.set(c.asin, c);
    }
    return [...byAsin.values()];
  }, [familyChildren, variationAsins, productId]);
  const isCurrentChild = (c: FamilyMember) => (variationAsins ? c.asin === product.asin : c.id === productId);
  const hasVariations = variationAsins ? children.length > 1 : children.length > 0;
  const distinguishingKey = useMemo(
    () => findDistinguishingKey(children),
    [children]
  );

  // Top highlights
  const topHighlights = useMemo(() => {
    const rows: { label: string; value: string }[] = [];
    const fields: [string, string][] = [
      ["Brand", "BrandName"],
      ["Product Type", "ProductType"],
      ["Item Type", "ItemTypeKeyword"],
      ["Feed Product Type", "FeedProductType"],
    ];
    for (const [label, bqName] of fields) {
      const val = getProductFieldValue(product, bqName);
      if (val) rows.push({ label, value: val });
    }
    if (variationTheme) {
      const currentChild = children.find((c) => c.id === productId);
      if (currentChild) {
        const val = getVariationLabel(currentChild, distinguishingKey, variationTheme);
        if (val && val !== currentChild.asin) {
          rows.splice(1, 0, { label: variationTheme, value: val });
        }
      }
    }
    if (size) rows.push({ label: "Size", value: size });
    return rows;
  }, [product, variationTheme, children, productId, distinguishingKey, size]);

  // ── Image Gallery State ──
  const slotData = useMemo(() => {
    return IMAGE_SLOTS.map((slot) => {
      const url = listingImages?.[slot.bqName] || getProductFieldValue(product, slot.bqName) || "";
      return { ...slot, url };
    });
  }, [product, listingImages]);

  const filledCount = slotData.filter((s) => s.url).length;
  const [pdpExpanded, setPdpExpanded] = useState(defaultExpanded);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editSlot, setEditSlot] = useState<(typeof IMAGE_SLOTS)[number] | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [swapMode, setSwapMode] = useState<number | null>(null);

  const selectedSlot = slotData[selectedIdx];
  const displayUrl = selectedSlot?.url || "";

  const filledImages = useMemo(
    () => slotData.filter((s) => s.url).map((s) => ({ url: s.url, label: s.label })),
    [slotData]
  );

  const handleEditUrl = useCallback(
    async (url: string) => {
      if (!editSlot || !onSave) return;
      const oldVal = getProductFieldValue(product, editSlot.bqName) || "";
      const newVal = url.trim() || null;
      await onSave(editSlot.bqName, newVal);
      onFieldSaved?.(editSlot.bqName, editSlot.label, oldVal, newVal ?? "");
      toast.success(`Saved ${editSlot.label}`);
      setEditSlot(null);
    },
    [editSlot, product, onSave, onFieldSaved]
  );

  const handleClear = useCallback(
    async (idx: number) => {
      if (!onSave) return;
      const slot = slotData[idx];
      if (!slot.url) return;
      const oldVal = slot.url;
      await onSave(slot.bqName, null);
      onFieldSaved?.(slot.bqName, slot.label, oldVal, "");
      toast.success(`Cleared ${slot.label}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await onSave(slot.bqName, oldVal);
            onFieldSaved?.(slot.bqName, slot.label, "", oldVal);
            toast.info(`Restored ${slot.label}`);
          },
        },
        duration: 5000,
      });
    },
    [slotData, onSave, onFieldSaved]
  );

  const handleSwap = useCallback(
    async (targetIdx: number) => {
      if (!onSave || swapMode === null || swapMode === targetIdx) {
        setSwapMode(null);
        return;
      }
      const slotA = slotData[swapMode];
      const slotB = slotData[targetIdx];
      await onSave(slotA.bqName, slotB.url || null);
      await onSave(slotB.bqName, slotA.url || null);
      onFieldSaved?.(slotA.bqName, slotA.label, slotA.url, slotB.url);
      onFieldSaved?.(slotB.bqName, slotB.label, slotB.url, slotA.url);
      toast.success(`Swapped ${slotA.label} and ${slotB.label}`);
      setSwapMode(null);
    },
    [swapMode, slotData, onSave, onFieldSaved]
  );

  const handleThumbnailClick = useCallback(
    (idx: number) => {
      if (swapMode !== null) {
        handleSwap(idx);
      } else {
        setSelectedIdx(idx);
      }
    },
    [swapMode, handleSwap]
  );

  const openLightbox = useCallback(() => {
    if (!displayUrl) return;
    const idx = filledImages.findIndex((img) => img.url === displayUrl);
    setLightboxIdx(idx >= 0 ? idx : 0);
  }, [displayUrl, filledImages]);

  return (
    <div className="rounded-lg border border-[var(--pdp-border)] bg-[var(--pdp-bg)] text-[var(--pdp-text)] overflow-hidden font-ember">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setPdpExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--pdp-border)]/30 transition-colors"
      >
        {pdpExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-[var(--pdp-secondary-text)]" /> : <ChevronRight className="h-4 w-4 shrink-0 text-[var(--pdp-secondary-text)]" />}
        <span className="text-sm font-semibold">Product Detail Page</span>
        <span className="text-[10px] text-[var(--pdp-secondary-text)] ml-auto tabular-nums">{filledCount}/{IMAGE_SLOTS.length} images</span>
      </button>
      {pdpExpanded && <><div className="flex flex-col lg:flex-row">
        {/* ── Left: Image Gallery ── */}
        <div className="lg:w-[420px] shrink-0 p-4 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-[var(--pdp-secondary-text)]" />
              <span className="text-xs font-semibold text-[var(--pdp-text)]">Images</span>
            </div>
            <Badge variant="secondary" className="text-[10px] tabular-nums px-1.5 py-0">
              {filledCount}/{IMAGE_SLOTS.length}
            </Badge>
          </div>

          {/* Main image */}
          <div className="relative flex-1 flex items-center justify-center bg-[var(--pdp-bg)] min-h-[300px] rounded-md border border-[var(--pdp-border)]">
            {displayUrl ? (
              <>
                <img
                  src={displayUrl}
                  alt={title}
                  className="max-h-[340px] max-w-full object-contain cursor-zoom-in"
                  onClick={openLightbox}
                />
                <button
                  type="button"
                  onClick={openLightbox}
                  className="absolute top-2 right-2 p-1.5 rounded bg-black/40 text-white hover:bg-black/60 transition-colors"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <div className="text-center text-[var(--pdp-secondary-text)]">
                <ImagePlus className="h-8 w-8 mx-auto mb-1.5 opacity-50" />
                <p className="text-xs">No image</p>
                {!readOnly && onSave && (
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded border border-[var(--pdp-border)] text-[var(--pdp-secondary-text)] hover:bg-gray-100 transition-colors"
                    onClick={() => setEditSlot(IMAGE_SLOTS[selectedIdx])}
                  >
                    Add URL
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          <div className="flex items-center gap-1.5 mt-3">
            {slotData.map((slot, idx) => (
              <TooltipProvider key={slot.bqName} delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleThumbnailClick(idx)}
                      className={`relative h-10 w-10 rounded border overflow-hidden cursor-pointer transition-all shrink-0 ${
                        swapMode !== null
                          ? swapMode === idx
                            ? "border-orange-400 ring-2 ring-orange-400 scale-105"
                            : "border-dashed border-[var(--pdp-border)] hover:border-orange-500/30"
                          : idx === selectedIdx
                            ? "border-orange-400 ring-1 ring-orange-400"
                            : "border-[var(--pdp-border)] hover:border-orange-500/30"
                      }`}
                    >
                      {slot.url ? (
                        <img
                          src={slot.url}
                          alt={slot.label}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-[var(--pdp-border)]">
                          <ImagePlus className="h-3 w-3 text-[var(--pdp-secondary-text)] opacity-50" />
                        </div>
                      )}
                      <span className="absolute bottom-0 right-0 bg-black/50 text-white text-[8px] px-0.5 leading-relaxed rounded-tl">
                        {idx === 0 ? "M" : idx + 1}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {slot.label}
                    {swapMode !== null && swapMode !== idx && " (click to swap)"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>

          {/* Edit controls */}
          {!readOnly && onSave && (
            <div className="flex items-center gap-1.5 mt-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 h-6 px-2 text-[10px] font-medium rounded border border-[var(--pdp-border)] text-[var(--pdp-secondary-text)] hover:bg-gray-100 transition-colors"
                onClick={() => setEditSlot(IMAGE_SLOTS[selectedIdx])}
              >
                <Edit3 className="h-3 w-3" />
                Edit
              </button>
              <button
                type="button"
                className={`inline-flex items-center gap-1 h-6 px-2 text-[10px] font-medium rounded border transition-colors ${
                  swapMode !== null
                    ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600"
                    : "border-[var(--pdp-border)] text-[var(--pdp-secondary-text)] hover:bg-gray-100"
                }`}
                onClick={() => setSwapMode(swapMode !== null ? null : selectedIdx)}
              >
                <ArrowLeftRight className="h-3 w-3" />
                {swapMode !== null ? "Cancel" : "Swap"}
              </button>
              {displayUrl && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 h-6 px-2 text-[10px] font-medium rounded border border-[var(--pdp-border)] text-red-500 hover:bg-red-50 transition-colors"
                  onClick={() => handleClear(selectedIdx)}
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              )}
              <span className="ml-auto text-[10px] text-[var(--pdp-secondary-text)] truncate">
                {selectedSlot.label}
              </span>
            </div>
          )}
        </div>

        {/* ── Right: Product Details ── */}
        <div className="flex-1 p-6 border-l border-[var(--pdp-border)] space-y-4 min-w-0">
          {/* Title */}
          {wrap("Title", (
            <h1 className="text-2xl font-normal leading-snug text-[var(--pdp-text)]">
              {hl(title)}
            </h1>
          ))}
          {product.itemHighlight && wrap("ItemHighlight", (
            <p data-testid="pdp-item-highlight" className="!mt-1 text-sm leading-snug text-[var(--pdp-secondary-text)]">
              {hl(product.itemHighlight)}
            </p>
          ))}

          {/* Brand */}
          {storeName && (
            <p className="text-sm">
              Visit the{" "}
              <span className="text-[var(--pdp-link)]">{storeName} Store</span>
            </p>
          )}

          <hr className="border-[var(--pdp-border)]" />

          {/* Price */}
          {price && (
            <span className="text-[28px] font-normal text-[var(--pdp-text)] leading-none">
              ${price}
            </span>
          )}

          {/* Variation Selectors */}
          {hasVariations && variationTheme && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--pdp-text)]">
                <span className="font-bold">{variationTheme}:</span>{" "}
                {getVariationLabel(
                  children.find(isCurrentChild) || children[0],
                  distinguishingKey,
                  variationTheme
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {children.map((child) => {
                  const isCurrent = isCurrentChild(child);
                  const label = getVariationLabel(child, distinguishingKey, variationTheme);
                  const cls = `flex flex-col items-start rounded-lg border px-3 py-2 text-xs transition-colors min-w-[80px] ${
                    isCurrent
                      ? "border-[var(--pdp-link)] bg-[var(--pdp-link)]/15 shadow-sm"
                      : "border-[var(--pdp-border)] hover:border-[var(--pdp-link)] bg-[var(--pdp-bg)]"
                  }`;
                  const inner = (
                    <>
                      <span className={`font-medium ${isCurrent ? "text-[var(--pdp-link)]" : "text-[var(--pdp-text)]"}`}>
                        {label}
                      </span>
                      {child.listPrice && (
                        <span className="text-[var(--pdp-secondary-text)] mt-0.5">
                          ${formatPrice(child.listPrice)}
                        </span>
                      )}
                    </>
                  );
                  return onSelectAsin ? (
                    <button key={child.id} type="button" className={cls} onClick={() => child.asin && onSelectAsin(child.asin)}>{inner}</button>
                  ) : (
                    <Link key={child.id} href={`/products/${child.id}`} className={cls}>{inner}</Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Size */}
          {size && (
            <div>
              <p className="text-sm text-[var(--pdp-text)]">
                <span className="font-bold">Size:</span> {size}
              </p>
            </div>
          )}

          <hr className="border-[var(--pdp-border)]" />

          {/* About this item */}
          {bullets.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-base font-bold text-[var(--pdp-text)]">
                About this item
              </h3>
              <ul className="list-disc pl-5 space-y-1.5">
                {bullets.map((bp) => (
                  <li key={bp.slot} className="text-sm text-[var(--pdp-text)] leading-relaxed">
                    {wrap(`DetailedBulletPoint_${bp.slot}`, hl(bp.text))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ── Below-the-fold sections ── */}
      <div className="border-t border-[var(--pdp-border)]">
        {!seoOnly && topHighlights.length > 0 && (
          <PdpCollapsible title="Top Highlights" defaultOpen>
            <table className="w-full text-sm">
              <tbody>
                {topHighlights.map(({ label, value }) => (
                  <tr key={label} className="border-b border-[var(--pdp-border)] last:border-0">
                    <td className="py-1.5 pr-4 text-[var(--pdp-secondary-text)] font-medium whitespace-nowrap align-top w-[140px]">
                      {label}
                    </td>
                    <td className="py-1.5 text-[var(--pdp-text)]">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdpCollapsible>
        )}

        {productDescription && (
          <PdpCollapsible title="Product Description" defaultOpen>
            {wrap("ProductDescription", (
              <p className="text-sm text-[var(--pdp-text)] leading-relaxed whitespace-pre-line">
                {hl(productDescription)}
              </p>
            ))}
          </PdpCollapsible>
        )}

        {!seoOnly && keyFeatures.length > 0 && (
          <PdpCollapsible title="Key Features">
            <ul className="list-disc pl-5 space-y-1.5">
              {keyFeatures.map((kf, i) => (
                <li key={i} className="text-sm text-[var(--pdp-text)] leading-relaxed">
                  {kf}
                </li>
              ))}
            </ul>
          </PdpCollapsible>
        )}

        {!seoOnly && conciseBullets.length > 0 && (
          <PdpCollapsible title="Concise Bullet Points">
            <ul className="list-disc pl-5 space-y-1.5">
              {conciseBullets.map((cb, i) => (
                <li key={i} className="text-sm text-[var(--pdp-text)] leading-relaxed">
                  {cb}
                </li>
              ))}
            </ul>
          </PdpCollapsible>
        )}

        {!seoOnly && itemDetails.length > 0 && (
          <PdpCollapsible title="Item Details">
            <table className="w-full text-sm">
              <tbody>
                {itemDetails.map(({ label, value }) => (
                  <tr key={label} className="border-b border-[var(--pdp-border)] last:border-0">
                    <td className="py-1.5 pr-4 text-[var(--pdp-secondary-text)] font-medium whitespace-nowrap align-top w-[180px]">
                      {label}
                    </td>
                    <td className="py-1.5 text-[var(--pdp-text)] break-words">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdpCollapsible>
        )}
      </div></>}

      {/* Edit URL dialog */}
      {onSave && (
        <ImageUrlDialog
          open={editSlot !== null}
          onOpenChange={(open) => !open && setEditSlot(null)}
          slotLabel={editSlot?.label ?? ""}
          currentUrl={
            editSlot
              ? getProductFieldValue(product, editSlot.bqName) || ""
              : ""
          }
          onSave={handleEditUrl}
        />
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && filledImages.length > 0 && (
        <ImageLightbox
          images={filledImages}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}

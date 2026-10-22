"use client";

import { useCallback, useMemo, useState } from "react";

function getLogicalSubgroup(fieldName: string): string {
  const f = fieldName.toLowerCase();
  if (
    f.includes("productdescription") ||
    f.includes("shortdescription") ||
    f.includes("bulletpoint") ||
    f.includes("keyword") ||
    f.includes("keyfeature") ||
    f.includes("generic") ||
    f.includes("concise")
  ) {
    return "SEO & Content";
  }
  if (
    f.includes("lifestyle") ||
    f.includes("colormap") ||
    f.includes("pattern") ||
    f.includes("edition") ||
    f.includes("designname") ||
    f.includes("ringsize") ||
    f.includes("itemshape") ||
    f.includes("suitablehaircolor") ||
    f.includes("targetgender") ||
    f.includes("collectionname") ||
    f.includes("material") ||
    f.includes("fabric")
  ) {
    return "Physical & Design";
  }
  if (
    f.includes("shelflife") ||
    f.includes("fulfillmentcenter") ||
    f.includes("expirable") ||
    f.includes("expiration") ||
    f.includes("meltingtemperature") ||
    f.includes("releasedate") ||
    f.includes("productsitelaunch")
  ) {
    return "Logistics & Expiration";
  }
  if (
    f.includes("unitcount") ||
    f.includes("numberofitems") ||
    f.includes("configuration") ||
    f.includes("setname") ||
    f.includes("itemcount") ||
    f.includes("quantity")
  ) {
    return "Quantity & Config";
  }
  if (
    f.includes("hairtype") ||
    f.includes("hairconditioner") ||
    f.includes("skin cleaning") ||
    f.includes("container") ||
    f.includes("labeler") ||
    f.includes("partnumber") ||
    f.includes("component") ||
    f.includes("included")
  ) {
    return "Industry Specifics";
  }
  if (
    f.includes("safety") ||
    f.includes("pesticide") ||
    f.includes("battery") ||
    f.includes("fcc") ||
    f.includes("warning") ||
    f.includes("hazard") ||
    f.includes("toxic") ||
    f.includes("fire") ||
    f.includes("chemical") ||
    f.includes("compliance") ||
    f.includes("certification") ||
    f.includes("test")
  ) {
    return "Compliance & Safety";
  }
  if (
    f.includes("weight") ||
    f.includes("dimension") ||
    f.includes("length") ||
    f.includes("width") ||
    f.includes("height") ||
    f.includes("depth") ||
    f.includes("volume") ||
    f.includes("itemweight") ||
    f.includes("volumetric")
  ) {
    return "Measures & Dimensions";
  }
  return "Components & Material";
}
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ArrowLeft, Eye, Check, Undo2, LayoutTemplate } from "lucide-react";
import Link from "next/link";
import { ProductSection } from "./product-section";
import { ProductField } from "./product-field";
import { ListingIdentitySection } from "./listing-identity-section";
import { ProductIdentitySection } from "./product-identity-section";
import { VariationSection } from "./variation-section";
import { DimensionsSection, DIMENSIONS_SECTION_FIELDS } from "./dimensions-section";
import { CommentSummary } from "./comment-summary";
import { FieldSearch } from "./field-search";
import { ProductDetailsSubCard } from "./product-details-sub-card";
import { VarietyPackCard } from "./variety-pack-section";
import { SeoSection } from "./seo-section";
import { SeoRevisionLine } from "./seo-revision-line";
import { OfferSection } from "./offer-section";
import { ImagesSection } from "./images-section";
import { ComplianceSection } from "./compliance-section";
import { IngredientsNutritionSection } from "./ingredients-nutrition-section";
import { ApparelStyleSection } from "./apparel-style-section";
import { MaterialsSection } from "./materials-section";
import { FoodAttributesSection } from "./food-attributes-section";
import { TechnicalSpecsSection } from "./technical-specs-section";
import { PetAttributesSection } from "./pet-attributes-section";
import { SportRecreationSection } from "./sport-recreation-section";
import { PublicationSection } from "./publication-section";
import { SpecificationsSection } from "./specifications-section";
import { TargetAudienceSection } from "./target-audience-section";
import { StorageShelfLifeSection } from "./storage-shelf-life-section";
import { ItemDetailsSection } from "./item-details-section";
import { SafetyComplianceSection } from "./safety-compliance-section";
import { ManufacturingSection } from "./manufacturing-section";
import { ProductDetailsSection } from "./product-details-section";
import { EditListingShell, EditListingSection } from "./edit-listing-shell";
import { useCategoryDefinition } from "@/hooks/use-category-definition";
import type { AmazonFieldMeta } from "./product-field";
import { CORE_COLUMNS } from "@/lib/column-registry";
import { COMPUTED_FIELDS } from "@/lib/computed-fields";
import { getProductFieldValue } from "@/lib/product-mapper";
import { getAttributeRequirement } from "@/lib/category-requirement";
import { inferFieldType, getFieldMaxLength, getSelectOptions } from "@/lib/column-utils";
import {
  useColumnAttributes,
  type EnrichedAttribute,
} from "@/hooks/use-column-attributes";
import { RequirementLevel, PRODUCT_IDENTITY_DESCRIPTIONS } from "@/lib/constants";
import type { Product } from "@/lib/db/schema";

const EDIT_LISTING_NAV = [
  { id: "product-identity", label: "Product Identity" },
  { id: "description", label: "Description" },
  { id: "images", label: "Images" },
  { id: "dimensions-shipping", label: "Dimensions & Shipping" },
  { id: "product-details", label: "Other Details" },
  { id: "offer", label: "Offer" },
  { id: "safety-compliance", label: "Safety & Compliance" },
] as const;

type FieldEdit = {
  bqName: string;
  label: string;
  oldValue: string;
  newValue: string;
  savedAt: Date;
};

/**
 * Find the common prefix/suffix between two strings and return segments
 * so only the changed middle part can be highlighted.
 */
function diffHighlight(
  oldStr: string,
  newStr: string
): { old: { prefix: string; changed: string; suffix: string }; new: { prefix: string; changed: string; suffix: string } } {
  let prefixLen = 0;
  const minLen = Math.min(oldStr.length, newStr.length);
  while (prefixLen < minLen && oldStr[prefixLen] === newStr[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    oldStr[oldStr.length - 1 - suffixLen] === newStr[newStr.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefix = oldStr.slice(0, prefixLen);
  const oldChanged = oldStr.slice(prefixLen, oldStr.length - suffixLen);
  const newChanged = newStr.slice(prefixLen, newStr.length - suffixLen);
  const suffix = oldStr.slice(oldStr.length - suffixLen);

  return {
    old: { prefix, changed: oldChanged, suffix },
    new: { prefix, changed: newChanged, suffix },
  };
}

/** Fields already shown in the dedicated ImageGallery — skip in data-driven groups */
const IMAGE_SECTION_FIELDS = new Set([
  "MainImageURL",
  "OtherImageURL1", "OtherImageURL2", "OtherImageURL3", "OtherImageURL4",
  "OtherImageURL5", "OtherImageURL6", "OtherImageURL7", "OtherImageURL8",
  "SwatchImageURL",
]);

/** Fields already shown in the dedicated ProductSeoSection — skip in data-driven groups */
const SEO_SECTION_FIELDS = new Set([
  "SEOVersionNumber", "ItemName",
  "DetailedBulletPoint1", "DetailedBulletPoint2", "DetailedBulletPoint3",
  "DetailedBulletPoint4", "DetailedBulletPoint5",
  "ProductDescription",
  "GenericKeyword1", "GenericKeyword2", "GenericKeyword3",
  "GenericKeyword4", "GenericKeyword5",
  "ConciseBulletPoint1", "ConciseBulletPoint2", "ConciseBulletPoint3",
  "ConciseBulletPoint4", "ConciseBulletPoint5",
  "PA_LIBulletPoint1", "PA_LIBulletPoint2", "PA_LIBulletPoint3",
  "PA_LIBulletPoint4", "PA_LIBulletPoint5",
  "KeyFeature1", "KeyFeature2", "KeyFeature3",
  "KeyFeature4", "KeyFeature5",
]);

/** Fields already shown in ListingIdentitySection — skip in data-driven groups */
const LISTING_IDENTITY_FIELDS = new Set([
  "Status", "UUID", "ASIN", "SKU", "SummarizedTitle",
  "AmazonPDPURL", "WebsitePDPURL", "ClientIDCode",
  "Marketplace", "Country", "IntentwiseID",
  "Action", "RegionOfOrigin", "Region of Origin", "CountryOfOrigin",
]);

/** Fields already shown in ProductIdentitySection or VariationSection — skip in data-driven groups */
const PRODUCT_IDENTITY_FIELDS = new Set([
  "BrandName", "Manufacturer", "ProductIdType", "ProductId",
  "ProductType", "ItemTypeKeyword", "FeedProductType",
  "VariationID", "VariationThemeName", "VariationProduct",
  "ChildRelationshipType", "ParentageLevel", "ParentSKU", "ParentASIN",
  "Color", "Flavor", "Size", "Style",
]);

/** Amazon Category groups handled by the dedicated Dimensions & Shipping section */
const EXCLUDE_CATEGORY_GROUPS = new Set(["Shipping", "Product Details"]);

/** Reference groups that default to expanded (none — all start collapsed) */
const DEFAULT_EXPANDED_GROUPS = new Set<string>();

type Props = {
  productId: string;
  from?: string;
  fromMarketplace?: string;
  fromSet?: string;
  fromVariationId?: string;
};

type ProductWithComments = Product & {
  _commentCounts?: Record<string, { total: number; open: number }>;
  _aacData?: { intentwiseId: string | null; marketplace: string | null; country: string | null; brandName: string | null; brandURL: string | null; clientName: string | null };
  _parentInfo?: { sku: string | null; asin: string | null } | null;
  _variationName?: string | null;
  _flavor?: string | null;
  _size?: string | null;
};

async function fetchProduct(id: string): Promise<ProductWithComments> {
  const res = await fetch(`/api/products/${id}`);
  if (!res.ok) throw new Error("Failed to fetch product");
  return res.json();
}

export function ProductDetailForm({ productId, from, fromMarketplace, fromSet, fromVariationId }: Props) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const isReadOnly = session?.user?.role === "viewer";
  const [showAll, setShowAll] = useState(false);
  const [activeRequirementFilters, setActiveRequirementFilters] = useState<Set<RequirementLevel>>(new Set());

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => fetchProduct(productId),
  });

  // Fetch column attributes
  const clientCode = product?.clientIdCode || undefined;
  const { groups, byGeneralLabel, isLoading: attrsLoading } =
    useColumnAttributes(clientCode);

  // Per-product requirement levels from categoryMeta keyed off product.productType
  const requirementByLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const attr of byGeneralLabel.values()) {
      const r = getAttributeRequirement(attr, product?.productType);
      if (r) m.set(attr.generalLabel, r);
    }
    return m;
  }, [byGeneralLabel, product?.productType]);

  // If product has no productType, try to find one from the client's category definitions
  const { data: clientCategoryDefs } = useQuery({
    queryKey: ["category-definitions-list", clientCode],
    queryFn: async () => {
      const res = await fetch(`/api/category-definitions?clientIdCode=${clientCode}`);
      if (!res.ok) return { definitions: [] };
      return res.json() as Promise<{ definitions: { productType: string }[] }>;
    },
    enabled: !!clientCode && !product?.productType,
    staleTime: 10 * 60 * 1000,
  });

  const effectiveProductType =
    product?.productType ||
    clientCategoryDefs?.definitions?.[0]?.productType ||
    undefined;

  // Fetch Amazon category definition — don't pass marketplace domain (e.g. "amazon.com"),
  // let the API default to the marketplace ID "ATVPDKIKX0DER"
  const { groups: categoryGroups } = useCategoryDefinition(
    effectiveProductType,
    clientCode,
    productId,
    undefined
  );

  // Build lookup: bibleFieldMatch (generalLabel) → AmazonFieldMeta
  const amazonMetaByField = useMemo(() => {
    const map = new Map<string, AmazonFieldMeta>();
    for (const group of categoryGroups) {
      for (const attr of group.attributes) {
        if (attr.bibleFieldMatch) {
          map.set(attr.bibleFieldMatch, {
            amazonFieldName: attr.amazonFieldName,
            localLabel: attr.localLabel,
            requirement: attr.requirement,
            description: attr.description,
            example: attr.example,
            validValues: attr.validValues,
          });
        }
      }
    }
    return map;
  }, [categoryGroups]);

  // Session edit tracking
  const [fieldEdits, setFieldEdits] = useState<Map<string, FieldEdit>>(
    new Map()
  );

  const onFieldSaved = useCallback(
    (bqName: string, fieldLabel: string, oldValue: string, newValue: string) => {
      setFieldEdits((prev) => {
        const next = new Map(prev);
        next.set(bqName, {
          bqName,
          label: fieldLabel,
          oldValue,
          newValue,
          savedAt: new Date(),
        });
        return next;
      });
    },
    []
  );

  const revertMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/products/${productId}/revert`, {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to revert");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setFieldEdits(new Map());
      toast.success(`Reverted ${data.reverted} field(s) to original values`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      bqName,
      value,
      field,
    }: {
      bqName: string;
      value: string | null;
      field: string | null;
    }) => {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value, bqName }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const handleSave = useCallback(
    async (bqName: string, value: string | null): Promise<void> => {
      // Enforce ASIN must be exactly 10 characters
      if ((bqName === "ASIN" || bqName === "ParentASIN") && value != null && value.length !== 10) {
        toast.error("ASIN must be exactly 10 characters");
        throw new Error("ASIN must be exactly 10 characters");
      }
      const coreDef = CORE_COLUMNS.find((c) => c.bqName === bqName);
      await saveMutation.mutateAsync({
        bqName,
        value,
        field: coreDef?.coreField ?? null,
      });
    },
    [saveMutation]
  );

  // Section expansion tracking (for jump-to-field)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );
const handleSectionExpandedChange = useCallback(
    (sectionName: string, expanded: boolean) => {
      setExpandedSections((prev) => {
        const next = new Set(prev);
        if (expanded) next.add(sectionName);
        else next.delete(sectionName);
        return next;
      });
    },
    []
  );

  const handleSelectField = useCallback(
    (bqName: string, referenceGroup: string) => {
      // Expand the target section
      setExpandedSections((prev) => {
        const next = new Set(prev);
        next.add(referenceGroup);
        return next;
      });

      // Wait for DOM update, then scroll and focus
      requestAnimationFrame(() => {
        setTimeout(() => {
          // Try the field input first (for SEO fields that use bqName directly)
          const inputEl = document.querySelector<HTMLElement>(
            `[data-field-bq="${bqName}"]`
          );
          // Fall back to the wrapper div
          const wrapperEl = document.getElementById(`field-${bqName}`);
          const targetEl = inputEl || wrapperEl;

          if (targetEl) {
            targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
            // Focus the input — inputEl is already the input/textarea,
            // otherwise query inside the wrapper
            const input =
              inputEl ??
              wrapperEl?.querySelector<HTMLElement>("input, textarea");
            if (
              input instanceof HTMLInputElement ||
              input instanceof HTMLTextAreaElement
            ) {
              input.focus();
            }
            // Gold ring highlight
            const ringTarget = wrapperEl || targetEl;
            ringTarget.classList.add("ring-2", "ring-brand", "rounded-md");
            setTimeout(
              () =>
                ringTarget.classList.remove(
                  "ring-2",
                  "ring-brand",
                  "rounded-md"
                ),
              2000
            );
          }
        }, 150);
      });
    },
    []
  );

  const handleToggleRequirement = useCallback((level: RequirementLevel) => {
    setActiveRequirementFilters((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  // Compute requirement breakdown for this product's category
  const requirementBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    for (const req of requirementByLabel.values()) {
      if (req && req !== "Not Required") {
        breakdown[req] = (breakdown[req] || 0) + 1;
      }
    }
    return breakdown;
  }, [requirementByLabel]);

  // Filter logic: requirement chip filters + "relevant only" mode
  const isFieldRelevant = useCallback(
    (attr: EnrichedAttribute, fieldValue: string | null): boolean => {
      const req = (requirementByLabel.get(attr.generalLabel) || "") as RequirementLevel;

      // If requirement chip filters are active, only show matching fields
      if (activeRequirementFilters.size > 0) {
        return activeRequirementFilters.has(req);
      }

      if (showAll) return true;
      // If requirement is empty or "Not Required" AND value is empty, hide it
      if ((req === "" || req === "Not Required") && (!fieldValue || fieldValue === "")) {
        return false;
      }
      return true;
    },
    [showAll, activeRequirementFilters, requirementByLabel]
  );

  // Count visible vs total columns
  const columnCounts = useMemo(() => {
    if (!product) return { visible: 0, total: 0 };
    let visible = 0;
    let total = 0;
    for (const attr of byGeneralLabel.values()) {
      total++;
      const val = getProductFieldValue(product, attr.generalLabel);
      if (isFieldRelevant(attr, val)) visible++;
    }
    return { visible, total };
  }, [product, byGeneralLabel, isFieldRelevant]);

  if (isLoading || attrsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!product) {
    return <p className="text-muted-foreground">Product not found.</p>;
  }

  const commentCounts = product._commentCounts ?? {};
  const commentTotalOpen = Object.values(commentCounts).reduce(
    (sum, c) => sum + c.open,
    0
  );
  const commentFieldCount = Object.values(commentCounts).filter(
    (c) => c.open > 0
  ).length;

  const fromListingImages = from === "listing-images";
  const fromAplusEditor = from === "aplus-editor";
  const fromAplus = from === "aplus" || fromAplusEditor;
  const fromVariationBuilder = from === "variation-builder";
  const fromHolidayDeals = from === "holiday-deals";
  const fromReviews = from === "reviews";
  // Opened in a new tab from the New SEO Project wizard (whose state lives only
  // in that tab), so "Back" closes this tab instead of navigating.
  const fromSeoNew = from === "seo-new";
  // Opened in a new tab from an SEO project's intake — same close/back behaviour
  const fromSeoProject = from === "seo-project";
  const fromSeoTab = fromSeoNew || fromSeoProject;
  const reviewsHref = (() => {
    const params = new URLSearchParams();
    if (product.clientIdCode) params.set("client", product.clientIdCode);
    if (product.asin) params.set("asin", product.asin);
    const query = params.toString();
    return query ? `/reviews?${query}` : "/reviews";
  })();
  const listingImagesHref = product.clientIdCode
    ? `/design/listing-images/${encodeURIComponent(product.clientIdCode)}`
    : "/design/listing-images";
  const aplusListHref = product.clientIdCode
    ? `/design/aplus2/${encodeURIComponent(product.clientIdCode)}`
    : "/design/aplus2";
  const aplusEditorHref =
    fromAplusEditor && product.clientIdCode && fromMarketplace && fromSet
      ? `/design/aplus2/${encodeURIComponent(product.clientIdCode)}/${encodeURIComponent(fromMarketplace)}/${encodeURIComponent(fromSet)}`
      : aplusListHref;
  const variationBuilderHref =
    fromVariationId && /^[0-9a-f-]{36}$/i.test(fromVariationId)
      ? `/variations/${fromVariationId}`
      : "/variations";
  const productsHref = product.clientIdCode
    ? `/products?client=${product.clientIdCode}`
    : "/products";
  const backHref = fromListingImages
    ? listingImagesHref
    : fromAplus
      ? aplusEditorHref
      : fromVariationBuilder
        ? variationBuilderHref
        : fromHolidayDeals
          ? "/holiday-deals"
          : fromReviews
            ? reviewsHref
            : fromSeoNew
              ? "/seo/new"
              : fromSeoProject
                ? "/seo"
                : productsHref;
  const backLabel = fromListingImages
    ? "Back to listing images"
    : fromAplus
      ? "Back to A+"
      : fromVariationBuilder
        ? "Back to variation builder"
        : fromHolidayDeals
          ? "Back to holiday deals"
          : fromReviews
            ? "Back to reviews"
            : fromSeoNew
              ? "Back to New SEO Project"
              : fromSeoProject
                ? "Back to SEO project"
                : "Back";

  return (
    <EditListingShell
      items={[...EDIT_LISTING_NAV]}
      product={{
        id: product.id,
        asin: product.asin,
        sku: product.sku,
        itemName: product.itemName,
        summarizedTitle: product.summarizedTitle,
        brandName: product.brandName,
        mainImageUrl: product.mainImageUrl,
        otherImageUrl1: getProductFieldValue(product, "OtherImageURL1"),
        clientIdCode: product.clientIdCode,
      }}
      cancelHref={backHref}
      topBar={
        <div className="flex items-center gap-3 sticky top-0 z-30 bg-background py-2 -mx-6 px-6 lg:-mx-10 lg:px-10 border-b border-border">
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <Link
              href={backHref}
              onClick={(e) => {
                if (!fromSeoTab) return;
                e.preventDefault();
                // Same tab (browser ignored target=_blank): go back to the exact page.
                if (window.history.length > 1) {
                  window.history.back();
                  return;
                }
                // Fresh tab: closing it reveals the wizard tab with its selection intact.
                window.close();
                // Browsers may refuse to close the tab — fall back to the wizard route.
                setTimeout(() => { window.location.href = backHref; }, 200);
              }}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              {backLabel}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <Link href={product.clientIdCode ? `/design/aplus2/${product.clientIdCode}` : "/design/aplus2"}>
              <LayoutTemplate className="mr-1 h-4 w-4" />
              A+ Content
            </Link>
          </Button>
          {product.asin && (
            <Badge variant="outline" className="font-mono shrink-0">
              {product.asin}
            </Badge>
          )}
          {product.sku && (
            <Badge variant="outline" className="font-mono shrink-0 max-w-[200px] truncate">
              {product.sku}
            </Badge>
          )}
          {product.isDirty && (
            <>
              <Link href="/publish">
                <Badge
                  variant="default"
                  className="shrink-0 cursor-pointer hover:opacity-90"
                  style={{ backgroundColor: "var(--brand)", color: "var(--brand-foreground)" }}
                >
                  Unsaved changes
                </Badge>
              </Link>
              {!isReadOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7 gap-1"
                  disabled={revertMutation.isPending}
                  onClick={() => {
                    if (confirm("Discard all unpublished changes and restore original values?")) {
                      revertMutation.mutate();
                    }
                  }}
                >
                  <Undo2 className="h-3 w-3" />
                  {revertMutation.isPending ? "Reverting..." : "Discard"}
                </Button>
              )}
            </>
          )}
          {isReadOnly && (
            <Badge variant="secondary" className="shrink-0">Read-only</Badge>
          )}
          <div className="ml-auto shrink-0">
            <FieldSearch
              product={product}
              attributes={[...byGeneralLabel.values()]}
              onSelectField={handleSelectField}
            />
          </div>
        </div>
      }
    >
      {/* Dirty fields summary bar */}
      {fieldEdits.size > 0 && (
        <div className="sticky top-0 z-20 flex items-center gap-3 rounded-lg border border-border bg-card text-white px-4 py-2.5 text-sm">
          <div className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-emerald-400" />
            <span>
              <strong>{fieldEdits.size}</strong> field
              {fieldEdits.size !== 1 ? "s" : ""} saved this session
            </span>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
              >
                <Eye className="h-3 w-3" />
                View changes
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[32rem] max-h-96 overflow-y-auto p-4"
            >
              <h4 className="text-sm font-medium mb-3">
                Changes this session
              </h4>
              <div className="space-y-3">
                {[...fieldEdits.values()]
                  .sort(
                    (a, b) => b.savedAt.getTime() - a.savedAt.getTime()
                  )
                  .map((edit) => {
                    const oldV = edit.oldValue || "";
                    const newV = edit.newValue || "";
                    const isEmpty = !oldV && !newV;
                    const isNew = !oldV && newV;
                    const isCleared = oldV && !newV;
                    const diff =
                      !isEmpty && !isNew && !isCleared
                        ? diffHighlight(oldV, newV)
                        : null;

                    return (
                      <div
                        key={edit.bqName}
                        className="text-xs border-b border-border pb-3 last:border-0"
                      >
                        <span className="font-medium text-foreground/80">
                          {edit.label}
                        </span>
                        <div className="mt-1 space-y-1 whitespace-pre-wrap break-words">
                          {isNew ? (
                            <div>
                              <span className="text-muted-foreground/70">(empty) &rarr; </span>
                              <span className="bg-emerald-600 text-white rounded-sm px-0.5">
                                {newV}
                              </span>
                            </div>
                          ) : isCleared ? (
                            <div>
                              <span className="bg-red-600 text-white line-through rounded-sm px-0.5">
                                {oldV}
                              </span>
                              <span className="text-muted-foreground/70"> &rarr; (empty)</span>
                            </div>
                          ) : diff ? (
                            <>
                              <div className="text-muted-foreground">
                                {diff.old.prefix}
                                <span className="bg-red-600 text-white rounded-sm px-0.5">
                                  {diff.old.changed}
                                </span>
                                {diff.old.suffix}
                              </div>
                              <div className="text-muted-foreground">
                                {diff.new.prefix}
                                <span className="bg-emerald-600 text-white rounded-sm px-0.5">
                                  {diff.new.changed}
                                </span>
                                {diff.new.suffix}
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Comment summary bar */}
      <CommentSummary totalOpen={commentTotalOpen} fieldCount={commentFieldCount} />

      {/* 1. Product Identity — left: Listing + Variations + VP; right: Product Details + Offer */}
      <EditListingSection id="product-identity" title="Product Identity">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-4 min-w-0">
            <ListingIdentitySection
              product={product}
              readOnly={isReadOnly}
              onSave={handleSave}
              onFieldSaved={onFieldSaved}
              aacData={product._aacData}
              variationName={product._variationName}
              flavor={product._flavor}
              size={product._size}
            />
            <div id="variations" className="scroll-mt-20 space-y-4">
              <VariationSection
                product={product}
                readOnly={isReadOnly}
                onSave={handleSave}
                onFieldSaved={onFieldSaved}
                parentInfo={product._parentInfo}
                variationName={product._variationName}
              />
              <VarietyPackCard product={product} readOnly={isReadOnly} />
            </div>
          </div>
          <div className="space-y-4 min-w-0">
            <ProductIdentitySection
              product={product}
              readOnly={isReadOnly}
              onSave={handleSave}
              onFieldSaved={onFieldSaved}
              aacBrandName={product._aacData?.brandName}
            />
            <div id="offer" className="scroll-mt-20">
              <OfferSection
                product={product}
                readOnly={isReadOnly}
                onSave={handleSave}
                onFieldSaved={onFieldSaved}
              />
            </div>
          </div>
        </div>
      </EditListingSection>

      {/* 2. Description (SEO) left; Images + Safety & Compliance right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <EditListingSection id="description" title="Description">
          <SeoRevisionLine productId={product.id} />
          <SeoSection
            product={product}
            readOnly={isReadOnly}
            onSave={handleSave}
            onFieldSaved={onFieldSaved}
          />
        </EditListingSection>

        <div className="space-y-4 min-w-0">
          <EditListingSection id="images" title="Images">
            <ImagesSection
              product={product}
              readOnly={isReadOnly}
              onSave={handleSave}
              onFieldSaved={onFieldSaved}
            />
          </EditListingSection>

          <div id="safety-compliance" className="scroll-mt-20 space-y-3">
            <h2 className="text-xl font-bold text-foreground tracking-tight">
              Safety & Compliance
            </h2>
            <ComplianceSection
              product={product}
              readOnly={isReadOnly}
              onSave={handleSave}
              onFieldSaved={onFieldSaved}
            />
            <SafetyComplianceSection
              product={product}
              readOnly={isReadOnly}
              onSave={handleSave}
              onFieldSaved={onFieldSaved}
            />
          </div>
        </div>
      </div>

      {/* 3. Dimensions & Shipping — own full-width section */}
      <EditListingSection id="dimensions-shipping" title="Dimensions & Shipping">
        <DimensionsSection
          product={product}
          readOnly={isReadOnly}
          onSave={handleSave}
          onFieldSaved={onFieldSaved}
        >
          {/* Extra Shipping fields from Amazon category (not already in Dimensions) */}
          {(() => {
            const shippingGroup = categoryGroups.find((g) => g.name === "Shipping");
            if (!shippingGroup) return null;
            const extraShippingAttrs = shippingGroup.attributes.filter(
              (a) => a.bibleFieldMatch && !DIMENSIONS_SECTION_FIELDS.has(a.bibleFieldMatch)
            );
            if (extraShippingAttrs.length === 0) return null;
            return (
              <div className="space-y-2 pt-3 border-t border-border/50">
                <span className="text-xs font-medium text-muted-foreground">Shipping</span>
              {extraShippingAttrs.map((a) => {
                const fieldName = a.bibleFieldMatch!;
                const enriched = byGeneralLabel.get(fieldName);
                return (
                  <ProductField
                    key={fieldName}
                    bqName={fieldName}
                    label={a.localLabel || fieldName}
                    value={getProductFieldValue(product, fieldName)}
                    fieldType={enriched ? inferFieldType(enriched) : "text"}
                    readOnly={isReadOnly}
                    onSave={handleSave}
                    onFieldSaved={onFieldSaved}
                    requirementLevel={(a.requirement as RequirementLevel) || undefined}
                    maxLength={enriched ? getFieldMaxLength(enriched) : undefined}
                    options={enriched ? getSelectOptions(enriched) : undefined}
                    productId={productId}
                    commentCount={commentCounts[fieldName]}
                    amazonMeta={amazonMetaByField.get(fieldName) ?? null}
                    computed={COMPUTED_FIELDS.has(fieldName)}
                  />
                );
              })}
              </div>
            );
          })()}
        </DimensionsSection>
      </EditListingSection>

      {/* 4. Other Details — two-column attribute cards */}
      <EditListingSection id="product-details" title="Other Details">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
      <IngredientsNutritionSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      <ApparelStyleSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      <MaterialsSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      <FoodAttributesSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      <TechnicalSpecsSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      <PetAttributesSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      <SportRecreationSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      <PublicationSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      <SpecificationsSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      <TargetAudienceSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      <StorageShelfLifeSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      <ItemDetailsSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      <ManufacturingSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      <ProductDetailsSection
        product={product}
        readOnly={isReadOnly}
        onSave={handleSave}
        onFieldSaved={onFieldSaved}
      />

      {/* Attribute sections — one card per group, sorted by requirement */}
      <div className="contents">
        {(() => {
          const EXCLUDED_FIELDS = new Set([
            ...SEO_SECTION_FIELDS,
            ...IMAGE_SECTION_FIELDS,
            ...LISTING_IDENTITY_FIELDS,
            ...PRODUCT_IDENTITY_FIELDS,
            ...DIMENSIONS_SECTION_FIELDS,
          ]);
          const VALID_REQ = new Set(["Required", "Conditionally Required", "Recommended", "Optional"]);
          const REQ_RANK: Record<string, number> = {
            Required: 0,
            "Conditionally Required": 1,
            Recommended: 2,
            Optional: 3,
          };

          if (categoryGroups.length > 0) {
            const mergedGroups: typeof categoryGroups = [];
            const mergeMap = new Map<string, typeof categoryGroups[0]>();
            for (const cg of categoryGroups) {
              const baseKey = cg.name.replace(/\s*\(.*\)$/, "");
              const existing = mergeMap.get(baseKey);
              if (existing) {
                existing.attributes = [...existing.attributes, ...cg.attributes];
              } else {
                const clone = { ...cg, name: baseKey, attributes: [...cg.attributes] };
                mergeMap.set(baseKey, clone);
                mergedGroups.push(clone);
              }
            }

            return mergedGroups.map((cg) => {
              if (EXCLUDE_CATEGORY_GROUPS.has(cg.name)) return null;

              const attrs = cg.attributes.filter((a) => {
                if (!a.bibleFieldMatch) return false;
                if (EXCLUDED_FIELDS.has(a.bibleFieldMatch)) return false;
                if (!VALID_REQ.has(a.requirement)) return false;
                return true;
              });
              const seen = new Set<string>();
              const dedupedAttrs = attrs.filter((a) => {
                if (seen.has(a.bibleFieldMatch!)) return false;
                seen.add(a.bibleFieldMatch!);
                return true;
              });
              if (dedupedAttrs.length === 0) return null;

              const sorted = [...dedupedAttrs].sort((a, b) => {
                const ar = REQ_RANK[a.requirement] ?? 2;
                const br = REQ_RANK[b.requirement] ?? 2;
                return ar !== br ? ar - br : a.sortOrder - b.sortOrder;
              });

              let populatedCount = 0;
              let reqRequired = 0, reqConditional = 0, reqPreferred = 0, reqOptional = 0;
              for (const a of sorted) {
                const val = getProductFieldValue(product, a.bibleFieldMatch!);
                if (val != null && val !== "") populatedCount++;
                if (a.requirement === "Required") reqRequired++;
                else if (a.requirement === "Conditionally Required") reqConditional++;
                else if (a.requirement === "Preferred" || a.requirement === "Recommended") reqPreferred++;
                else if (a.requirement === "Optional") reqOptional++;
              }

              const isProductDetailsSection = cg.name.toLowerCase().includes("product details");

              return (
                <ProductSection
                  key={cg.name}
                  title={cg.name}
                  count={sorted.length}
                  populatedCount={populatedCount}
                  defaultExpanded={false}
                  expanded={expandedSections.has(cg.name) ? true : undefined}
                  requirementSummary={{ required: reqRequired, conditional: reqConditional, preferred: reqPreferred, optional: reqOptional }}
                  onExpandedChange={(exp) => handleSectionExpandedChange(cg.name, exp)}
                >
                  {isProductDetailsSection ? (
                    (() => {
                      const subgroupMap = new Map<string, typeof sorted>();
                      for (const a of sorted) {
                        const fieldName = a.bibleFieldMatch!;
                        const enriched = byGeneralLabel.get(fieldName);
                        const subgroupName = getLogicalSubgroup(a.bibleFieldMatch || fieldName);
                        if (!subgroupMap.has(subgroupName)) subgroupMap.set(subgroupName, []);
                        subgroupMap.get(subgroupName)!.push(a);
                      }

                      const subgroups = Array.from(subgroupMap.entries())
                        .map(([name, groupAttrs]) => ({
                          name,
                          attrs: groupAttrs.sort((a, b) => {
                            const ar = REQ_RANK[a.requirement] ?? 2;
                            const br = REQ_RANK[b.requirement] ?? 2;
                            return ar !== br ? ar - br : a.sortOrder - b.sortOrder;
                          }),
                        }))
                        .sort((a, b) => {
                          if (a.name === "Other") return 1;
                          if (b.name === "Other") return -1;
                          return a.name.localeCompare(b.name);
                        });

                      return subgroups.map((sg) => {
                        let sgFilled = 0;
                        let sgRequired = 0, sgConditional = 0, sgPreferred = 0, sgOptional = 0;
                        for (const a of sg.attrs) {
                          const val = getProductFieldValue(product, a.bibleFieldMatch!);
                          if (val != null && val !== "") sgFilled++;
                          if (a.requirement === "Required") sgRequired++;
                          else if (a.requirement === "Conditionally Required") sgConditional++;
                          else if (a.requirement === "Preferred" || a.requirement === "Recommended") sgPreferred++;
                          else if (a.requirement === "Optional") sgOptional++;
                        }

                        const titleCase = sg.name.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();

                        return (
                          <ProductDetailsSubCard
                            key={sg.name}
                            title={titleCase}
                            totalCount={sg.attrs.length}
                            filledCount={sgFilled}
                            requirementSummary={{ required: sgRequired, conditional: sgConditional, preferred: sgPreferred, optional: sgOptional }}
                          >
                            {sg.attrs.map((a) => {
                              const fieldName = a.bibleFieldMatch!;
                              const enriched = byGeneralLabel.get(fieldName);
                              return (
                                <ProductField
                                  key={fieldName}
                                  bqName={fieldName}
                                  label={a.localLabel || fieldName}
                                  value={getProductFieldValue(product, fieldName)}
                                  fieldType={enriched ? inferFieldType(enriched) : "text"}
                                  readOnly={isReadOnly}
                                  onSave={handleSave}
                                  onFieldSaved={onFieldSaved}
                                  isEssential={enriched?.isEssential}
                                  labelDetails={enriched?.description}
                                  requirementLevel={(a.requirement as RequirementLevel) || undefined}
                                  maxLength={enriched ? getFieldMaxLength(enriched) : undefined}
                                  options={enriched ? getSelectOptions(enriched) : undefined}
                                  productId={productId}
                                  commentCount={commentCounts[fieldName]}
                                  amazonMeta={amazonMetaByField.get(fieldName) ?? null}
                                  computed={COMPUTED_FIELDS.has(fieldName)}
                                />
                              );
                            })}
                          </ProductDetailsSubCard>
                        );
                      });
                    })()
                  ) : (
                    sorted.map((a) => {
                      const fieldName = a.bibleFieldMatch!;
                      const enriched = byGeneralLabel.get(fieldName);
                      return (
                        <ProductField
                          key={fieldName}
                          bqName={fieldName}
                          label={a.localLabel || fieldName}
                          value={getProductFieldValue(product, fieldName)}
                          fieldType={enriched ? inferFieldType(enriched) : "text"}
                          readOnly={isReadOnly}
                          onSave={handleSave}
                          onFieldSaved={onFieldSaved}
                          isEssential={enriched?.isEssential}
                          labelDetails={enriched?.description}
                          requirementLevel={(a.requirement as RequirementLevel) || undefined}
                          maxLength={enriched ? getFieldMaxLength(enriched) : undefined}
                          options={enriched ? getSelectOptions(enriched) : undefined}
                          productId={productId}
                          commentCount={commentCounts[fieldName]}
                          amazonMeta={amazonMetaByField.get(fieldName) ?? null}
                          computed={COMPUTED_FIELDS.has(fieldName)}
                        />
                      );
                    })
                  )}
                </ProductSection>
              );
            });
          }

          return groups.map((group) => {
            if (group.name === "Variations") return null;
            if (group.name === "Listing Identity") return null;
            if (group.name === "Dimensions & Weight") return null;

            const allAttrs = group.subgroups.flatMap((sg) => sg.attributes);
            const filtered = allAttrs.filter((attr) => {
              if (SEO_SECTION_FIELDS.has(attr.generalLabel)) return false;
              if (IMAGE_SECTION_FIELDS.has(attr.generalLabel)) return false;
              if (LISTING_IDENTITY_FIELDS.has(attr.generalLabel)) return false;
              if (PRODUCT_IDENTITY_FIELDS.has(attr.generalLabel)) return false;
              if (DIMENSIONS_SECTION_FIELDS.has(attr.generalLabel)) return false;
              if (attr.subgroup === "Variation") return false;
              const req = requirementByLabel.get(attr.generalLabel) || "";
              if (!VALID_REQ.has(req)) return false;
              return true;
            });

            if (filtered.length === 0) return null;

            const sorted = [...filtered].sort((a, b) => {
              const ar = REQ_RANK[requirementByLabel.get(a.generalLabel) || ""] ?? 2;
              const br = REQ_RANK[requirementByLabel.get(b.generalLabel) || ""] ?? 2;
              if (ar !== br) return ar - br;
              return a.generalLabel.localeCompare(b.generalLabel);
            });

            let populatedCount = 0;
            let reqRequired2 = 0, reqConditional2 = 0, reqPreferred2 = 0, reqOptional2 = 0;
            for (const attr of sorted) {
              const val = getProductFieldValue(product, attr.generalLabel);
              if (val != null && val !== "") populatedCount++;
              const amz = amazonMetaByField.get(attr.generalLabel);
              if (amz?.requirement === "Required") reqRequired2++;
              else if (amz?.requirement === "Conditionally Required") reqConditional2++;
              else if (amz?.requirement === "Preferred" || amz?.requirement === "Recommended") reqPreferred2++;
              else if (amz?.requirement === "Optional") reqOptional2++;
            }

            const isProductDetailsFallback = group.name.toLowerCase().includes("product details");

              return (
                <ProductSection
                  key={group.name}
                  title={group.name}
                  count={sorted.length}
                  populatedCount={populatedCount}
                  defaultExpanded={false}
                  expanded={expandedSections.has(group.name) ? true : undefined}
                  onExpandedChange={(exp) => handleSectionExpandedChange(group.name, exp)}
                  requirementSummary={{ required: reqRequired2, conditional: reqConditional2, preferred: reqPreferred2, optional: reqOptional2 }}
                >
                  {isProductDetailsFallback ? (
                    (() => {
                      const subgroupMap = new Map<string, typeof sorted>();
                      for (const attr of sorted) {
                        const subgroupName = getLogicalSubgroup(attr.generalLabel);
                        if (!subgroupMap.has(subgroupName)) subgroupMap.set(subgroupName, []);
                        subgroupMap.get(subgroupName)!.push(attr);
                      }

                      const subgroups = Array.from(subgroupMap.entries())
                        .map(([name, groupAttrs]) => ({
                          name,
                          attrs: groupAttrs.sort((a, b) => {
                            const ar = REQ_RANK[requirementByLabel.get(a.generalLabel) || ""] ?? 2;
                            const br = REQ_RANK[requirementByLabel.get(b.generalLabel) || ""] ?? 2;
                            return ar !== br ? ar - br : a.generalLabel.localeCompare(b.generalLabel);
                          }),
                        }))
                        .sort((a, b) => {
                          if (a.name === "Other") return 1;
                          if (b.name === "Other") return -1;
                          return a.name.localeCompare(b.name);
                        });

                      return subgroups.map((sg) => {
                        let sgFilled = 0;
                        let sgRequired = 0, sgConditional = 0, sgPreferred = 0, sgOptional = 0;
                        for (const attr of sg.attrs) {
                          const val = getProductFieldValue(product, attr.generalLabel);
                          if (val != null && val !== "") sgFilled++;
                          const amz = amazonMetaByField.get(attr.generalLabel);
                          if (amz?.requirement === "Required") sgRequired++;
                          else if (amz?.requirement === "Conditionally Required") sgConditional++;
                          else if (amz?.requirement === "Preferred" || amz?.requirement === "Recommended") sgPreferred++;
                          else if (amz?.requirement === "Optional") sgOptional++;
                        }

                        const titleCase = sg.name.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();

                        return (
                          <ProductDetailsSubCard
                            key={sg.name}
                            title={titleCase}
                            totalCount={sg.attrs.length}
                            filledCount={sgFilled}
                            requirementSummary={{ required: sgRequired, conditional: sgConditional, preferred: sgPreferred, optional: sgOptional }}
                          >
                            {sg.attrs.map((attr) => (
                              <ProductField
                                key={attr.generalLabel}
                                bqName={attr.generalLabel}
                                label={attr.generalLabel}
                                value={getProductFieldValue(product, attr.generalLabel)}
                                fieldType={inferFieldType(attr)}
                                readOnly={isReadOnly}
                                onSave={handleSave}
                                onFieldSaved={onFieldSaved}
                                isEssential={attr.isEssential}
                                labelDetails={attr.description}
                                requirementLevel={(requirementByLabel.get(attr.generalLabel) as RequirementLevel) || undefined}
                                productId={productId}
                                commentCount={commentCounts[attr.generalLabel]}
                                amazonMeta={amazonMetaByField.get(attr.generalLabel) ?? null}
                                computed={COMPUTED_FIELDS.has(attr.generalLabel)}
                              />
                            ))}
                          </ProductDetailsSubCard>
                        );
                      });
                    })()
                  ) : (
                    sorted.map((attr) => (
                      <ProductField
                        key={attr.generalLabel}
                        bqName={attr.generalLabel}
                        label={attr.generalLabel}
                        value={getProductFieldValue(product, attr.generalLabel)}
                        fieldType={inferFieldType(attr)}
                        readOnly={isReadOnly}
                        onSave={handleSave}
                        onFieldSaved={onFieldSaved}
                        isEssential={attr.isEssential}
                        labelDetails={attr.description}
                        requirementLevel={(requirementByLabel.get(attr.generalLabel) as RequirementLevel) || undefined}
                        productId={productId}
                        commentCount={commentCounts[attr.generalLabel]}
                        amazonMeta={amazonMetaByField.get(attr.generalLabel) ?? null}
                        computed={COMPUTED_FIELDS.has(attr.generalLabel)}
                      />
                    ))
                  )}
                </ProductSection>
              );
            });
        })()}
      </div>
      </div>
      </EditListingSection>
    </EditListingShell>
  );
}

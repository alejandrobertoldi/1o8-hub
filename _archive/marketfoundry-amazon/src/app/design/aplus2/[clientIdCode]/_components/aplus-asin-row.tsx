"use client";

import Link from "next/link";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { aplusProductDetailHref } from "@/lib/aplus2/set-path";
import { cn } from "@/lib/utils";

export type AplusAsinRowProduct = {
  id: string;
  asin: string;
  parentageLevel?: string | null;
  summarizedTitle?: string | null;
  itemName?: string | null;
};

const PARENTAGE_STYLES: Record<string, string> = {
  parent: "bg-blue-500/20 text-blue-400",
  child: "bg-purple-500/20 text-purple-400",
  standalone: "bg-zinc-700 text-zinc-400",
};

export function ParentageBadge({ value, pill }: { value: string | null | undefined; pill?: boolean }) {
  if (!value) return null;
  const style = PARENTAGE_STYLES[value.toLowerCase()] ?? "bg-zinc-700 text-zinc-400";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap shrink-0",
        pill
          ? "h-9 rounded-full px-3 text-[13px] font-medium leading-none"
          : "w-[43px] py-0.5 rounded text-[10px] font-bold",
        style,
      )}
    >
      {value}
    </span>
  );
}

/** Parentage · orange ASIN (Hub PDP) · Amazon smile · summarized title. */
export function AplusAsinRow({
  product,
  from = "aplus",
  marketplace,
  setIdentifier,
  smileVariant = "on-dark",
  showParentage = true,
  pillParentage = false,
  emphasized,
  linkToProduct = true,
  accent = "brand",
  className,
}: {
  product: AplusAsinRowProduct;
  from?: "aplus" | "aplus-editor";
  marketplace?: string;
  setIdentifier?: string;
  smileVariant?: "on-dark" | "on-light" | "auto";
  showParentage?: boolean;
  /** h-9 rounded-full parentage chip (editor banner only). */
  pillParentage?: boolean;
  /** Larger type for the card's primary ASIN. Defaults to parentage Parent. */
  emphasized?: boolean;
  /** Hub product-detail link. Portal clients cannot open /products. */
  linkToProduct?: boolean;
  accent?: "brand" | "portal";
  className?: string;
}) {
  const title = product.summarizedTitle || product.itemName || "";
  const productHref =
    linkToProduct && product.id
      ? from === "aplus-editor"
        ? aplusProductDetailHref(product.id, { marketplace, setIdentifier })
        : aplusProductDetailHref(product.id)
      : null;

  const isLarge =
    emphasized ?? (product.parentageLevel ?? "").toLowerCase() === "parent";
  const asinClass = cn(
    "font-mono font-bold shrink-0",
    accent === "portal" ? "text-portal-accent" : "text-brand",
    productHref && "hover:underline underline-offset-2",
    isLarge ? "text-sm" : "text-[11px]",
  );

  return (
    <div className={cn("flex items-center gap-1.5 min-w-0 flex-nowrap", className)}>
      {showParentage && <ParentageBadge value={product.parentageLevel} pill={pillParentage} />}
      {productHref ? (
        <Link href={productHref} className={asinClass} title="Open product detail">
          {product.asin}
        </Link>
      ) : (
        <span className={asinClass}>{product.asin}</span>
      )}
      <AmazonPdpLink asin={product.asin} variant={smileVariant} />
      {title ? (
        <span className="text-[11px] text-zinc-200 truncate min-w-0" title={title}>
          {title}
        </span>
      ) : null}
    </div>
  );
}

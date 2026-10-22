"use client";

import Link from "next/link";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { aplusProductDetailHref } from "@/lib/aplus2/set-path";
import { cn } from "@/lib/utils";

/** ASIN → product detail, plus the Amazon smile linking to the PDP. */
export function AplusAsinLinks({
  asin,
  productId,
  className,
  iconClassName,
  from = "aplus",
  marketplace,
  setIdentifier,
  smileVariant = "auto",
}: {
  asin: string;
  productId: string | null | undefined;
  className?: string;
  iconClassName?: string;
  from?: "aplus" | "aplus-editor";
  marketplace?: string;
  setIdentifier?: string;
  smileVariant?: "on-dark" | "on-light" | "auto";
}) {
  const productHref = productId
    ? from === "aplus-editor"
      ? aplusProductDetailHref(productId, { marketplace, setIdentifier })
      : aplusProductDetailHref(productId)
    : null;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {productHref ? (
        <Link
          href={productHref}
          className="underline underline-offset-2 decoration-muted-foreground/50 hover:text-brand hover:decoration-brand"
          title="Open product detail"
        >
          {asin}
        </Link>
      ) : (
        <span>{asin}</span>
      )}
      <AmazonPdpLink asin={asin} className={iconClassName} variant={smileVariant} />
    </span>
  );
}

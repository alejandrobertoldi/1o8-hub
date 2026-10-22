"use client";

import Link from "next/link";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { aplusProductDetailHref } from "@/lib/aplus2/set-path";
import { isAplus2ParentProduct } from "@/lib/aplus2/variation-scope";
import { cn } from "@/lib/utils";
import { AplusAsinRow, ParentageBadge, type AplusAsinRowProduct } from "./aplus-asin-row";

export type CoveredAsin = AplusAsinRowProduct;

/**
 * Sequential chunks. Leading sections get the same row count; leftover
 * ASINs go in the last section (e.g. 10 into 3 → 4, 4, 2).
 */
export function splitIntoSections<T>(items: T[], sectionCount = 2): T[][] {
  if (items.length === 0) return [];
  const count = Math.min(sectionCount, items.length);
  const rowsPerSection = Math.ceil(items.length / count);
  const sections: T[][] = [];
  for (let i = 0; i < count; i++) {
    const start = i * rowsPerSection;
    if (start >= items.length) break;
    sections.push(items.slice(start, start + rowsPerSection));
  }
  return sections;
}

/** Parent sits above the column grid so col-2 children align with the first child, not the parent. */
export function peelParentProduct<T extends { parentageLevel?: string | null }>(
  items: T[],
): { parent: T | undefined; rest: T[] } {
  const index = items.findIndex((item) => isAplus2ParentProduct(item.parentageLevel));
  if (index === -1) return { parent: undefined, rest: items };
  return {
    parent: items[index],
    rest: items.filter((_, i) => i !== index),
  };
}

function CoveredAsinTable({
  products,
  from,
  marketplace,
  setIdentifier,
  smileVariant,
  linkToProduct = true,
}: {
  products: CoveredAsin[];
  from: "aplus" | "aplus-editor";
  marketplace?: string;
  setIdentifier?: string;
  smileVariant: "on-dark" | "on-light" | "auto";
  linkToProduct?: boolean;
}) {
  return (
    <table className="w-full min-w-0 table-fixed text-left">
      <thead>
        <tr className="text-[9px] font-bold uppercase tracking-wider opacity-60">
          <th className="w-6 pr-1 pb-1 font-bold">PDP</th>
          <th className="w-[6.75rem] pr-1.5 pb-1 font-bold">ASIN</th>
          <th className="w-[4.5rem] pr-1.5 pb-1 font-bold">Parentage</th>
          <th className="pb-1 font-bold">Summarized title</th>
        </tr>
      </thead>
      <tbody>
        {products.map((p) => {
          const productHref =
            linkToProduct && p.id
              ? from === "aplus-editor"
                ? aplusProductDetailHref(p.id, { marketplace, setIdentifier })
                : aplusProductDetailHref(p.id)
              : null;
          const title = p.summarizedTitle || p.itemName || "—";
          return (
            <tr key={p.id || p.asin} className="align-middle">
              <td className="pr-1 py-0.5">
                <AmazonPdpLink asin={p.asin} variant={smileVariant} />
              </td>
              <td className="pr-1.5 py-0.5 font-mono text-[10px] truncate">
                {productHref ? (
                  <Link
                    href={productHref}
                    className="underline underline-offset-2 decoration-muted-foreground/50 hover:text-brand hover:decoration-brand"
                    title="Open product detail"
                  >
                    {p.asin}
                  </Link>
                ) : (
                  <span>{p.asin}</span>
                )}
              </td>
              <td className="pr-1.5 py-0.5">
                <ParentageBadge value={p.parentageLevel} />
              </td>
              <td className="py-0.5 text-[10px] truncate" title={title === "—" ? undefined : title}>
                {title}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function AplusCoveredAsinList({
  products,
  from = "aplus",
  marketplace,
  setIdentifier,
  smileVariant = "auto",
  sectionCount = 2,
  variant = "inline",
  linkToProduct = true,
  accent = "brand",
  className,
}: {
  products: CoveredAsin[];
  from?: "aplus" | "aplus-editor";
  marketplace?: string;
  setIdentifier?: string;
  smileVariant?: "on-dark" | "on-light" | "auto";
  sectionCount?: 2 | 3;
  variant?: "inline" | "table";
  linkToProduct?: boolean;
  accent?: "brand" | "portal";
  className?: string;
}) {
  if (products.length === 0) return null;

  const { parent, rest } =
    variant === "inline" ? peelParentProduct(products) : { parent: undefined, rest: products };
  const sections = splitIntoSections(rest, sectionCount);
  const colClass =
    sections.length >= 3 ? "grid-cols-3" : sections.length === 2 ? "grid-cols-2" : "grid-cols-1";

  const rowProps = {
    from,
    marketplace,
    setIdentifier,
    smileVariant,
    linkToProduct,
    accent,
  } as const;

  if (variant === "inline") {
    return (
      <div className={cn("space-y-1", className)}>
        {parent && <AplusAsinRow product={parent} {...rowProps} />}
        {sections.length > 0 && (
          <div className={cn("grid min-w-0 gap-x-4 gap-y-1", colClass)}>
            {sections.map((section, i) => (
              <div key={section[0]?.id ?? i} className="min-w-0 space-y-1">
                {section.map((p) => (
                  <AplusAsinRow key={p.id || p.asin} product={p} {...rowProps} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("grid min-w-0 gap-x-3", colClass, className)}>
      {sections.map((section, i) => (
        <CoveredAsinTable
          key={section[0]?.id ?? i}
          products={section}
          from={from}
          marketplace={marketplace}
          setIdentifier={setIdentifier}
          smileVariant={smileVariant}
          linkToProduct={linkToProduct}
        />
      ))}
    </div>
  );
}

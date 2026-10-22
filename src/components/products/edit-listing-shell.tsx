"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export type EditListingNavItem = {
  id: string;
  label: string;
};

type Props = {
  items: EditListingNavItem[];
  product: {
    id: string;
    asin: string | null;
    sku: string | null;
    itemName: string | null;
    summarizedTitle: string | null;
    brandName: string | null;
    /** Amazon CLR main image URL */
    mainImageUrl: string | null;
    /** Fallback Amazon URL when MAIN Drive + mainImageUrl are empty */
    otherImageUrl1?: string | null;
    clientIdCode: string | null;
  };
  children: React.ReactNode;
  topBar?: React.ReactNode;
  cancelHref?: string;
};

type HubListingImage = {
  driveFileId: string;
  slot: string;
};

async function fetchProductListingImages(productId: string): Promise<HubListingImage[]> {
  const res = await fetch(
    `/api/design/listing-images?productId=${encodeURIComponent(productId)}`,
  );
  if (!res.ok) return [];
  return res.json();
}

function resolveSidebarThumb(opts: {
  driveMainFileId: string | null;
  mainImageUrl: string | null;
  otherImageUrl1: string | null;
}): { src: string; href: string } | null {
  if (opts.driveMainFileId) {
    const base = `/api/design/listing-images/image?driveFileId=${encodeURIComponent(opts.driveMainFileId)}`;
    return { src: `${base}&thumb=1`, href: base };
  }
  const amazonUrl = opts.mainImageUrl || opts.otherImageUrl1;
  if (amazonUrl) return { src: amazonUrl, href: amazonUrl };
  return null;
}

export function EditListingShell({ items, product, children, topBar, cancelHref }: Props) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  const { data: hubImages = [] } = useQuery({
    queryKey: ["listing-images-product", product.id],
    queryFn: () => fetchProductListingImages(product.id),
    staleTime: 30_000,
  });

  const driveMainFileId = useMemo(() => {
    const main = hubImages.find((img) => img.slot === "MAIN");
    return main?.driveFileId ?? null;
  }, [hubImages]);

  const thumb = useMemo(
    () =>
      resolveSidebarThumb({
        driveMainFileId,
        mainImageUrl: product.mainImageUrl,
        otherImageUrl1: product.otherImageUrl1 ?? null,
      }),
    [driveMainFileId, product.mainImageUrl, product.otherImageUrl1],
  );

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActiveId(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const sectionEls = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => !!el);
    if (sectionEls.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] },
    );
    for (const el of sectionEls) observer.observe(el);
    return () => observer.disconnect();
  }, [items]);

  const title =
    product.summarizedTitle || product.itemName || product.asin || "Product";

  return (
    <div className="space-y-3">
      {topBar}
      <div className="flex gap-4 items-start min-h-[70vh]">
        {/* Seller Central–style left rail */}
        <aside className="hidden lg:flex w-[260px] shrink-0 flex-col sticky top-16 self-start max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-lg border border-border bg-card">
          <div className="px-4 pt-4 pb-3 border-b border-border">
            <p className="text-sm font-bold text-foreground">Edit Listing</p>
          </div>

          <div className="px-3 py-3 border-b border-border">
            <div className="flex gap-3">
              <div className="relative h-14 w-14 shrink-0 rounded border border-border bg-muted overflow-hidden">
                {thumb ? (
                  <a
                    href={thumb.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 block"
                    title="Open main image"
                  >
                    <Image
                      src={thumb.src}
                      alt=""
                      fill
                      className="object-contain"
                      sizes="56px"
                      unoptimized
                    />
                  </a>
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">
                    No img
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
                  {title}
                </p>
                {product.sku && (
                  <p className="mt-1 text-[10px] text-muted-foreground font-mono truncate">
                    SKU: {product.sku}
                  </p>
                )}
                {product.asin && (
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    ASIN: {product.asin}
                  </p>
                )}
                {product.brandName && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    {product.brandName}
                  </p>
                )}
              </div>
            </div>
          </div>

          <nav className="flex-1 py-1" aria-label="Listing sections">
            {items.map((item) => {
              const active = activeId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollTo(item.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors border-l-2",
                    active
                      ? "border-l-brand bg-muted/60 font-medium text-foreground"
                      : "border-l-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] text-muted-foreground/80">›</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-border p-3 space-y-2">
            <Link
              href={
                cancelHref ??
                (product.clientIdCode ? `/products?client=${product.clientIdCode}` : "/products")
              }
              className="flex h-9 w-full items-center justify-center rounded-md border border-border bg-background text-sm font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </Link>
          </div>
        </aside>

        {/* Single-page scrollable sections */}
        <div className="min-w-0 flex-1 space-y-6 pb-16">{children}</div>
      </div>
    </div>
  );
}

export function EditListingSection({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <div>
        <h2 className="text-xl font-bold text-foreground tracking-tight">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

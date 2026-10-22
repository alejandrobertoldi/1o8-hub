"use client";

import { Suspense } from "react";
import { ProductTable } from "@/components/products/product-table";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

export default function ProductsPage() {
  return (
    <div>
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Product Catalog"
        >
          <span className="font-bold text-sidebar-foreground">Product</span>
          <span className="font-normal text-brand">Catalog</span>
        </h1>
      </PageMetaSlot>
      <Suspense>
        <ProductTable />
      </Suspense>
    </div>
  );
}

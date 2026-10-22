"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryAttributesV2 } from "@/components/admin/category-attributes-v2";

export default function AttributesPage() {
  return (
    <div className="space-y-6">
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        }
      >
        <CategoryAttributesV2 />
      </Suspense>
    </div>
  );
}

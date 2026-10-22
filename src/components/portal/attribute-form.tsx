/* eslint-disable react-doctor/nextjs-no-use-search-params-without-suspense */
/* eslint-disable react-doctor/no-generic-handler-names */
/* eslint-disable react-doctor/query-mutation-missing-invalidation */
/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/react-compiler-destructure-method */
"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

interface FieldData {
  attributeName: string;
  localLabel: string;
  description: string | null;
  example: string | null;
  requirement: string;
  currentValue: string;
  isEmpty: boolean;
}

interface ProductData {
  productId: string;
  productName: string;
  asin: string;
  fields: FieldData[];
  missingCount: number;
}

interface TemplateRequestData {
  request: {
    id: string;
    clientIdCode: string;
    productType: string;
    scope: string;
    levels: string[];
  };
  productType: string;
  products: ProductData[];
}

export function AttributeForm() {
  const searchParams = useSearchParams();
  const requestId = searchParams.get("request");
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["template-request", requestId],
    queryFn: async () => {
      const res = await fetch(
        `/api/attributes/template-requests/${requestId}`
      );
      if (!res.ok) throw new Error("Template request not found");
      return res.json() as Promise<TemplateRequestData>;
    },
    enabled: !!requestId,
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      productId,
      bqName,
      value,
    }: {
      productId: string;
      bqName: string;
      value: string;
    }) => {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bqName, value, field: null }),
      });
      if (!res.ok) throw new Error("Failed to save");
    },
    onError: () => toast.error("Failed to save field"),
  });

  const handleBlur = useCallback(
    (productId: string, bqName: string, value: string) => {
      saveMutation.mutate({ productId, bqName, value });
    },
    [saveMutation]
  );

  if (!requestId) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No attribute request specified. Ask your account manager for a link.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading form…</p>;
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
        <p className="text-sm text-red-400">
          Template request not found or expired.
        </p>
      </div>
    );
  }

  const products = data.products;
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 p-8 text-center">
        <Check className="size-8 text-emerald-400 mx-auto mb-2" />
        <p className="text-sm text-emerald-400">All products are complete!</p>
      </div>
    );
  }

  const product = products[currentIndex];
  const missingFields = product.fields.filter((f) => f.isEmpty);

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border bg-card">
        <span className="text-sm text-muted-foreground">
          Product {currentIndex + 1} of {products.length}
        </span>
        <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{
              width: `${((currentIndex + 1) / products.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Product header */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-medium">{product.productName}</h2>
        <span className="text-xs text-muted-foreground font-mono">
          ASIN: {product.asin}
        </span>
        <span className="ml-3 text-xs text-muted-foreground">
          {missingFields.length} field{missingFields.length !== 1 ? "s" : ""} to
          fill
        </span>
      </div>

      {/* Fields */}
      <div className="space-y-3">
        {missingFields.map((field) => (
          <FieldInput
            key={field.attributeName}
            field={field}
            productId={product.productId}
            onBlur={handleBlur}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          size="sm"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => i - 1)}
        >
          <ChevronLeft className="size-4 mr-1" />
          Previous
        </Button>
        <Button
          size="sm"
          disabled={currentIndex === products.length - 1}
          onClick={() => setCurrentIndex((i) => i + 1)}
        >
          Next Product
          <ChevronRight className="size-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  productId,
  onBlur,
}: {
  field: FieldData;
  productId: string;
  onBlur: (productId: string, bqName: string, value: string) => void;
}) {
  const [value, setValue] = useState(field.currentValue);
  const isLong = (field.description?.length ?? 0) > 100;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 ${
            field.requirement === "Required"
              ? "border-red-500/50 text-red-400"
              : field.requirement === "Conditionally Required"
                ? "border-orange-500/50 text-orange-400"
                : "border-purple-500/50 text-purple-400"
          }`}
        >
          {field.requirement}
        </Badge>
        <Label className="text-sm font-medium">{field.localLabel}</Label>
      </div>

      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}

      {isLong ? (
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => onBlur(productId, field.attributeName, value)}
          placeholder={field.example || "Enter value…"}
          className="min-h-[80px]"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => onBlur(productId, field.attributeName, value)}
          placeholder={field.example || "Enter value…"}
        />
      )}

      {field.example && (
        <p className="text-[11px] text-muted-foreground/60">
          Example: <span className="font-mono">{field.example}</span>
        </p>
      )}

      <p className="text-[11px] text-muted-foreground/40 font-mono">
        {field.attributeName}
      </p>
    </div>
  );
}

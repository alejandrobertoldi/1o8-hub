"use client";

import { useQuery } from "@tanstack/react-query";

interface CategoryAttributeData {
  id: number;
  localLabel: string;
  amazonFieldName: string;
  description: string | null;
  example: string | null;
  requirement: string;
  validValues: string[] | null;
  bibleFieldMatch: string | null;
  currentValue: string | null;
  sortOrder: number;
  isKey: boolean;
}

interface CategoryGroupData {
  name: string;
  attributes: CategoryAttributeData[];
}

interface CategoryDefinitionData {
  id: number;
  clientIdCode: string;
  productType: string;
  marketplaceId: string;
  totalAttributes: number;
  requiredCount: number;
  conditionalCount: number;
  optionalCount: number;
  uploadedBy: string;
  uploadedAt: string;
}

interface CategoryDefinitionResponse {
  definition: CategoryDefinitionData | null;
  groups: CategoryGroupData[];
}

export type { CategoryAttributeData, CategoryGroupData, CategoryDefinitionData };

async function fetchCategoryDefinition(
  productType: string,
  clientIdCode: string,
  productId?: string,
  marketplaceId?: string
): Promise<CategoryDefinitionResponse> {
  const params = new URLSearchParams({ clientIdCode });
  if (productId) params.set("productId", productId);
  if (marketplaceId) params.set("marketplaceId", marketplaceId);

  const res = await fetch(
    `/api/category-definitions/${encodeURIComponent(productType)}?${params}`
  );
  if (!res.ok) throw new Error("Failed to fetch category definition");
  return res.json();
}

export function useCategoryDefinition(
  productType?: string,
  clientIdCode?: string,
  productId?: string,
  marketplaceId?: string
) {
  const { data, isLoading, error } = useQuery({
    queryKey: [
      "category-definition",
      productType,
      clientIdCode,
      productId,
      marketplaceId,
    ],
    queryFn: () =>
      fetchCategoryDefinition(
        productType!,
        clientIdCode!,
        productId,
        marketplaceId
      ),
    enabled: !!productType && !!clientIdCode,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    definition: data?.definition ?? null,
    groups: data?.groups ?? [],
    isLoading,
    error,
  };
}

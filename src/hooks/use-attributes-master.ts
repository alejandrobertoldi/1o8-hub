"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AttributeMaster, PDPCard } from "@/lib/attributes-master";

export type { AttributeMaster, PDPCard } from "@/lib/attributes-master";

async function fetchAttributesMaster<T = AttributeMaster[] | PDPCard[]>(format?: string): Promise<T> {
  const params = new URLSearchParams();
  if (format) params.set("format", format);
  const res = await fetch(`/api/attributes-master?${params}`);
  if (!res.ok) throw new Error("Failed to fetch attributes master");
  return res.json();
}

export function useAttributesMaster(options?: { format?: "cards" | "counts" }) {
  const format = options?.format;

  const { data, isLoading, error } = useQuery({
    queryKey: ["attributes-master", format || "all"],
    queryFn: () => fetchAttributesMaster(format || undefined),
    staleTime: 5 * 60 * 1000,
  });

  return { data, isLoading, error };
}

export function useAttributesMasterCards() {
  const { data: cards, isLoading, error, refetch } = useQuery<PDPCard[]>({
    queryKey: ["attributes-master-cards"],
    queryFn: () => fetchAttributesMaster<PDPCard[]>("cards"),
    staleTime: 5 * 60 * 1000,
  });

  const cardsMap = useMemo(() => {
    if (!cards) return new Map<string, PDPCard>();
    return new Map(cards.map((c) => [c.name, c]));
  }, [cards]);

  return { cards, cardsMap, isLoading, error, refetch };
}

export function useAttributesMasterCounts() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["attributes-master-counts"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("format", "counts");
      const res = await fetch(`/api/attributes-master?${params}`);
      if (!res.ok) throw new Error("Failed to fetch counts");
      return res.json() as Promise<{
        required: number;
        conditionallyRequired: number;
        recommended: number;
        optional: number;
      }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  return { counts: data, isLoading, error };
}
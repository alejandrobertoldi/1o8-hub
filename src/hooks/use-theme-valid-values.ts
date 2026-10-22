"use client";

import { useQuery } from "@tanstack/react-query";

export function useThemeValidValues(clientIdCode: string | null | undefined) {
  return useQuery({
    queryKey: ["theme-valid-values", clientIdCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/products/theme-values?client=${encodeURIComponent(clientIdCode!)}`
      );
      if (!res.ok) return new Map<string, string[]>();
      const json = (await res.json()) as Record<string, string[]>;
      return new Map(Object.entries(json));
    },
    enabled: !!clientIdCode,
    staleTime: 5 * 60 * 1000,
  });
}

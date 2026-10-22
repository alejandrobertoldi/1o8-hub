import { useQuery } from "@tanstack/react-query";
import type { RainforestProduct } from "@/types/rainforest";

async function fetchAmazonLive(asin: string): Promise<RainforestProduct> {
  const res = await fetch(`/api/amazon-live?asin=${encodeURIComponent(asin)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  const { product } = await res.json();
  return product;
}

export function useAmazonLive(asin: string | null, enabled: boolean) {
  return useQuery<RainforestProduct>({
    queryKey: ["amazon-live", asin],
    queryFn: () => fetchAmazonLive(asin!),
    enabled: enabled && !!asin,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

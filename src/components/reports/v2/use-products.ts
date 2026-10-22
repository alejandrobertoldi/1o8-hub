"use client";
/* eslint-disable react-doctor/no-fetch-in-effect */
import { useEffect, useState } from "react";
import type { ProductsResponse } from "./primitives/products";

export interface ProductsState {
  data: ProductsResponse | null;
  loading: boolean;
  requestKey: string;
}

/** Single source of the advertised-ASIN fetch for a surface. Mirrors useCampaigns
 *  so Campaign & product detail issues exactly one fetch per endpoint. */
export function useProducts(accountId?: string, start?: string, end?: string, refreshKey = 0): ProductsState {
  const requestKey = accountId && start && end ? `${accountId}:${start}:${end}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: ProductsResponse | null } | null>(null);

  useEffect(() => {
    if (!accountId || !start || !end) return;
    let ignore = false;
    fetch(`/api/reports/product-performance?accountId=${accountId}&start=${start}&end=${end}`)
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<ProductsResponse>;
      })
      .then((d) => { if (!ignore) setResult({ key: requestKey, data: d }); })
      .catch(() => { if (!ignore) setResult({ key: requestKey, data: null }); });
    return () => { ignore = true; };
  }, [accountId, start, end, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;
  return { data, loading, requestKey };
}

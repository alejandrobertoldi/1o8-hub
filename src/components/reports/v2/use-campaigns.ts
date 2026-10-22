"use client";
/* eslint-disable react-doctor/no-fetch-in-effect */
import { useEffect, useState } from "react";
import type { CampaignsResponse } from "./primitives/campaigns";

export interface CampaignsState {
  data: CampaignsResponse | null;
  loading: boolean;
  requestKey: string;
}

/** Single source of the campaigns fetch for a surface. Called ONCE by the shell;
 *  its result feeds the ROAS-ranking + scatter charts. Mirrors useOverview so a
 *  surface issues exactly one fetch per endpoint. */
export function useCampaigns(accountId?: string, start?: string, end?: string, refreshKey = 0): CampaignsState {
  const requestKey = accountId && start && end ? `${accountId}:${start}:${end}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: CampaignsResponse | null } | null>(null);

  useEffect(() => {
    if (!accountId || !start || !end) return;
    let ignore = false;
    fetch(`/api/reports/campaigns?accountId=${accountId}&start=${start}&end=${end}`)
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<CampaignsResponse>;
      })
      .then((d) => { if (!ignore) setResult({ key: requestKey, data: d }); })
      .catch(() => { if (!ignore) setResult({ key: requestKey, data: null }); });
    return () => { ignore = true; };
  }, [accountId, start, end, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;
  return { data, loading, requestKey };
}

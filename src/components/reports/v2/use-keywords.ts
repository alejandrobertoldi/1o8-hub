"use client";
/* eslint-disable react-doctor/no-fetch-in-effect */
import { useEffect, useState } from "react";
import type { KeywordsResponse } from "./primitives/keywords";

export interface KeywordsState {
  data: KeywordsResponse | null;
  loading: boolean;
  requestKey: string;
}

/** Single source of the keywords fetch for a surface. Called ONCE by the shell;
 *  its result feeds the Keyword analysis table (and, later, decision support).
 *  Mirrors useOverview/useCampaigns so a surface issues exactly one fetch per endpoint. */
export function useKeywords(accountId?: string, start?: string, end?: string, refreshKey = 0): KeywordsState {
  const requestKey = accountId && start && end ? `${accountId}:${start}:${end}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: KeywordsResponse | null } | null>(null);

  useEffect(() => {
    if (!accountId || !start || !end) return;
    let ignore = false;
    fetch(`/api/reports/keywords?accountId=${accountId}&start=${start}&end=${end}`)
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<KeywordsResponse>;
      })
      .then((d) => { if (!ignore) setResult({ key: requestKey, data: d }); })
      .catch(() => { if (!ignore) setResult({ key: requestKey, data: null }); });
    return () => { ignore = true; };
  }, [accountId, start, end, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;
  return { data, loading, requestKey };
}

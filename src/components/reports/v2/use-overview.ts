"use client";
/* eslint-disable react-doctor/no-fetch-in-effect */
import { useEffect, useState } from "react";
import type { OverviewResponse } from "./primitives/kpi-derivations";

export interface OverviewState {
  data: OverviewResponse | null;
  loading: boolean;
  requestKey: string;
}

/** Single source of the overview fetch for a surface. Called ONCE by the shell;
 *  its result is shared by the KPI grid and the Executive Insights strip so a
 *  surface never issues two fetches of the same (Redshift+BigQuery-slow) endpoint. */
export function useOverview(accountId?: string, start?: string, end?: string, refreshKey = 0): OverviewState {
  const requestKey = accountId && start && end ? `${accountId}:${start}:${end}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: OverviewResponse | null } | null>(null);

  useEffect(() => {
    if (!accountId || !start || !end) return;
    let ignore = false;
    fetch(`/api/reports/overview?accountId=${accountId}&start=${start}&end=${end}`)
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<OverviewResponse>;
      })
      .then((d) => { if (!ignore) setResult({ key: requestKey, data: d }); })
      .catch(() => { if (!ignore) setResult({ key: requestKey, data: null }); });
    return () => { ignore = true; };
  }, [accountId, start, end, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;
  return { data, loading, requestKey };
}

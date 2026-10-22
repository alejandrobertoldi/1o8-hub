"use client";
/* eslint-disable react-doctor/no-fetch-in-effect */
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { formatDate, getFirstDayOfCurrentMonth, getWeekNumber, resolveRange, type RangeMode } from "@/lib/report-date-range";

// Default range = the previous (last complete) week. Guards cover the year
// boundary, where a January date can sit in week 52/53 of the prior year
// and a late-December date in week 1 of the next.
export function previousWeek(now: Date): { year: number; week: number } {
  const prev = new Date(now);
  prev.setDate(now.getDate() - 7);
  const week = getWeekNumber(prev);
  let year = prev.getFullYear();
  if (week >= 52 && prev.getMonth() === 0) year -= 1;
  if (week === 1 && prev.getMonth() === 11) year += 1;
  return { year, week };
}

export interface ReportClient {
  clientIdCode: string;
  clientName: string;
  clientStatus: string | null;
  rawData?: Record<string, string>;
}

/** /api/clients?lite=1 returns a JSON array; 401/500 bodies are objects. */
export function asClientList(payload: unknown): ReportClient[] {
  return Array.isArray(payload) ? payload : [];
}

/** The half of the report controls both surfaces share: the date range plus the
 *  resolved Intentwise account. The portal has no client *list* and no manual
 *  refresh, so PortalReportControls implements only this base — which is what
 *  lets ReportsControlsBar serve both surfaces. */
export interface ReportRangeControls {
  mode: RangeMode;
  setMode: (m: RangeMode) => void;
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
  year: number;
  setYear: (y: number) => void;
  week: number;
  setWeek: (w: number) => void;
  accountId: string;
  start: string;
  end: string;
}

/** Hub-only additions: the free client-select and the manual Redshift refresh. */
export interface ReportControls extends ReportRangeControls {
  clients: ReportClient[];
  clientsLoading: boolean;
  selectedClient: string;
  setSelectedClient: (name: string) => void;
  refreshKey: number;
  bumpRefresh: () => void;
}

function useReportControlsState(): ReportControls {
  const pathname = usePathname();
  const [clients, setClients] = useState<ReportClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [mode, setMode] = useState<RangeMode>("week");
  const [customStart, setCustomStart] = useState(() => getFirstDayOfCurrentMonth(new Date()));
  const [customEnd, setCustomEnd] = useState(() => formatDate(new Date()));
  const [year, setYear] = useState(() => previousWeek(new Date()).year);
  const [week, setWeek] = useState(() => previousWeek(new Date()).week);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if ((pathname ?? "").includes("/print")) {
      setClientsLoading(false);
      return;
    }
    setClientsLoading(true);
    fetch("/api/clients?lite=1")
      .then((r) => r.json())
      .then((payload: unknown) => {
        const list = asClientList(payload);
        setClients(list);
        if (list.length > 0) {
          setSelectedClient((cur) => {
            const stillActive = list.some((c) => c.clientName === cur || c.clientIdCode === cur);
            return stillActive && cur ? cur : list[0].clientName;
          });
        }
        setClientsLoading(false);
      })
      .catch(() => {
        setClients([]);
        setClientsLoading(false);
      });
  }, [pathname]);

  const selectedClientObj = clients.find(
    (c) => c.clientName === selectedClient || c.clientIdCode === selectedClient,
  );
  const accountId = selectedClientObj?.rawData?.IntentwiseID?.trim() ?? "";
  const { start, end } = useMemo(
    () => resolveRange(mode, { customStart, customEnd, year, week }),
    [mode, customStart, customEnd, year, week],
  );

  return {
    clients, clientsLoading, selectedClient, setSelectedClient,
    mode, setMode, customStart, setCustomStart, customEnd, setCustomEnd,
    year, setYear, week, setWeek,
    accountId, start, end,
    refreshKey, bumpRefresh: () => setRefreshKey((k) => k + 1),
  };
}

/* State lives in a provider mounted by src/app/reports/layout.tsx, above the
   page segment, so client + date selections survive switching between the
   report pages until manually changed. */
const ReportControlsContext = createContext<ReportControls | null>(null);

export function ReportControlsProvider({ children }: { children: ReactNode }) {
  return createElement(ReportControlsContext.Provider, { value: useReportControlsState() }, children);
}

export function useReportControls(): ReportControls {
  const ctx = useContext(ReportControlsContext);
  if (!ctx) throw new Error("useReportControls requires ReportControlsProvider (mounted by src/app/reports/layout.tsx)");
  return ctx;
}

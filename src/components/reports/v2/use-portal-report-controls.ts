"use client";
import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/no-fetch-in-effect */
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatDate, getFirstDayOfCurrentMonth, resolveRange, type RangeMode } from "@/lib/report-date-range";
import { previousWeek, type ReportRangeControls } from "./use-report-controls";
import { makeSectionAccess } from "./portal-report-access";
import { useActivePortalClientCode, portalClientQuery } from "@/components/portal/portal-visible-clients";

interface PortalClientRow {
  clientIdCode: string;
  clientName: string;
  clientStatus: string | null;
  rawData?: Record<string, string>;
}

type ClientLite = { clientIdCode: string; allowedSections: string[] };

export interface PortalReportControls extends ReportRangeControls {
  clientIdCode: string;
  clientName: string;
  clientStatus: string | null;
  allowedSections: string[];
  isAdminPreview: boolean;
  isProspect: boolean;
  canAccessSection: (sectionId: string) => boolean;
  clientHasSection: (sectionId: string) => boolean;
  /** "?client=<code>" built from the RESOLVED client, always set once loaded.
   *  Used for the index card links, matching today's behavior. */
  clientParam: string;
  /** The index URL, carrying the preview param only when the current URL had
   *  one — so a real client's back link stays a clean /portal/reports, exactly
   *  as it is today. Deliberately not derived from clientParam. */
  backHref: string;
  loading: boolean;
  notFound: boolean;
}

function usePortalReportControlsState(): PortalReportControls {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const { clientIdCode: activeCode, ready } = useActivePortalClientCode();
  const previewParam = searchParams.get("client") ?? "";
  const isAdmin = hasAdminPowers(session?.user?.role);
  const isAdminPreview = Boolean(isAdmin && previewParam);
  const isProspect = session?.user?.clientStatus === "Prospect";

  const [row, setRow] = useState<PortalClientRow | null>(null);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<RangeMode>("week");
  const [customStart, setCustomStart] = useState(() => getFirstDayOfCurrentMonth(new Date()));
  const [customEnd, setCustomEnd] = useState(() => formatDate(new Date()));
  const [year, setYear] = useState(() => previousWeek(new Date()).year);
  const [week, setWeek] = useState(() => previousWeek(new Date()).week);

  // Always pass ?client= so the API cannot fall back to the first assigned
  // code (TRT) when the homepage dropdown has enabled a different account.
  useEffect(() => {
    if (!ready) return;
    if (!activeCode) {
      setRow(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    let ignore = false;
    fetch(`/api/portal/me/client?client=${encodeURIComponent(activeCode)}`)
      .then(async (r) => {
        if (ignore) return;
        if (!r.ok) {
          setRow(null);
          setLoading(false);
          return;
        }
        setRow((await r.json()) as PortalClientRow);
        setLoading(false);
      })
      .catch(() => {
        if (ignore) return;
        setRow(null);
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [activeCode, ready]);

  // Admin preview needs the PREVIEWED client's own grants, which
  // /api/portal/me/client does not return (spec §9 correction 6). Keyed
  // "portal-clients" because the index page's eye-toggle mutation invalidates
  // that key to refresh after a toggle.
  const { data: previewedClient } = useQuery<ClientLite[], Error, ClientLite | undefined>({
    queryKey: ["portal-clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: isAdminPreview,
    select: (data) => data.find((c) => c.clientIdCode === previewParam),
  });

  const allowedSections = isAdminPreview
    ? (previewedClient?.allowedSections ?? [])
    : (session?.user?.allowedSections ?? []);

  const access = makeSectionAccess({ isAdminPreview, isProspect, allowedSections });

  const { start, end } = useMemo(
    () => resolveRange(mode, { customStart, customEnd, year, week }),
    [mode, customStart, customEnd, year, week],
  );

  const clientIdCode = row?.clientIdCode ?? "";

  return {
    clientIdCode,
    clientName: row?.clientName ?? "",
    clientStatus: row?.clientStatus ?? null,
    allowedSections,
    isAdminPreview,
    isProspect,
    ...access,
    clientParam: clientIdCode ? portalClientQuery(clientIdCode) : "",
    backHref: `/portal/reports${previewParam ? `?client=${encodeURIComponent(previewParam)}` : ""}`,
    loading,
    notFound: !loading && row === null,
    accountId: row?.rawData?.IntentwiseID?.trim() ?? "",
    mode, setMode, customStart, setCustomStart, customEnd, setCustomEnd,
    year, setYear, week, setWeek, start, end,
  };
}

/* State lives in a provider mounted by src/app/portal/reports/layout.tsx, above
   the page segment, so the client's date selection survives switching between
   report pages within one visit — matching hub behavior. */
const PortalReportControlsContext = createContext<PortalReportControls | null>(null);

export function PortalReportControlsProvider({ children }: { children: ReactNode }) {
  return createElement(PortalReportControlsContext.Provider, { value: usePortalReportControlsState() }, children);
}

export function usePortalReportControls(): PortalReportControls {
  const ctx = useContext(PortalReportControlsContext);
  if (!ctx) {
    throw new Error(
      "usePortalReportControls requires PortalReportControlsProvider (mounted by src/app/portal/reports/layout.tsx)",
    );
  }
  return ctx;
}

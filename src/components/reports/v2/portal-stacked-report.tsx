"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { PortalClientSection, usePortalStackedClients } from "@/components/portal/portal-stacked-clients";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { PortalReportState, MissingAccountIdBanner } from "@/components/reports/v2/portal-report-state";
import { usePortalReportControls } from "@/components/reports/v2/use-portal-report-controls";
import { canAccess } from "@/lib/permissions";
import { CLIENT_NAMES } from "@/lib/constants";

type ClientRow = {
  clientIdCode: string;
  clientName: string;
  rawData?: Record<string, string>;
};

type AssignedClient = {
  clientIdCode: string;
  clientName: string;
  allowedSections: string[];
};

export type StackedReportCtx = {
  /** IntentwiseID for THIS client — empty string when the AAC row has none. */
  accountId: string;
  start: string;
  end: string;
  clientIdCode: string;
  clientName: string;
};

function intentwiseFromRaw(raw: Record<string, string> | undefined): string {
  if (!raw) return "";
  return (raw.IntentwiseID || raw["Intentwise ID"] || raw.intentwiseID || "").trim();
}

/** The same row usePortalReportControls fetches for the active client, but
 *  keyed per client so every stacked block resolves its own IntentwiseID. */
function usePortalClientRow(clientIdCode: string) {
  return useQuery<ClientRow>({
    queryKey: ["portal-me-client", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/portal/me/client?client=${encodeURIComponent(clientIdCode)}`);
      if (!res.ok) throw new Error("Client not found");
      return res.json();
    },
    enabled: !!clientIdCode,
    staleTime: 120_000,
  });
}

/** Per-client grants. The session only carries the UNION across assigned
 *  clients, which is the right gate for "may this viewer open the page" but
 *  the wrong one for "does THIS account hold the section" — Trejo's Tacos has
 *  order-geography, Trejo's Spirits does not. Same cache key as the picker. */
function usePortalAssignedClients(enabled: boolean) {
  return useQuery<{ clients: AssignedClient[] }>({
    queryKey: ["portal-me-clients", "self"],
    queryFn: async () => {
      const res = await fetch("/api/portal/me/clients");
      if (!res.ok) throw new Error("Failed to load clients");
      return res.json();
    },
    enabled,
    staleTime: 120_000,
  });
}

function StackedReportClient({
  clientIdCode,
  showHeader,
  granted,
  start,
  end,
  children,
}: {
  clientIdCode: string;
  showHeader: boolean;
  granted: boolean;
  start: string;
  end: string;
  children: (ctx: StackedReportCtx) => ReactNode;
}) {
  const { data, isLoading, isError } = usePortalClientRow(clientIdCode);
  const clientName = data?.clientName || CLIENT_NAMES[clientIdCode] || clientIdCode;
  const accountId = intentwiseFromRaw(data?.rawData);

  return (
    <PortalClientSection clientIdCode={clientIdCode} clientName={clientName} showHeader={showHeader}>
      {!granted ? (
        <PortalReportState kind="unavailable" />
      ) : isLoading ? (
        <PortalReportState kind="loading" />
      ) : isError || !data ? (
        <PortalReportState kind="not-found" />
      ) : (
        <>
          {!accountId && <MissingAccountIdBanner flush />}
          {children({ accountId, start, end, clientIdCode, clientName })}
        </>
      )}
    </PortalClientSection>
  );
}

/**
 * A portal report page for one or many clients: the controls bar (dates, back
 * link, PDF) renders ONCE in the nav slot, the report title once at the top,
 * then one body per visible client, stacked in assignment order. Single-client
 * users see exactly the pre-stacking layout.
 */
export function PortalStackedReport({
  sectionId,
  sectionLabel,
  title,
  description,
  showDates = true,
  extras,
  refreshRange,
  children,
}: {
  /** Bare section id ("overview", "share-of-voice"); prefixed to reports-* for the grant check. */
  sectionId: string;
  sectionLabel: string;
  title: string;
  description: string;
  showDates?: boolean;
  /** Shared controls (a year select, a trailing-range picker). Per-client extras
   *  belong inside `children`, next to the data they describe. */
  extras?: ReactNode;
  refreshRange?: { start: string; end: string };
  children: (ctx: StackedReportCtx) => ReactNode;
}) {
  const controls = usePortalReportControls();
  const { codes, showHeaders, ready, isEmpty, isAdminPreview, label } = usePortalStackedClients();
  // The union gate already covers a single client; per-client grants only
  // matter once two or more accounts share the page.
  const needGrants = showHeaders && !isAdminPreview;
  const grants = usePortalAssignedClients(needGrants);

  if (!ready || controls.loading || (needGrants && grants.isLoading)) {
    return <PortalReportState kind="loading" />;
  }
  if (isEmpty || controls.notFound) return <PortalReportState kind="not-found" />;
  if (!controls.canAccessSection(sectionId)) return <PortalReportState kind="unavailable" />;

  const grantsByCode = new Map((grants.data?.clients ?? []).map((c) => [c.clientIdCode, c.allowedSections]));
  const isGranted = (code: string): boolean => {
    if (!needGrants) return true;
    if (controls.isProspect) return true;
    // A client missing from the grants payload (fetch failed) falls back to the
    // union gate that already passed, so a transient error never blanks a block.
    const sections = grantsByCode.get(code);
    return sections ? canAccess(`reports-${sectionId}`, sections, false) : true;
  };

  const clientLabel = showHeaders ? label : `${controls.clientName} · ${controls.clientIdCode}`;

  return (
    <div className="-mt-6 lg:-mt-8">
      <PageMetaSlot>
        <ReportsControlsBar
          surface="portal"
          controls={controls}
          sectionLabel={sectionLabel}
          showDates={showDates}
          showClientSelect={false}
          showRefreshButton={false}
          clientLabel={clientLabel}
          backHref={controls.backHref}
          refreshRange={refreshRange}
          extras={extras}
        />
      </PageMetaSlot>
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5 text-mf-ink">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">{title}</h1>
            <p className="mt-2.5 max-w-[760px] text-mf-muted">{description}</p>
          </div>
          <div className="space-y-12">
            {codes.map((code) => (
              <StackedReportClient
                key={code}
                clientIdCode={code}
                showHeader={showHeaders}
                granted={isGranted(code)}
                start={controls.start}
                end={controls.end}
              >
                {children}
              </StackedReportClient>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

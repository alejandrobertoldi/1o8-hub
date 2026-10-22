"use client";

import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { hasAdminPowers } from "@/lib/roles";
import { CLIENT_NAMES } from "@/lib/constants";
import { formatPortalClientBadge } from "@/lib/client-codes";
import { cn } from "@/lib/utils";
import { usePortalVisibleClients } from "@/components/portal/portal-visible-clients";

export type PortalStackedClientsState = {
  /** Clients to render, in assignment order (or the single admin-preview client). */
  codes: string[];
  /** True when more than one client is shown, so each block needs its own header. */
  showHeaders: boolean;
  /** False until the session has loaded AND the visible-clients store has
   *  hydrated from localStorage. Gating on the session matters: the store
   *  reports ready with an empty assignment while `useSession` is still
   *  loading, which would flash "No client assigned" at every real user. */
  ready: boolean;
  /** Ready and nothing to show. */
  isEmpty: boolean;
  isAdminPreview: boolean;
  /** "Trejo's Tacos · Trejo's Spirits" — for subtitles that used to name one client. */
  label: string;
};

/**
 * The one answer to "which clients does this portal page render?".
 *
 * Client users see every account enabled in the homepage picker, stacked in
 * assignment order (Trejo's Tacos + Trejo's Spirits, or any N assignments).
 * Admin preview with ?client= stays single-client.
 */
export function usePortalStackedClients(): PortalStackedClientsState {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const previewClient = isAdmin ? searchParams.get("client") : null;
  const { visible, ready: storeReady } = usePortalVisibleClients();
  const codes = previewClient ? [previewClient] : visible;
  // Same gate useActivePortalClientCode has always applied.
  const ready = storeReady && status !== "loading";
  return {
    codes,
    showHeaders: codes.length > 1,
    ready,
    isEmpty: ready && codes.length === 0,
    isAdminPreview: Boolean(previewClient),
    label: formatPortalClientBadge(codes, CLIENT_NAMES),
  };
}

/**
 * One client's block on a stacked portal page. The header (code eyebrow +
 * client name) only renders when the page shows more than one client, so a
 * single-client user sees exactly what they saw before.
 */
export function PortalClientSection({
  clientIdCode,
  clientName,
  showHeader,
  children,
  className,
}: {
  clientIdCode: string;
  clientName?: string;
  showHeader: boolean;
  children: ReactNode;
  className?: string;
}) {
  const name = clientName || CLIENT_NAMES[clientIdCode] || clientIdCode;
  return (
    <section
      id={`client-${clientIdCode}`}
      data-client={clientIdCode}
      className={cn("space-y-6", className)}
      aria-label={name}
    >
      {showHeader && (
        <header className="border-b border-border/60 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {clientIdCode}
          </p>
          <h2 className="text-lg font-bold tracking-tight text-foreground">{name}</h2>
        </header>
      )}
      {children}
    </section>
  );
}

const DEFAULT_EMPTY = (
  <div className="flex flex-col items-center justify-center py-24 text-center">
    <p className="text-sm text-muted-foreground">No client assigned to your account yet.</p>
  </div>
);

/**
 * Renders one block per visible portal client, one after another. Pass a
 * render function that builds the body for a single client; it is called once
 * per client with that client's code, so per-client state (filters, tabs,
 * queries) lives inside the body component and never leaks across accounts.
 *
 * Renders nothing until the visible-clients store is ready, so a multi-client
 * user never sees a one-client flash.
 */
export function PortalStackedClients({
  children,
  empty = DEFAULT_EMPTY,
  className,
}: {
  children: (clientIdCode: string, ctx: { showHeader: boolean; index: number }) => ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  const { codes, showHeaders, ready, isEmpty } = usePortalStackedClients();
  if (!ready) return null;
  if (isEmpty) return empty;
  return (
    <div className={cn("space-y-12", className)}>
      {codes.map((code, index) => (
        <PortalClientSection key={code} clientIdCode={code} showHeader={showHeaders}>
          {children(code, { showHeader: showHeaders, index })}
        </PortalClientSection>
      ))}
    </div>
  );
}

"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { AlrLinkPhase } from "./alr-link-phase";
import { MergeToMasterPhase } from "./merge-to-master-phase";

type Props = { clientIdCode: string; onSuccess: () => void };

interface StagingState {
  hasClr: boolean;
  hasAlr: boolean;
  clr: { count: number; productTypes: number; missingRequired: number };
  alr: {
    count: number;
    byStatus: { Active: number; Inactive: number; Incomplete: number; Other: number };
  };
  master: { count: number; lastUpdatedAt: string | null };
}

export function AlrLinkAndMerge({ clientIdCode, onSuccess }: Props) {
  // Shares its query key with `ClrAttributeImport` so both components read
  // the same cache entry: when CLR execute succeeds and that component
  // refetches, this gate's `hasClr` flips immediately. Without the shared
  // key the ALR browse UI stays hidden until a hard refresh.
  const state = useQuery<StagingState>({
    queryKey: ["staging-state", clientIdCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/onboarding/staging-state?clientIdCode=${encodeURIComponent(clientIdCode)}`
      );
      if (!res.ok) throw new Error("Failed to load staging state");
      return (await res.json()) as StagingState;
    },
  });

  if (state.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-600">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    );
  }
  if (state.isError || !state.data) {
    return <div className="text-sm text-red-600">Failed to load staging state.</div>;
  }

  if (!state.data.hasClr) {
    // After a successful merge, both staging tables are wiped but master
    // has the newly-merged rows — surface that as a persistent confirmation
    // instead of the (now misleading) "must complete 8.2" gate.
    if (state.data.master.count > 0) {
      const lastUpdated = state.data.master.lastUpdatedAt;
      return (
        <div className="flex items-start gap-2 text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-md p-3">
          <CheckCircle2 className="size-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          <span>
            Merged to master: <strong>{state.data.master.count}</strong> products
            {lastUpdated
              ? ` on ${new Date(lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
              : ""}
            . Re-upload Step 8.2 (CLR) above to start a new import.
          </span>
        </div>
      );
    }
    return (
      <div className="text-sm text-neutral-700 border border-neutral-200 rounded-md p-4">
        Step 8.2 (CLR import) must be completed before linking SKUs to ASINs.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* "ALR already staged" banner is rendered inline by AlrLinkPhase
          itself (same pattern as ClrAttributeImport) so the confirmation
          stays inside the card the user just acted on. */}
      <AlrLinkPhase clientIdCode={clientIdCode} onConfirmed={() => state.refetch()} />
      {state.data.hasAlr && (
        <MergeToMasterPhase
          clientIdCode={clientIdCode}
          onMerged={() => {
            state.refetch();
            onSuccess();
          }}
        />
      )}
    </div>
  );
}

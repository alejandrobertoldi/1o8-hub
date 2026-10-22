"use client";

// The three whole-page states a portal report can be in before it has data to
// show. Each REPLACES the report body.
const COPY = {
  loading: "Loading report…",
  "not-found": "No client linked to your session.",
  unavailable:
    "This report isn't available for your account — reach out to your account manager for access.",
} as const;

export function PortalReportState({ kind }: { kind: keyof typeof COPY }) {
  return (
    <div className="p-8 text-muted-foreground" role={kind === "loading" ? "status" : undefined}>
      {COPY[kind]}
    </div>
  );
}

// Renders ABOVE the report body rather than replacing it — the report still has
// something to show, it just cannot resolve an Intentwise account. That is why
// this is a separate component and not a fourth PortalReportState kind.
//
// Colors are DESIGN.md's Error/Red badge row (light + dark pairing), not a copy
// of the index page's old dark-only string. The light row is what makes this
// correct on the portal's light ghost canvas; the dark row keeps it correct in
// dark mode too.
export function MissingAccountIdBanner({ flush = false }: { flush?: boolean } = {}) {
  const banner = (
    <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
      Missing IntentwiseID for this client.
    </div>
  );
  // `flush` drops the page-width wrapper for callers that already sit inside
  // the report's <main> column (stacked per-client blocks).
  if (flush) return banner;
  return <div className="mx-auto w-[min(calc(100%-32px),1760px)] pt-3">{banner}</div>;
}

"use client";

// Shared pieces for showing an SEO project's client and targeted ASINs, in the
// A+ New Set / set-coverage style. Used by the New SEO Project wizard and the
// project's S1.0 Project Summary.

import { useState } from "react";
import Link from "next/link";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { clientLogoSrc } from "@/components/monthly-report/client-logo";
import type { SeoTargetScope } from "@/lib/seo/project-naming";

type TargetScope = SeoTargetScope;
interface ClientEntry {
  clientIdCode: string;
  clientName: string;
}

/** Client mark from /client-logos, falling back to the initial when no file exists. */
export function ClientMark({ client, compact }: { client: ClientEntry; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = clientLogoSrc(client.clientIdCode);

  if (!src || failed) {
    return (
      <div className={`${compact ? "size-10 text-lg" : "size-16 text-2xl"} shrink-0 rounded-md bg-brand/10 flex items-center justify-center font-bold text-brand`}>
        {client.clientName.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <div className={`relative shrink-0 ${compact ? "h-10 w-20" : "h-16 w-full"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${client.clientName} logo`}
        className="absolute inset-0 h-full w-full object-contain invert dark:invert-0"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export const PARENTAGE_STYLES: Record<string, string> = {
  parent: "bg-blue-500/10 text-blue-400",
  child: "bg-purple-500/10 text-purple-400",
  standalone: "bg-muted text-muted-foreground",
};

/**
 * ASIN linking to the product detail page, styled like the A+ New Set dialog.
 * Opens a new tab: the wizard keeps its selection in memory only, so navigating
 * away in the same tab would throw the in-progress project away.
 */
export function AsinLink({
  asin, productId, from = "seo-new",
}: { asin: string; productId?: string | null; from?: "seo-new" | "seo-project" }) {
  if (!productId) return <>{asin}</>;
  return (
    <Link
      href={`/products/${productId}?from=${from}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="hover:underline"
      title="Open product in a new tab"
    >
      {asin}
    </Link>
  );
}

const SCOPE_PILL: Record<TargetScope, string> = {
  ASIN: "border-brand/40 bg-brand/10 text-brand",
  VARIATION: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  GROUP: "border-teal-500/40 bg-teal-500/10 text-teal-400",
};

export function ScopePill({ scope }: { scope: TargetScope }) {
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold ${SCOPE_PILL[scope]}`}>
      {scope}
    </span>
  );
}

/** Compact coverage line from the A+ set view: parentage badge, ASIN + Amazon link, title. */
export function CoverageRow({
  badge, asin, productId, title, from,
}: { badge: string; asin: string; productId?: string | null; title: string | null; from?: "seo-new" | "seo-project" }) {
  return (
    <div className="flex min-w-0 items-center gap-2 py-0.5">
      <span
        className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
          PARENTAGE_STYLES[badge.toLowerCase()] ?? "bg-muted text-muted-foreground"
        }`}
      >
        {badge}
      </span>
      <span className="shrink-0 font-mono text-xs font-bold text-brand">
        <AsinLink asin={asin} productId={productId} from={from} />
      </span>
      <AmazonPdpLink asin={asin} />
      <span className="truncate text-[11px] text-muted-foreground">{title ?? ""}</span>
    </div>
  );
}


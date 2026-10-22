"use client";

import { useState, useCallback } from "react";
import type { SeoVersion } from "@/lib/seo-types";

interface VersionTimelineProps {
  projectId: string;
  asin: string;
  sku: string;
  onCompare: (v1: SeoVersion, v2: SeoVersion) => void;
}

export function VersionTimeline({ projectId, asin, sku, onCompare }: VersionTimelineProps) {
  const [versions, setVersions] = useState<SeoVersion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    if (versions) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/seo/versions?asin=${encodeURIComponent(asin)}&sku=${encodeURIComponent(sku)}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setVersions(data.versions || []);
      setExpanded(true);
    } catch {
      setError("Failed to load versions");
    }
    setLoading(false);
  }, [asin, sku, versions, expanded]);

  return (
    <div>
      <button
        onClick={loadVersions}
        className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      >
        <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>&#9656;</span>
        Versions{versions ? ` (${versions.length})` : ""}
        {loading && <span className="text-muted-foreground/50 ml-1">Loading…</span>}
      </button>

      {error && (
        <p className="text-[10px] text-red-500 mt-1">
          {error}{" "}
          <button onClick={loadVersions} className="underline">retry</button>
        </p>
      )}

      {expanded && versions && (
        <div className="mt-2 space-y-1.5">
          {versions.length === 0 && (
            <p className="text-[10px] text-muted-foreground/50 italic">No versions in BQ yet</p>
          )}
          {versions.map((v, i) => (
            <div
              key={v.seoVersionNumber}
              className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-foreground">
                    v{v.seoVersionNumber}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {v.populatedCount} fields &middot; {v.seoCategory}
                  </span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-bold ${
                    v.seoStatus === "Current"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : "bg-stone-100 text-stone-500 dark:bg-zinc-800 dark:text-zinc-500"
                  }`}>
                    {v.seoStatus}
                  </span>
                </div>
                {i < versions.length - 1 && (
                  <button
                    onClick={() => onCompare(versions[i + 1], v)}
                    className="text-[10px] font-bold text-brand hover:text-brand-hover transition-colors"
                  >
                    Compare &#8596;
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

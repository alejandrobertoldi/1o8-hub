/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-bold-heading */
"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { CoverageRow } from "@/components/seo/target-display";
import type { TrailRow } from "@/lib/seo/phase-trail";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { SectionDots } from "@/components/seo/section-dots";
import { AvatarCircle } from "@/components/seo/avatar-circle";
import { ProjectStatusPicker } from "@/components/seo/project-status-picker";
import { stageLabel } from "@/lib/seo/revision-rules";
import { PpcStatusTab } from "@/components/seo/ppc-status/ppc-status-tab";

// ── Types ─────────────────────────────────────────────────────────────

interface ProjectSummary {
  id: string;
  name: string;
  brand_name: string;
  status: string;
  current_phase: string;
  review_stage?: string | null;
  asins?: Array<{ asin: string; sku: string; parentage_level: string | null; product_id: string | null; title: string | null }>;
  review_approved?: boolean;
  pushed?: boolean;
  trail?: TrailRow[];
  assigned_to: string | null;
  assignee_name: string | null;
  assignee_image: string | null;
  created_at: string;
  s1_approved_at: string | null;
  s2_approved_at: string | null;
  s3_approved_at: string | null;
  s4_approved_at: string | null;
  s5_approved_at: string | null;
  s6_approved_at: string | null;
  variation_id: string | null;
  variation_name: string | null;
  variation_code: string | null;
  version: number;
  quality_scores: number[];
  content_preview: { title: string; bullet1: string; description: string } | null;
  quality_score: { overall_score: number; scored_at: string } | null;
  export_info: { export_count: number; last_exported_at: string; last_url: string | null } | null;
}

interface RecentExport {
  id: string;
  type: string;
  url: string | null;
  createdAt: string;
}

interface ClientDetail {
  clientIdCode: string;
  clientName: string;
  projects: ProjectSummary[];
  asinCount: number;
  exportCount: number;
  recentExports: RecentExport[];
  phaseBreakdown: {
    S1: number;
    S2: number;
    S3: number;
    S4: number;
    S5: number;
    S6: number;
    completed: number;
  };
}

const sectionRoute: Record<string, string> = {
  S1: "intake",
  S2: "keywords",
  S3: "reviews",
  S4: "rufus",
  S5: "cosmo",
  S6: "seo",
};

const PHASES = ["S1", "S2", "S3", "S4", "S5", "S6"] as const;

const exportTypeIcon: Record<string, string> = {
  google_doc: "G",
  csv: "C",
  tsv: "T",
};

const exportTypeLabel: Record<string, string> = {
  google_doc: "Google Doc",
  csv: "CSV",
  tsv: "TSV",
};

// ── Phase Breakdown Bar ───────────────────────────────────────────────

function PhaseBreakdown({
  breakdown,
}: {
  breakdown: ClientDetail["phaseBreakdown"];
}) {
  const total =
    breakdown.S1 +
    breakdown.S2 +
    breakdown.S3 +
    breakdown.S4 +
    breakdown.S5 +
    breakdown.S6 +
    breakdown.completed;

  return (
    <div className="rounded-xl border border-stone-200 bg-card p-5 dark:border-zinc-800 animate-card-enter">
      <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-3">
        Phase Overview
      </h2>

      {/* Bar */}
      {total > 0 && (
        <div className="flex h-2.5 rounded-full overflow-hidden bg-stone-100 dark:bg-zinc-800/50 mb-3">
          {PHASES.map((phase) => {
            const count = breakdown[phase];
            if (!count) return null;
            return (
              <div
                key={phase}
                className="bg-amber-400 dark:bg-amber-500/60 transition-all"
                style={{ width: `${(count / total) * 100}%` }}
              />
            );
          })}
          {breakdown.completed > 0 && (
            <div
              className="bg-emerald-500 dark:bg-emerald-500/60 transition-all"
              style={{
                width: `${(breakdown.completed / total) * 100}%`,
              }}
            />
          )}
        </div>
      )}

      {/* Labels */}
      <div className="flex items-center gap-4 flex-wrap">
        {PHASES.map((phase) => (
          <div key={phase} className="flex items-center gap-1.5">
            <div
              className={`size-6 rounded flex items-center justify-center text-[9px] font-bold ${
                breakdown[phase] > 0
                  ? "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30"
                  : "bg-stone-100 text-stone-400 border border-stone-200 dark:bg-zinc-800/50 dark:text-zinc-600 dark:border-zinc-800"
              }`}
            >
              {breakdown[phase]}
            </div>
            <span className="text-[10px] text-muted-foreground">{phase}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div
            className={`size-6 rounded flex items-center justify-center text-[9px] font-bold ${
              breakdown.completed > 0
                ? "bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30"
                : "bg-stone-100 text-stone-400 border border-stone-200 dark:bg-zinc-800/50 dark:text-zinc-600 dark:border-zinc-800"
            }`}
          >
            {breakdown.completed}
          </div>
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <svg
              className="size-3 text-emerald-600 dark:text-emerald-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Done
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton Loader ───────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="h-4 w-32 rounded bg-stone-200 dark:bg-zinc-800" />
        <div className="h-10 w-64 rounded bg-stone-200 dark:bg-zinc-800" />
        <div className="h-4 w-48 rounded bg-stone-200 dark:bg-zinc-800" />
      </div>
      {/* Phase bar skeleton */}
      <div className="rounded-xl border border-stone-200 bg-card p-5 dark:border-zinc-800">
        <div className="h-3 w-24 rounded bg-stone-200 dark:bg-zinc-800 mb-3" />
        <div className="h-2.5 rounded-full bg-stone-100 dark:bg-zinc-800/50 mb-3" />
        <div className="flex gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-6 w-12 rounded bg-stone-200 dark:bg-zinc-800"
            />
          ))}
        </div>
      </div>
      {/* Cards skeleton */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-stone-200 bg-card p-5 dark:border-zinc-800"
        >
          <div className="h-5 w-48 rounded bg-stone-200 dark:bg-zinc-800 mb-2" />
          <div className="h-3 w-32 rounded bg-stone-200 dark:bg-zinc-800 mb-3" />
          <div className="flex gap-1.5">
            {Array.from({ length: 6 }).map((_, j) => (
              <div
                key={j}
                className="size-5 rounded bg-stone-200 dark:bg-zinc-800"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function SEOClientDetailPage() {
  const params = useParams();
  const clientId = params.clientId as string;

  const [data, setData] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"projects" | "ppc">("projects");


  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/seo/clients/${clientId}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed to load" }));
          setError(err.error || "Failed to load client data");
          return;
        }
        setData(await res.json());
      } catch {
        setError("Failed to load client data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [clientId]);

  return (
    <div>
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="SEO Clients"
        >
          <span className="font-bold text-sidebar-foreground">SEO</span>
          <span className="font-normal text-brand">Clients</span>
        </h1>
      </PageMetaSlot>
      {/* Header */}
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 mb-2 bg-background">
        <Link
          href="/seo"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <svg
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Dashboard
        </Link>

        {data && (
          <>
            <p className="text-sm font-semibold text-foreground">
              {data.clientName}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {data.projects.length} project
              {data.projects.length !== 1 ? "s" : ""} &middot;{" "}
              {data.asinCount} ASIN{data.asinCount !== 1 ? "s" : ""} &middot;{" "}
              {data.exportCount} export{data.exportCount !== 1 ? "s" : ""}
            </p>
          </>
        )}

        <div className="inline-flex rounded-full border border-stone-300 p-0.5 mt-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setView("projects")}
            className={`h-8 rounded-full px-3 text-[13px] font-medium leading-none transition-colors ${
              view === "projects"
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:bg-stone-50 dark:hover:bg-zinc-800"
            }`}
          >
            Projects
          </button>
          <button
            type="button"
            onClick={() => setView("ppc")}
            className={`h-8 rounded-full px-3 text-[13px] font-medium leading-none transition-colors ${
              view === "ppc"
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:bg-stone-50 dark:hover:bg-zinc-800"
            }`}
          >
            PPC Status
          </button>
        </div>
      </div>

      {view === "ppc" ? (
        <PpcStatusTab clientId={clientId} />
      ) : (
      /* Content */
      loading ? (
        <Skeleton />
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <Link
            href="/seo"
            className="text-xs text-brand hover:underline mt-2 inline-block"
          >
            Back to SEO Dashboard
          </Link>
        </div>
      ) : data && data.projects.length === 0 ? (
        <div className="text-center py-12 text-xs text-muted-foreground">
          <p className="mb-2">No SEO projects for this client yet.</p>
          <Link
            href="/seo"
            className="text-amber-700 hover:text-amber-600 underline dark:text-amber-400 dark:hover:text-amber-300"
          >
            Back to SEO Manager
          </Link>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Phase Overview */}
          <PhaseBreakdown breakdown={data.phaseBreakdown} />

          {/* Projects List */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-brand">
                Projects
              </h2>
              <span className="text-[10px] text-muted-foreground">
                ({data.projects.length})
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="space-y-2.5">
              {data.projects.map((p, index) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-stone-200 bg-card hover:border-stone-300 hover:shadow-md transition-all group card-glow animate-card-enter dark:border-zinc-800 dark:hover:border-zinc-700"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <Link href={`/seo/${p.id}/${sectionRoute[p.current_phase] || "intake"}`} className="block flex-1 min-w-0 px-5 pt-5 pb-3">
                    {/* TIER 1: Identity */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-foreground group-hover:text-amber-800 dark:group-hover:text-zinc-100 truncate flex items-center gap-1.5">
                          {p.name}
                          {p.variation_id && <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">V{p.version}</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {p.brand_name || "No brand"} &middot; Created{" "}
                          {new Date(p.created_at).toLocaleDateString("en-US")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {p.assigned_to && (
                          <div className="flex items-center gap-1.5" title={p.assignee_name || "Assigned"}>
                            <AvatarCircle name={p.assignee_name} image={p.assignee_image} size={22} />
                            <span className="text-[10px] text-muted-foreground max-w-[80px] truncate hidden sm:inline">
                              {p.assignee_name?.split(" ")[0] || "Assigned"}
                            </span>
                          </div>
                        )}
                        <ProjectStatusPicker
                          projectId={p.id}
                          status={p.status}
                          onUpdated={(status) =>
                            setData((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    projects: prev.projects.map((row) =>
                                      row.id === p.id ? { ...row, status } : row,
                                    ),
                                  }
                                : prev,
                            )
                          }
                        />
                        {p.review_stage && <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-bold text-sky-600 dark:text-sky-400">{stageLabel(p.review_stage)}</span>}
                      </div>
                    </div>

                  </Link>

                  {/* TIER 2: targeted ASINs (left, own Hub + Amazon links) | phases + team + review stages (right, opens the project) */}
                  <div className="flex flex-col gap-3 px-5 pb-5 md:flex-row md:items-start md:gap-8">
                    <div className="min-w-0 flex-1">
                      {(p.asins ?? []).map((a) => {
                        const lvl = (a.parentage_level || "").toLowerCase();
                        const badge = lvl === "parent" ? "Parent" : lvl === "child" ? "Child" : "Standalone";
                        return <CoverageRow key={`${a.asin}::${a.sku}`} badge={badge} asin={a.asin} productId={a.product_id} from="seo-project" title={a.title} />;
                      })}
                    </div>
                    <Link href={`/seo/${p.id}/${sectionRoute[p.current_phase] || "intake"}`} className="flex shrink-0 items-start gap-3 md:border-l md:border-border md:pl-6">
                      <SectionDots project={p} vertical trail={p.trail} />
                      {p.variation_code && (
                        <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[8px] font-bold text-violet-700 dark:bg-violet-500/10 dark:text-violet-400">
                          {p.variation_code}
                        </span>
                      )}
                    </Link>
                  </div>

                </div>
              ))}
            </div>
          </div>

          {/* Recent Exports */}
          {data.recentExports.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-brand">
                  Recent Exports
                </h2>
                <span className="text-[10px] text-muted-foreground">
                  ({data.recentExports.length})
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="rounded-xl border border-stone-200 bg-card dark:border-zinc-800 overflow-hidden animate-card-enter">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 dark:border-zinc-800">
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Type
                      </th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Date
                      </th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Link
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentExports.map((exp) => (
                      <tr
                        key={exp.id}
                        className="border-b border-stone-100 dark:border-zinc-800/50 last:border-0"
                      >
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="size-5 rounded bg-stone-100 dark:bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-stone-500 dark:text-zinc-500">
                              {exportTypeIcon[exp.type] || "?"}
                            </span>
                            <span className="text-foreground font-medium">
                              {exportTypeLabel[exp.type] || exp.type}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {new Date(exp.createdAt).toLocaleDateString("en-US")}
                        </td>
                        <td className="px-4 py-2.5">
                          {exp.url ? (
                            <a
                              href={exp.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Open
                            </a>
                          ) : (
                            <span className="text-muted-foreground/50">--</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2">
            <Link
              href={`/seo/manager?client=${clientId}`}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-solid px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-solid-hover shadow-[0_0_16px_-4px_var(--brand-glow)] transition-all"
            >
              <svg
                className="size-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
              Open in SEO Manager
            </Link>
          </div>
        </div>
      ) : null
      )}
    </div>
  );
}

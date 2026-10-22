"use client";
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */

import { useMemo, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CLIENT_NAMES } from "@/lib/constants";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalClientParam, portalClientQuery } from "@/components/portal/portal-visible-clients";
import { PortalStackedClients, usePortalStackedClients } from "@/components/portal/portal-stacked-clients";
import {
  isPortalActiveStatus,
  isPortalCompletedStatus,
  isPortalProgressStatus,
  projectStatusClass,
  projectStatusLabel,
} from "@/lib/seo/project-status";

// ── Types ──────────────────────────────────────────────────────────────

type SeoProject = {
  id: string;
  name: string;
  brand_name: string;
  status: string;
  current_phase: string;
  created_at: string;
  updated_at: string;
  assignee_name: string | null;
  assignee_image: string | null;
  asin_count: number;
  s1_approved_at: string | null;
  s2_approved_at: string | null;
  s3_approved_at: string | null;
  s4_approved_at: string | null;
  s5_approved_at: string | null;
  s6_approved_at: string | null;
};

const PHASES = [
  { code: "S1", label: "Intake" },
  { code: "S2", label: "Keywords" },
  { code: "S3", label: "Reviews" },
  { code: "S4", label: "Alexa for Shopping" },
  { code: "S5", label: "COSMO" },
  { code: "S6", label: "Content" },
];

// ── Helpers ────────────────────────────────────────────────────────────

function approvedCount(p: SeoProject): number {
  let c = 0;
  if (p.s1_approved_at) c++;
  if (p.s2_approved_at) c++;
  if (p.s3_approved_at) c++;
  if (p.s4_approved_at) c++;
  if (p.s5_approved_at) c++;
  if (p.s6_approved_at) c++;
  return c;
}

function progressPct(p: SeoProject): number {
  return Math.round((approvedCount(p) / 6) * 100);
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Project Card ────────────────────────────────────────────────────────

function ProjectCard({ project, delay }: { project: SeoProject; delay: number }) {
  const progress = progressPct(project);
  const approved = approvedCount(project);
  const currentPhase = PHASES.find((ph) => ph.code === project.current_phase);

  return (
    <div
      className="rounded-xl border border-stone-200 bg-card dark:border-zinc-800 p-5 animate-card-enter"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground truncate">{project.name}</h3>
          {project.brand_name && (
            <p className="text-[10px] text-muted-foreground">{project.brand_name}</p>
          )}
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] shrink-0 border-transparent font-bold",
            projectStatusClass(project.status),
          )}
        >
          {projectStatusLabel(project.status)}
        </Badge>
      </div>

      {/* Phase progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Phase {project.current_phase} — {currentPhase?.label || "Unknown"}
          </span>
          <span className="text-[10px] font-bold text-foreground tabular-nums">
            {approved}/6
          </span>
        </div>
        <div className="flex gap-1">
          {PHASES.map((ph, i) => {
            const isApproved = [
              project.s1_approved_at,
              project.s2_approved_at,
              project.s3_approved_at,
              project.s4_approved_at,
              project.s5_approved_at,
              project.s6_approved_at,
            ][i];
            const isCurrent = ph.code === project.current_phase;
            return (
              <div
                key={ph.code}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-all",
                  isApproved
                    ? "bg-emerald-500"
                    : isCurrent
                      ? "bg-portal-accent/60 animate-pulse"
                      : "bg-stone-200 dark:bg-zinc-700"
                )}
                title={`${ph.code} ${ph.label}${isApproved ? " ✓" : isCurrent ? " (current)" : ""}`}
              />
            );
          })}
        </div>
      </div>

      {/* Footer details */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-3">
          {project.asin_count > 0 && (
            <span>{project.asin_count} ASIN{project.asin_count !== 1 ? "s" : ""}</span>
          )}
          {project.assignee_name && (
            <span>{project.assignee_name.split(" ")[0]}</span>
          )}
        </div>
        <span>Updated {relativeTime(project.updated_at)}</span>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────

function PortalSeoContent() {
  const { label } = usePortalStackedClients();
  const clientParam = usePortalClientParam();

  return (
    <div className="space-y-8 -mt-6 lg:-mt-8">
      {/* Page heading portaled into TopNav row 3 (page-meta-slot) */}
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="SEO Projects"
          >
            <span className="font-bold text-sidebar-foreground">SEO</span>
            <span className="font-normal text-portal-accent">Projects</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {label} &mdash; Amazon Listing Optimization Pipeline
          </p>
        </div>
      </PageMetaSlot>

      <Link
        href={`/portal${clientParam}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3" />
        Back to portal
      </Link>

      {/* One block per visible client, stacked in assignment order. */}
      <PortalStackedClients>{(code) => <SeoForClient clientCode={code} />}</PortalStackedClients>
    </div>
  );
}

type ReviewItem = { revisionId: string; revisionNumber: number; submittedAt: string; projectName: string; clientIdCode: string | null; asinCount: number };

function ReviewWaiting({ clientCode }: { clientCode: string }) {
  const clientName = CLIENT_NAMES[clientCode] || clientCode;
  const { data } = useQuery<{ items: ReviewItem[] }>({
    queryKey: ["portal-seo-revisions", clientCode],
    queryFn: () =>
      fetch(`/api/portal/seo/revisions${portalClientQuery(clientCode)}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    staleTime: 60 * 1000,
  });
  const items = (data?.items ?? []).filter((i) => i.clientIdCode === clientCode);
  if (items.length === 0) return null;
  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4">
      <p className="mb-2 text-xs font-bold text-portal-accent">
        Waiting for your review ({items.length}) &middot; {clientName}
      </p>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.revisionId}>
            <Link href={`/portal/seo/review/${i.revisionId}`} className="text-sm hover:underline">
              {i.projectName} · r{i.revisionNumber} · {i.asinCount} ASINs · sent {i.submittedAt.slice(0, 10)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SeoForClient({ clientCode }: { clientCode: string }) {
  const clientName = CLIENT_NAMES[clientCode] || clientCode;

  const { data: projects = [], isLoading } = useQuery<SeoProject[]>({
    queryKey: ["portal-seo", clientCode],
    queryFn: () =>
      fetch(`/api/portal/seo${portalClientQuery(clientCode)}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    staleTime: 5 * 60 * 1000,
  });

  const active = useMemo(
    () => projects.filter((p) => isPortalActiveStatus(p.status)),
    [projects],
  );
  const completed = useMemo(
    () => projects.filter((p) => isPortalCompletedStatus(p.status)),
    [projects],
  );
  // Avg over draft / in_progress only — live is shipped and would pin the average near 100%.
  const avgProgress = useMemo(() => {
    const open = projects.filter((p) => isPortalProgressStatus(p.status));
    if (open.length === 0) return 0;
    return Math.round(open.reduce((sum, p) => sum + progressPct(p), 0) / open.length);
  }, [projects]);

  return (
    <div className="space-y-8">
      <ReviewWaiting clientCode={clientCode} />
      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-portal-accent" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && projects.length === 0 && (
        <div className="text-center py-20">
          <Search className="size-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">
            No SEO projects found for {clientName}.
          </p>
        </div>
      )}

      {/* Metrics */}
      {!isLoading && projects.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Active" value={active.length} delay={0} />
            <MetricCard label="Completed" value={completed.length} delay={60} />
            <MetricCard label="Avg Progress" value={`${avgProgress}%`} progress={avgProgress} delay={120} />
            <MetricCard label="Total Projects" value={projects.length} delay={180} />
          </div>

          {/* Active: draft + live (+ in_progress) */}
          {active.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Active
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {active.map((p, i) => (
                  <ProjectCard key={p.id} project={p} delay={i * 60} />
                ))}
              </div>
            </div>
          )}

          {/* Completed: completed + deprecated (+ archived) */}
          {completed.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Completed
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {completed.map((p, i) => (
                  <ProjectCard key={p.id} project={p} delay={i * 60} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, progress, delay = 0 }: {
  label: string;
  value: string | number;
  progress?: number;
  delay?: number;
}) {
  return (
    <div
      className="rounded-xl border border-stone-200 bg-card p-5 dark:border-zinc-800 animate-card-enter"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </p>
      <p className="text-3xl font-bold tracking-tighter text-foreground font-[family-name:var(--font-outfit)]">
        {value}
      </p>
      {progress !== undefined && (
        <div className="mt-2 h-1.5 rounded-full bg-stone-100 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-portal-accent transition-all duration-700"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function PortalSeoPage() {
  return (
    <Suspense>
      <PortalSeoContent />
    </Suspense>
  );
}
